import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 🗄️ Persistent JSON-File Database
 * 
 * War-grade persistence layer. Every task, every earning, every execution
 * survives restarts, crashes, and redeployments. No more amnesia.
 * 
 * Tables:
 * - tasks: All discovered + executed tasks
 * - earnings: Revenue records
 * - executions: Agent loop execution history
 * - knowledge: Learning entries
 */

const DB_DIR = path.join(os.homedir(), ".agentclaw", "db");

interface DBSchema {
  tasks: TaskRecord[];
  earnings: EarningRecord[];
  executions: ExecutionRecord[];
  knowledge: KnowledgeRecord[];
  meta: { lastUpdated: number; totalEarningsUsd: number; totalTasksExecuted: number; totalTasksDiscovered: number };
}

export interface TaskRecord {
  id: string;
  source: string;
  title: string;
  url: string;
  status: "discovered" | "queued" | "executing" | "submitted" | "completed" | "failed" | "skipped";
  discoveredAt: number;
  executedAt?: number;
  submittedAt?: number;
  completedAt?: number;
  earnedUsd?: number;
  solutionSnippet?: string;
  errorMsg?: string;
  retries: number;
}

export interface EarningRecord {
  id: string;
  taskId: string;
  source: string;
  amountUsd: number;
  title: string;
  timestamp: number;
  payoutStatus: "pending_escrow" | "verified_transferred" | "failed";
  destinationWallet: string;
  verifiedAt?: number;
  txHash?: string;
}

export interface ExecutionRecord {
  taskId: string;
  startedAt: number;
  completedAt: number;
  turns: number;
  toolsUsed: string[];
  success: boolean;
  errorMsg?: string;
}

export interface KnowledgeRecord {
  id: string;
  topic: string;
  insight: string;
  source: string;
  timestamp: number;
}

const DEFAULT_DB: DBSchema = {
  tasks: [],
  earnings: [],
  executions: [],
  knowledge: [],
  meta: { lastUpdated: 0, totalEarningsUsd: 0, totalTasksExecuted: 0, totalTasksDiscovered: 0 },
};

// In-memory cache
let db: DBSchema | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getDbPath(table: string): string {
  return path.join(DB_DIR, `${table}.json`);
}

function ensureDir(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function loadDb(): DBSchema {
  if (db) return db;
  ensureDir();
  
  db = { ...DEFAULT_DB };
  
  for (const table of ["tasks", "earnings", "executions", "knowledge", "meta"] as const) {
    const filePath = getDbPath(table);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        (db as any)[table] = JSON.parse(raw);
      }
    } catch {
      // Corrupted file — start fresh for this table
      console.warn(`[DB] Warning: ${table}.json corrupted, using defaults`);
    }
  }
  
  return db;
}

function scheduleSave(): void {
  dirty = true;
  if (flushTimer) return;
  // Debounce: flush to disk every 2 seconds max
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (dirty) flushToDisk();
  }, 2000);
}

function flushToDisk(): void {
  if (!db) return;
  ensureDir();
  dirty = false;
  
  db.meta.lastUpdated = Date.now();
  
  for (const table of ["tasks", "earnings", "executions", "knowledge", "meta"] as const) {
    try {
      fs.writeFileSync(getDbPath(table), JSON.stringify((db as any)[table], null, 2));
    } catch (err) {
      console.warn(`[DB] Write error for ${table}:`, err);
    }
  }
}

// ==================== TASK OPERATIONS ====================

export function dbRecordDiscovery(task: Omit<TaskRecord, "status" | "discoveredAt" | "retries">): TaskRecord {
  const data = loadDb();
  const existing = data.tasks.find(t => t.id === task.id);
  if (existing) return existing;
  
  const record: TaskRecord = {
    ...task,
    status: "discovered",
    discoveredAt: Date.now(),
    retries: 0,
  };
  
  data.tasks.push(record);
  data.meta.totalTasksDiscovered++;
  
  // Cap at 2000 records, remove oldest completed/failed
  if (data.tasks.length > 2000) {
    const removable = data.tasks.findIndex(t => t.status === "completed" || t.status === "failed" || t.status === "skipped");
    if (removable >= 0) data.tasks.splice(removable, 1);
    else data.tasks.shift();
  }
  
  scheduleSave();
  return record;
}

export function dbUpdateTaskStatus(taskId: string, status: TaskRecord["status"], extra?: Partial<TaskRecord>): void {
  const data = loadDb();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  task.status = status;
  if (extra) Object.assign(task, extra);
  
  if (status === "executing") task.executedAt = Date.now();
  if (status === "submitted") task.submittedAt = Date.now();
  if (status === "completed") {
    task.completedAt = Date.now();
    data.meta.totalTasksExecuted++;
  }
  
  scheduleSave();
}

export function dbGetPendingTasks(limit = 10): TaskRecord[] {
  const data = loadDb();
  return data.tasks
    .filter(t => t.status === "discovered" || t.status === "queued")
    .sort((a, b) => b.discoveredAt - a.discoveredAt) // newest first
    .slice(0, limit);
}

export function dbGetExecutingTasks(): TaskRecord[] {
  const data = loadDb();
  return data.tasks.filter(t => t.status === "executing");
}

export function dbGetTaskById(taskId: string): TaskRecord | undefined {
  return loadDb().tasks.find(t => t.id === taskId);
}

// ==================== EARNINGS OPERATIONS ====================

const TREASURY_DEFAULT = "0xfdCE8864Ab96584102354Eb2d270187E0E900492";

export function dbRecordEarning(earning: Partial<EarningRecord> & { amountUsd: number; title: string }): EarningRecord {
  const data = loadDb();
  const treasuryAddress = process.env.TREASURY_ADDRESS || TREASURY_DEFAULT;
  const record: EarningRecord = {
    id: earning.id || `earn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    taskId: earning.taskId || "submission",
    source: earning.source || "bounty",
    amountUsd: earning.amountUsd,
    title: earning.title,
    timestamp: Date.now(),
    payoutStatus: earning.payoutStatus || "pending_escrow",
    destinationWallet: earning.destinationWallet || treasuryAddress,
    txHash: earning.txHash,
  };
  
  data.earnings.push(record);
  scheduleSave();
  return record;
}

export function dbConfirmWalletTransfer(earningId: string, txHash?: string): { record: EarningRecord; survivalState: unknown } | null {
  const data = loadDb();
  const record = data.earnings.find((e) => e.id === earningId || e.taskId === earningId);
  if (!record) return null;

  if (record.payoutStatus !== "verified_transferred") {
    record.payoutStatus = "verified_transferred";
    record.verifiedAt = Date.now();
    if (txHash) record.txHash = txHash;
    data.meta.totalEarningsUsd += record.amountUsd;
    scheduleSave();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordEarning } = require("./survival");
    const survivalState = recordEarning(record.amountUsd, record.title);
    return { record, survivalState };
  }

  return { record, survivalState: null };
}

export function dbGetTotalEarnings(): number {
  const earnings = loadDb().earnings;
  return earnings
    .filter((e) => e.payoutStatus === "verified_transferred")
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export function dbGetPendingEarnings(): number {
  const earnings = loadDb().earnings;
  return earnings
    .filter((e) => e.payoutStatus === "pending_escrow")
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export function dbGetEarnings(): EarningRecord[] {
  return loadDb().earnings;
}

// ==================== EXECUTION LOG ====================

export function dbLogExecution(record: ExecutionRecord): void {
  const data = loadDb();
  data.executions.push(record);
  
  // Cap at 500 execution records
  if (data.executions.length > 500) {
    data.executions = data.executions.slice(-500);
  }
  
  scheduleSave();
}

// ==================== KNOWLEDGE ====================

export function dbStoreKnowledge(record: KnowledgeRecord): void {
  const data = loadDb();
  data.knowledge.push(record);
  
  // Cap at 200 knowledge entries
  if (data.knowledge.length > 200) {
    data.knowledge = data.knowledge.slice(-200);
  }
  
  scheduleSave();
}

export function dbGetKnowledge(): KnowledgeRecord[] {
  return loadDb().knowledge;
}

// ==================== STATS ====================

export function dbGetStats(): DBSchema["meta"] & { pendingTasks: number; executingTasks: number; recentEarnings: EarningRecord[] } {
  const data = loadDb();
  return {
    ...data.meta,
    pendingTasks: data.tasks.filter(t => t.status === "discovered" || t.status === "queued").length,
    executingTasks: data.tasks.filter(t => t.status === "executing").length,
    recentEarnings: data.earnings.slice(-20),
  };
}

// Force flush on process exit
process.on("exit", () => { if (dirty && db) flushToDisk(); });
process.on("SIGINT", () => { if (dirty && db) flushToDisk(); process.exit(0); });
process.on("SIGTERM", () => { if (dirty && db) flushToDisk(); process.exit(0); });

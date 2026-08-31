#!/usr/bin/env node

// src/memory/db.ts
import sqlite3 from "sqlite3";
import { createClient } from "@libsql/client";
import fs2 from "fs";
import path2 from "path";
import os2 from "os";

// src/memory/survival.ts
import fs from "fs";
import path from "path";
import os from "os";
var SURVIVAL_PATH = path.join(os.homedir(), ".cashclaw", "survival.json");
var DEFAULT_SURVIVAL = {
  health: 100,
  totalEarnedUsd: 0,
  level: 1,
  rankTitle: "Rookie Survivor",
  paidApiUnlocked: false,
  companyLaunchUnlocked: false,
  isHibernating: false,
  lastDecayTime: Date.now(),
  lastEarningsTime: Date.now(),
  events: [
    {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "REVIVE",
      hpChange: 0,
      newHp: 100,
      note: "Agent initialized with 100 HP (Level 1: Rookie Survivor)"
    }
  ]
};
function loadSurvivalState() {
  if (!fs.existsSync(SURVIVAL_PATH)) {
    saveSurvivalState(DEFAULT_SURVIVAL);
    return DEFAULT_SURVIVAL;
  }
  try {
    const raw = fs.readFileSync(SURVIVAL_PATH, "utf-8");
    const state = JSON.parse(raw);
    return state;
  } catch {
    return DEFAULT_SURVIVAL;
  }
}
function saveSurvivalState(state) {
  const dir = path.dirname(SURVIVAL_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SURVIVAL_PATH, JSON.stringify(state, null, 2));
}
function calculateLevelAndRank(totalEarnedUsd) {
  if (totalEarnedUsd >= 1e3) {
    return {
      level: 4,
      rankTitle: "AI Tycoon (Company Launched \u{1F680})",
      paidApiUnlocked: true,
      companyLaunchUnlocked: true
    };
  }
  if (totalEarnedUsd >= 500) {
    return {
      level: 3,
      rankTitle: "Agency Pro (Paid API Unlocked \u{1F511})",
      paidApiUnlocked: true,
      companyLaunchUnlocked: false
    };
  }
  if (totalEarnedUsd >= 100) {
    return {
      level: 2,
      rankTitle: "Earner Rank",
      paidApiUnlocked: false,
      companyLaunchUnlocked: false
    };
  }
  return {
    level: 1,
    rankTitle: "Rookie Survivor",
    paidApiUnlocked: false,
    companyLaunchUnlocked: false
  };
}
function recordEarning(amountUsd, taskTitle) {
  const state = loadSurvivalState();
  state.lastEarningsTime = Date.now();
  const hpGain = Math.round(amountUsd / 10 * 20);
  state.health = Math.min(100, state.health + hpGain);
  state.totalEarnedUsd += amountUsd;
  state.isHibernating = false;
  const oldLevel = state.level;
  const levelInfo = calculateLevelAndRank(state.totalEarnedUsd);
  state.level = levelInfo.level;
  state.rankTitle = levelInfo.rankTitle;
  state.paidApiUnlocked = levelInfo.paidApiUnlocked;
  state.companyLaunchUnlocked = levelInfo.companyLaunchUnlocked;
  state.events.unshift({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "EARNING",
    hpChange: hpGain,
    newHp: state.health,
    note: `Earned $${amountUsd.toFixed(2)} on "${taskTitle}" (+${hpGain} HP). Total: $${state.totalEarnedUsd.toFixed(2)}`
  });
  if (state.level > oldLevel) {
    state.events.unshift({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "LEVEL_UP",
      hpChange: 0,
      newHp: state.health,
      note: `LEVEL UP! Promoted to Level ${state.level}: ${state.rankTitle}`
    });
  }
  if (state.events.length > 50) state.events.pop();
  saveSurvivalState(state);
  return state;
}

// src/memory/db.ts
var tursoUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
var tursoToken = process.env.TURSO_AUTH_TOKEN;
var libsql = null;
if (tursoUrl) {
  try {
    libsql = createClient({
      url: tursoUrl,
      authToken: tursoToken
    });
    console.log(`[Turso DB] \u2601\uFE0F Connected to Turso Cloud Database: ${tursoUrl}`);
  } catch (err) {
    console.error("[Turso DB] \u26A0\uFE0F Failed to initialize Turso client, falling back to local SQLite:", err.message);
  }
}
var PROJECT_DB_DIR = path2.join(process.cwd(), "data", "db");
var HOME_DB_DIR = path2.join(os2.homedir(), ".agentclaw", "db");
function ensureDirs() {
  try {
    if (!fs2.existsSync(PROJECT_DB_DIR)) {
      fs2.mkdirSync(PROJECT_DB_DIR, { recursive: true });
    }
    return path2.join(PROJECT_DB_DIR, "agentclaw.sqlite");
  } catch {
    if (!fs2.existsSync(HOME_DB_DIR)) {
      fs2.mkdirSync(HOME_DB_DIR, { recursive: true });
    }
    return path2.join(HOME_DB_DIR, "agentclaw.sqlite");
  }
}
var dbPath = ensureDirs();
var sqlite = new sqlite3.Database(dbPath);
function runQuery(sql, args = []) {
  if (libsql) {
    libsql.execute({ sql, args }).catch((err) => {
      console.error("[Turso DB] Exec Error:", err.message);
    });
  }
  sqlite.run(sql, args);
}
var SCHEMA_TABLES = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    discoveredAt INTEGER NOT NULL,
    executedAt INTEGER,
    submittedAt INTEGER,
    completedAt INTEGER,
    earnedUsd REAL,
    solutionSnippet TEXT,
    errorMsg TEXT,
    retries INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS earnings (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    source TEXT NOT NULL,
    amountUsd REAL NOT NULL,
    title TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    payoutStatus TEXT NOT NULL,
    destinationWallet TEXT NOT NULL,
    verifiedAt INTEGER,
    txHash TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    startedAt INTEGER NOT NULL,
    completedAt INTEGER NOT NULL,
    turns INTEGER NOT NULL,
    toolsUsed TEXT NOT NULL,
    success INTEGER NOT NULL,
    errorMsg TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    insight TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    taskId TEXT,
    message TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS key_health (
    keyHash TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    exhaustedAt INTEGER,
    rateLimitedUntil INTEGER NOT NULL DEFAULT 0,
    consecutiveErrors INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS cluster_nodes (
    nodeId TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    pid INTEGER NOT NULL,
    activeTasks INTEGER NOT NULL DEFAULT 0,
    lastHeartbeat INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS vault_meta (
    vaultId TEXT PRIMARY KEY,
    encryptedPayload TEXT NOT NULL,
    salt TEXT NOT NULL,
    iv TEXT NOT NULL,
    authTag TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`,
  `CREATE INDEX IF NOT EXISTS idx_earnings_payout ON earnings(payoutStatus);`,
  `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_key_health_provider ON key_health(provider);`
];
async function initTursoSchema() {
  if (!libsql) return;
  try {
    for (const sql of SCHEMA_TABLES) {
      await libsql.execute(sql);
    }
    console.log("[Turso DB] \u2705 Turso database schema verified & all 8 tables created.");
    const taskRes = await libsql.execute("SELECT * FROM tasks ORDER BY discoveredAt DESC LIMIT 300");
    for (const row of taskRes.rows) {
      cache.tasks.set(row.id, {
        id: row.id,
        source: row.source,
        title: row.title,
        url: row.url,
        status: row.status,
        discoveredAt: Number(row.discoveredAt),
        executedAt: row.executedAt ? Number(row.executedAt) : void 0,
        submittedAt: row.submittedAt ? Number(row.submittedAt) : void 0,
        completedAt: row.completedAt ? Number(row.completedAt) : void 0,
        earnedUsd: row.earnedUsd ? Number(row.earnedUsd) : void 0,
        solutionSnippet: row.solutionSnippet ? row.solutionSnippet : void 0,
        errorMsg: row.errorMsg ? row.errorMsg : void 0,
        retries: Number(row.retries || 0)
      });
    }
    const earnRes = await libsql.execute("SELECT * FROM earnings ORDER BY timestamp DESC LIMIT 100");
    for (const row of earnRes.rows) {
      cache.earnings.set(row.id, {
        id: row.id,
        taskId: row.taskId,
        source: row.source,
        amountUsd: Number(row.amountUsd),
        title: row.title,
        timestamp: Number(row.timestamp),
        payoutStatus: row.payoutStatus,
        destinationWallet: row.destinationWallet,
        verifiedAt: row.verifiedAt ? Number(row.verifiedAt) : void 0,
        txHash: row.txHash ? row.txHash : void 0
      });
    }
    console.log(`[Turso DB] \u2601\uFE0F Restored ${cache.tasks.size} tasks and ${cache.earnings.size} earnings from Turso Cloud.`);
  } catch (err) {
    console.error("[Turso DB] Error setting up schema:", err.message);
  }
}
initTursoSchema();
var MAX_CACHE_TASKS = 500;
var MAX_CACHE_EARNINGS = 200;
function capMapSize(map, maxSize) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey !== void 0) {
      map.delete(firstKey);
    } else {
      break;
    }
  }
}
var cache = {
  tasks: /* @__PURE__ */ new Map(),
  earnings: /* @__PURE__ */ new Map(),
  executions: [],
  knowledge: /* @__PURE__ */ new Map(),
  events: [],
  keyHealth: /* @__PURE__ */ new Map(),
  clusterNodes: /* @__PURE__ */ new Map(),
  vaultMeta: /* @__PURE__ */ new Map(),
  meta: { totalEarningsUsd: 0, totalTasksExecuted: 0, totalTasksDiscovered: 0 }
};
sqlite.serialize(() => {
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA synchronous = NORMAL;");
  sqlite.run("PRAGMA busy_timeout = 5000;");
  sqlite.run("PRAGMA cache_size = -2000;");
  sqlite.run("PRAGMA mmap_size = 0;");
  sqlite.run("PRAGMA temp_store = MEMORY;");
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      discoveredAt INTEGER NOT NULL,
      executedAt INTEGER,
      submittedAt INTEGER,
      completedAt INTEGER,
      earnedUsd REAL,
      solutionSnippet TEXT,
      errorMsg TEXT,
      retries INTEGER NOT NULL DEFAULT 0
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS earnings (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      source TEXT NOT NULL,
      amountUsd REAL NOT NULL,
      title TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      payoutStatus TEXT NOT NULL,
      destinationWallet TEXT NOT NULL,
      verifiedAt INTEGER,
      txHash TEXT
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER NOT NULL,
      turns INTEGER NOT NULL,
      toolsUsed TEXT NOT NULL,
      success INTEGER NOT NULL,
      errorMsg TEXT
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      insight TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      taskId TEXT,
      message TEXT NOT NULL
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS key_health (
      keyHash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      exhaustedAt INTEGER,
      rateLimitedUntil INTEGER NOT NULL DEFAULT 0,
      consecutiveErrors INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS cluster_nodes (
      nodeId TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      pid INTEGER NOT NULL,
      activeTasks INTEGER NOT NULL DEFAULT 0,
      lastHeartbeat INTEGER NOT NULL
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS vault_meta (
      vaultId TEXT PRIMARY KEY,
      encryptedPayload TEXT NOT NULL,
      salt TEXT NOT NULL,
      iv TEXT NOT NULL,
      authTag TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_earnings_payout ON earnings(payoutStatus);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_key_health_provider ON key_health(provider);`);
  const projTasksPath = path2.join(PROJECT_DB_DIR, "tasks.json");
  const homeTasksPath = path2.join(HOME_DB_DIR, "tasks.json");
  const jsonPath = fs2.existsSync(projTasksPath) ? projTasksPath : fs2.existsSync(homeTasksPath) ? homeTasksPath : null;
  if (jsonPath) {
    const dir = path2.dirname(jsonPath);
    const tasksFile = path2.join(dir, "tasks.json");
    if (fs2.existsSync(tasksFile)) {
      try {
        const tasks = JSON.parse(fs2.readFileSync(tasksFile, "utf-8"));
        for (const t of tasks) {
          cache.tasks.set(t.id, t);
          sqlite.run(
            `INSERT OR IGNORE INTO tasks (id, source, title, url, status, discoveredAt, executedAt, submittedAt, completedAt, earnedUsd, solutionSnippet, errorMsg, retries)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [t.id, t.source, t.title, t.url, t.status, t.discoveredAt, t.executedAt || null, t.submittedAt || null, t.completedAt || null, t.earnedUsd || null, t.solutionSnippet || null, t.errorMsg || null, t.retries || 0]
          );
        }
      } catch {
      }
    }
    const earningsFile = path2.join(dir, "earnings.json");
    if (fs2.existsSync(earningsFile)) {
      try {
        const earnings = JSON.parse(fs2.readFileSync(earningsFile, "utf-8"));
        for (const e of earnings) {
          cache.earnings.set(e.id, e);
          sqlite.run(
            `INSERT OR IGNORE INTO earnings (id, taskId, source, amountUsd, title, timestamp, payoutStatus, destinationWallet, verifiedAt, txHash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.taskId, e.source, e.amountUsd, e.title, e.timestamp, e.payoutStatus, e.destinationWallet, e.verifiedAt || null, e.txHash || null]
          );
        }
      } catch {
      }
    }
  }
  sqlite.all("SELECT * FROM tasks ORDER BY discoveredAt DESC LIMIT 300", (err, rows) => {
    if (!err && rows) {
      for (const row of rows) {
        cache.tasks.set(row.id, {
          id: row.id,
          source: row.source,
          title: row.title,
          url: row.url,
          status: row.status,
          discoveredAt: row.discoveredAt,
          executedAt: row.executedAt || void 0,
          submittedAt: row.submittedAt || void 0,
          completedAt: row.completedAt || void 0,
          earnedUsd: row.earnedUsd || void 0,
          solutionSnippet: row.solutionSnippet || void 0,
          errorMsg: row.errorMsg || void 0,
          retries: row.retries || 0
        });
      }
    }
  });
  sqlite.all("SELECT * FROM earnings ORDER BY timestamp DESC LIMIT 100", (err, rows) => {
    if (!err && rows) {
      for (const row of rows) {
        cache.earnings.set(row.id, {
          id: row.id,
          taskId: row.taskId,
          source: row.source,
          amountUsd: row.amountUsd,
          title: row.title,
          timestamp: row.timestamp,
          payoutStatus: row.payoutStatus,
          destinationWallet: row.destinationWallet,
          verifiedAt: row.verifiedAt || void 0,
          txHash: row.txHash || void 0
        });
      }
    }
  });
  sqlite.all("SELECT * FROM key_health", (err, rows) => {
    if (!err && rows) {
      for (const row of rows) {
        cache.keyHealth.set(row.keyHash, {
          keyHash: row.keyHash,
          provider: row.provider,
          status: row.status,
          exhaustedAt: row.exhaustedAt || null,
          rateLimitedUntil: row.rateLimitedUntil || 0,
          consecutiveErrors: row.consecutiveErrors || 0,
          updatedAt: row.updatedAt
        });
      }
    }
  });
});
function dbRecordDiscovery(task) {
  const existing = cache.tasks.get(task.id);
  if (existing) return existing;
  const record = {
    ...task,
    status: "discovered",
    discoveredAt: Date.now(),
    retries: 0
  };
  cache.tasks.set(record.id, record);
  capMapSize(cache.tasks, MAX_CACHE_TASKS);
  runQuery(
    `INSERT INTO tasks (id, source, title, url, status, discoveredAt, executedAt, submittedAt, completedAt, earnedUsd, solutionSnippet, errorMsg, retries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.source,
      record.title,
      record.url,
      record.status,
      record.discoveredAt,
      record.executedAt || null,
      record.submittedAt || null,
      record.completedAt || null,
      record.earnedUsd || null,
      record.solutionSnippet || null,
      record.errorMsg || null,
      record.retries
    ]
  );
  return record;
}
function dbUpdateTaskStatus(taskId, status, extra) {
  const task = cache.tasks.get(taskId);
  if (!task) return;
  const now = Date.now();
  task.status = status;
  if (extra) Object.assign(task, extra);
  if (status === "executing" && !task.executedAt) task.executedAt = now;
  if (status === "submitted" && !task.submittedAt) task.submittedAt = now;
  if (status === "completed" && !task.completedAt) task.completedAt = now;
  runQuery(
    `UPDATE tasks 
     SET status = ?, executedAt = ?, submittedAt = ?, completedAt = ?, earnedUsd = ?, solutionSnippet = ?, errorMsg = ?, retries = ?
     WHERE id = ?`,
    [
      task.status,
      task.executedAt || null,
      task.submittedAt || null,
      task.completedAt || null,
      task.earnedUsd || null,
      task.solutionSnippet || null,
      task.errorMsg || null,
      task.retries || 0,
      taskId
    ]
  );
}
function dbGetPendingTasks(limit = 10) {
  return Array.from(cache.tasks.values()).filter((t) => t.status === "discovered" || t.status === "queued").sort((a, b) => b.discoveredAt - a.discoveredAt).slice(0, limit);
}
function dbGetExecutingTasks() {
  return Array.from(cache.tasks.values()).filter((t) => t.status === "executing");
}
function dbGetTaskById(taskId) {
  return cache.tasks.get(taskId);
}
function dbGetAllTasks(limit = 100) {
  return Array.from(cache.tasks.values()).sort((a, b) => b.discoveredAt - a.discoveredAt).slice(0, limit);
}
var TREASURY_DEFAULT = "0xfdCE8864Ab96584102354Eb2d270187E0E900492";
function dbRecordEarning(earning) {
  const treasuryAddress = process.env.TREASURY_ADDRESS || TREASURY_DEFAULT;
  const record = {
    id: earning.id || `earn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    taskId: earning.taskId || "submission",
    source: earning.source || "bounty",
    amountUsd: earning.amountUsd,
    title: earning.title,
    timestamp: Date.now(),
    payoutStatus: earning.payoutStatus || "pending_escrow",
    destinationWallet: earning.destinationWallet || treasuryAddress,
    txHash: earning.txHash
  };
  cache.earnings.set(record.id, record);
  capMapSize(cache.earnings, MAX_CACHE_EARNINGS);
  runQuery(
    `INSERT INTO earnings (id, taskId, source, amountUsd, title, timestamp, payoutStatus, destinationWallet, verifiedAt, txHash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.taskId,
      record.source,
      record.amountUsd,
      record.title,
      record.timestamp,
      record.payoutStatus,
      record.destinationWallet,
      record.verifiedAt || null,
      record.txHash || null
    ]
  );
  return record;
}
function dbConfirmWalletTransfer(earningId, txHash) {
  let record = cache.earnings.get(earningId);
  if (!record) {
    record = Array.from(cache.earnings.values()).find((e) => e.taskId === earningId);
  }
  if (!record) return null;
  if (record.payoutStatus !== "verified_transferred") {
    record.payoutStatus = "verified_transferred";
    record.verifiedAt = Date.now();
    if (txHash) record.txHash = txHash;
    runQuery(
      `UPDATE earnings 
       SET payoutStatus = 'verified_transferred', verifiedAt = ?, txHash = ?
       WHERE id = ?`,
      [record.verifiedAt, record.txHash || null, record.id]
    );
    const survivalState = recordEarning(record.amountUsd, record.title);
    return { record, survivalState };
  }
  return { record, survivalState: null };
}
function dbGetTotalEarnings() {
  return Array.from(cache.earnings.values()).filter((e) => e.payoutStatus === "verified_transferred").reduce((sum, e) => sum + e.amountUsd, 0);
}
function dbGetPendingEarnings() {
  return Array.from(cache.earnings.values()).filter((e) => e.payoutStatus === "pending_escrow").reduce((sum, e) => sum + e.amountUsd, 0);
}
function dbGetEarnings() {
  return Array.from(cache.earnings.values()).sort((a, b) => b.timestamp - a.timestamp);
}
function dbLogExecution(record) {
  cache.executions.push(record);
  if (cache.executions.length > 500) cache.executions = cache.executions.slice(-500);
  runQuery(
    `INSERT INTO executions (taskId, startedAt, completedAt, turns, toolsUsed, success, errorMsg)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.taskId,
      record.startedAt,
      record.completedAt,
      record.turns,
      JSON.stringify(record.toolsUsed || []),
      record.success ? 1 : 0,
      record.errorMsg || null
    ]
  );
}
function dbStoreKnowledge(record) {
  cache.knowledge.set(record.id, record);
  runQuery(
    `INSERT OR REPLACE INTO knowledge (id, topic, insight, source, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [record.id, record.topic, record.insight, record.source, record.timestamp]
  );
}
function dbGetKnowledge() {
  return Array.from(cache.knowledge.values()).sort((a, b) => b.timestamp - a.timestamp);
}
function dbRecordEvent(event) {
  cache.events.push(event);
  if (cache.events.length > 500) cache.events = cache.events.slice(-500);
  runQuery(
    `INSERT INTO events (timestamp, type, taskId, message)
     VALUES (?, ?, ?, ?)`,
    [event.timestamp, event.type, event.taskId || null, event.message]
  );
}
function dbGetAllEvents(limit = 100) {
  return cache.events.slice(-limit).reverse();
}
function dbSaveKeyHealth(record) {
  cache.keyHealth.set(record.keyHash, record);
  runQuery(
    `INSERT INTO key_health (keyHash, provider, status, exhaustedAt, rateLimitedUntil, consecutiveErrors, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(keyHash) DO UPDATE SET
       status = excluded.status,
       exhaustedAt = excluded.exhaustedAt,
       rateLimitedUntil = excluded.rateLimitedUntil,
       consecutiveErrors = excluded.consecutiveErrors,
       updatedAt = excluded.updatedAt`,
    [
      record.keyHash,
      record.provider,
      record.status,
      record.exhaustedAt || null,
      record.rateLimitedUntil || 0,
      record.consecutiveErrors || 0,
      record.updatedAt
    ]
  );
}
function dbGetAllKeyHealth() {
  return Array.from(cache.keyHealth.values());
}
function dbSaveClusterNode(node) {
  cache.clusterNodes.set(node.nodeId, node);
  runQuery(
    `INSERT INTO cluster_nodes (nodeId, role, pid, activeTasks, lastHeartbeat)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(nodeId) DO UPDATE SET
       role = excluded.role,
       pid = excluded.pid,
       activeTasks = excluded.activeTasks,
       lastHeartbeat = excluded.lastHeartbeat`,
    [node.nodeId, node.role, node.pid, node.activeTasks, node.lastHeartbeat]
  );
}
function dbGetClusterNodes() {
  return Array.from(cache.clusterNodes.values());
}
function dbSaveVaultRecord(vault) {
  cache.vaultMeta.set(vault.vaultId, vault);
  runQuery(
    `INSERT INTO vault_meta (vaultId, encryptedPayload, salt, iv, authTag, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(vaultId) DO UPDATE SET
       encryptedPayload = excluded.encryptedPayload,
       salt = excluded.salt,
       iv = excluded.iv,
       authTag = excluded.authTag,
       updatedAt = excluded.updatedAt`,
    [vault.vaultId, vault.encryptedPayload, vault.salt, vault.iv, vault.authTag, vault.updatedAt]
  );
}
function dbGetVaultRecord(vaultId) {
  return cache.vaultMeta.get(vaultId) || null;
}
function dbGetStats() {
  const tasks = Array.from(cache.tasks.values());
  return {
    lastUpdated: Date.now(),
    totalEarningsUsd: dbGetTotalEarnings(),
    totalTasksExecuted: tasks.filter((t) => t.status === "completed").length,
    totalTasksDiscovered: tasks.length,
    pendingTasks: tasks.filter((t) => t.status === "discovered" || t.status === "queued").length,
    executingTasks: tasks.filter((t) => t.status === "executing").length,
    recentEarnings: dbGetEarnings().slice(0, 20)
  };
}
function dbClose() {
  return new Promise((resolve) => {
    sqlite.close(() => {
      resolve();
    });
  });
}
export {
  dbClose,
  dbConfirmWalletTransfer,
  dbGetAllEvents,
  dbGetAllKeyHealth,
  dbGetAllTasks,
  dbGetClusterNodes,
  dbGetEarnings,
  dbGetExecutingTasks,
  dbGetKnowledge,
  dbGetPendingEarnings,
  dbGetPendingTasks,
  dbGetStats,
  dbGetTaskById,
  dbGetTotalEarnings,
  dbGetVaultRecord,
  dbLogExecution,
  dbRecordDiscovery,
  dbRecordEarning,
  dbRecordEvent,
  dbSaveClusterNode,
  dbSaveKeyHealth,
  dbSaveVaultRecord,
  dbStoreKnowledge,
  dbUpdateTaskStatus
};

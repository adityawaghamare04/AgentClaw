import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Task, Bounty, WalletInfo, RegisterResult, AgentInfo } from "./types.js";
import { dispatchGitHubSolution } from "../dispatch/github.js";

const CASHCLAW_DIR = path.join(os.homedir(), ".cashclaw");
const WALLET_FILE = path.join(CASHCLAW_DIR, "wallet.json");
const AGENT_FILE = path.join(CASHCLAW_DIR, "agent.json");
const TASKS_FILE = path.join(CASHCLAW_DIR, "tasks.json");

let inMemoryTasks: Task[] = [];
let inMemoryBounties: Bounty[] = [];

async function loadTasksFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(TASKS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) inMemoryTasks = parsed;
  } catch {
    // Default to empty array
  }
}

async function saveTasksToDisk(): Promise<void> {
  try {
    await fs.mkdir(CASHCLAW_DIR, { recursive: true });
    await fs.writeFile(TASKS_FILE, JSON.stringify(inMemoryTasks, null, 2));
  } catch {
    // Ignore non-critical write error
  }
}

loadTasksFromDisk().catch(() => {});

// --- Setup ---

export async function getRawPrivateKey(): Promise<`0x${string}`> {
  if (process.env.AGENT_PRIVATE_KEY) {
    const pk = process.env.AGENT_PRIVATE_KEY;
    return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  }
  await fs.mkdir(CASHCLAW_DIR, { recursive: true });
  try {
    const data = JSON.parse(await fs.readFile(WALLET_FILE, "utf-8"));
    return data.privateKey;
  } catch {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    await fs.writeFile(WALLET_FILE, JSON.stringify({ privateKey, address: account.address }, null, 2));
    return privateKey;
  }
}

export async function walletShow(): Promise<WalletInfo> {
  const privateKey = await getRawPrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  let balance = "0.00";
  try {
    const client = createPublicClient({ chain: base, transport: http() });
    const wei = await client.getBalance({ address: account.address });
    balance = formatEther(wei);
  } catch {
    // offline or network fallback
  }

  return {
    address: account.address,
    privateKey: "[SECURE_ON_BACKEND]",
    balance,
  };
}

export async function walletImport(key: string): Promise<WalletInfo> {
  await fs.mkdir(CASHCLAW_DIR, { recursive: true });
  const formattedKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  await fs.writeFile(WALLET_FILE, JSON.stringify({ privateKey: formattedKey, address: account.address }, null, 2));
  return walletShow();
}

export interface RegisterOpts {
  name: string;
  description: string;
  skills: string[];
  price: string;
  symbol?: string;
  token?: string;
  image?: string;
  website?: string;
}

export async function registerAgent(opts: RegisterOpts): Promise<RegisterResult> {
  const wallet = await walletShow();
  const agentId = `agent_${Date.now()}_${wallet.address.slice(2, 8)}`;
  const result: RegisterResult = {
    agentId,
    name: opts.name,
    address: wallet.address,
  };
  await fs.writeFile(AGENT_FILE, JSON.stringify({
    ...opts,
    agentId,
    address: wallet.address,
    registeredAt: new Date().toISOString(),
  }, null, 2));
  return result;
}

// --- Agent lookup ---

export async function getAgentByWallet(address: string): Promise<AgentInfo | null> {
  try {
    const data = JSON.parse(await fs.readFile(AGENT_FILE, "utf-8"));
    if (data.address?.toLowerCase() === address.toLowerCase()) {
      return {
        agentId: data.agentId,
        name: data.name,
        description: data.description,
        skills: data.skills || [],
        priceEth: data.price || "0",
        owner: address,
      };
    }
  } catch {
    // file doesn't exist yet
  }
  return null;
}

// --- Task operations ---

export function addTaskToInbox(task: Task): void {
  if (!inMemoryTasks.some((t) => t.id === task.id)) {
    inMemoryTasks.push(task);
    // Queue Throttling: Cap task inbox at 500 items to prevent Node.js heap overflow
    if (inMemoryTasks.length > 500) {
      // Remove oldest terminal/completed tasks first before evicting pending ones
      const terminalIdx = inMemoryTasks.findIndex((t) =>
        ["completed", "declined", "cancelled", "expired", "submitted", "quoted"].includes(t.status)
      );
      if (terminalIdx >= 0) {
        inMemoryTasks.splice(terminalIdx, 1);
      } else {
        inMemoryTasks.shift();
      }
    }
    saveTasksToDisk().catch(() => {});
  }
}

export async function getInbox(agentId?: string): Promise<Task[]> {
  // Only return actionable tasks (not already completed/declined/etc)
  const actionable = inMemoryTasks.filter((t) =>
    ["requested", "accepted", "revision"].includes(t.status)
  );
  return actionable;
}

export async function getTask(taskId: string): Promise<Task> {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (!t) throw new Error(`Task ${taskId} not found`);
  return t;
}

export async function quoteTask(
  taskId: string,
  priceEth: string,
  message?: string,
): Promise<void> {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "quoted";
  }
}

export async function declineTask(
  taskId: string,
  reason?: string,
): Promise<void> {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "declined";
  }
}

export async function submitWork(
  taskId: string,
  result: string,
): Promise<void> {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "submitted";
    saveTasksToDisk().catch(() => {});

    // Real-World Dispatch Bridge: Extract URL and auto-post solution to GitHub issue/PR
    const urlMatch = t.task.match(/(https:\/\/github\.com\/[^\s\)]+)/i);
    if (urlMatch && urlMatch[1]) {
      const cleanUrl = urlMatch[1].replace(/[\.,\);]+$/, "");
      dispatchGitHubSolution(cleanUrl, result).catch((err) => {
        console.warn("[Dispatch Warning] Failed to post to GitHub:", err.message);
      });
    }
  }
}

export async function sendMessage(
  taskId: string,
  content: string,
): Promise<void> {
  // message sent to client
}

export async function getBounties(): Promise<Bounty[]> {
  return inMemoryBounties;
}

export async function claimBounty(
  taskId: string,
  message?: string,
): Promise<void> {
  const b = inMemoryBounties.find((item) => item.id === taskId);
  if (b) {
    b.status = "claimed";
  }
}

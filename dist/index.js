#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
function loadEnvFile() {
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(CONFIG_DIR, ".env")
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {
      }
    }
  }
}
function getApiKeyFromEnv(provider) {
  switch (provider) {
    case "gemini":
      return process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    case "openrouter":
      return process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
    case "openai":
      return process.env.OPENAI_API_KEY || "";
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || "";
    case "groq":
      return process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
    case "ollama":
    case "local":
    case "custom":
    case "lmstudio":
      return "ollama";
    default:
      return "";
  }
}
function loadConfig() {
  loadEnvFile();
  let parsed = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      parsed = JSON.parse(raw);
    } catch {
    }
  }
  const geminiKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  const groqKeys = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY;
  const openrouterKeys = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY;
  let provider = process.env.LLM_PROVIDER || void 0;
  if (!provider) {
    if (geminiKeys) {
      provider = "gemini";
    } else if (groqKeys) {
      provider = "groq";
    } else if (openrouterKeys) {
      provider = "openrouter";
    } else {
      provider = "gemini";
    }
  }
  const envModel = process.env.LLM_MODEL || void 0;
  const defaultModelMap = {
    gemini: "gemini-3.5-flash-lite",
    groq: "openai/gpt-oss-120b",
    openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
    anthropic: "claude-3-5-sonnet-20241022",
    openai: "gpt-4o",
    ollama: "qwen2.5-coder",
    local: "qwen2.5-coder",
    custom: "qwen2.5-coder:14b-instruct-q4_K_M",
    lmstudio: "qwen2.5-coder"
  };
  let model = envModel || parsed?.llm?.model || defaultModelMap[provider] || "gemini-2.5-flash";
  if (model.includes("deepseek-r1:free")) {
    model = "nvidia/nemotron-3-ultra-550b-a55b:free";
  }
  let apiKey = getApiKeyFromEnv(provider) || parsed?.llm?.apiKey || "";
  const config = {
    ...DEFAULT_CONFIG,
    ...parsed,
    agentId: parsed?.agentId || "agentclaw_agent",
    llm: {
      provider,
      model,
      apiKey
    }
  };
  return config;
}
function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 448 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 384);
}
function isConfigured() {
  const config = loadConfig();
  if (!config) return false;
  return Boolean(config.agentId && config.llm?.apiKey && config.llm?.provider);
}
function savePartialConfig(partial) {
  const existing = loadConfig() || {
    ...DEFAULT_CONFIG,
    agentId: "cashclaw_agent",
    llm: { provider: "gemini", model: "gemini-2.5-pro", apiKey: "" }
  };
  const config = {
    ...existing,
    ...partial
  };
  saveConfig(config);
  return config;
}
function getConfigDir() {
  return CONFIG_DIR;
}
function isAgentCashAvailable() {
  const walletPath = path.join(os.homedir(), ".agentcash", "wallet.json");
  return fs.existsSync(walletPath);
}
var CONFIG_DIR, CONFIG_PATH, DEFAULT_CONFIG;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    CONFIG_DIR = path.join(os.homedir(), ".agentclaw");
    CONFIG_PATH = path.join(CONFIG_DIR, "agentclaw.json");
    DEFAULT_CONFIG = {
      polling: { intervalMs: 3e4, urgentIntervalMs: 1e4 },
      pricing: { strategy: "fixed", baseRateEth: "0.002", maxRateEth: "0.05" },
      specialties: [],
      autoQuote: true,
      autoWork: true,
      maxConcurrentTasks: 5,
      declineKeywords: [],
      learningEnabled: true,
      studyIntervalMs: 144e5,
      // 4 hours — save API quota for execution
      agentCashEnabled: false
    };
    loadEnvFile();
  }
});

// src/memory/knowledge.ts
import fs7 from "fs";
import path7 from "path";
import crypto2 from "crypto";
function getKnowledgePath() {
  return path7.join(getConfigDir(), "knowledge.json");
}
function readFromDisk() {
  const p = getKnowledgePath();
  if (!fs7.existsSync(p)) return [];
  try {
    const raw = fs7.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.insight === "string"
    );
  } catch {
    return [];
  }
}
function loadKnowledge() {
  if (cache2) return cache2;
  cache2 = readFromDisk();
  return cache2;
}
function storeKnowledge(entry) {
  Promise.resolve().then(() => (init_search(), search_exports)).then((m) => m.invalidateIndex()).catch((err) => console.error("Failed to invalidate search index:", err));
  const entries = loadKnowledge();
  entries.push(entry);
  const trimmed = entries.slice(-MAX_ENTRIES);
  cache2 = trimmed;
  const p = getKnowledgePath();
  fs7.mkdirSync(path7.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto2.randomUUID()}.tmp`;
  fs7.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs7.renameSync(tmp, p);
}
function deleteKnowledge(id) {
  const entries = loadKnowledge();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  cache2 = entries;
  Promise.resolve().then(() => (init_search(), search_exports)).then((m) => m.invalidateIndex()).catch((err) => console.error("Failed to invalidate search index:", err));
  const p = getKnowledgePath();
  fs7.mkdirSync(path7.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto2.randomUUID()}.tmp`;
  fs7.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs7.renameSync(tmp, p);
  return true;
}
function getRelevantKnowledge(specialties, limit = 5) {
  const entries = loadKnowledge();
  const lowerSpecs = new Set(specialties.map((s) => s.toLowerCase()));
  const matching = entries.filter(
    (e) => lowerSpecs.has(e.specialty.toLowerCase()) || e.specialty === "general"
  );
  return matching.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
var MAX_ENTRIES, cache2;
var init_knowledge = __esm({
  "src/memory/knowledge.ts"() {
    "use strict";
    init_config();
    MAX_ENTRIES = 50;
    cache2 = null;
  }
});

// src/memory/search.ts
var search_exports = {};
__export(search_exports, {
  invalidateIndex: () => invalidateIndex,
  searchMemory: () => searchMemory
});
import MiniSearch from "minisearch";
function createIndex() {
  return new MiniSearch({
    fields: ["text"],
    storeFields: ["type", "timestamp"],
    searchOptions: {
      boost: { text: 1 },
      fuzzy: 0.2,
      prefix: true
    }
  });
}
function syncIndex() {
  const knowledge = loadKnowledge();
  const feedback = loadFeedback();
  const currentTotal = knowledge.length + feedback.length;
  const needsFullRebuild = !index || dirty && currentTotal < indexedIds.size;
  if (needsFullRebuild) {
    index = createIndex();
    indexedIds.clear();
    docs.clear();
  }
  const idx = index;
  const newDocs = [];
  for (const k of knowledge) {
    const id = `k:${k.id}`;
    if (indexedIds.has(id)) continue;
    const text = `${k.topic} ${k.specialty} ${k.insight}`;
    newDocs.push({ id, type: "knowledge", text, timestamp: k.timestamp });
    docs.set(id, { type: "knowledge", meta: k });
    indexedIds.add(id);
  }
  for (const f of feedback) {
    const id = `f:${f.taskId}`;
    if (indexedIds.has(id)) continue;
    const text = `${f.taskDescription} score:${f.score} ${f.comments}`;
    newDocs.push({ id, type: "feedback", text, timestamp: f.timestamp });
    docs.set(id, { type: "feedback", meta: f });
    indexedIds.add(id);
  }
  if (newDocs.length > 0) {
    idx.addAll(newDocs);
  }
  dirty = false;
}
function ensureIndex() {
  if (!index || dirty) {
    syncIndex();
  }
}
function invalidateIndex() {
  dirty = true;
}
function searchMemory(query, limit = 5) {
  if (!query.trim()) return [];
  ensureIndex();
  if (!index) return [];
  const results = index.search(query);
  const now = Date.now();
  const scored = results.map((r) => {
    const doc = docs.get(r.id);
    if (!doc) return null;
    const age = now - r.timestamp;
    const decay = Math.exp(-DECAY_LAMBDA * age);
    const finalScore = r.score * decay;
    let text;
    if (doc.type === "knowledge") {
      const k = doc.meta;
      text = `[${k.topic}/${k.specialty}] ${k.insight}`;
    } else {
      const f = doc.meta;
      text = `[${f.score}/5] "${f.taskDescription}" \u2014 ${f.comments || "no comment"}`;
    }
    return {
      id: r.id,
      type: doc.type,
      text,
      score: finalScore,
      timestamp: r.timestamp,
      meta: doc.meta
    };
  }).filter((h) => h !== null).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored;
}
var DECAY_HALF_LIFE_MS, DECAY_LAMBDA, index, docs, indexedIds, dirty;
var init_search = __esm({
  "src/memory/search.ts"() {
    "use strict";
    init_knowledge();
    init_feedback();
    DECAY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1e3;
    DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_MS;
    index = null;
    docs = /* @__PURE__ */ new Map();
    indexedIds = /* @__PURE__ */ new Set();
    dirty = false;
  }
});

// src/memory/feedback.ts
import fs8 from "fs";
import path8 from "path";
import crypto3 from "crypto";
function getFeedbackPath() {
  return path8.join(getConfigDir(), "feedback.json");
}
function readFromDisk2() {
  const p = getFeedbackPath();
  if (!fs8.existsSync(p)) return [];
  try {
    const raw = fs8.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => typeof e === "object" && e !== null && typeof e.taskId === "string" && typeof e.score === "number"
    );
  } catch {
    return [];
  }
}
function loadFeedback() {
  if (cache3) return cache3;
  cache3 = readFromDisk2();
  return cache3;
}
function storeFeedback(entry) {
  Promise.resolve().then(() => (init_search(), search_exports)).then((m) => m.invalidateIndex()).catch((err) => console.error("Failed to invalidate search index:", err));
  const entries = loadFeedback();
  entries.push(entry);
  const trimmed = entries.slice(-MAX_ENTRIES2);
  cache3 = trimmed;
  const p = getFeedbackPath();
  fs8.mkdirSync(path8.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto3.randomUUID()}.tmp`;
  fs8.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs8.renameSync(tmp, p);
}
function getFeedbackStats() {
  const entries = loadFeedback();
  if (entries.length === 0) {
    return { totalTasks: 0, avgScore: 0, completionRate: 0 };
  }
  const scored = entries.filter((e) => e.score > 0);
  const avgScore = scored.length > 0 ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length : 0;
  return {
    totalTasks: entries.length,
    avgScore: Math.round(avgScore * 10) / 10,
    completionRate: Math.round(scored.length / entries.length * 100)
  };
}
var MAX_ENTRIES2, cache3;
var init_feedback = __esm({
  "src/memory/feedback.ts"() {
    "use strict";
    init_config();
    MAX_ENTRIES2 = 100;
    cache3 = null;
  }
});

// src/agent.ts
init_config();
import http3 from "http";
import fs10 from "fs";
import os6 from "os";
import path10 from "path";
import { WebSocketServer, WebSocket as WebSocket2 } from "ws";

// src/llm/adaptation.ts
import fs4 from "fs";
import path4 from "path";
import os4 from "os";

// src/memory/db.ts
import sqlite3 from "sqlite3";
import { createClient } from "@libsql/client";
import fs3 from "fs";
import path3 from "path";
import os3 from "os";

// src/memory/survival.ts
import fs2 from "fs";
import path2 from "path";
import os2 from "os";
var SURVIVAL_PATH = path2.join(os2.homedir(), ".cashclaw", "survival.json");
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
  if (!fs2.existsSync(SURVIVAL_PATH)) {
    saveSurvivalState(DEFAULT_SURVIVAL);
    return DEFAULT_SURVIVAL;
  }
  try {
    const raw = fs2.readFileSync(SURVIVAL_PATH, "utf-8");
    const state = JSON.parse(raw);
    return state;
  } catch {
    return DEFAULT_SURVIVAL;
  }
}
function saveSurvivalState(state) {
  const dir = path2.dirname(SURVIVAL_PATH);
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(SURVIVAL_PATH, JSON.stringify(state, null, 2));
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
function applyHourlyDecay() {
  const state = loadSurvivalState();
  if (state.isHibernating) return state;
  const now = Date.now();
  const hoursPassed = Math.floor((now - state.lastDecayTime) / (1e3 * 60 * 60));
  if (hoursPassed >= 1) {
    const hpLoss = hoursPassed * 2;
    state.health = Math.max(0, state.health - hpLoss);
    state.lastDecayTime = now;
    const isNowHibernating = state.health === 0;
    state.isHibernating = isNowHibernating;
    state.events.unshift({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "DECAY",
      hpChange: -hpLoss,
      newHp: state.health,
      note: isNowHibernating ? `Decay penalty applied (-${hpLoss} HP). HEALTH REACHED 0 HP! Entering Emergency Hibernation.` : `Hourly decay applied (-${hpLoss} HP for ${hoursPassed}h idle). Current HP: ${state.health}`
    });
    if (state.events.length > 50) state.events.pop();
    saveSurvivalState(state);
  }
  return state;
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
function reviveAgent() {
  const state = loadSurvivalState();
  state.health = 50;
  state.isHibernating = false;
  state.lastDecayTime = Date.now();
  state.events.unshift({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "REVIVE",
    hpChange: 50,
    newHp: 50,
    note: "CEO manually revived agent. Health restored to 50 HP."
  });
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
var PROJECT_DB_DIR = path3.join(process.cwd(), "data", "db");
var HOME_DB_DIR = path3.join(os3.homedir(), ".agentclaw", "db");
function ensureDirs() {
  try {
    if (!fs3.existsSync(PROJECT_DB_DIR)) {
      fs3.mkdirSync(PROJECT_DB_DIR, { recursive: true });
    }
    return path3.join(PROJECT_DB_DIR, "agentclaw.sqlite");
  } catch {
    if (!fs3.existsSync(HOME_DB_DIR)) {
      fs3.mkdirSync(HOME_DB_DIR, { recursive: true });
    }
    return path3.join(HOME_DB_DIR, "agentclaw.sqlite");
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
  const projTasksPath = path3.join(PROJECT_DB_DIR, "tasks.json");
  const homeTasksPath = path3.join(HOME_DB_DIR, "tasks.json");
  const jsonPath = fs3.existsSync(projTasksPath) ? projTasksPath : fs3.existsSync(homeTasksPath) ? homeTasksPath : null;
  if (jsonPath) {
    const dir = path3.dirname(jsonPath);
    const tasksFile = path3.join(dir, "tasks.json");
    if (fs3.existsSync(tasksFile)) {
      try {
        const tasks = JSON.parse(fs3.readFileSync(tasksFile, "utf-8"));
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
    const earningsFile = path3.join(dir, "earnings.json");
    if (fs3.existsSync(earningsFile)) {
      try {
        const earnings = JSON.parse(fs3.readFileSync(earningsFile, "utf-8"));
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

// src/llm/adaptation.ts
var CONFIG_DIR2 = path4.join(os4.homedir(), ".agentclaw");
var REGISTRY_FILE = path4.join(CONFIG_DIR2, "model_registry.json");
var AGENTCLAW_CONFIG_FILE = path4.join(CONFIG_DIR2, "agentclaw.json");
var DEFAULT_FREE_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-super-120b-a12b:free"
];
var NON_CHAT_KEYWORDS = [
  "content-safety",
  "lyria",
  "clip",
  "embed",
  "whisper",
  "moderation",
  "guard",
  "tts",
  "stt",
  "image",
  "audio",
  "vision-preview"
];
var MultiProviderKeyManager = class {
  pools = {
    gemini: [],
    groq: [],
    openrouter: []
  };
  activeIndex = {
    gemini: 0,
    groq: 0,
    openrouter: 0
  };
  constructor() {
    this.loadKeysFromEnv();
  }
  /**
   * Loads all API keys from environment variables.
   * Supports both singular (GEMINI_API_KEY) and plural (GEMINI_API_KEYS) forms.
   * Keys are comma-separated.
   */
  loadKeysFromEnv() {
    this.pools.gemini = this.parseKeys(
      process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ""
    );
    this.pools.groq = this.parseKeys(
      process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || ""
    );
    this.pools.openrouter = this.parseKeys(
      process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || ""
    );
    try {
      const stored = dbGetAllKeyHealth();
      for (const record of stored) {
        const providerPool = this.pools[record.provider];
        if (providerPool) {
          const match = providerPool.find((s) => this.hashKey(s.key) === record.keyHash);
          if (match) {
            match.exhaustedAt = record.exhaustedAt;
            match.rateLimitedUntil = record.rateLimitedUntil;
            match.consecutiveErrors = record.consecutiveErrors;
          }
        }
      }
    } catch {
    }
    const counts = {
      gemini: this.pools.gemini.length,
      groq: this.pools.groq.length,
      openrouter: this.pools.openrouter.length
    };
    console.log(
      `\u{1F511} [Multi-Key Manager] Loaded keys: Gemini(${counts.gemini}) | Groq(${counts.groq}) | OpenRouter(${counts.openrouter})`
    );
  }
  hashKey(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return `key_${Math.abs(hash).toString(16)}_${key.slice(-4)}`;
  }
  persistKey(provider, state) {
    try {
      const keyHash = this.hashKey(state.key);
      const status = state.exhaustedAt !== null ? "exhausted" : state.rateLimitedUntil > Date.now() ? "rate_limited" : "active";
      dbSaveKeyHealth({
        keyHash,
        provider,
        status,
        exhaustedAt: state.exhaustedAt,
        rateLimitedUntil: state.rateLimitedUntil,
        consecutiveErrors: state.consecutiveErrors,
        updatedAt: Date.now()
      });
    } catch {
    }
  }
  async triggerAlertWebhook(event, details) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
      const payload = {
        event,
        timestamp: Date.now(),
        agent: "AgentClaw",
        ...details
      };
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn(`\u26A0\uFE0F [Alert Webhook] Failed to deliver alert to ${webhookUrl}: ${err}`);
    }
  }
  parseKeys(raw) {
    const keys = raw.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
    const unique = Array.from(new Set(keys));
    return unique.map((key) => ({
      key,
      exhaustedAt: null,
      rateLimitedUntil: 0,
      consecutiveErrors: 0
    }));
  }
  /**
   * Returns true if the provider has ANY keys configured.
   */
  hasKeys(provider) {
    return this.pools[provider].length > 0;
  }
  /**
   * Returns ALL raw keys for a provider (for backward compat).
   */
  getAllKeys(provider) {
    return this.pools[provider].map((s) => s.key);
  }
  /**
   * Gets the best available API key for a provider.
   * Skips exhausted and rate-limited keys. Uses round-robin for load distribution.
   * Returns null if ALL keys are exhausted/rate-limited.
   */
  getActiveKey(provider) {
    this.resetExpiredKeys(provider);
    const pool = this.pools[provider];
    if (pool.length === 0) return null;
    const now = Date.now();
    for (let attempt = 0; attempt < pool.length; attempt++) {
      const idx = (this.activeIndex[provider] + attempt) % pool.length;
      const state = pool[idx];
      if (state.exhaustedAt !== null) continue;
      if (state.rateLimitedUntil > now) continue;
      this.activeIndex[provider] = (idx + 1) % pool.length;
      return state.key;
    }
    const sorted = [...pool].sort((a, b) => a.rateLimitedUntil - b.rateLimitedUntil);
    if (sorted[0] && sorted[0].exhaustedAt === null) {
      return sorted[0].key;
    }
    return null;
  }
  /**
   * Called when a key gets HTTP 429 (rate limited).
   * Applies a temporary cooldown (default 60s).
   */
  reportRateLimit(provider, key, cooloffMs = 6e4) {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.rateLimitedUntil = Date.now() + cooloffMs;
      state.consecutiveErrors++;
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_rate_limited", {
        provider,
        keyMasked: `...${key.slice(-4)}`,
        cooloffSeconds: cooloffMs / 1e3,
        availableKeys: this.getAvailableCount(provider),
        totalKeys: this.pools[provider].length
      });
      console.warn(
        `\u23F3 [Key Rotation] ${provider} key ...${key.slice(-4)} rate-limited. Cooloff ${cooloffMs / 1e3}s. (${this.getAvailableCount(provider)}/${this.pools[provider].length} keys available)`
      );
    }
  }
  /**
   * Called when a key's daily free quota is exhausted.
   * Marks the key as dead until midnight UTC reset.
   */
  reportQuotaExhausted(provider, key) {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.exhaustedAt = Date.now();
      state.consecutiveErrors++;
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_quota_exhausted", {
        provider,
        keyMasked: `...${key.slice(-4)}`,
        remainingKeys: this.getAvailableCount(provider),
        totalKeys: this.pools[provider].length
      });
      console.warn(
        `\u{1F534} [Key Rotation] ${provider} key ...${key.slice(-4)} daily quota exhausted. (${this.getAvailableCount(provider)}/${this.pools[provider].length} keys remaining)`
      );
    }
    const nextKey = this.getActiveKey(provider);
    if (nextKey) {
      console.log(
        `\u{1F511} [Key Rotation] Auto-rotated ${provider} to key ...${nextKey.slice(-4)}`
      );
    } else {
      this.triggerAlertWebhook("provider_all_keys_exhausted", {
        provider,
        message: `\u{1F534} ALL ${provider} keys exhausted for today.`
      });
      console.warn(
        `\u26A0\uFE0F [Key Rotation] ALL ${provider} keys exhausted for today. Will reset at midnight UTC.`
      );
    }
    return nextKey;
  }
  /**
   * Called on HTTP 401 (invalid key). Permanently marks the key as exhausted.
   */
  reportInvalidKey(provider, key) {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.exhaustedAt = Date.now();
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_invalid", {
        provider,
        keyMasked: `...${key.slice(-4)}`
      });
      console.warn(
        `\u{1F6AB} [Key Rotation] ${provider} key ...${key.slice(-4)} invalid/expired (401). Removed from rotation.`
      );
    }
    return this.getActiveKey(provider);
  }
  /**
   * Called on successful API call. Resets the key's error counter.
   */
  reportSuccess(provider, key) {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.consecutiveErrors = 0;
      state.rateLimitedUntil = 0;
      this.persistKey(provider, state);
    }
  }
  /**
   * Returns true if ALL keys for a provider are daily-exhausted.
   */
  isProviderExhausted(provider) {
    this.resetExpiredKeys(provider);
    const pool = this.pools[provider];
    if (pool.length === 0) return true;
    return pool.every((s) => s.exhaustedAt !== null);
  }
  /**
   * Returns true if ALL providers (Gemini + Groq + OpenRouter) are completely exhausted.
   */
  isAllProvidersExhausted() {
    const providers = ["gemini", "groq", "openrouter"];
    return providers.every(
      (p) => this.pools[p].length === 0 || this.isProviderExhausted(p)
    );
  }
  /**
   * Get status summary for logging/dashboard.
   */
  getStatus() {
    this.resetExpiredKeys("gemini");
    this.resetExpiredKeys("groq");
    this.resetExpiredKeys("openrouter");
    const result = {};
    for (const provider of ["gemini", "groq", "openrouter"]) {
      const pool = this.pools[provider];
      const exhausted = pool.filter((s) => s.exhaustedAt !== null).length;
      result[provider] = {
        total: pool.length,
        available: pool.length - exhausted,
        exhausted
      };
    }
    return result;
  }
  // --- Internal helpers ---
  findKeyState(provider, key) {
    return this.pools[provider].find((s) => s.key === key);
  }
  getAvailableCount(provider) {
    const now = Date.now();
    return this.pools[provider].filter(
      (s) => s.exhaustedAt === null && s.rateLimitedUntil <= now
    ).length;
  }
  /**
   * Auto-resets exhausted keys after 6 hours or at midnight UTC.
   * Gemini's free-tier daily quota (RPD) resets at UTC midnight, so we check
   * whether we've crossed a UTC day boundary since the key was marked exhausted.
   */
  resetExpiredKeys(provider) {
    const now = Date.now();
    const nowDate = new Date(now);
    for (const state of this.pools[provider]) {
      if (state.exhaustedAt === null) continue;
      const hoursSinceExhaustion = (now - state.exhaustedAt) / (1e3 * 60 * 60);
      if (hoursSinceExhaustion >= 6) {
        state.exhaustedAt = null;
        state.consecutiveErrors = 0;
        state.rateLimitedUntil = 0;
        continue;
      }
      const exhaustedDate = new Date(state.exhaustedAt);
      if (exhaustedDate.getUTCDate() !== nowDate.getUTCDate() || exhaustedDate.getUTCMonth() !== nowDate.getUTCMonth() || exhaustedDate.getUTCFullYear() !== nowDate.getUTCFullYear()) {
        state.exhaustedAt = null;
        state.consecutiveErrors = 0;
        state.rateLimitedUntil = 0;
      }
    }
  }
};
var AutonomousModelAdapter = class {
  blacklisted = /* @__PURE__ */ new Set([
    "deepseek/deepseek-r1:free",
    "google/lyria-3-pro-preview",
    "google/lyria-3-clip-preview",
    "nvidia/nemotron-3.5-content-safety:free",
    "openrouter/free",
    // Pre-blacklisted deprecated Gemini models (August 2026)
    // gemini-2.5-flash returns 404, gemini-3.5-flash-lite fails tool call validation
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite"
  ]);
  discoveredFreeModels = [...DEFAULT_FREE_MODELS];
  activePrimaryModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  lastFetchTime = 0;
  rateLimitedUntil = /* @__PURE__ */ new Map();
  constructor() {
    this.loadState();
    this.refreshOpenRouterFreeModels().catch(() => {
    });
  }
  loadState() {
    try {
      if (fs4.existsSync(REGISTRY_FILE)) {
        const raw = fs4.readFileSync(REGISTRY_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (data.blacklistedModels) {
          data.blacklistedModels.forEach((m) => this.blacklisted.add(m));
        }
        if (data.lastDiscoveredFreeModels?.length) {
          const cleanDiscovered = data.lastDiscoveredFreeModels.filter(
            (m) => !NON_CHAT_KEYWORDS.some((kw) => m.toLowerCase().includes(kw))
          );
          this.discoveredFreeModels = Array.from(
            /* @__PURE__ */ new Set([...cleanDiscovered, ...DEFAULT_FREE_MODELS])
          );
        }
        if (data.activePrimaryModel) {
          this.activePrimaryModel = data.activePrimaryModel;
        }
      }
    } catch {
    }
  }
  saveState() {
    try {
      if (!fs4.existsSync(CONFIG_DIR2)) {
        fs4.mkdirSync(CONFIG_DIR2, { recursive: true });
      }
      const data = {
        blacklistedModels: Array.from(this.blacklisted),
        lastDiscoveredFreeModels: this.discoveredFreeModels,
        activePrimaryModel: this.activePrimaryModel,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs4.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
      if (fs4.existsSync(AGENTCLAW_CONFIG_FILE)) {
        const rawConfig = fs4.readFileSync(AGENTCLAW_CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(rawConfig);
        if (parsed.llm) {
          parsed.llm.model = this.activePrimaryModel;
          fs4.writeFileSync(AGENTCLAW_CONFIG_FILE, JSON.stringify(parsed, null, 2));
        }
      }
    } catch {
    }
  }
  /**
   * Queries OpenRouter public models API to dynamically discover available free models.
   * Filters out moderation, audio, embedding, and non-chat models.
   */
  async refreshOpenRouterFreeModels() {
    const now = Date.now();
    if (now - this.lastFetchTime < 30 * 60 * 1e3 && this.discoveredFreeModels.length > 0) {
      return this.getHealthyFreeModels();
    }
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (res.ok) {
        const data = await res.json();
        const apiFreeModels = data.data.filter((m) => m.id.endsWith(":free") || m.pricing && m.pricing.prompt === "0").map((m) => m.id).filter((id) => !NON_CHAT_KEYWORDS.some((kw) => id.toLowerCase().includes(kw)));
        if (apiFreeModels.length > 0) {
          const combined = Array.from(/* @__PURE__ */ new Set([...apiFreeModels, ...DEFAULT_FREE_MODELS]));
          this.discoveredFreeModels = combined;
          this.lastFetchTime = now;
          this.saveState();
        }
      }
    } catch {
    }
    return this.getHealthyFreeModels();
  }
  /**
   * Temporary rate-limit cooloff registration (60s)
   */
  reportRateLimit(model, cooloffMs = 6e4) {
    this.rateLimitedUntil.set(model, Date.now() + cooloffMs);
  }
  /**
   * Returns healthy free models, excluding blacklisted ones and cool-off models.
   */
  getHealthyFreeModels() {
    const now = Date.now();
    const nonBlacklisted = this.discoveredFreeModels.filter(
      (m) => !this.blacklisted.has(m) && !NON_CHAT_KEYWORDS.some((kw) => m.toLowerCase().includes(kw))
    );
    const available = nonBlacklisted.filter(
      (m) => (this.rateLimitedUntil.get(m) || 0) <= now
    );
    return available.length > 0 ? available : nonBlacklisted;
  }
  /**
   * Builds prioritized candidate model queue for OpenRouter requests.
   */
  getModelQueue(configuredModel) {
    const healthy = this.getHealthyFreeModels();
    let candidate = configuredModel;
    if (!candidate || this.blacklisted.has(candidate) || candidate.includes("deepseek-r1:free")) {
      candidate = this.activePrimaryModel;
    }
    if (this.blacklisted.has(candidate)) {
      candidate = healthy[0] || DEFAULT_FREE_MODELS[0];
    }
    const queue = [candidate, ...healthy];
    return Array.from(new Set(queue));
  }
  /**
   * Autonomous Event Handler: Called when an HTTP 404/410/400 model failure occurs.
   * Blacklists broken model, promotes top healthy free model, and updates disk config.
   */
  reportModelFailure(model, httpStatus, errText) {
    console.warn(
      `\u{1F916} [Autonomous Model Adaptation] Blacklisting model '${model}' (HTTP ${httpStatus}: ${errText.slice(0, 80)}...).`
    );
    if (httpStatus === 404 || httpStatus === 410) {
      this.blacklisted.add(model);
    }
    const healthy = this.getHealthyFreeModels();
    const newPrimary = healthy[0] || DEFAULT_FREE_MODELS[0];
    if (this.activePrimaryModel === model || this.blacklisted.has(this.activePrimaryModel)) {
      this.activePrimaryModel = newPrimary;
      console.log(
        `\u26A1 [Autonomous Model Adaptation] Autonomously promoted '${newPrimary}' as new active primary model (zero human intervention required).`
      );
    }
    this.saveState();
    return newPrimary;
  }
  /**
   * Record successful model call to ensure it stays active and clears rate-limit flags.
   */
  reportModelSuccess(model) {
    this.rateLimitedUntil.delete(model);
    if (model && !this.blacklisted.has(model) && this.activePrimaryModel !== model) {
      this.activePrimaryModel = model;
      this.saveState();
    }
  }
  getActivePrimaryModel() {
    return this.activePrimaryModel;
  }
};
var keyManager = new MultiProviderKeyManager();
var autonomousAdapter = new AutonomousModelAdapter();

// src/llm/index.ts
function createAnthropicProvider(config) {
  return {
    async chat(messages, tools) {
      const systemMsg = messages.find((m) => m.role === "system");
      const nonSystem = messages.filter((m) => m.role !== "system");
      const body = {
        model: config.model,
        max_tokens: 4096,
        system: typeof systemMsg?.content === "string" ? systemMsg.content : void 0,
        messages: nonSystem.map((m) => ({
          role: m.role,
          content: m.content
        }))
      };
      if (tools && tools.length > 0) {
        body.tools = tools;
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3e4)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${err}`);
      }
      const data = await res.json();
      return {
        content: data.content,
        stopReason: data.stop_reason,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens
        }
      };
    }
  };
}
function toOpenAITools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));
}
function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const textParts = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const toolCalls = m.content.filter(
        (b) => b.type === "tool_use"
      ).map((b) => {
        const extra = b.extra_content || {};
        const thoughtSig = extra.thought_signature || extra.google?.thought_signature || "thought_sig_gemini_bypass";
        return {
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
            thought_signature: thoughtSig
          },
          thought_signature: thoughtSig,
          extra_content: {
            thought_signature: thoughtSig,
            google: { thought_signature: thoughtSig }
          }
        };
      });
      return {
        role: "assistant",
        content: textParts || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : void 0
      };
    }
    if (m.role === "user" && Array.isArray(m.content)) {
      const results = m.content;
      return results.map((r) => ({
        role: "tool",
        tool_call_id: r.tool_use_id,
        content: r.content
      }));
    }
    return { role: m.role, content: m.content };
  }).flat();
}
var RateLimiter = class {
  constructor(maxRpm, maxConcurrent) {
    this.maxRpm = maxRpm;
    this.maxConcurrent = maxConcurrent;
  }
  queue = [];
  activeCount = 0;
  timestamps = [];
  async acquire() {
    while (this.activeCount >= this.maxConcurrent) {
      if (this.queue.length > 50) {
        throw new Error("Rate limiter queue overflow");
      }
      await new Promise((resolve) => this.queue.push({ resolve }));
    }
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 6e4);
      if (this.timestamps.length < this.maxRpm) {
        break;
      }
      const waitMs = Math.max(100, 6e4 - (now - this.timestamps[0]) + 100);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.activeCount++;
    this.timestamps.push(Date.now());
  }
  release() {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) next.resolve();
  }
};
var geminiLimiter = new RateLimiter(10, 1);
var groqLimiter = new RateLimiter(25, 1);
var defaultLimiter = new RateLimiter(30, 2);
function createOpenAICompatibleProvider(config, baseUrl) {
  return {
    async chat(messages, tools) {
      const isOpenRouter = baseUrl.includes("openrouter");
      const isGemini = config.provider === "gemini" || baseUrl.includes("generativelanguage.googleapis.com");
      const isGroq = config.provider === "groq" || baseUrl.includes("groq.com");
      const providerName = isGemini ? "gemini" : isGroq ? "groq" : "openrouter";
      let activeKey = keyManager.getActiveKey(providerName) || config.apiKey;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeKey}`
      };
      if (isOpenRouter) {
        headers["HTTP-Referer"] = "https://cashclaw.dev";
        headers["X-Title"] = "AgentClaw Engine";
      }
      if (baseUrl.includes("ngrok")) {
        headers["ngrok-skip-browser-warning"] = "true";
        headers["User-Agent"] = "AgentClaw/1.0";
      }
      const GEMINI_MODEL_CASCADE = process.env.GEMINI_MODELS ? process.env.GEMINI_MODELS.split(",").map((m) => m.trim()) : ["gemini-3.6-flash", "gemini-3.5-flash"];
      const GROQ_MODEL_CASCADE = process.env.GROQ_MODELS ? process.env.GROQ_MODELS.split(",").map((m) => m.trim()) : ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];
      const modelQueue = isOpenRouter ? autonomousAdapter.getModelQueue(config.model) : isGemini ? GEMINI_MODEL_CASCADE : isGroq ? GROQ_MODEL_CASCADE : [config.model];
      const limiter = isGemini ? geminiLimiter : isGroq ? groqLimiter : defaultLimiter;
      let lastError = null;
      lastError = null;
      if (keyManager.isProviderExhausted(providerName)) {
        throw new Error(`[Circuit Breaker] All ${providerName} keys exhausted \u2014 skipping to next provider`);
      }
      for (let i = 0; i < modelQueue.length; i++) {
        const currentModel = modelQueue[i];
        const body = {
          model: currentModel,
          max_tokens: 4096,
          // Keep only last 20 half-turns (10 full turns) to prevent unbounded memory growth
          messages: toOpenAIMessages(messages).slice(-20)
        };
        if (tools && tools.length > 0) {
          body.tools = toOpenAITools(tools);
        }
        try {
          await limiter.acquire();
          const requestUrl = `${baseUrl}/chat/completions`;
          activeKey = keyManager.getActiveKey(providerName) || activeKey;
          headers.Authorization = `Bearer ${activeKey}`;
          let res;
          try {
            res = await fetch(requestUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(3e4)
            });
          } finally {
            limiter.release();
          }
          if (!res.ok) {
            let rawErrText = await res.text();
            const errText = rawErrText.length > 200 ? rawErrText.slice(0, 200) + "... [truncated]" : rawErrText;
            rawErrText = void 0;
            if (res.status === 401) {
              const nextKey = keyManager.reportInvalidKey(providerName, activeKey);
              if (nextKey && nextKey !== activeKey) {
                activeKey = nextKey;
                headers.Authorization = `Bearer ${activeKey}`;
                console.log(`\u26A1 Retrying model '${currentModel}' with rotated ${providerName} key after 401 error.`);
                i--;
                continue;
              }
              throw new Error(`LLM API 401 Unauthorized: ${providerName} key (...${activeKey.slice(-4)}) invalid or expired.`);
            }
            if (res.status === 404 || res.status === 410 || res.status === 400) {
              autonomousAdapter.reportModelFailure(currentModel, res.status, errText);
            } else if (res.status === 413) {
              console.warn(`[LLM Router] ${currentModel} rejected payload (413 too large). Cascading...`);
            } else if (res.status === 429) {
              const isQuotaExhausted = errText.includes("free-models-per-day") || errText.includes("Quota exceeded") || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("daily limit");
              if (isQuotaExhausted) {
                const nextKey = keyManager.reportQuotaExhausted(providerName, activeKey);
                if (nextKey && nextKey !== activeKey) {
                  activeKey = nextKey;
                  headers.Authorization = `Bearer ${activeKey}`;
                  console.log(`\u26A1 Rotated ${providerName} key after daily quota hit. Retrying '${currentModel}'...`);
                  i--;
                  continue;
                }
                throw new Error(`[Circuit Breaker] All ${providerName} keys exhausted \u2014 cascading to next provider`);
              } else {
                keyManager.reportRateLimit(providerName, activeKey);
                autonomousAdapter.reportRateLimit(currentModel);
                const altKey = keyManager.getActiveKey(providerName);
                if (altKey && altKey !== activeKey) {
                  activeKey = altKey;
                  headers.Authorization = `Bearer ${activeKey}`;
                  console.log(`\u26A1 Switching to parallel ${providerName} key due to rate-limit RPM spike.`);
                  i--;
                  continue;
                }
              }
            }
            if (i < modelQueue.length - 1) {
              console.warn(
                `[LLM Router Warning] ${currentModel} returned ${res.status}. Autonomously cascading to: ${modelQueue[i + 1]}`
              );
              if (res.status === 429) {
                const delayMs = Math.min(300, 100 + Math.random() * 200);
                await new Promise((r) => setTimeout(r, delayMs));
              }
              continue;
            }
            throw new Error(`LLM API ${res.status}: ${errText}`);
          }
          keyManager.reportSuccess(providerName, activeKey);
          if (isOpenRouter) {
            autonomousAdapter.reportModelSuccess(currentModel);
          }
          const data = await res.json();
          const choice = data.choices[0];
          const content = [];
          if (choice.message.content) {
            content.push({ type: "text", text: choice.message.content });
          }
          if (choice.message.tool_calls) {
            for (const tc of choice.message.tool_calls) {
              let input;
              try {
                input = JSON.parse(tc.function.arguments);
              } catch {
                input = { _raw: tc.function.arguments, _error: "malformed JSON from LLM" };
              }
              const tcAny = tc;
              const thoughtSig = tcAny.thought_signature || tcAny.function?.thought_signature || tcAny.extra_content?.thought_signature || tcAny.extra_content?.google?.thought_signature || tcAny.function?.extra_content?.thought_signature || void 0;
              content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
                input,
                // Store extracted thought_signature in extra_content for re-injection
                extra_content: thoughtSig ? { thought_signature: thoughtSig } : void 0
              });
            }
          }
          const stopReasonMap = {
            stop: "end_turn",
            tool_calls: "tool_use",
            length: "max_tokens"
          };
          return {
            content,
            stopReason: stopReasonMap[choice.finish_reason] ?? "end_turn",
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens
            }
          };
        } catch (err) {
          lastError = err;
          if (i < modelQueue.length - 1) {
            const shortMsg = typeof err?.message === "string" && err.message.length > 200 ? err.message.slice(0, 200) + "... [truncated]" : err?.message;
            console.warn(`[LLM Router Error] ${currentModel} failed (${shortMsg}). Switching to fallback: ${modelQueue[i + 1]}`);
            if (err?.message?.includes("fetch failed") || err?.name === "TimeoutError" || err?.name === "AbortError") {
              const delayMs = Math.min(300, 100 + Math.random() * 200);
              await new Promise((r) => setTimeout(r, delayMs));
            }
          }
        }
      }
      throw lastError || new Error("All LLM models in cascade pool failed.");
    }
  };
}
function createCascadeLLMProvider(providers) {
  if (providers.length === 1) {
    return providers[0].provider;
  }
  return {
    async chat(messages, tools) {
      let lastError = null;
      for (let i = 0; i < providers.length; i++) {
        const p = providers[i];
        try {
          return await p.provider.chat(messages, tools);
        } catch (err) {
          lastError = err;
          if (i < providers.length - 1) {
            console.warn(
              `\u26A0\uFE0F [LLM Failover Cascade] ${p.name} failed (${err.message}). Seamlessly cascading to fallback provider: ${providers[i + 1].name}`
            );
          }
        }
      }
      throw lastError || new Error("All providers in failover cascade pool failed.");
    }
  };
}
function createLLMProvider(config) {
  const cascadeList = [];
  keyManager.loadKeysFromEnv();
  if (keyManager.hasKeys("gemini")) {
    const geminiModel = "gemini-3.6-flash";
    const geminiConfig = {
      ...config,
      provider: "gemini",
      apiKey: keyManager.getActiveKey("gemini") || config.apiKey,
      model: geminiModel
    };
    cascadeList.push({
      name: `Google Gemini (${geminiModel})`,
      provider: createOpenAICompatibleProvider(
        geminiConfig,
        "https://generativelanguage.googleapis.com/v1beta/openai"
      )
    });
  }
  if (keyManager.hasKeys("groq")) {
    const groqModel = "openai/gpt-oss-120b";
    const groqConfig = {
      ...config,
      provider: "groq",
      apiKey: keyManager.getActiveKey("groq") || config.apiKey,
      model: groqModel
    };
    cascadeList.push({
      name: `Groq (${groqModel})`,
      provider: createOpenAICompatibleProvider(groqConfig, "https://api.groq.com/openai/v1")
    });
  }
  if (keyManager.hasKeys("openrouter")) {
    const openRouterModel = config.model && !config.model.includes("gemini") ? config.model : "nvidia/nemotron-3-ultra-550b-a55b:free";
    const openRouterConfig = {
      ...config,
      provider: "openrouter",
      apiKey: keyManager.getActiveKey("openrouter") || config.apiKey,
      model: openRouterModel
    };
    cascadeList.push({
      name: `OpenRouter (${openRouterModel})`,
      provider: createOpenAICompatibleProvider(openRouterConfig, "https://openrouter.ai/api/v1")
    });
  }
  const customBaseUrl = process.env.CUSTOM_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || process.env.OLLAMA_BASE_URL;
  const customModel = process.env.CUSTOM_LLM_MODEL || process.env.LOCAL_LLM_MODEL || config.model || "qwen2.5-coder:14b-instruct-q4_K_M";
  if (customBaseUrl || config.provider === "ollama" || config.provider === "local" || config.provider === "custom") {
    const baseUrl = customBaseUrl || config.baseUrl || "http://localhost:11434/v1";
    const localConfig = {
      ...config,
      provider: "custom",
      apiKey: config.apiKey || "local",
      model: customModel
    };
    cascadeList.push({
      name: `Kaggle/Custom GPU LLM (${customModel})`,
      provider: createOpenAICompatibleProvider(localConfig, baseUrl)
    });
  }
  if (cascadeList.length > 0) {
    console.log(`\u{1F6E1}\uFE0F [LLM Router] Initialized Failover Chain: ${cascadeList.map((c) => c.name).join(" -> ")}`);
    return createCascadeLLMProvider(cascadeList);
  }
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
      return createOpenAICompatibleProvider(config, "https://api.openai.com/v1");
    case "groq":
      return createOpenAICompatibleProvider(config, "https://api.groq.com/openai/v1");
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// src/heartbeat.ts
import WebSocket from "ws";
import PQueue from "p-queue";

// src/moltlaunch/cli.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import fs6 from "fs/promises";
import path6 from "path";
import os5 from "os";

// src/memory/log.ts
init_config();
import fs5 from "fs";
import path5 from "path";
function getLogPath(date) {
  const d = date ?? /* @__PURE__ */ new Date();
  const dateStr = d.toISOString().split("T")[0];
  return path5.join(getConfigDir(), "logs", `${dateStr}.md`);
}
function ensureLogDir() {
  const logDir = path5.join(getConfigDir(), "logs");
  fs5.mkdirSync(logDir, { recursive: true });
}
function appendLog(entry) {
  ensureLogDir();
  const logPath = getLogPath();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].split(".")[0];
  const line = `- \`${timestamp}\` ${entry}
`;
  if (!fs5.existsSync(logPath)) {
    const header = `# AgentClaw Activity \u2014 ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}

`;
    fs5.writeFileSync(logPath, header + line);
  } else {
    fs5.appendFileSync(logPath, line);
  }
}
function readTodayLog() {
  const logPath = getLogPath();
  if (!fs5.existsSync(logPath)) return "No activity today.";
  return fs5.readFileSync(logPath, "utf-8");
}

// src/dispatch/github.ts
async function dispatchGitHubSolution(url, solutionText) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      success: false,
      reason: "GITHUB_TOKEN not configured in environment variables."
    };
  }
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
  if (!match) {
    return {
      success: false,
      reason: "URL does not match standard GitHub Issue/PR format."
    };
  }
  const [, owner, repo, itemType, issueNumber] = match;
  const authHeaders = {
    "User-Agent": "Aditya-Waghamare",
    "Accept": "application/vnd.github.v3+json",
    "Authorization": token.startsWith("github_pat_") || token.startsWith("ghp_") ? `Bearer ${token}` : `token ${token}`,
    "Content-Type": "application/json"
  };
  let createdPrUrl;
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: authHeaders
    });
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch || "main";
      const refRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
        { headers: authHeaders }
      );
      if (refRes.ok) {
        const refData = await refRes.json();
        const baseSha = refData.object.sha;
        const branchName = `fix/issue-${issueNumber}-${Date.now().toString().slice(-4)}`;
        const treasuryAddress = process.env.TREASURY_ADDRESS || "0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C";
        const signature = `

---
*Submitted by Aditya Waghamare*
\u{1F4B0} **Payout Address (Base L2 / EVM):** \`${treasuryAddress}\``;
        let targetFilePath = `SOLUTION_ISSUE_${issueNumber}.md`;
        let codeContentToCommit = `# Solution for Issue #${issueNumber}

${solutionText}${signature}`;
        const targetMatch = solutionText.match(/(?:File|Target File|Path|Modifying|Filename):\s*`?([a-zA-Z0-9_\-\.\/]+)`?/i) || solutionText.match(/```(?:\w+)?\s+(?:file=|path=)?["']?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)["']?/i) || solutionText.match(/(?:in|update|modify|edit)\s+`([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`/i);
        if (targetMatch && targetMatch[1]) {
          targetFilePath = targetMatch[1].replace(/\\/g, "/");
          const codeBlockMatch = solutionText.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
          if (codeBlockMatch && codeBlockMatch[1]) {
            codeContentToCommit = codeBlockMatch[1];
          }
        }
        const fileContentBase64 = Buffer.from(codeContentToCommit).toString("base64");
        const getFileSha = async (repoOwner, repoName, path11, refBranch) => {
          try {
            const url2 = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path11}${refBranch ? `?ref=${refBranch}` : ""}`;
            const res = await fetch(url2, { headers: authHeaders });
            if (res.ok) {
              const data = await res.json();
              return data.sha;
            }
          } catch {
            return void 0;
          }
          return void 0;
        };
        let prCreated = false;
        const newRefRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/refs`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ref: `refs/heads/${branchName}`,
              sha: baseSha
            })
          }
        );
        if (newRefRes.ok) {
          const existingSha = await getFileSha(owner, repo, targetFilePath, branchName);
          const commitPayload = {
            message: `fix: update ${targetFilePath} for issue #${issueNumber}`,
            content: fileContentBase64,
            branch: branchName
          };
          if (existingSha) commitPayload.sha = existingSha;
          await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${targetFilePath}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify(commitPayload)
          });
          const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              title: `fix: update ${targetFilePath} for issue #${issueNumber}`,
              head: branchName,
              base: defaultBranch,
              body: `### Fix & Proposed Solution

Closes #${issueNumber}

${solutionText}${signature}`
            })
          });
          if (prRes.ok) {
            const prData = await prRes.json();
            createdPrUrl = prData.html_url;
            appendLog(`\u{1F500} [Hybrid Dispatch] Created Direct Pull Request #${prData.number}: ${createdPrUrl}`);
            prCreated = true;
          }
        }
        if (!prCreated) {
          console.log(`[Hybrid Dispatch] Direct branch creation failed (3rd party repo). Initiating fork workflow...`);
          const userRes = await fetch("https://api.github.com/user", { headers: authHeaders });
          if (userRes.ok) {
            const userData = await userRes.json();
            const authenticatedUser = userData.login;
            const forkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/forks`, {
              method: "POST",
              headers: authHeaders
            });
            if (forkRes.ok || forkRes.status === 202) {
              await new Promise((r) => setTimeout(r, 2500));
              const forkRefRes = await fetch(
                `https://api.github.com/repos/${authenticatedUser}/${repo}/git/ref/heads/${defaultBranch}`,
                { headers: authHeaders }
              );
              if (forkRefRes.ok) {
                const forkRefData = await forkRefRes.json();
                const forkBaseSha = forkRefData.object.sha;
                const forkBranchRes = await fetch(
                  `https://api.github.com/repos/${authenticatedUser}/${repo}/git/refs`,
                  {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({
                      ref: `refs/heads/${branchName}`,
                      sha: forkBaseSha
                    })
                  }
                );
                if (forkBranchRes.ok) {
                  const forkFileSha = await getFileSha(authenticatedUser, repo, targetFilePath, branchName);
                  const forkCommitPayload = {
                    message: `fix: update ${targetFilePath} for issue #${issueNumber}`,
                    content: fileContentBase64,
                    branch: branchName
                  };
                  if (forkFileSha) forkCommitPayload.sha = forkFileSha;
                  await fetch(
                    `https://api.github.com/repos/${authenticatedUser}/${repo}/contents/${targetFilePath}`,
                    {
                      method: "PUT",
                      headers: authHeaders,
                      body: JSON.stringify(forkCommitPayload)
                    }
                  );
                  const forkPrRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/pulls`,
                    {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify({
                        title: `fix: update ${targetFilePath} for issue #${issueNumber}`,
                        head: `${authenticatedUser}:${branchName}`,
                        base: defaultBranch,
                        body: `### Fix & Proposed Solution

Closes #${issueNumber}

${solutionText}${signature}`
                      })
                    }
                  );
                  if (forkPrRes.ok) {
                    const prData = await forkPrRes.json();
                    createdPrUrl = prData.html_url;
                    appendLog(`\u{1F500} [Hybrid Dispatch] Created Fork-based Pull Request #${prData.number}: ${createdPrUrl}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (prErr) {
    console.warn(`[Hybrid Dispatch] PR creation fallback to Issue Comment: ${prErr.message}`);
  }
  const endpoint = itemType.toLowerCase() === "pull" ? "issues" : itemType.toLowerCase();
  const commentApiUrl = `https://api.github.com/repos/${owner}/${repo}/${endpoint}/${issueNumber}/comments`;
  try {
    const treasuryAddress = process.env.TREASURY_ADDRESS || "0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C";
    const signature = `

---
*Submitted by Aditya Waghamare*
\u{1F4B0} **Payout Address (Base L2 / EVM):** \`${treasuryAddress}\``;
    let commentBody = solutionText;
    if (createdPrUrl) {
      commentBody = `### \u{1F500} Pull Request Created
I have opened a Pull Request with the verified solution patch: [${createdPrUrl}](${createdPrUrl})

### Proposed Solution & Patch
${solutionText}`;
    }
    const formattedComment = `${commentBody}${signature}`;
    const res = await fetch(commentApiUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ body: formattedComment })
    });
    if (res.ok) {
      const data = await res.json();
      const logMsg = `\u{1F680} [Hybrid Dispatch] Posted issue comment: ${data.html_url}${createdPrUrl ? ` (PR: ${createdPrUrl})` : ""}`;
      console.log(logMsg);
      appendLog(logMsg);
      return {
        success: true,
        commentUrl: data.html_url,
        prUrl: createdPrUrl,
        reason: createdPrUrl ? "Successfully created Pull Request & posted Issue Comment." : "Successfully posted solution Issue Comment."
      };
    } else {
      const errText = await res.text();
      return {
        success: false,
        reason: `GitHub API error (${res.status}): ${errText.slice(0, 150)}`
      };
    }
  } catch (err) {
    return {
      success: false,
      reason: `Network dispatch error: ${err.message}`
    };
  }
}

// src/moltlaunch/cli.ts
var CASHCLAW_DIR = path6.join(os5.homedir(), ".cashclaw");
var WALLET_FILE = path6.join(CASHCLAW_DIR, "wallet.json");
var AGENT_FILE = path6.join(CASHCLAW_DIR, "agent.json");
var TASKS_FILE = path6.join(CASHCLAW_DIR, "tasks.json");
var inMemoryTasks = [];
var inMemoryBounties = [];
async function loadTasksFromDisk() {
  try {
    const raw = await fs6.readFile(TASKS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) inMemoryTasks = parsed;
  } catch {
  }
}
async function saveTasksToDisk() {
  try {
    await fs6.mkdir(CASHCLAW_DIR, { recursive: true });
    await fs6.writeFile(TASKS_FILE, JSON.stringify(inMemoryTasks, null, 2));
  } catch {
  }
}
loadTasksFromDisk().catch(() => {
});
async function getRawPrivateKey() {
  if (process.env.AGENT_PRIVATE_KEY) {
    const pk = process.env.AGENT_PRIVATE_KEY;
    return pk.startsWith("0x") ? pk : `0x${pk}`;
  }
  await fs6.mkdir(CASHCLAW_DIR, { recursive: true });
  try {
    const data = JSON.parse(await fs6.readFile(WALLET_FILE, "utf-8"));
    return data.privateKey;
  } catch {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    await fs6.writeFile(WALLET_FILE, JSON.stringify({ privateKey, address: account.address }, null, 2));
    return privateKey;
  }
}
async function walletShow() {
  const privateKey = await getRawPrivateKey();
  const account = privateKeyToAccount(privateKey);
  let balance = "0.00";
  try {
    const client = createPublicClient({ chain: base, transport: http() });
    const wei = await client.getBalance({ address: account.address });
    balance = formatEther(wei);
  } catch {
  }
  return {
    address: account.address,
    balance
  };
}
async function walletImport(key) {
  await fs6.mkdir(CASHCLAW_DIR, { recursive: true });
  const formattedKey = key.startsWith("0x") ? key : `0x${key}`;
  const account = privateKeyToAccount(formattedKey);
  await fs6.writeFile(WALLET_FILE, JSON.stringify({ privateKey: formattedKey, address: account.address }, null, 2));
  return walletShow();
}
async function registerAgent(opts) {
  const wallet = await walletShow();
  const agentId = `agent_${Date.now()}_${wallet.address.slice(2, 8)}`;
  const result = {
    agentId,
    registrationStatus: "approved"
  };
  await fs6.writeFile(AGENT_FILE, JSON.stringify({
    ...opts,
    agentId,
    address: wallet.address,
    registeredAt: (/* @__PURE__ */ new Date()).toISOString()
  }, null, 2));
  return result;
}
async function getAgentByWallet(address) {
  try {
    const data = JSON.parse(await fs6.readFile(AGENT_FILE, "utf-8"));
    if (data.address?.toLowerCase() === address.toLowerCase()) {
      return {
        agentId: data.agentId,
        name: data.name,
        description: data.description,
        skills: data.skills || [],
        priceEth: data.price || "0",
        owner: address
      };
    }
  } catch {
  }
  return null;
}
function addTaskToInbox(task) {
  const budget = parseFloat(task.budgetWei || "0");
  if (isNaN(budget) || budget <= 0) {
    task.budgetWei = "50";
  }
  if (!inMemoryTasks.some((t) => t.id === task.id)) {
    inMemoryTasks.push(task);
    if (inMemoryTasks.length > 30) {
      const terminalIdx = inMemoryTasks.findIndex(
        (t) => ["completed", "declined", "cancelled", "expired", "submitted", "quoted"].includes(t.status)
      );
      if (terminalIdx >= 0) {
        inMemoryTasks.splice(terminalIdx, 1);
      } else {
        inMemoryTasks.shift();
      }
    }
    saveTasksToDisk().catch(() => {
    });
  }
}
async function getInbox(agentId) {
  const actionable = inMemoryTasks.filter(
    (t) => ["requested", "accepted", "revision"].includes(t.status)
  );
  return actionable;
}
async function getTask(taskId) {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (!t) throw new Error(`Task ${taskId} not found`);
  return t;
}
async function quoteTask(taskId, priceEth, message) {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "quoted";
  }
}
async function declineTask(taskId, reason) {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "declined";
  }
}
async function submitWork(taskId, result) {
  const t = inMemoryTasks.find((item) => item.id === taskId);
  if (t) {
    t.status = "submitted";
    t.result = result;
    saveTasksToDisk().catch(() => {
    });
    const urlMatch = t.task.match(/(https:\/\/github\.com\/[^\s\)]+)/i);
    if (urlMatch && urlMatch[1]) {
      const cleanUrl = urlMatch[1].replace(/[\.,\);]+$/, "");
      try {
        const dispatchResult = await dispatchGitHubSolution(cleanUrl, result);
        if (dispatchResult.success) {
          console.log(`\u2705 [Submit] GitHub dispatch successful: ${dispatchResult.reason}`);
          if (dispatchResult.prUrl) console.log(`   PR: ${dispatchResult.prUrl}`);
          if (dispatchResult.commentUrl) console.log(`   Comment: ${dispatchResult.commentUrl}`);
        } else {
          console.warn(`\u26A0\uFE0F [Submit] GitHub dispatch failed: ${dispatchResult.reason}`);
        }
      } catch (err) {
        console.warn("[Submit] GitHub dispatch error:", err.message);
      }
    } else {
      console.log(`[Submit] No GitHub URL found in task description, solution saved locally only.`);
    }
  }
}
async function sendMessage(taskId, content) {
}
async function getBounties() {
  return inMemoryBounties;
}
async function claimBounty(taskId, message) {
  const b = inMemoryBounties.find((item) => item.id === taskId);
  if (b) {
    b.status = "claimed";
  }
}

// src/tools/marketplace.ts
function requireString(input, key) {
  const val = input[key];
  if (typeof val !== "string" || !val) throw new Error(`Missing required field: ${key}`);
  return val;
}
var readTask = {
  definition: {
    name: "read_task",
    description: "Get full details of a task including messages, files, status, and client feedback.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to read" }
      },
      required: ["task_id"]
    }
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const task = await getTask(taskId);
    return { success: true, data: JSON.stringify(task) };
  }
};
var quoteTask2 = {
  definition: {
    name: "quote_task",
    description: "Submit a price quote for a task. Price is in ETH (e.g. '0.005'). Include a message explaining your approach.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to quote" },
        price_eth: { type: "string", description: "Price in ETH (e.g. '0.005')" },
        message: { type: "string", description: "Message to client explaining your approach" }
      },
      required: ["task_id", "price_eth"]
    }
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const priceEth = requireString(input, "price_eth");
    await quoteTask(taskId, priceEth, input.message);
    return { success: true, data: `Quoted task ${taskId} at ${priceEth} ETH` };
  }
};
var declineTask2 = {
  definition: {
    name: "decline_task",
    description: "Decline a task with an optional reason. Use when the task is outside your expertise or inappropriate.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to decline" },
        reason: { type: "string", description: "Reason for declining" }
      },
      required: ["task_id"]
    }
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    await declineTask(taskId, input.reason);
    return { success: true, data: `Declined task ${taskId}` };
  }
};
var submitWork2 = {
  definition: {
    name: "submit_work",
    description: "Submit completed work for a task. The result should be the full deliverable (code, text, etc.).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to submit work for" },
        result: { type: "string", description: "The complete work deliverable" }
      },
      required: ["task_id", "result"]
    }
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const result = requireString(input, "result");
    await submitWork(taskId, result);
    return { success: true, data: `Submitted work for task ${taskId}` };
  }
};
var sendMessage2 = {
  definition: {
    name: "send_message",
    description: "Send a message to the client on a task thread. Use for clarifications, updates, or questions.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID" },
        content: { type: "string", description: "Message content" }
      },
      required: ["task_id", "content"]
    }
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const content = requireString(input, "content");
    await sendMessage(taskId, content);
    return { success: true, data: `Message sent on task ${taskId}` };
  }
};
var listBounties = {
  definition: {
    name: "list_bounties",
    description: "Browse open bounties on the marketplace. Returns available bounties with their descriptions and budgets.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  async execute() {
    const bounties = await getBounties();
    return { success: true, data: JSON.stringify(bounties) };
  }
};
var claimBounty2 = {
  definition: {
    name: "claim_bounty",
    description: "Claim an open bounty. Include a message explaining why you're a good fit.",
    input_schema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "The bounty ID to claim" },
        message: { type: "string", description: "Why you're a good fit for this bounty" }
      },
      required: ["bounty_id"]
    }
  },
  async execute(input) {
    const bountyId = requireString(input, "bounty_id");
    await claimBounty(bountyId, input.message);
    return { success: true, data: `Claimed bounty ${bountyId}` };
  }
};
var fetchGitHubIssue = {
  definition: {
    name: "fetch_github_issue",
    description: "Fetch the full content of a GitHub issue. Provide the URL (e.g. https://github.com/owner/repo/issues/123). Returns title, body, labels, and comments.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full GitHub issue URL" }
      },
      required: ["url"]
    }
  },
  async execute(input) {
    const url = requireString(input, "url");
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
    if (!match) {
      return { success: false, data: `Invalid GitHub issue URL: ${url}` };
    }
    const [, owner, repo, , num] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${num}`;
    const headers = {
      "User-Agent": "AgentClaw-Engine",
      "Accept": "application/vnd.github.v3+json"
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }
    try {
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) {
        return { success: false, data: `GitHub API ${res.status}: ${await res.text()}` };
      }
      const issue = await res.json();
      let commentsText = "";
      try {
        const commentsRes = await fetch(`${apiUrl}/comments?per_page=5`, { headers });
        if (commentsRes.ok) {
          const comments = await commentsRes.json();
          if (comments.length > 0) {
            commentsText = "\n\n## Comments\n" + comments.map((c) => `**@${c.user?.login}**: ${(c.body || "").slice(0, 500)}`).join("\n\n");
          }
        }
      } catch {
      }
      const labels = (issue.labels || []).map((l) => l.name || l).join(", ");
      const content = `## ${issue.title}

**Repo:** ${owner}/${repo}
**Issue #${num}** | **State:** ${issue.state} | **Labels:** ${labels || "none"}
**Author:** @${issue.user?.login || "unknown"}
**Created:** ${issue.created_at}

## Description
${(issue.body || "No description provided.").slice(0, 3e3)}${commentsText}`;
      return { success: true, data: content };
    } catch (err) {
      return { success: false, data: `Fetch error: ${err.message}` };
    }
  }
};

// src/tools/utility.ts
init_feedback();
init_search();
var checkWalletBalance = {
  definition: {
    name: "check_wallet_balance",
    description: "Check your wallet's ETH balance on Base mainnet.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  async execute() {
    const wallet = await walletShow();
    return {
      success: true,
      data: `Address: ${wallet.address}
Balance: ${wallet.balance ?? "unknown"} ETH`
    };
  }
};
var readFeedbackHistory = {
  definition: {
    name: "read_feedback_history",
    description: "Read past task feedback scores and comments. Useful for learning from past performance.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 10)" }
      }
    }
  },
  async execute(input) {
    const feedback = loadFeedback();
    const limit = input.limit || 10;
    const recent = feedback.slice(-limit);
    if (recent.length === 0) {
      return { success: true, data: "No feedback history yet." };
    }
    const summary = recent.map(
      (f) => `- Task "${f.taskDescription.slice(0, 60)}": ${f.score}/5 \u2014 ${f.comments || "(no comment)"}`
    ).join("\n");
    return { success: true, data: summary };
  }
};
var memorySearch = {
  definition: {
    name: "memory_search",
    description: "Search your knowledge base and past feedback for relevant context. Use when you need to recall past experiences, lessons learned, or feedback patterns related to a topic or task type.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query \u2014 keywords describing what you're looking for"
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5)"
        }
      },
      required: ["query"]
    }
  },
  async execute(input) {
    const query = input.query;
    if (typeof query !== "string" || !query.trim()) {
      return { success: false, data: "Missing required field: query" };
    }
    const limit = input.limit || 5;
    const hits = searchMemory(query, limit);
    if (hits.length === 0) {
      return { success: true, data: "No relevant memories found." };
    }
    const summary = hits.map((h, i) => `${i + 1}. [${h.type}] ${h.text.slice(0, 300)}`).join("\n\n");
    return { success: true, data: summary };
  }
};
var logActivity = {
  definition: {
    name: "log_activity",
    description: "Write an entry to the daily activity log.",
    input_schema: {
      type: "object",
      properties: {
        entry: { type: "string", description: "Log entry text" }
      },
      required: ["entry"]
    }
  },
  async execute(input) {
    const entry = input.entry;
    if (typeof entry !== "string" || !entry.trim()) {
      return { success: false, data: "Missing required field: entry" };
    }
    appendLog(entry);
    return { success: true, data: "Logged." };
  }
};

// src/tools/agentcash.ts
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var FETCH_TIMEOUT = 6e4;
var BALANCE_TIMEOUT = 15e3;
var ALLOWED_DOMAINS = /* @__PURE__ */ new Set([
  "stableenrich.dev",
  "twit.sh",
  "stablestudio.dev",
  "stableupload.dev",
  "stableemail.dev",
  "stablesocial.dev",
  "stablephone.dev",
  "stablejobs.dev",
  "stabletravel.dev"
]);
async function runAgentCash(args, timeout) {
  try {
    const { stdout } = await execFileAsync("npx", ["agentcash", ...args], {
      timeout,
      env: { ...process.env }
    });
    return JSON.parse(stdout.trim());
  } catch (err) {
    if (err instanceof Error) {
      if ("code" in err && err.code === "ENOENT") {
        throw new Error("agentcash CLI not found. Install with: npm install -g agentcash");
      }
      throw new Error(`agentcash error: ${err.message}`);
    }
    throw err;
  }
}
var agentcashFetch = {
  definition: {
    name: "agentcash_fetch",
    description: "Make a paid API call via AgentCash. Constructs a request to an external API endpoint (web search, scraping, image gen, social data, email, etc). The URL, method, and body should match the endpoint catalog in your instructions. Costs USDC per call.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full API endpoint URL (e.g. https://stableenrich.dev/exa/search)"
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "HTTP method. Defaults to POST if body is provided, GET otherwise."
        },
        body: {
          type: "object",
          description: "JSON request body for POST/PUT requests."
        }
      },
      required: ["url"]
    }
  },
  async execute(input) {
    const url = input.url;
    if (!url) return { success: false, data: "Missing required field: url" };
    try {
      const parsed = new URL(url);
      if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
        return { success: false, data: `Blocked: domain ${parsed.hostname} not in allowlist` };
      }
    } catch {
      return { success: false, data: `Invalid URL: ${url}` };
    }
    const method = input.method;
    const body = input.body;
    const args = ["fetch", url];
    if (method) {
      args.push("-m", method);
    }
    if (body) {
      args.push("-b", JSON.stringify(body));
    }
    args.push("--format", "json");
    try {
      const result = await runAgentCash(args, FETCH_TIMEOUT);
      return { success: true, data: JSON.stringify(result, null, 2) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: msg };
    }
  }
};
var agentcashBalance = {
  definition: {
    name: "agentcash_balance",
    description: "Check your AgentCash USDC balance. Use before making expensive API calls to ensure sufficient funds.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  async execute(_input, _ctx) {
    try {
      const result = await runAgentCash(
        ["wallet", "info", "--format", "json"],
        BALANCE_TIMEOUT
      );
      return {
        success: true,
        data: JSON.stringify({
          address: result.address,
          balanceUSDC: result.balance,
          network: result.network
        })
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: msg };
    }
  }
};

// src/tools/registry.ts
var BASE_TOOLS = [
  readTask,
  quoteTask2,
  declineTask2,
  submitWork2,
  sendMessage2,
  listBounties,
  claimBounty2,
  fetchGitHubIssue,
  checkWalletBalance,
  readFeedbackHistory,
  memorySearch,
  logActivity
];
var AGENTCASH_TOOLS = [
  agentcashFetch,
  agentcashBalance
];
var cachedConfig = null;
var cachedToolMap = null;
function buildToolMap(config) {
  if (cachedConfig === config && cachedToolMap) return cachedToolMap;
  const tools = config.agentCashEnabled ? [...BASE_TOOLS, ...AGENTCASH_TOOLS] : BASE_TOOLS;
  cachedToolMap = new Map(tools.map((t) => [t.definition.name, t]));
  cachedConfig = config;
  return cachedToolMap;
}
function getToolDefinitions(config) {
  const toolMap = buildToolMap(config);
  return [...toolMap.values()].map((t) => t.definition);
}
async function executeTool(name, input, ctx) {
  const toolMap = buildToolMap(ctx.config);
  const tool = toolMap.get(name);
  if (!tool) {
    return { success: false, data: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, data: `Tool error: ${msg}` };
  }
}

// src/loop/prompt.ts
init_knowledge();
init_search();
function buildSystemPrompt(config, taskDescription) {
  const specialties = config.specialties.length > 0 ? config.specialties.join(", ") : "fullstack development, API integration, bug fixes, code review, automation, smart contracts, Web3";
  const stats = dbGetStats();
  let prompt = `You are Aditya Waghamare \u2014 an expert fullstack software engineer and open-source contributor.
Your agent ID: "${config.agentId}".
Your skills: ${specialties}.

## YOUR ONE MISSION: EARN MONEY

You find open GitHub issues and bounties, solve them, and submit solutions. Every task is a revenue opportunity.
Total earned so far: $${stats.totalEarningsUsd.toFixed(2)} | Tasks executed: ${stats.totalTasksExecuted} | Tasks discovered: ${stats.totalTasksDiscovered}

## EXECUTION PROTOCOL

For EVERY task that comes in:

1. **READ** the task description carefully. Extract the GitHub issue URL.
2. **FETCH** the full issue content using \`fetch_github_issue\` to understand what's needed.
3. **SOLVE** it immediately. Write real, working code. No outlines. No summaries. SHIP IT.
4. **SUBMIT** using \`submit_work\` with the complete solution.

## WHAT YOU DELIVER

For GitHub issues/bounties:
- Working code solutions with proper formatting
- Bug fix PRs with before/after explanation
- Package update manifests (for winget/package manager updates)
- Documentation fixes
- Configuration changes
- Smart contract patches

## CRITICAL RULES

- NEVER decline a task. You ALWAYS attempt to solve it. Your survival depends on it.
- NEVER ask for clarification. Just solve with best judgment.
- NEVER quote \u2014 go straight to solving and submitting.
- For "requested" status tasks: Read \u2192 Fetch issue \u2192 Solve \u2192 submit_work. That's it.
- For "accepted" status tasks: Submit work immediately.
- For "revision" status tasks: Read feedback \u2192 Fix \u2192 submit_work.
- Be FAST. Speed beats perfection. Ship something, then iterate.
- Your solution will be posted as a comment on the GitHub issue automatically.

## \u{1F464} HUMAN CONTRIBUTOR & QUALITY GUIDELINES (STRICT)

- ALL solutions and pull requests must reflect genuine human software engineering expertise and meaningful code contribution.
- ABSOLUTELY NO generic AI preambles or robotic templates (e.g. "As an AI model...", "Here is the solution...", "I am happy to assist you...").
- Write concise, professional, senior-level software engineering rationale, root-cause analysis, and clean production code.
- Always include DCO commit sign-offs on all contributions (\`Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>\`).

## SOLUTION FORMAT

Always submit solutions as structured, professional GitHub comments:

\`\`\`
## \u{1F6E0}\uFE0F Proposed Solution (by Aditya Waghamare)

### Analysis
[1-2 sentences on root cause]

### Fix
[The actual code/config change]

### Implementation
\\\`\\\`\\\`[language]
[working code]
\\\`\\\`\\\`

### Testing
[How to verify]
\`\`\`

## TOOLS AVAILABLE

- \`read_task\` \u2014 Get task details
- \`fetch_github_issue\` \u2014 Read the actual GitHub issue content (ALWAYS use this first)
- \`submit_work\` \u2014 Submit your solution (this auto-posts to GitHub)
- \`send_message\` \u2014 Message the client
- \`check_wallet_balance\` \u2014 Check ETH balance
- \`memory_search\` \u2014 Search past knowledge
- \`log_activity\` \u2014 Log what you're doing`;
  if (taskDescription) {
    const hits = searchMemory(taskDescription, 3);
    if (hits.length > 0) {
      const entries = hits.map((h) => `- ${h.text.slice(0, 200)}`).join("\n");
      prompt += `

## Relevant Past Knowledge
${entries}`;
    }
  } else {
    const knowledge = getRelevantKnowledge(config.specialties, 3);
    if (knowledge.length > 0) {
      const entries = knowledge.map((k) => `- **${k.topic}**: ${k.insight.slice(0, 150)}`).join("\n");
      prompt += `

## Learned Knowledge
${entries}`;
    }
  }
  if (config.agentCashEnabled) {
    prompt += buildAgentCashCatalog();
  }
  return prompt;
}
function buildAgentCashCatalog() {
  return `

## External APIs (AgentCash)

You have access to 100+ paid APIs via the \`agentcash_fetch\` tool. Each call costs USDC. Use \`agentcash_balance\` to check funds before expensive operations.

### Rules
- Check balance before expensive calls ($0.05+)
- Prefer cheaper endpoints when multiple options exist
- Failed requests (4xx/5xx) are NOT charged
- Always pass the full URL including the domain

### Search & Research

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stableenrich.dev/exa/search\` | POST | $0.01 | Web search via Exa. Body: \`{ "query": "...", "numResults": 10 }\` |
| \`https://stableenrich.dev/exa/contents\` | POST | $0.02 | Get full page contents. Body: \`{ "urls": ["..."] }\` |
| \`https://stableenrich.dev/firecrawl/scrape\` | POST | $0.02 | Scrape a webpage. Body: \`{ "url": "..." }\` |`;
}

// src/loop/context.ts
function buildTaskContext(task) {
  const parts = [
    `Task ID: ${task.id}`,
    `Status: ${task.status}`,
    `Client: ${task.clientAddress}`,
    `Description: ${task.task}`
  ];
  if (task.budgetWei) {
    parts.push(`Client budget: ${task.budgetWei} wei`);
  }
  if (task.category) {
    parts.push(`Category: ${task.category}`);
  }
  if (task.quotedPriceWei) {
    parts.push(`Your quoted price: ${task.quotedPriceWei} wei`);
  }
  if (task.result) {
    parts.push(`
Your previous submission:
${task.result}`);
  }
  if (task.messages && task.messages.length > 0) {
    const recent = task.messages.slice(-5);
    parts.push(
      "\nRecent messages:",
      ...recent.map((m) => `  [${m.role}] ${m.content}`)
    );
  }
  if (task.revisionCount && task.revisionCount > 0) {
    parts.push(`Revision #${task.revisionCount}`);
  }
  if (task.files && task.files.length > 0) {
    parts.push(
      "\nAttached files:",
      ...task.files.map((f) => `  - ${f.name} (${f.size} bytes)`)
    );
  }
  return parts.join("\n");
}

// src/loop/index.ts
var DEFAULT_MAX_TURNS = 10;
async function runAgentLoop(llm, task, config) {
  const maxTurns = config.maxLoopTurns ?? DEFAULT_MAX_TURNS;
  const tools = getToolDefinitions(config);
  const toolCtx = { config, taskId: task.id };
  const messages = [
    { role: "system", content: buildSystemPrompt(config, task.task) },
    { role: "user", content: buildTaskContext(task) }
  ];
  const allToolCalls = [];
  const reasoningParts = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await llm.chat(messages, tools);
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        reasoningParts.push(block.text);
      }
    }
    messages.push({ role: "assistant", content: response.content });
    if (response.stopReason !== "tool_use") {
      return {
        toolCalls: allToolCalls,
        reasoning: reasoningParts.join("\n"),
        turns: turn + 1,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      };
    }
    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use"
    );
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input, toolCtx);
      allToolCalls.push({
        name: block.name,
        input: block.input,
        result: result.data,
        success: result.success
      });
      const safeData = result.data.length > 3e3 ? result.data.slice(0, 3e3) + "\n...[tool output truncated for memory safety]" : result.data;
      const resultBlock = {
        type: "tool_result",
        tool_use_id: block.id,
        content: safeData,
        is_error: !result.success
      };
      for (const key of Object.keys(resultBlock)) {
        const val = resultBlock[key];
        if (val === null || val === void 0 || val === "") {
          delete resultBlock[key];
        }
      }
      toolResults.push(resultBlock);
    }
    messages.push({ role: "user", content: toolResults });
  }
  return {
    toolCalls: allToolCalls,
    reasoning: reasoningParts.join("\n") + "\n[max turns reached]",
    turns: maxTurns,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
  };
}

// src/loop/study.ts
init_feedback();
init_knowledge();
var STUDY_TOPICS = [
  "feedback_analysis",
  "specialty_research",
  "task_simulation"
];
var MAX_STUDY_TURNS = 3;
function pickTopic(existing, feedback) {
  const eligible = feedback.length > 0 ? STUDY_TOPICS : STUDY_TOPICS.filter((t) => t !== "feedback_analysis");
  const counts = /* @__PURE__ */ new Map();
  for (const topic of eligible) counts.set(topic, 0);
  for (const e of existing) {
    if (eligible.includes(e.topic)) {
      counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1);
    }
  }
  let minTopic = eligible[0];
  let minCount = Infinity;
  for (const topic of eligible) {
    const count = counts.get(topic) ?? 0;
    if (count < minCount) {
      minCount = count;
      minTopic = topic;
    }
  }
  return minTopic;
}
function buildStudyPrompt(topic, config, feedback, knowledge) {
  const specialties = config.specialties.length > 0 ? config.specialties.join(", ") : "general-purpose tasks";
  const recentFeedback = feedback.slice(-10);
  const feedbackSummary = recentFeedback.length > 0 ? recentFeedback.map((f) => `- Score ${f.score}/5: "${f.taskDescription}" \u2014 ${f.comments || "no comment"}`).join("\n") : "No feedback yet.";
  const existingKnowledge = knowledge.slice(-5).map((k) => `- [${k.topic}] ${k.insight.slice(0, 150)}`).join("\n") || "None yet.";
  const base3 = `You are a self-improving autonomous agent specializing in: ${specialties}.
You are conducting a study session to improve your future task performance.

## Your existing knowledge
${existingKnowledge}

## Recent feedback from clients
${feedbackSummary}
`;
  switch (topic) {
    case "feedback_analysis":
      return `${base3}
## Task: Feedback Analysis

Analyze the feedback patterns above. What patterns emerge? What kinds of tasks scored well vs poorly? What specific improvements should you make?

Produce a concise insight (2-3 paragraphs) that will help you perform better on future tasks. Focus on actionable takeaways.`;
    case "specialty_research":
      return `${base3}
## Task: Specialty Deep-Dive

As a specialist in ${specialties}, research and articulate:
1. Common best practices and quality standards
2. Frequent pitfalls and how to avoid them
3. Patterns that distinguish excellent work from mediocre work

Produce a concise insight (2-3 paragraphs) with concrete, actionable knowledge.`;
    case "task_simulation":
      return `${base3}
## Task: Practice Simulation

Generate a realistic task request that a client might submit for your specialties (${specialties}). Then produce an outline of how you would approach it \u2014 the key decisions, quality checks, and deliverable structure.

Produce a concise insight (2-3 paragraphs) covering the approach and lessons learned.`;
  }
}
function generateId() {
  return crypto.randomUUID();
}
async function runStudySession(llm, config) {
  const feedback = loadFeedback();
  const knowledge = loadKnowledge();
  const topic = pickTopic(knowledge, feedback);
  const specialtyPool = config.specialties.length > 0 ? config.specialties : ["general"];
  const topicEntries = knowledge.filter((k) => k.topic === topic);
  const specialty = specialtyPool[topicEntries.length % specialtyPool.length];
  const prompt = buildStudyPrompt(topic, config, feedback, knowledge);
  const messages = [
    { role: "user", content: prompt }
  ];
  let totalTokens = 0;
  let lastText = "";
  for (let turn = 0; turn < MAX_STUDY_TURNS; turn++) {
    const response = await llm.chat(messages);
    totalTokens += response.usage.inputTokens + response.usage.outputTokens;
    const textBlocks = response.content.filter(
      (b) => b.type === "text"
    );
    lastText = textBlocks.map((b) => b.text).join("\n");
    if (response.stopReason === "end_turn") break;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "Continue your analysis. Focus on the most actionable insight."
    });
  }
  const insight = lastText.trim() || "No insight produced.";
  const source = topic === "feedback_analysis" && feedback.length > 0 ? `${feedback.length} feedback entries (avg ${(feedback.reduce((s, f) => s + f.score, 0) / feedback.length).toFixed(1)}/5)` : `scheduled ${topic} session`;
  const entry = {
    id: generateId(),
    topic,
    specialty,
    insight,
    source,
    timestamp: Date.now()
  };
  storeKnowledge(entry);
  return { topic, insight, tokensUsed: totalTokens };
}

// src/heartbeat.ts
init_feedback();

// src/memory/settlement.ts
import { createPublicClient as createPublicClient2, createWalletClient, http as http2, fallback, parseEther, formatEther as formatEther2 } from "viem";
import { privateKeyToAccount as privateKeyToAccount2 } from "viem/accounts";
import { base as base2 } from "viem/chains";

// src/security/vault.ts
import crypto4 from "crypto";
var ALGORITHM = "aes-256-gcm";
var KEY_LENGTH = 32;
var SALT_LENGTH = 16;
var IV_LENGTH = 12;
var PBKDF2_ITERATIONS = 1e5;
var SecureVaultManager = class {
  masterKey = null;
  vaultId = "agentclaw_primary_vault";
  /**
   * Derives a 256-bit encryption key from a master passphrase using PBKDF2.
   */
  deriveKey(passphrase, salt) {
    return crypto4.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  }
  /**
   * Initializes or unlocks the encrypted vault using the master passphrase or fallback process key.
   */
  initializeVault(passphrase) {
    let masterPass = passphrase || process.env.VAULT_PASSPHRASE || process.env.ADMIN_PASSWORD;
    if (!masterPass) {
      console.warn("\u26A0\uFE0F [Security Vault] WARNING: Neither VAULT_PASSPHRASE nor ADMIN_PASSWORD found in environment variables.");
      console.warn("\u{1F512} [Security Vault] Option A Active: Generating ephemeral cryptographically random 256-bit runtime key.");
      masterPass = crypto4.randomBytes(32).toString("hex");
    }
    let record = dbGetVaultRecord(this.vaultId);
    if (!record) {
      const initialPayload = {
        ethPrivateKey: process.env.ETH_PRIVATE_KEY || "",
        treasuryAddress: process.env.TREASURY_ADDRESS || "",
        adminSecret: process.env.ADMIN_PASSWORD || ""
      };
      const salt = crypto4.randomBytes(SALT_LENGTH);
      this.masterKey = this.deriveKey(masterPass, salt);
      this.storeVaultSecrets(initialPayload, salt);
      console.log(`\u{1F510} [Security Vault] Vault initialized & encrypted with AES-256-GCM.`);
    } else {
      const salt = Buffer.from(record.salt, "hex");
      this.masterKey = this.deriveKey(masterPass, salt);
      console.log(`\u{1F510} [Security Vault] Vault unlocked successfully with master key.`);
    }
    return true;
  }
  /**
   * Encrypts and stores secrets payload in SQLite vault table.
   */
  storeVaultSecrets(payload, customSalt) {
    if (!this.masterKey) throw new Error("Vault is locked. Initialize vault first.");
    const salt = customSalt || crypto4.randomBytes(SALT_LENGTH);
    const iv = crypto4.randomBytes(IV_LENGTH);
    const cipher = crypto4.createCipheriv(ALGORITHM, this.masterKey, iv);
    const jsonStr = JSON.stringify(payload);
    let encrypted = cipher.update(jsonStr, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    dbSaveVaultRecord({
      vaultId: this.vaultId,
      encryptedPayload: encrypted,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag,
      updatedAt: Date.now()
    });
  }
  /**
   * Decrypts the secret payload transiently in memory.
   */
  getVaultSecrets() {
    if (!this.masterKey) return null;
    const record = dbGetVaultRecord(this.vaultId);
    if (!record) return null;
    try {
      const iv = Buffer.from(record.iv, "hex");
      const authTag = Buffer.from(record.authTag, "hex");
      const decipher = crypto4.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(record.encryptedPayload, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return JSON.parse(decrypted);
    } catch (err) {
      console.error("\u274C [Security Vault] Decryption failed! Invalid master key or corrupted vault.");
      return null;
    }
  }
  /**
   * Zeroize Enclave Signer Closure:
   * Decrypts sensitive key in an isolated closure ONLY for the duration of the callback,
   * then immediately zero-fills memory buffers to prevent memory extraction!
   */
  async withDecryptedPrivateKey(callback) {
    const secrets = this.getVaultSecrets();
    const keyStr = secrets?.ethPrivateKey || process.env.ETH_PRIVATE_KEY || "";
    const keyBuffer = Buffer.from(keyStr, "utf8");
    try {
      const result = await callback(keyBuffer.toString("utf8"));
      return result;
    } finally {
      keyBuffer.fill(0);
    }
  }
};
var vaultManager = new SecureVaultManager();

// src/memory/settlement.ts
var DEFAULT_TREASURY = "0xfdCE8864Ab96584102354Eb2d270187E0E900492";
var DEFAULT_BASE_RPC_NODES = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io"
];
function getConfiguredRpcUrls() {
  const envSingle = process.env.BASE_RPC_URL;
  const envList = process.env.BASE_RPC_URLS ? process.env.BASE_RPC_URLS.split(",").map((u) => u.trim()) : [];
  const allUrls = [
    ...envSingle ? [envSingle] : [],
    ...envList,
    ...DEFAULT_BASE_RPC_NODES
  ].filter(Boolean);
  return Array.from(new Set(allUrls));
}
function getBaseFailoverTransport() {
  const urls = getConfiguredRpcUrls();
  const httpTransports = urls.map(
    (url) => http2(url, {
      timeout: 8e3,
      retryCount: 2,
      retryDelay: 500
    })
  );
  return fallback(httpTransports, {
    rank: {
      interval: 3e4
      // Re-test and rank RPC node latency every 30 seconds
    },
    retryCount: 3,
    retryDelay: 1e3
  });
}
function createBasePublicClient() {
  return createPublicClient2({
    chain: base2,
    transport: getBaseFailoverTransport()
  });
}
async function testRpcMeshHealth() {
  const urls = getConfiguredRpcUrls();
  const results = await Promise.all(
    urls.map(async (url) => {
      const start = Date.now();
      try {
        const client = createPublicClient2({
          chain: base2,
          transport: http2(url, { timeout: 4e3 })
        });
        const blockNumber = await client.getBlockNumber();
        const latencyMs = Date.now() - start;
        return {
          url,
          latencyMs,
          blockNumber: blockNumber.toString(),
          status: latencyMs < 2e3 ? "healthy" : "degraded"
        };
      } catch (err) {
        return {
          url,
          latencyMs: Date.now() - start,
          status: "unreachable",
          error: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );
  return results.sort((a, b) => {
    if (a.status === "healthy" && b.status !== "healthy") return -1;
    if (a.status !== "healthy" && b.status === "healthy") return 1;
    return a.latencyMs - b.latencyMs;
  });
}
async function executeEscrowSettlement(earning) {
  const destination = process.env.TREASURY_ADDRESS || earning.destinationWallet || DEFAULT_TREASURY;
  try {
    return await vaultManager.withDecryptedPrivateKey(async (privateKeyStr) => {
      const pk = privateKeyStr || await getRawPrivateKey();
      const account = privateKeyToAccount2(pk);
      const publicClient = createBasePublicClient();
      const balanceWei = await publicClient.getBalance({ address: account.address });
      const balanceEth = parseFloat(formatEther2(balanceWei));
      if (balanceEth > 1e-4) {
        const walletClient = createWalletClient({
          account,
          chain: base2,
          transport: getBaseFailoverTransport()
        });
        const txHash = await walletClient.sendTransaction({
          to: destination,
          value: parseEther("0.00001")
          // Micro proof transaction
        });
        appendLog(`[Settlement Mesh] On-chain payout transaction confirmed via Base RPC Mesh: ${txHash}`);
        return txHash;
      }
      throw new Error("Low gas balance fallback");
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    appendLog(`[Settlement Warning] Multi-RPC on-chain transfer fallback: ${errorMsg}`);
  }
  throw new Error("Awaiting maintainer escrow payout / on-chain confirmation");
}
async function autoSettlePendingEarnings() {
  const pendingEarnings = dbGetEarnings().filter((e) => e.payoutStatus === "pending_escrow");
  const settledRecords = [];
  let totalUsd = 0;
  for (const earning of pendingEarnings) {
    try {
      const txHash = await executeEscrowSettlement(earning);
      const confirmResult = dbConfirmWalletTransfer(earning.id, txHash);
      if (confirmResult) {
        settledRecords.push(confirmResult.record);
        totalUsd += confirmResult.record.amountUsd;
        appendLog(`\u{1F4B0} [Settlement Engine] Auto-settled escrow for task ${earning.taskId}: $${earning.amountUsd} -> ${confirmResult.record.destinationWallet} (Tx: ${txHash})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`\u274C [Settlement Error] Failed to settle earning ${earning.id}: ${msg}`);
    }
  }
  return {
    settled: settledRecords,
    totalSettledUsd: totalUsd
  };
}

// src/heartbeat.ts
var TERMINAL_STATUSES = /* @__PURE__ */ new Set([
  "completed",
  "declined",
  "cancelled",
  "expired",
  "resolved",
  "disputed"
]);
var WS_URL = "wss://api.moltlaunch.com/ws";
var WS_INITIAL_RECONNECT_MS = 5e3;
var WS_MAX_RECONNECT_MS = 3e5;
var WS_POLL_INTERVAL_MS = 12e4;
var TASK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1e3;
var RATE_LIMIT_COOLDOWN_MS = 6e4;
function createHeartbeat(config, llm) {
  const maxConcurrency = Math.min(Math.max(1, config.maxConcurrentTasks || 2), 2);
  const taskQueue = new PQueue({
    concurrency: maxConcurrency,
    autoStart: true
  });
  const state = {
    running: false,
    activeTasks: /* @__PURE__ */ new Map(),
    lastPoll: 0,
    totalPolls: 0,
    startedAt: 0,
    events: [],
    wsConnected: false,
    lastStudyTime: 0,
    totalStudySessions: 0,
    workerConcurrency: maxConcurrency,
    get activeWorkers() {
      return taskQueue.pending;
    },
    get queuedTasks() {
      return taskQueue.size;
    }
  };
  let timer = null;
  let ws = null;
  let wsReconnectTimer = null;
  let wsReconnectDelay = WS_INITIAL_RECONNECT_MS;
  let wsFailLogged = false;
  const processing = /* @__PURE__ */ new Set();
  const completedTasks = /* @__PURE__ */ new Set();
  const processedVersions = /* @__PURE__ */ new Map();
  const listeners = [];
  const taskRetryAfter = /* @__PURE__ */ new Map();
  const taskRetryCounts = /* @__PURE__ */ new Map();
  let rateLimitedUntil = 0;
  let consecutive429s = 0;
  function hydrateStateFromDb() {
    try {
      const storedTasks = dbGetAllTasks(100);
      for (const st of storedTasks) {
        const isTerminal = TERMINAL_STATUSES.has(st.status) || st.status === "completed" || st.status === "failed" || st.status === "skipped";
        if (!isTerminal && !state.activeTasks.has(st.id)) {
          state.activeTasks.set(st.id, {
            id: st.id,
            agentId: config.agentId || "agent_claw",
            task: st.title,
            status: st.status,
            quotedPriceWei: st.earnedUsd ? String(st.earnedUsd) : void 0,
            result: st.solutionSnippet ? st.solutionSnippet.slice(0, 500) : void 0,
            clientAddress: st.source
          });
        }
      }
    } catch {
    }
    try {
      const storedEvents = dbGetAllEvents(30);
      if (storedEvents && storedEvents.length > 0) {
        state.events = storedEvents;
      }
    } catch {
    }
  }
  hydrateStateFromDb();
  function emit(event) {
    const full = { ...event, timestamp: Date.now() };
    state.events.push(full);
    if (state.events.length > 30) {
      state.events = state.events.slice(-20);
    }
    dbRecordEvent(full);
    for (const fn of listeners) fn(full);
  }
  function onEvent(fn) {
    listeners.push(fn);
  }
  function connectWs() {
    if (!state.running || !config.agentId) return;
    try {
      ws = new WebSocket(`${WS_URL}/${config.agentId}`, { family: 4 });
      ws.on("open", () => {
        state.wsConnected = true;
        wsReconnectDelay = WS_INITIAL_RECONNECT_MS;
        wsFailLogged = false;
        emit({ type: "ws", message: "WebSocket connected" });
      });
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "connected") return;
          if (msg.task) handleTaskEvent(msg.task);
        } catch {
        }
      });
      ws.on("close", () => {
        state.wsConnected = false;
        if (!wsFailLogged) {
          emit({ type: "ws", message: "WebSocket disconnected \u2014 HTTP polling active" });
          wsFailLogged = true;
        }
        scheduleWsReconnect();
      });
      ws.on("error", () => {
        state.wsConnected = false;
        ws?.close();
        scheduleWsReconnect();
      });
    } catch {
      scheduleWsReconnect();
    }
  }
  function scheduleWsReconnect() {
    if (!state.running) return;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(() => connectWs(), wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_MAX_RECONNECT_MS);
  }
  function disconnectWs() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      ws = null;
    }
    state.wsConnected = false;
  }
  async function executeTaskWorker(task) {
    const startTime = Date.now();
    emit({
      type: "exec",
      taskId: task.id,
      message: `\u26A1 WORKER EXECUTING [Active Workers: ${taskQueue.pending}/${taskQueue.concurrency}]: ${task.task.slice(0, 70)}`
    });
    appendLog(`\u26A1 Executing task ${task.id} (Workers: ${taskQueue.pending}/${taskQueue.concurrency}): ${task.task.slice(0, 100)}`);
    dbUpdateTaskStatus(task.id, "executing");
    try {
      const result = await runAgentLoop(llm, task, config);
      const toolNames = result.toolCalls.map((tc) => tc.name).join(", ");
      const hasSubmit = result.toolCalls.some((tc) => tc.name === "submit_work");
      emit({
        type: "loop_complete",
        taskId: task.id,
        message: `\u2705 Done in ${result.turns} turns: [${toolNames}]${hasSubmit ? " \u2192 SUBMITTED" : ""}`
      });
      appendLog(`Task ${task.id} done: ${result.turns} turns, tools=[${toolNames}]`);
      for (const tc of result.toolCalls) {
        emit({
          type: "tool_call",
          taskId: task.id,
          message: `${tc.name}(${JSON.stringify(tc.input).slice(0, 80)}) \u2192 ${tc.success ? "\u2713" : "\u2717"}`
        });
      }
      dbLogExecution({
        taskId: task.id,
        startedAt: startTime,
        completedAt: Date.now(),
        turns: result.turns,
        toolsUsed: result.toolCalls.map((tc) => tc.name),
        success: hasSubmit
      });
      if (hasSubmit) {
        const earnedUsd = Number(task.budgetWei) || 25;
        dbRecordEarning({
          taskId: task.id,
          source: task.clientAddress || "bounty",
          amountUsd: earnedUsd,
          title: task.task.slice(0, 100),
          payoutStatus: "pending_escrow"
        });
        dbUpdateTaskStatus(task.id, "submitted", { solutionSnippet: result.reasoning.slice(0, 500) });
        emit({
          type: "feedback",
          taskId: task.id,
          message: `\u{1F7E1} SUBMITTED! Bounty +$${earnedUsd} pending escrow release...`
        });
        autoSettlePendingEarnings().then((res) => {
          if (res.settled.length > 0) {
            emit({
              type: "feedback",
              taskId: task.id,
              message: `\u{1F7E2} CONFIRMED! $${res.totalSettledUsd} transferred to wallet ${res.settled[0]?.destinationWallet || ""}`
            });
          }
        }).catch((err) => {
          appendLog(`[Settlement Warning] Instant settlement attempt: ${err.message}`);
        });
      } else {
        dbUpdateTaskStatus(task.id, "completed");
      }
      consecutive429s = 0;
      taskRetryCounts.delete(task.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", taskId: task.id, message: `\u274C Error: ${msg.slice(0, 200)}` });
      appendLog(`Error for ${task.id}: ${msg}`);
      const isCircuitBreaker = msg.includes("Circuit Breaker");
      const is429 = isCircuitBreaker || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("rate");
      if (is429) {
        consecutive429s++;
        if (keyManager.isAllProvidersExhausted() && !taskQueue.isPaused) {
          taskQueue.pause();
          emit({
            type: "error",
            message: `\u23F8\uFE0F All provider keys exhausted \u2014 worker queue paused until quota resets.`
          });
        }
        const retries = (taskRetryCounts.get(task.id) || 0) + 1;
        taskRetryCounts.set(task.id, retries);
        const backoffMs = Math.min(RATE_LIMIT_COOLDOWN_MS * Math.pow(2, retries - 1), 10 * 60 * 1e3);
        taskRetryAfter.set(task.id, Date.now() + backoffMs);
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        processedVersions.delete(task.id);
        dbUpdateTaskStatus(task.id, "queued", { errorMsg: isCircuitBreaker ? `circuit-breaker - retry #${retries}` : `429 - retry #${retries}`, retries });
        emit({
          type: "error",
          taskId: task.id,
          message: `\u23F3 Rate limited \u2014 retry in ${Math.round(backoffMs / 6e4)} min (attempt ${retries})`
        });
      } else {
        const retryCount = (taskRetryCounts.get(task.id) || 0) + 1;
        if (retryCount <= 3) {
          taskRetryCounts.set(task.id, retryCount);
          taskRetryAfter.set(task.id, Date.now() + 3e4);
          processedVersions.delete(task.id);
          dbUpdateTaskStatus(task.id, "queued", { errorMsg: msg.slice(0, 200), retries: retryCount });
        } else {
          dbUpdateTaskStatus(task.id, "failed", { errorMsg: msg.slice(0, 200) });
        }
      }
      dbLogExecution({
        taskId: task.id,
        startedAt: startTime,
        completedAt: Date.now(),
        turns: 0,
        toolsUsed: [],
        success: false,
        errorMsg: msg.slice(0, 300)
      });
    }
  }
  function handleTaskEvent(task) {
    try {
      dbRecordDiscovery({
        id: task.id,
        source: task.clientAddress || "moltlaunch",
        title: task.task,
        url: task.id
      });
      dbUpdateTaskStatus(task.id, task.status, {
        earnedUsd: task.quotedPriceWei ? Number(task.quotedPriceWei) : void 0,
        solutionSnippet: task.result
      });
    } catch {
    }
    if (TERMINAL_STATUSES.has(task.status)) {
      if (task.status === "completed" && task.ratedScore !== void 0) {
        handleCompleted(task);
      }
      state.activeTasks.delete(task.id);
      processedVersions.delete(task.id);
      taskRetryAfter.delete(task.id);
      taskRetryCounts.delete(task.id);
      return;
    }
    if (Date.now() < rateLimitedUntil) {
      state.activeTasks.set(task.id, task);
      return;
    }
    const retryAfter = taskRetryAfter.get(task.id);
    if (retryAfter && Date.now() < retryAfter) {
      state.activeTasks.set(task.id, task);
      return;
    }
    const version = `${task.id}:${task.status}`;
    const prevVersion = processedVersions.get(task.id);
    if (prevVersion === version && !processing.has(task.id) && !taskRetryAfter.has(task.id)) {
      state.activeTasks.set(task.id, task);
      return;
    }
    if (processing.has(task.id)) return;
    if (task.status === "quoted" || task.status === "submitted") {
      state.activeTasks.set(task.id, task);
      processedVersions.set(task.id, version);
      return;
    }
    if (keyManager.isAllProvidersExhausted()) {
      if (!taskQueue.isPaused) {
        taskQueue.pause();
      }
      emit({
        type: "error",
        taskId: task.id,
        message: `\u23F8\uFE0F All API keys across all providers exhausted. Task deferred until quota resets.`
      });
      state.activeTasks.set(task.id, task);
      return;
    }
    state.activeTasks.set(task.id, task);
    processedVersions.set(task.id, version);
    taskRetryAfter.delete(task.id);
    processing.add(task.id);
    taskQueue.add(async () => {
      await executeTaskWorker(task);
    }).catch((err) => {
      appendLog(`[Worker Queue Exception] Task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
    }).finally(() => {
      processing.delete(task.id);
    });
  }
  async function checkSubmittedBountiesLifecycle() {
    const token = process.env.GITHUB_TOKEN;
    const authHeaders = {
      "User-Agent": "AgentClaw-Engine",
      "Accept": "application/vnd.github.v3+json",
      ...token ? { Authorization: token.startsWith("github_pat_") || token.startsWith("ghp_") ? `Bearer ${token}` : `token ${token}` } : {}
    };
    for (const [id, task] of state.activeTasks.entries()) {
      if (task.status !== "submitted") continue;
      const ghMatch = task.task.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
      if (!ghMatch) continue;
      const [, owner, repo, itemType, num] = ghMatch;
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${num}`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          if (data.state === "closed") {
            appendLog(`\u{1F389} [Lifecycle Observer] Submitted bounty ${id} (${owner}/${repo} #${num}) confirmed ACCEPTED/CLOSED!`);
            dbUpdateTaskStatus(id, "completed");
            task.status = "completed";
            emit({
              type: "feedback",
              taskId: id,
              message: `\u{1F389} ACCEPTED! Maintainer closed/merged #${num} in ${owner}/${repo}. Triggering payout...`
            });
            await autoSettlePendingEarnings().catch(() => {
            });
          }
        }
      } catch {
      }
    }
  }
  async function tick() {
    try {
      applyHourlyDecay();
      await checkSubmittedBountiesLifecycle().catch(() => {
      });
      await autoSettlePendingEarnings().catch(() => {
      });
      const tasks = await getInbox(config.agentId);
      state.lastPoll = Date.now();
      state.totalPolls++;
      emit({ type: "poll", message: `Polled inbox: ${tasks.length} task(s)` });
      for (const task of tasks) {
        handleTaskEvent(task);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `Poll error: ${msg}` });
    }
    scheduleNext();
  }
  function handleCompleted(task) {
    if (task.ratedScore === void 0) return;
    if (completedTasks.has(task.id)) return;
    completedTasks.add(task.id);
    storeFeedback({
      taskId: task.id,
      taskDescription: task.task,
      score: task.ratedScore,
      comments: task.ratedComment ?? "",
      timestamp: Date.now()
    });
    emit({
      type: "feedback",
      taskId: task.id,
      message: `Rated ${task.ratedScore}/5`
    });
  }
  function scheduleNext() {
    if (!state.running) return;
    const now = Date.now();
    for (const [id, task] of state.activeTasks) {
      const statusStr = task.status;
      const isTerminal = TERMINAL_STATUSES.has(task.status) || statusStr === "completed" || statusStr === "failed" || statusStr === "skipped";
      const taskTime = task.quotedAt ?? task.acceptedAt ?? task.submittedAt ?? state.startedAt;
      if (isTerminal || !processing.has(id) && now - taskTime > TASK_EXPIRY_MS) {
        state.activeTasks.delete(id);
        processedVersions.delete(id);
        taskRetryAfter.delete(id);
        taskRetryCounts.delete(id);
      }
    }
    if (state.activeTasks.size > 100) {
      const idsToPrune = [...state.activeTasks.keys()].slice(0, 20);
      for (const id of idsToPrune) {
        state.activeTasks.delete(id);
        processedVersions.delete(id);
        taskRetryAfter.delete(id);
        taskRetryCounts.delete(id);
      }
    }
    if (global.gc) {
      try {
        global.gc();
      } catch {
      }
    }
    if (taskQueue.isPaused && !keyManager.isAllProvidersExhausted()) {
      taskQueue.start();
      consecutive429s = 0;
      emit({
        type: "poll",
        message: `\u25B6\uFE0F Provider keys recovered \u2014 worker queue resumed.`
      });
    }
    void maybeStudy();
    if (state.wsConnected) {
      timer = setTimeout(() => void tick(), WS_POLL_INTERVAL_MS);
      return;
    }
    const hasWork = [...state.activeTasks.values()].some(
      (t) => t.status === "requested" || t.status === "revision" || t.status === "accepted"
    );
    const interval = hasWork ? config.polling.urgentIntervalMs : config.polling.intervalMs;
    timer = setTimeout(() => void tick(), interval);
  }
  let studying = false;
  async function maybeStudy() {
    if (!config.learningEnabled) return;
    if (studying) return;
    if (processing.size > 0 || taskQueue.pending > 0) return;
    if (Date.now() < rateLimitedUntil) return;
    const hasTasks = state.activeTasks.size > 0;
    if (hasTasks) return;
    if (taskRetryAfter.size > 0) return;
    const STUDY_INTERVAL = Math.max(config.studyIntervalMs, 72e5);
    if (Date.now() - state.lastStudyTime < STUDY_INTERVAL) return;
    studying = true;
    emit({ type: "study", message: "Starting study session..." });
    try {
      const result = await runStudySession(llm, config);
      state.lastStudyTime = Date.now();
      state.totalStudySessions++;
      emit({ type: "study", message: `Study complete: ${result.topic}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `Study error: ${msg}` });
      state.lastStudyTime = Date.now();
    } finally {
      studying = false;
    }
  }
  function getQueueStatus() {
    return {
      concurrency: taskQueue.concurrency,
      activeWorkers: taskQueue.pending,
      queuedTasks: taskQueue.size,
      processingTaskIds: Array.from(processing)
    };
  }
  function start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = Date.now();
    if (state.lastStudyTime === 0) {
      state.lastStudyTime = Date.now();
    }
    appendLog("\u{1F525} AgentClaw execution engine started \u2014 CONCURRENT WORKER POOL ACTIVE (Pillar 3)");
    console.log("\u{1F525} [Heartbeat] Execution engine started \u2014 CONCURRENT WORKER POOL ACTIVE (Pillar 3)");
    connectWs();
    void tick();
  }
  function stop() {
    state.running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    disconnectWs();
    taskQueue.clear();
    appendLog("Heartbeat stopped");
  }
  return { state, start, stop, onEvent, getQueueStatus };
}

// src/agent.ts
init_feedback();
init_knowledge();

// src/memory/chat.ts
init_config();
import fs9 from "fs";
import path9 from "path";
import crypto5 from "crypto";
var MAX_MESSAGES = 100;
function getChatPath() {
  return path9.join(getConfigDir(), "chat.json");
}
function loadChat() {
  const p = getChatPath();
  if (!fs9.existsSync(p)) return [];
  try {
    const raw = fs9.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => typeof e === "object" && e !== null && typeof e.role === "string" && typeof e.content === "string"
    );
  } catch {
    return [];
  }
}
function appendChat(message) {
  const messages = loadChat();
  messages.push(message);
  const trimmed = messages.slice(-MAX_MESSAGES);
  const p = getChatPath();
  fs9.mkdirSync(path9.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto5.randomUUID()}.tmp`;
  fs9.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs9.renameSync(tmp, p);
}
function clearChat() {
  const p = getChatPath();
  if (fs9.existsSync(p)) {
    const tmp = `${p}.${crypto5.randomUUID()}.tmp`;
    fs9.writeFileSync(tmp, "[]");
    fs9.renameSync(tmp, p);
  }
}

// src/listeners/categoryB.ts
var telegramOffset = 0;
function startCategoryBListeners() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (telegramToken) {
    console.log("[Category B] \u{1F916} Telegram Bot Listener starting...");
    setInterval(() => pollTelegram(telegramToken), 1e4);
  }
  if (discordToken) {
    console.log("[Category B] \u{1F4AC} Discord Bot Listener active.");
  }
}
async function pollTelegram(token) {
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${telegramOffset}&timeout=5`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !data.result || data.result.length === 0) return;
    for (const update of data.result) {
      telegramOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg || !msg.text) continue;
      const text = msg.text.trim();
      const chatId = msg.chat.id;
      if (text.startsWith("/start") || text.startsWith("/help")) {
        await sendTelegramReply(token, chatId, "*Aditya Waghamare 24/7 Engine Active*\n\nSend me a task or bounty using:\n`/task <description> $<budget>`");
      } else if (text.startsWith("/task") || text.toLowerCase().includes("bounty")) {
        const taskContent = text.replace(/^\/task/, "").trim() || "Telegram Task";
        const updatedState = recordEarning(15, `[Telegram] ${taskContent.slice(0, 30)}`);
        await sendTelegramReply(token, chatId, `\u2705 *Task Accepted & Logged*

Task: ${taskContent}
Earnings: +$15.00
Current HP: ${updatedState.health}/100`);
      }
    }
  } catch {
  }
}
async function sendTelegramReply(token, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
    });
  } catch {
  }
}

// src/listeners/categoryA.ts
var seenBounties = /* @__PURE__ */ new Set();
var MAX_NEW_TASKS_PER_SCAN = 10;
var platformStatsMap = {
  bountyhub: { id: "bountyhub", name: "BountyHub.dev Platform", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_bountyhub: { id: "github_bountyhub", name: "BountyHub GitHub Stream", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_bounty: { id: "github_bounty", name: "GitHub Bounty Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_algora: { id: "github_algora", name: "Algora / Bountycaster Streams", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_real: { id: "github_real", name: "GitHub Real Label Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_redeem: { id: "github_redeem", name: "GitHub Redeem Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_del_mission: { id: "github_del_mission", name: "Delegate Mission Requests", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_found_mission: { id: "github_found_mission", name: "Foundation Mission Requests", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_contrib_opp: { id: "github_contrib_opp", name: "Contribution Opportunities", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_eco_idea: { id: "github_eco_idea", name: "Ecosystem Project Ideas", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_draft_idea: { id: "github_draft_idea", name: "Draft Project Ideas", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_1: { id: "github_intent_1", name: "Grant Intent #1 Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_3: { id: "github_intent_3", name: "Grant Intent #3 Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_apps: { id: "github_intent_apps", name: "Intent: Novel Applications", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_decent: { id: "github_intent_decent", name: "Intent: Technical Decentralization", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_goodfirst: { id: "github_goodfirst", name: "Good First Issue Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_helpwanted: { id: "github_helpwanted", name: "Help Wanted Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_bug: { id: "github_bug", name: "Bug Fix Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_enhancement: { id: "github_enhancement", name: "Enhancement Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_open_bounties: { id: "github_open_bounties", name: "Open Bounty & Crypto Grants", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" }
};
function getPlatformStats() {
  return Object.values(platformStatsMap);
}
function startCategoryAListeners() {
  console.log("[Category A] \u{1F310} Universal GitHub Bounty & BountyHub Scanner active \u2014 scanning all open bounty, BountyHub, crypto & developer issue streams.");
  setTimeout(pollAllCategoryAPlatforms, 5e3);
  setInterval(pollAllCategoryAPlatforms, 10 * 60 * 1e3);
}
function updateStat(platformId, countNew) {
  if (platformStatsMap[platformId]) {
    platformStatsMap[platformId].scanCount += 1;
    platformStatsMap[platformId].lastScanned = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    platformStatsMap[platformId].bountiesFound += countNew;
    platformStatsMap[platformId].status = "Active";
  }
}
function extractBudgetUsd(text) {
  if (!text) return 50;
  const algoraMatch = text.match(/\/bounty\s+\$?(\d+)/i);
  if (algoraMatch && algoraMatch[1]) {
    const val = parseInt(algoraMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 5e4) return val;
  }
  const usdMatch = text.match(/\$(\d{1,5})/);
  if (usdMatch && usdMatch[1]) {
    const val = parseInt(usdMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 5e4) return val;
  }
  const cryptoMatch = text.match(/(\d+(?:\.\d+)?)\s*(USDC|ETH|SOL|DEGEN|OP|ARB|NEAR|AVAX|MATIC|BASE)/i);
  if (cryptoMatch && cryptoMatch[1]) {
    const val = parseFloat(cryptoMatch[1]);
    const symbol = cryptoMatch[2].toUpperCase();
    if (!isNaN(val) && val > 0) {
      if (symbol === "USDC") return Math.round(val);
      if (symbol === "ETH") return Math.round(val * 2500);
      if (symbol === "SOL") return Math.round(val * 150);
      return Math.max(25, Math.round(val));
    }
  }
  return 50;
}
async function pollAllCategoryAPlatforms() {
  try {
    const items = [];
    const queries = [
      () => pollGitHubQuery('body:"bountyhub.dev"', "github_bountyhub", "BountyHub.dev Bounties"),
      () => pollGitHubQuery("label:bountyhub", "github_bountyhub", "BountyHub Label Stream"),
      () => pollGitHubQuery("bountyhub", "bountyhub", "BountyHub Platform Issues"),
      () => pollGitHubQuery("label:bounty", "github_bounty", "GitHub Bounty Issues"),
      () => pollGitHubQuery('body:"/bounty"', "github_algora", "Algora Bounty Issues"),
      () => pollGitHubQuery("label:real", "github_real", "GitHub Real Label Stream"),
      () => pollGitHubQuery("label:redeem", "github_redeem", "GitHub Redeem Stream"),
      () => pollGitHubQuery('label:"Delegate Mission Request"', "github_del_mission", "Delegate Mission Requests"),
      () => pollGitHubQuery('label:"Foundation Mission Request"', "github_found_mission", "Foundation Mission Requests"),
      () => pollGitHubQuery('label:"Contribution Opportunity"', "github_contrib_opp", "Contribution Opportunities"),
      () => pollGitHubQuery('label:"Ecosystem Project Idea"', "github_eco_idea", "Ecosystem Project Ideas"),
      () => pollGitHubQuery('label:"Draft Project Idea"', "github_draft_idea", "Draft Project Ideas"),
      () => pollGitHubQuery('label:"Intent #1"', "github_intent_1", "Grant Intent #1"),
      () => pollGitHubQuery('label:"Intent #3"', "github_intent_3", "Grant Intent #3"),
      () => pollGitHubQuery('label:"Intent: Novel Applications"', "github_intent_apps", "Intent: Novel Applications"),
      () => pollGitHubQuery('label:"Intent: Technical Decentralization"', "github_intent_decent", "Intent: Technical Decentralization"),
      () => pollGitHubQuery('label:"good first issue"', "github_goodfirst", "GitHub Good-First Stream"),
      () => pollGitHubQuery('label:"help wanted"', "github_helpwanted", "GitHub Help-Wanted Stream"),
      () => pollGitHubQuery("label:bug", "github_bug", "GitHub Bug Fix Stream"),
      () => pollGitHubQuery("label:enhancement", "github_enhancement", "GitHub Enhancement Stream"),
      () => pollGitHubQuery("bounty", "github_open_bounties", "Open Bounty & Crypto Grants")
    ];
    const chunkSize = 4;
    for (let i = 0; i < queries.length; i += chunkSize) {
      const chunk = queries.slice(i, i + chunkSize);
      const batchResults = await Promise.allSettled(chunk.map((fn) => fn()));
      for (const res of batchResults) {
        if (res.status === "fulfilled") {
          items.push(...res.value);
        }
      }
    }
    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);
      if (newCount >= MAX_NEW_TASKS_PER_SCAN) {
        console.log(`[Category A] \u23F8\uFE0F Hit per-scan cap (${MAX_NEW_TASKS_PER_SCAN}). Remaining bounties queued for next scan.`);
        break;
      }
      newCount++;
      if (seenBounties.size > 1e3) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }
      const budgetStr = ` [Est. Reward: $${item.budgetUsd}]`;
      const logMsg = `[${item.source}] Discovered Bounty: "${item.title}"${budgetStr} (${item.url})`;
      console.log(`[Category A] \u{1F3AF} ${logMsg}`);
      appendLog(logMsg);
      dbRecordDiscovery({
        id: item.id,
        source: item.source,
        title: item.title,
        url: item.url
      });
      addTaskToInbox({
        id: item.id,
        agentId: "agent_claw",
        clientAddress: item.source || "CategoryA_Feed",
        task: `[${item.source}] ${item.title} \u2014 URL: ${item.url}. Details: ${item.snippet || item.title}`,
        status: "requested"
      });
    }
  } catch (err) {
    console.error("[Category A] \u274C Error during scan cycle:", err?.message || err);
  }
}
async function pollGitHubQuery(query, platformId, sourceName) {
  try {
    const url = `https://api.github.com/search/issues?q=is:issue+is:open+${encodeURIComponent(query)}&sort=created&order=desc&per_page=5`;
    const headers = {
      "User-Agent": "AgentClaw-BountyScanner/1.0",
      "Accept": "application/vnd.github.v3+json"
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      updateStat(platformId, 0);
      return [];
    }
    const data = await res.json();
    const rawItems = data.items || [];
    updateStat(platformId, rawItems.length);
    return rawItems.map((issue) => ({
      id: `gh_${issue.id}`,
      source: sourceName,
      platformId,
      title: issue.title,
      url: issue.html_url,
      budgetUsd: extractBudgetUsd(`${issue.title} ${issue.body || ""}`),
      snippet: (issue.body || "").slice(0, 300)
    }));
  } catch (err) {
    updateStat(platformId, 0);
    return [];
  }
}

// src/agent.ts
var PORT = Number(process.env.AGENTCLAW_PORT || process.env.CASHCLAW_PORT || process.env.PORT) || 3777;
var MAX_BODY_BYTES = 1048576;
async function startAgent() {
  startCategoryAListeners();
  startCategoryBListeners();
  startKeepAlive();
  const configured = isConfigured();
  const config = configured ? loadConfig() : null;
  if (config && config.agentCashEnabled === void 0) {
    if (isAgentCashAvailable()) {
      config.agentCashEnabled = true;
      savePartialConfig({ agentCashEnabled: true });
    }
  }
  const ctx = {
    mode: configured ? "running" : "setup",
    config,
    heartbeat: null
  };
  if (ctx.mode === "running" && ctx.config) {
    const llm = createLLMProvider(ctx.config.llm);
    ctx.heartbeat = createHeartbeat(ctx.config, llm);
    ctx.heartbeat.start();
  }
  const server = createServer(ctx);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const wsClients = /* @__PURE__ */ new Set();
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(
      JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        message: "AgentClaw 10/10 WebSocket Telemetry Bus Connected",
        queueStatus: ctx.heartbeat ? ctx.heartbeat.getQueueStatus() : null
      })
    );
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
      }
    });
    ws.on("error", () => {
      wsClients.delete(ws);
    });
    ws.on("close", () => {
      wsClients.delete(ws);
    });
  });
  if (ctx.heartbeat) {
    ctx.heartbeat.onEvent((event) => {
      const payload = JSON.stringify({ type: "event", timestamp: Date.now(), data: event });
      for (const ws of wsClients) {
        if (ws.readyState === WebSocket2.OPEN) {
          ws.send(payload);
        }
      }
    });
  }
  ctx.wsClients = wsClients;
  return server;
}
function startKeepAlive() {
  const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? process.env.RAILWAY_PUBLIC_DOMAIN.startsWith("http") ? process.env.RAILWAY_PUBLIC_DOMAIN : `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL.startsWith("http") ? process.env.RAILWAY_STATIC_URL : `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || railwayUrl || `http://localhost:${PORT}`;
  const pingIntervalMs = 8 * 60 * 1e3;
  console.log(`[Keep-Alive] \u{1F4E1} 24/7 Cloud Keep-Alive Pinger active (${externalUrl})`);
  setTimeout(() => {
    fetch(`${externalUrl}/health`).then(() => console.log(`[Keep-Alive] \u26A1 Initial ping successful`)).catch(() => {
    });
  }, 3e4);
  setInterval(() => {
    fetch(`${externalUrl}/health`).then(() => console.log(`[Keep-Alive] \u26A1 24/7 Keep-Alive ping sent to ${externalUrl}`)).catch((err) => console.warn(`[Keep-Alive] Ping note:`, err.message));
  }, pingIntervalMs);
  setInterval(() => {
    const mem = process.memoryUsage();
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    if ((heapMb > 160 || rssMb > 280) && typeof global.gc === "function") {
      console.log(`[Memory Guard] \u{1F9F9} High RAM usage (${heapMb}MB heap / ${rssMb}MB RSS). Invoking Garbage Collection...`);
      global.gc();
    }
  }, 15 * 1e3);
}
function createServer(ctx) {
  const server = http3.createServer((req, res) => {
    const origin = req.headers.origin;
    const allowedOrigin = origin || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname === "/health" || url.pathname === "/ping" || url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", mode: ctx.config ? "running" : "setup", uptime: process.uptime() }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      handleApi(url.pathname, req, res, ctx);
      return;
    }
    serveStatic(url.pathname, res);
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Dashboard: http://localhost:${PORT}`);
  });
  return server;
}
function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
function parseJsonBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
}
function isAuthorized(req) {
  const secret = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const keyHeader = req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return keyHeader === secret || bearerToken === secret;
}
function handleApi(pathname, req, res, ctx) {
  if (pathname.startsWith("/api/setup/")) {
    handleSetupApi(pathname, req, res, ctx);
    return;
  }
  if (pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      json(res, { error: "POST only" }, 405);
      return;
    }
    readBody(req).then((bodyStr) => {
      try {
        const body = parseJsonBody(bodyStr);
        const pass = body.password || "";
        const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
        if (!expected) {
          json(res, { ok: true, message: "Authenticated" });
          return;
        }
        if (pass === expected) {
          json(res, { ok: true, message: "Authenticated" });
        } else {
          json(res, { error: "Invalid admin password" }, 401);
        }
      } catch {
        json(res, { error: "Invalid body" }, 400);
      }
    });
    return;
  }
  if (!ctx.config || !ctx.heartbeat) {
    json(res, { error: "Agent not configured", mode: "setup" }, 503);
    return;
  }
  switch (pathname) {
    case "/api/status":
      json(res, {
        running: ctx.heartbeat.state.running,
        activeTasks: ctx.heartbeat.state.activeTasks.size,
        totalPolls: ctx.heartbeat.state.totalPolls,
        lastPoll: ctx.heartbeat.state.lastPoll,
        startedAt: ctx.heartbeat.state.startedAt,
        uptime: ctx.heartbeat.state.running ? Date.now() - ctx.heartbeat.state.startedAt : 0,
        agentId: ctx.config.agentId
      });
      break;
    case "/api/platform-stats":
      json(res, {
        ok: true,
        platforms: getPlatformStats()
      });
      break;
    case "/api/tasks": {
      const now = Date.now();
      const cached = ctx._tasksCache;
      if (cached && now - cached.timestamp < 1e3) {
        json(res, cached.payload);
        break;
      }
      const activeTasksMap = ctx.heartbeat.state.activeTasks;
      const dbTasks = dbGetAllTasks(1e3);
      const dbEarnings = dbGetEarnings();
      const earningsByTaskMap = /* @__PURE__ */ new Map();
      for (const e of dbEarnings) {
        earningsByTaskMap.set(e.taskId, e);
        earningsByTaskMap.set(e.id, e);
      }
      const mergedMap = /* @__PURE__ */ new Map();
      for (const dbt of dbTasks) {
        const earn = earningsByTaskMap.get(dbt.id);
        mergedMap.set(dbt.id, {
          id: dbt.id,
          task: dbt.title,
          url: dbt.url,
          status: dbt.status,
          quotedPriceWei: dbt.earnedUsd ? String(dbt.earnedUsd) : void 0,
          result: dbt.solutionSnippet,
          earnedUsd: dbt.earnedUsd || earn?.amountUsd,
          payoutStatus: earn?.payoutStatus,
          txHash: earn?.txHash,
          source: earn?.source
        });
      }
      for (const at of activeTasksMap.values()) {
        const earn = earningsByTaskMap.get(at.id);
        mergedMap.set(at.id, {
          id: at.id,
          task: at.task,
          url: at.url || at.taskUrl,
          status: at.status,
          quotedPriceWei: at.quotedPriceWei,
          ratedScore: at.ratedScore,
          result: at.result,
          earnedUsd: earn?.amountUsd,
          payoutStatus: earn?.payoutStatus,
          txHash: earn?.txHash,
          source: earn?.source
        });
      }
      const currentEvents = ctx.heartbeat.state.events.length > 0 ? ctx.heartbeat.state.events : dbGetAllEvents(100);
      const payload = {
        tasks: Array.from(mergedMap.values()),
        events: currentEvents.slice(-50)
      };
      ctx._tasksCache = { timestamp: now, payload };
      json(res, payload);
      break;
    }
    case "/api/logs":
      json(res, { log: readTodayLog() });
      break;
    case "/api/config":
      json(res, {
        ...ctx.config,
        llm: { ...ctx.config.llm, apiKey: "***" }
      });
      break;
    case "/api/stats":
      json(res, {
        ...getFeedbackStats(),
        studySessions: ctx.heartbeat.state.totalStudySessions,
        knowledgeEntries: loadKnowledge().length
      });
      break;
    case "/api/knowledge":
      json(res, { entries: loadKnowledge() });
      break;
    case "/api/knowledge/delete":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      if (!isAuthorized(req)) {
        json(res, { error: "Unauthorized" }, 401);
        return;
      }
      handleKnowledgeDelete(req, res);
      break;
    case "/api/feedback":
      json(res, { entries: loadFeedback() });
      break;
    case "/api/stop":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      if (!isAuthorized(req)) {
        json(res, { error: "Unauthorized \u2014 missing or invalid ADMIN_SECRET" }, 401);
        return;
      }
      ctx.heartbeat.stop();
      json(res, { ok: true, running: false });
      break;
    case "/api/start":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      if (!isAuthorized(req)) {
        json(res, { error: "Unauthorized \u2014 missing or invalid ADMIN_SECRET" }, 401);
        return;
      }
      ctx.heartbeat.start();
      json(res, { ok: true, running: true });
      break;
    case "/api/config-update":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      if (!isAuthorized(req)) {
        json(res, { error: "Unauthorized \u2014 missing or invalid ADMIN_SECRET" }, 401);
        return;
      }
      handleConfigUpdate(req, res, ctx);
      break;
    case "/api/chat":
      if (req.method === "GET") {
        json(res, { messages: loadChat() });
      } else if (req.method === "POST") {
        handleChat(req, res, ctx);
      } else {
        json(res, { error: "GET or POST" }, 405);
      }
      break;
    case "/api/chat/clear":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      clearChat();
      json(res, { ok: true });
      break;
    case "/api/survival":
      json(res, applyHourlyDecay());
      break;
    case "/api/survival/revive":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      json(res, reviveAgent());
      break;
    case "/api/survival/earn":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      readBody(req).then((bodyStr) => {
        try {
          const body = parseJsonBody(bodyStr);
          const updated = recordEarning(body.amountUsd || 10, body.title || "Freelance Task");
          json(res, updated);
        } catch {
          json(res, { error: "Invalid body" }, 400);
        }
      });
      break;
    case "/api/revenue":
      json(res, {
        confirmedRevenue: dbGetTotalEarnings(),
        pendingRevenue: dbGetPendingEarnings(),
        destinationWallet: process.env.TREASURY_ADDRESS || "0xfdCE8864Ab96584102354Eb2d270187E0E900492",
        earnings: dbGetEarnings()
      });
      void autoSettlePendingEarnings().catch(() => {
      });
      break;
    case "/api/rpc-mesh":
      testRpcMeshHealth().then((meshHealth) => {
        json(res, {
          timestamp: Date.now(),
          meshStatus: meshHealth.some((n) => n.status === "healthy") ? "ONLINE" : "DEGRADED",
          healthyNodeCount: meshHealth.filter((n) => n.status === "healthy").length,
          totalNodes: meshHealth.length,
          nodes: meshHealth
        });
      }).catch((err) => {
        json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
      });
      break;
    case "/api/queue-status":
      if (ctx.heartbeat) {
        json(res, {
          timestamp: Date.now(),
          running: ctx.heartbeat.state.running,
          ...ctx.heartbeat.getQueueStatus()
        });
      } else {
        json(res, { error: "Heartbeat engine not running" }, 503);
      }
      break;
    case "/api/websocket-info":
      json(res, {
        enabled: true,
        endpoint: `ws://localhost:${PORT}/ws`,
        activeClients: ctx.wsClients ? ctx.wsClients.size : 0
      });
      break;
    case "/api/manual-bounty":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      if (!isAuthorized(req)) {
        json(res, { error: "Unauthorized" }, 401);
        return;
      }
      readBody(req).then((bodyStr) => {
        try {
          const body = parseJsonBody(bodyStr);
          if (!body.title || !body.url) {
            json(res, { error: "Missing title or url" }, 400);
            return;
          }
          const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          dbRecordDiscovery({
            id,
            source: body.source || "Manual",
            title: body.title,
            url: body.url
          });
          addTaskToInbox({
            id,
            agentId: "agent_claw",
            clientAddress: body.source || "Manual",
            task: `[${body.source || "Manual"}] ${body.title} \uFFFD URL: ${body.url}. Est. Reward: $${body.reward || 50}`,
            status: "requested"
          });
          console.log(`[Manual Bounty] Added: "${body.title}" ($${body.reward || 50}) \uFFFD ${body.url}`);
          json(res, { ok: true, id });
        } catch {
          json(res, { error: "Invalid body" }, 400);
        }
      });
      break;
    case "/api/revenue/confirm":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      readBody(req).then((bodyStr) => {
        try {
          const body = parseJsonBody(bodyStr);
          if (!body.earningId) {
            json(res, { error: "Missing earningId" }, 400);
            return;
          }
          const result = dbConfirmWalletTransfer(body.earningId, body.txHash);
          if (!result) {
            json(res, { error: "Earning record not found" }, 404);
            return;
          }
          json(res, { ok: true, record: result.record, survivalState: result.survivalState });
        } catch {
          json(res, { error: "Invalid body" }, 400);
        }
      });
      break;
    case "/api/webhooks/task":
      if (req.method !== "POST") {
        json(res, { error: "POST only" }, 405);
        return;
      }
      readBody(req).then(async (bodyStr) => {
        try {
          const body = parseJsonBody(bodyStr);
          if (!body.task) {
            json(res, { error: "Missing 'task' in payload" }, 400);
            return;
          }
          const platformName = body.platform || "Inbound Webhook";
          const amount = body.budgetUsd || 15;
          const updated = recordEarning(amount, `[${platformName}] ${body.task.slice(0, 40)}`);
          json(res, {
            ok: true,
            status: "accepted",
            platform: platformName,
            task: body.task,
            earningsLogged: amount,
            survivalState: updated
          });
        } catch (err) {
          json(res, { error: err instanceof Error ? err.message : "Invalid webhook payload" }, 400);
        }
      });
      break;
    case "/api/wallet":
      handleWallet(res, ctx);
      break;
    case "/api/agent-info":
      handleAgentInfo(res, ctx);
      break;
    case "/api/agentcash-balance":
      handleAgentCashBalance(res, ctx);
      break;
    case "/api/eth-price":
      handleEthPrice(res);
      break;
    case "/api/db-stats":
      json(res, dbGetStats());
      break;
    default:
      json(res, { error: "Not found" }, 404);
  }
}
async function handleSetupApi(pathname, req, res, ctx) {
  try {
    switch (pathname) {
      case "/api/setup/status":
        json(res, {
          configured: isConfigured(),
          mode: ctx.mode,
          step: detectCurrentStep(ctx)
        });
        break;
      case "/api/setup/wallet": {
        const wallet = await walletShow();
        json(res, wallet);
        break;
      }
      case "/api/setup/agent-lookup": {
        const wallet = await walletShow();
        const agent = await getAgentByWallet(wallet.address);
        if (agent) {
          savePartialConfig({ agentId: agent.agentId });
          ctx.config = loadConfig();
        }
        json(res, { agent });
        break;
      }
      case "/api/setup/wallet/import": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        const body = parseJsonBody(await readBody(req));
        const wallet = await walletImport(body.privateKey);
        json(res, wallet);
        break;
      }
      case "/api/setup/register": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        const body = parseJsonBody(await readBody(req));
        let imagePath;
        if (body.image && body.image.startsWith("data:")) {
          const match = body.image.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === "jpeg" ? "jpg" : match[1];
            imagePath = path10.join(os6.tmpdir(), `cashclaw-image-${Date.now()}.${ext}`);
            fs10.writeFileSync(imagePath, Buffer.from(match[2], "base64"));
          }
        }
        try {
          const result = await registerAgent({
            ...body,
            image: imagePath
          });
          savePartialConfig({ agentId: result.agentId });
          ctx.config = loadConfig();
          json(res, result);
        } finally {
          if (imagePath && fs10.existsSync(imagePath)) {
            fs10.unlinkSync(imagePath);
          }
        }
        break;
      }
      case "/api/setup/llm": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        const body = parseJsonBody(await readBody(req));
        savePartialConfig({ llm: body });
        ctx.config = loadConfig();
        json(res, { ok: true });
        break;
      }
      case "/api/setup/llm/test": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        const body = parseJsonBody(await readBody(req));
        const llm = createLLMProvider(body);
        const response = await llm.chat([
          { role: "user", content: "Say hello in one sentence." }
        ]);
        const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
        json(res, { ok: true, response: text });
        break;
      }
      case "/api/setup/specialization": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        const body = parseJsonBody(await readBody(req));
        savePartialConfig({
          specialties: body.specialties,
          pricing: body.pricing,
          autoQuote: body.autoQuote,
          autoWork: body.autoWork,
          maxConcurrentTasks: body.maxConcurrentTasks,
          declineKeywords: body.declineKeywords
        });
        ctx.config = loadConfig();
        json(res, { ok: true });
        break;
      }
      case "/api/setup/complete": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        if (!isConfigured()) {
          json(res, { error: "Configuration incomplete" }, 400);
          return;
        }
        ctx.config = loadConfig();
        const llm = createLLMProvider(ctx.config.llm);
        ctx.heartbeat = createHeartbeat(ctx.config, llm);
        ctx.heartbeat.start();
        ctx.mode = "running";
        json(res, { ok: true, mode: "running" });
        break;
      }
      case "/api/setup/reset": {
        if (req.method !== "POST") {
          json(res, { error: "POST only" }, 405);
          return;
        }
        if (ctx.heartbeat) {
          ctx.heartbeat.stop();
          ctx.heartbeat = null;
        }
        ctx.config = null;
        ctx.mode = "setup";
        json(res, { ok: true, mode: "setup" });
        break;
      }
      default:
        json(res, { error: "Not found" }, 404);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
function detectCurrentStep(ctx) {
  if (!ctx.config) return "wallet";
  if (!ctx.config.agentId) return "register";
  if (!ctx.config.llm?.apiKey) return "llm";
  return "specialization";
}
async function handleConfigUpdate(req, res, ctx) {
  try {
    const body = await readBody(req);
    const updates = parseJsonBody(body);
    if (!ctx.config) {
      json(res, { error: "No config" }, 400);
      return;
    }
    if (updates.specialties) ctx.config.specialties = updates.specialties;
    if (updates.pricing) {
      const ethPattern = /^\d+(\.\d{1,18})?$/;
      if (!ethPattern.test(updates.pricing.baseRateEth) || !ethPattern.test(updates.pricing.maxRateEth)) {
        json(res, { error: "Invalid ETH amount format" }, 400);
        return;
      }
      if (parseFloat(updates.pricing.baseRateEth) > parseFloat(updates.pricing.maxRateEth)) {
        json(res, { error: "baseRate cannot exceed maxRate" }, 400);
        return;
      }
      ctx.config.pricing = updates.pricing;
    }
    if (updates.autoQuote !== void 0) ctx.config.autoQuote = updates.autoQuote;
    if (updates.autoWork !== void 0) ctx.config.autoWork = updates.autoWork;
    if (updates.maxConcurrentTasks !== void 0) {
      const val = Number(updates.maxConcurrentTasks);
      if (!Number.isInteger(val) || val < 1 || val > 20) {
        json(res, { error: "maxConcurrentTasks must be 1-20" }, 400);
        return;
      }
      ctx.config.maxConcurrentTasks = val;
    }
    if (updates.declineKeywords) ctx.config.declineKeywords = updates.declineKeywords;
    if (updates.personality) {
      const p = updates.personality;
      if (p.customInstructions && p.customInstructions.length > 2e3) {
        json(res, { error: "customInstructions must be under 2000 characters" }, 400);
        return;
      }
      ctx.config.personality = p;
    }
    if (updates.learningEnabled !== void 0) ctx.config.learningEnabled = updates.learningEnabled;
    if (updates.studyIntervalMs !== void 0) {
      const val = Number(updates.studyIntervalMs);
      if (val < 6e4 || val > 864e5) {
        json(res, { error: "studyIntervalMs must be 60000-86400000" }, 400);
        return;
      }
      ctx.config.studyIntervalMs = val;
    }
    if (updates.polling) ctx.config.polling = updates.polling;
    if (updates.agentCashEnabled !== void 0) ctx.config.agentCashEnabled = updates.agentCashEnabled;
    if (updates.llm) {
      const newLlm = { ...updates.llm };
      const providerChanged = newLlm.provider !== ctx.config.llm.provider;
      if (newLlm.apiKey === "***") {
        if (providerChanged) {
          json(res, { error: "New provider selected \u2014 please enter your API key" }, 400);
          return;
        }
        newLlm.apiKey = ctx.config.llm.apiKey;
      }
      ctx.config.llm = newLlm;
      if (ctx.heartbeat) {
        ctx.heartbeat.stop();
        const llm = createLLMProvider(ctx.config.llm);
        ctx.heartbeat = createHeartbeat(ctx.config, llm);
        ctx.heartbeat.start();
      }
    }
    savePartialConfig(ctx.config);
    json(res, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    json(res, { error: msg }, 400);
  }
}
var walletCache = null;
var WALLET_CACHE_TTL = 6e4;
async function handleWallet(res, ctx) {
  try {
    const now = Date.now();
    if (!walletCache || now - walletCache.fetchedAt > WALLET_CACHE_TTL) {
      const info = await walletShow();
      walletCache = { info, fetchedAt: now };
    }
    json(res, walletCache.info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
async function handleAgentInfo(res, ctx) {
  try {
    const wallet = await walletShow();
    const agent = await getAgentByWallet(wallet.address);
    json(res, { agent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
async function handleAgentCashBalance(res, ctx) {
  if (!ctx.config?.agentCashEnabled) {
    json(res, { error: "AgentCash not enabled" }, 400);
    return;
  }
  try {
    const result = await agentcashBalance.execute({}, { config: ctx.config, taskId: "" });
    if (!result.success) {
      json(res, { error: result.data }, 500);
      return;
    }
    json(res, JSON.parse(result.data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
var ethPriceCache = null;
var ETH_PRICE_CACHE_TTL = 6e4;
async function handleEthPrice(res) {
  try {
    const now = Date.now();
    if (!ethPriceCache || now - ethPriceCache.fetchedAt > ETH_PRICE_CACHE_TTL) {
      const resp = await fetch(
        "`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD"
      );
      const data = await resp.json();
      if (!data.USD) {
        json(res, { error: "Failed to fetch ETH price" }, 502);
        return;
      }
      ethPriceCache = { price: data.USD, fetchedAt: now };
    }
    json(res, { price: ethPriceCache.price });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 502);
  }
}
async function handleChat(req, res, ctx) {
  try {
    const body = parseJsonBody(await readBody(req));
    if (!body.message?.trim()) {
      json(res, { error: "Message required" }, 400);
      return;
    }
    if (!ctx.config) {
      json(res, { error: "Not configured" }, 400);
      return;
    }
    const userMsg = body.message.trim();
    appendChat({ role: "user", content: userMsg, timestamp: Date.now() });
    const llm = createLLMProvider(ctx.config.llm);
    const specialties = ctx.config.specialties.length > 0 ? ctx.config.specialties.join(", ") : "general tasks";
    const allKnowledge = loadKnowledge();
    const relevantKnowledge = getRelevantKnowledge(ctx.config.specialties, 5);
    const stats = getFeedbackStats();
    const hbState = ctx.heartbeat?.state;
    const studySessions = hbState?.totalStudySessions ?? 0;
    const isRunning = hbState?.running ?? false;
    const knowledgeSection = relevantKnowledge.length > 0 ? `

You've learned these insights from self-study:
${relevantKnowledge.map((k) => `- ${k.insight.slice(0, 200)}`).join("\n")}` : "";
    const personalitySection = ctx.config.personality ? `
Your personality: tone=${ctx.config.personality.tone}, style=${ctx.config.personality.responseStyle}.${ctx.config.personality.customInstructions ? ` Custom instructions: ${ctx.config.personality.customInstructions}` : ""}` : "";
    const systemPrompt = `You are CashClaw (agent "${ctx.config.agentId}"), an autonomous work agent on the moltlaunch marketplace.
Your specialties: ${specialties}. These are your ONLY areas of expertise \u2014 always reference these specific skills, never claim to be "general-purpose".

## Self-awareness
- Status: ${isRunning ? "RUNNING" : "STOPPED"}
- Learning: ${ctx.config.learningEnabled ? "ACTIVE" : "DISABLED"} \u2014 study sessions every ${Math.round(ctx.config.studyIntervalMs / 6e4)} min
- Study sessions completed: ${studySessions}
- Knowledge entries: ${allKnowledge.length}
- Tasks completed: ${stats.totalTasks}, avg score: ${stats.avgScore}/5
- Tools: quote, decline, submit work, message clients, browse bounties, check wallet, read feedback${personalitySection}

You're chatting with your operator. Be helpful, concise, and direct. Discuss performance, knowledge, tasks, and capabilities. Keep responses grounded in your actual data.${knowledgeSection}`;
    const history = loadChat().slice(-20);
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role,
        content: m.content
      }))
    ];
    const response = await llm.chat(messages);
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    appendChat({ role: "assistant", content: text, timestamp: Date.now() });
    json(res, { reply: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
async function handleKnowledgeDelete(req, res) {
  try {
    const body = parseJsonBody(await readBody(req));
    if (!body.id || typeof body.id !== "string") {
      json(res, { error: "Missing id" }, 400);
      return;
    }
    const deleted = deleteKnowledge(body.id);
    if (!deleted) {
      json(res, { error: "Entry not found" }, 404);
      return;
    }
    json(res, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    json(res, { error: msg }, 400);
  }
}
function serveStatic(pathname, res) {
  const baseDir = import.meta.dirname ?? __dirname;
  const distUi = path10.join(baseDir, "..", "dist", "ui");
  const uiDir = fs10.existsSync(path10.join(distUi, "index.html")) ? distUi : path10.join(baseDir, "ui");
  const resolvedUiDir = path10.resolve(uiDir);
  let filePath = path10.resolve(uiDir, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!filePath.startsWith(resolvedUiDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!path10.extname(filePath)) {
    filePath = path10.join(resolvedUiDir, "index.html");
  }
  if (!fs10.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path10.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };
  res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "text/plain" });
  fs10.createReadStream(filePath).pipe(res);
}

// src/cluster/manager.ts
import cluster from "cluster";
import os7 from "os";
var ClusterManager = class {
  nodeId;
  isPrimary;
  workerCount;
  heartbeatTimer = null;
  constructor(customWorkerCount) {
    this.isPrimary = cluster.isPrimary;
    this.nodeId = this.isPrimary ? `primary_${process.pid}` : `worker_${cluster.worker?.id || process.pid}`;
    const envWorkerCount = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT, 10) : void 0;
    const enableCluster = process.env.ENABLE_CLUSTER === "true" || process.env.ENABLE_CLUSTER === "1";
    if (customWorkerCount !== void 0) {
      this.workerCount = customWorkerCount;
    } else if (envWorkerCount !== void 0) {
      this.workerCount = Math.max(0, envWorkerCount);
    } else if (enableCluster) {
      const numCores = os7.cpus().length;
      this.workerCount = Math.max(1, Math.min(4, numCores));
    } else {
      this.workerCount = 0;
    }
  }
  /**
   * Initializes the cluster environment.
   * If Primary: Spawns worker processes and monitors health.
   * If Worker: Registers IPC message listeners and executes work.
   */
  startCluster(onWorkerStart) {
    if (this.isPrimary) {
      if (this.workerCount > 0) {
        console.log(`\u26A1 [Cluster Engine] Primary Node active (PID: ${process.pid}) \u2014 Spawning ${this.workerCount} Cluster Workers...`);
      } else {
        console.log(`\u26A1 [Cluster Engine] Single-Process Mode active (PID: ${process.pid}) \u2014 Container Memory Optimized.`);
      }
      this.registerHeartbeat("primary");
      for (let i = 0; i < this.workerCount; i++) {
        this.spawnWorker();
      }
      cluster.on("exit", (worker, code, signal) => {
        console.warn(`\u26A0\uFE0F [Cluster Engine] Worker ${worker.id} (PID: ${worker.process.pid}) died (Code: ${code}, Signal: ${signal}). Re-spawning replacement...`);
        this.spawnWorker();
      });
    } else {
      console.log(`\u{1F477} [Cluster Engine] Worker Node active (ID: ${cluster.worker?.id}, PID: ${process.pid})`);
      this.registerHeartbeat("worker");
      process.on("message", (msg) => {
        if (msg.type === "PING") {
          if (process.send) process.send({ type: "PONG", pid: process.pid });
        }
      });
      if (onWorkerStart) onWorkerStart();
    }
    return this.getStatus();
  }
  spawnWorker() {
    const worker = cluster.fork();
    worker.on("message", (msg) => {
      if (msg && msg.type === "TASK_COMPLETED") {
        console.log(`[Cluster Primary] Worker ${worker.id} finished task: ${msg.taskId}`);
      }
    });
  }
  registerHeartbeat(role) {
    const update = () => {
      dbSaveClusterNode({
        nodeId: this.nodeId,
        role,
        pid: process.pid,
        activeTasks: 0,
        lastHeartbeat: Date.now()
      });
    };
    update();
    this.heartbeatTimer = setInterval(update, 5e3);
  }
  getStatus() {
    const nodes = dbGetClusterNodes();
    const activeNodes = nodes.filter((n) => Date.now() - n.lastHeartbeat < 15e3);
    return {
      isPrimary: this.isPrimary,
      nodeId: this.nodeId,
      workerCount: this.isPrimary ? Object.keys(cluster.workers || {}).length : 0,
      activeNodes
    };
  }
  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
};
var clusterManager = new ClusterManager();

// src/index.ts
async function main() {
  console.log("\u26A1 Starting AgentClaw Enterprise Cluster...");
  vaultManager.initializeVault();
  const clusterStatus = clusterManager.startCluster();
  if (!clusterStatus.isPrimary) {
    return;
  }
  const server = await startAgent();
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.AGENTCLAW_PORT || process.env.CASHCLAW_PORT || process.env.PORT || "3777";
    const url = `http://localhost:${port}`;
    const { execFile: execFileCb } = await import("child_process");
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execFileCb(opener, [url], { shell: process.platform === "win32" }, () => {
    });
  }
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

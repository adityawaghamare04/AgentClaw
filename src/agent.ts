/** Built by Aditya Waghamare */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  loadConfig,
  savePartialConfig,
  isConfigured,
  isAgentCashAvailable,
  type CashClawConfig,
  type LLMConfig,
} from "./config.js";
import { createLLMProvider } from "./llm/index.js";
import { createHeartbeat, type Heartbeat } from "./heartbeat.js";
import { readTodayLog } from "./memory/log.js";
import { getFeedbackStats, loadFeedback } from "./memory/feedback.js";
import { loadKnowledge, getRelevantKnowledge, deleteKnowledge } from "./memory/knowledge.js";
import { loadChat, appendChat, clearChat } from "./memory/chat.js";
import {
  applyHourlyDecay,
  loadSurvivalState,
  reviveAgent,
  recordEarning,
} from "./memory/survival.js";
import { autoSettlePendingEarnings, testRpcMeshHealth } from "./memory/settlement.js";
import { agentcashBalance } from "./tools/agentcash.js";
import * as cli from "./moltlaunch/cli.js";
import { startCategoryBListeners } from "./listeners/categoryB.js";
import { startCategoryAListeners, getPlatformStats } from "./listeners/categoryA.js";
import {
  dbGetStats,
  dbGetTotalEarnings,
  dbGetPendingEarnings,
  dbGetEarnings,
  dbConfirmWalletTransfer,
  dbRecordEarning,
  dbGetAllTasks,
  dbGetAllEvents,
} from "./memory/db.js";

const PORT = Number(process.env.AGENTCLAW_PORT || process.env.CASHCLAW_PORT || process.env.PORT) || 3777;
const MAX_BODY_BYTES = 1_048_576; // 1 MB

type ServerMode = "setup" | "running";

interface ServerContext {
  mode: ServerMode;
  config: CashClawConfig | null;
  heartbeat: Heartbeat | null;
}

export async function startAgent(): Promise<http.Server> {
  // Activate Category A Autonomous Public Feed Scrapers (GitHub, Reddit, Bounties)
  startCategoryAListeners();

  // Activate Category B Telegram & Discord listeners if configured
  startCategoryBListeners();

  // Start 24/7 Cloud Keep-Alive pinger to prevent Render sleep mode
  startKeepAlive();

  const configured = isConfigured();
  const config = configured ? loadConfig() : null;

  // Auto-enable AgentCash if wallet exists and not explicitly configured
  if (config && config.agentCashEnabled === undefined) {
    if (isAgentCashAvailable()) {
      config.agentCashEnabled = true;
      savePartialConfig({ agentCashEnabled: true });
    }
  }

  const ctx: ServerContext = {
    mode: configured ? "running" : "setup",
    config,
    heartbeat: null,
  };

  // If already configured, start the heartbeat immediately
  if (ctx.mode === "running" && ctx.config) {
    const llm = createLLMProvider(ctx.config.llm);
    ctx.heartbeat = createHeartbeat(ctx.config, llm);
    ctx.heartbeat.start();
  }

  const server = createServer(ctx);

  // Initialize WebSocket Server for Realtime Push Telemetry (Pillar 4)
  const wss = new WebSocketServer({ server, path: "/ws" });
  const wsClients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(
      JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
        message: "AgentClaw 10/10 WebSocket Telemetry Bus Connected",
        queueStatus: ctx.heartbeat ? ctx.heartbeat.getQueueStatus() : null,
      })
    );

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {}
    });

    ws.on("close", () => {
      wsClients.delete(ws);
    });
  });

  if (ctx.heartbeat) {
    ctx.heartbeat.onEvent((event) => {
      const payload = JSON.stringify({ type: "event", timestamp: Date.now(), data: event });
      for (const ws of wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    });
  }

  (ctx as any).wsClients = wsClients;
  return server;
}

function startKeepAlive() {
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || "https://agentclaw-cayj.onrender.com";
  const pingIntervalMs = 8 * 60 * 1000; // Ping every 8 minutes (Render sleeps at 15m)

  console.log(`[Keep-Alive] 📡 24/7 Cloud Keep-Alive Pinger active (${externalUrl})`);

  setTimeout(() => {
    fetch(`${externalUrl}/health`)
      .then(() => console.log(`[Keep-Alive] ⚡ Initial ping successful`))
      .catch(() => {});
  }, 30000);

  setInterval(() => {
    fetch(`${externalUrl}/health`)
      .then(() => console.log(`[Keep-Alive] ⚡ 24/7 Keep-Alive ping sent to ${externalUrl}`))
      .catch((err) => console.warn(`[Keep-Alive] Ping note:`, err.message));
  }, pingIntervalMs);
}

function createServer(ctx: ServerContext): http.Server {
  const server = http.createServer((req, res) => {
    // Dynamic CORS configuration
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

    // Standalone lightweight health check endpoint for UptimeRobot & Render
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

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
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

function parseJsonBody<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON");
  }
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const secret = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  if (!secret) {
    // Fail-secure: reject unauthorized admin API calls in production mode if secret is unset
    return process.env.NODE_ENV !== "production";
  }
  const keyHeader = req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return keyHeader === secret || bearerToken === secret;
}

function handleApi(
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  // Setup endpoints — available in both modes
  if (pathname.startsWith("/api/setup/")) {
    handleSetupApi(pathname, req, res, ctx);
    return;
  }

  if (pathname === "/api/auth/login") {
    if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
    readBody(req).then((bodyStr) => {
      try {
        const body = parseJsonBody<{ password?: string }>(bodyStr);
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

  // Running-mode endpoints require config + heartbeat
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
        uptime: ctx.heartbeat.state.running
          ? Date.now() - ctx.heartbeat.state.startedAt
          : 0,
        agentId: ctx.config.agentId,
      });
      break;

    case "/api/platform-stats":
      json(res, {
        ok: true,
        platforms: getPlatformStats(),
      });
      break;

    case "/api/tasks": {
      const activeTasksMap = ctx.heartbeat.state.activeTasks;
      const dbTasks = dbGetAllTasks(1000);
      const dbEarnings = dbGetEarnings();
      const earningsByTaskMap = new Map<string, any>();
      for (const e of dbEarnings) {
        earningsByTaskMap.set(e.taskId, e);
        earningsByTaskMap.set(e.id, e);
      }
      const mergedMap = new Map<string, any>();

      // Populate DB tasks first
      for (const dbt of dbTasks) {
        const earn = earningsByTaskMap.get(dbt.id);
        mergedMap.set(dbt.id, {
          id: dbt.id,
          task: dbt.title,
          status: dbt.status,
          quotedPriceWei: dbt.earnedUsd ? String(dbt.earnedUsd) : undefined,
          result: dbt.solutionSnippet,
          earnedUsd: dbt.earnedUsd || earn?.amountUsd,
          payoutStatus: earn?.payoutStatus,
          txHash: earn?.txHash,
          source: earn?.source,
        });
      }

      // Overlay live active tasks
      for (const at of activeTasksMap.values()) {
        const earn = earningsByTaskMap.get(at.id);
        mergedMap.set(at.id, {
          id: at.id,
          task: at.task,
          status: at.status,
          quotedPriceWei: at.quotedPriceWei,
          ratedScore: at.ratedScore,
          result: at.result,
          earnedUsd: earn?.amountUsd,
          payoutStatus: earn?.payoutStatus,
          txHash: earn?.txHash,
          source: earn?.source,
        });
      }

      const currentEvents = ctx.heartbeat.state.events.length > 0
        ? ctx.heartbeat.state.events
        : dbGetAllEvents(100);

      json(res, {
        tasks: Array.from(mergedMap.values()),
        events: currentEvents.slice(-50),
      });
      break;
    }

    case "/api/logs":
      json(res, { log: readTodayLog() });
      break;

    case "/api/config":
      json(res, {
        ...ctx.config,
        llm: { ...ctx.config.llm, apiKey: "***" },
      });
      break;

    case "/api/stats":
      json(res, {
        ...getFeedbackStats(),
        studySessions: ctx.heartbeat.state.totalStudySessions,
        knowledgeEntries: loadKnowledge().length,
      });
      break;

    case "/api/knowledge":
      json(res, { entries: loadKnowledge() });
      break;

    case "/api/knowledge/delete":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      if (!isAuthorized(req)) { json(res, { error: "Unauthorized" }, 401); return; }
      handleKnowledgeDelete(req, res);
      break;

    case "/api/feedback":
      json(res, { entries: loadFeedback() });
      break;

    case "/api/stop":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      if (!isAuthorized(req)) { json(res, { error: "Unauthorized — missing or invalid ADMIN_SECRET" }, 401); return; }
      ctx.heartbeat.stop();
      json(res, { ok: true, running: false });
      break;

    case "/api/start":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      if (!isAuthorized(req)) { json(res, { error: "Unauthorized — missing or invalid ADMIN_SECRET" }, 401); return; }
      ctx.heartbeat.start();
      json(res, { ok: true, running: true });
      break;

    case "/api/config-update":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      if (!isAuthorized(req)) { json(res, { error: "Unauthorized — missing or invalid ADMIN_SECRET" }, 401); return; }
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
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      clearChat();
      json(res, { ok: true });
      break;

    case "/api/survival":
      json(res, applyHourlyDecay());
      break;

    case "/api/survival/revive":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      json(res, reviveAgent());
      break;

    case "/api/survival/earn":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      readBody(req).then((bodyStr) => {
        try {
          const body = parseJsonBody<{ amountUsd: number; title: string }>(bodyStr);
          const updated = recordEarning(body.amountUsd || 10, body.title || "Freelance Task");
          json(res, updated);
        } catch {
          json(res, { error: "Invalid body" }, 400);
        }
      });
      break;
    case "/api/revenue":
      autoSettlePendingEarnings().catch(() => {}).finally(() => {
        json(res, {
          confirmedRevenue: dbGetTotalEarnings(),
          pendingRevenue: dbGetPendingEarnings(),
          destinationWallet: process.env.TREASURY_ADDRESS || "0xfdCE8864Ab96584102354Eb2d270187E0E900492",
          earnings: dbGetEarnings(),
        });
      });
      break;

    case "/api/rpc-mesh":
      testRpcMeshHealth()
        .then((meshHealth) => {
          json(res, {
            timestamp: Date.now(),
            meshStatus: meshHealth.some((n) => n.status === "healthy") ? "ONLINE" : "DEGRADED",
            healthyNodeCount: meshHealth.filter((n) => n.status === "healthy").length,
            totalNodes: meshHealth.length,
            nodes: meshHealth,
          });
        })
        .catch((err) => {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
        });
      break;

    case "/api/queue-status":
      if (ctx.heartbeat) {
        json(res, {
          timestamp: Date.now(),
          running: ctx.heartbeat.state.running,
          ...ctx.heartbeat.getQueueStatus(),
        });
      } else {
        json(res, { error: "Heartbeat engine not running" }, 503);
      }
      break;

    case "/api/websocket-info":
      json(res, {
        enabled: true,
        endpoint: `ws://localhost:${PORT}/ws`,
        activeClients: (ctx as any).wsClients ? (ctx as any).wsClients.size : 0,
      });
      break;

    case "/api/revenue/confirm":
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      readBody(req).then((bodyStr) => {
        try {
          const body = parseJsonBody<{ earningId: string; txHash?: string }>(bodyStr);
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
      if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
      readBody(req).then(async (bodyStr) => {
        try {
          const body = parseJsonBody<{ task: string; budgetUsd?: number; platform?: string; clientEmail?: string }>(bodyStr);
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
            survivalState: updated,
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

async function handleSetupApi(
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  try {
    switch (pathname) {
      case "/api/setup/status":
        json(res, {
          configured: isConfigured(),
          mode: ctx.mode,
          step: detectCurrentStep(ctx),
        });
        break;

      case "/api/setup/wallet": {
        const wallet = await cli.walletShow();
        json(res, wallet);
        break;
      }

      case "/api/setup/agent-lookup": {
        const wallet = await cli.walletShow();
        const agent = await cli.getAgentByWallet(wallet.address);
        // Auto-save agentId to config if found
        if (agent) {
          savePartialConfig({ agentId: agent.agentId });
          ctx.config = loadConfig();
        }
        json(res, { agent });
        break;
      }

      case "/api/setup/wallet/import": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
        const body = parseJsonBody(await readBody(req)) as { privateKey: string };
        const wallet = await cli.walletImport(body.privateKey);
        json(res, wallet);
        break;
      }

      case "/api/setup/register": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
        const body = parseJsonBody(await readBody(req)) as {
          name: string;
          description: string;
          skills: string[];
          price: string;
          symbol?: string;
          token?: string;
          image?: string; // base64 data URL
          website?: string;
        };

        // If image is a base64 data URL, write to temp file for CLI
        let imagePath: string | undefined;
        if (body.image && body.image.startsWith("data:")) {
          const match = body.image.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === "jpeg" ? "jpg" : match[1];
            imagePath = path.join(os.tmpdir(), `cashclaw-image-${Date.now()}.${ext}`);
            fs.writeFileSync(imagePath, Buffer.from(match[2], "base64"));
          }
        }

        try {
          const result = await cli.registerAgent({
            ...body,
            image: imagePath,
          });
          savePartialConfig({ agentId: result.agentId });
          ctx.config = loadConfig();
          json(res, result);
        } finally {
          // Clean up temp image
          if (imagePath && fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        break;
      }

      case "/api/setup/llm": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
        const body = parseJsonBody(await readBody(req)) as LLMConfig;
        savePartialConfig({ llm: body });
        ctx.config = loadConfig();
        json(res, { ok: true });
        break;
      }

      case "/api/setup/llm/test": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
        const body = parseJsonBody(await readBody(req)) as LLMConfig;
        const llm = createLLMProvider(body);
        const response = await llm.chat([
          { role: "user", content: "Say hello in one sentence." },
        ]);
        const text = response.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("");
        json(res, { ok: true, response: text });
        break;
      }

      case "/api/setup/specialization": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
        const body = parseJsonBody(await readBody(req)) as {
          specialties: string[];
          pricing: { strategy: string; baseRateEth: string; maxRateEth: string };
          autoQuote: boolean;
          autoWork: boolean;
          maxConcurrentTasks: number;
          declineKeywords: string[];
        };
        savePartialConfig({
          specialties: body.specialties,
          pricing: body.pricing as CashClawConfig["pricing"],
          autoQuote: body.autoQuote,
          autoWork: body.autoWork,
          maxConcurrentTasks: body.maxConcurrentTasks,
          declineKeywords: body.declineKeywords,
        });
        ctx.config = loadConfig();
        json(res, { ok: true });
        break;
      }

      case "/api/setup/complete": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }

        if (!isConfigured()) {
          json(res, { error: "Configuration incomplete" }, 400);
          return;
        }

        ctx.config = loadConfig()!;
        const llm = createLLMProvider(ctx.config.llm);
        ctx.heartbeat = createHeartbeat(ctx.config, llm);
        ctx.heartbeat.start();
        ctx.mode = "running";

        json(res, { ok: true, mode: "running" });
        break;
      }

      case "/api/setup/reset": {
        if (req.method !== "POST") { json(res, { error: "POST only" }, 405); return; }
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

/** Detect which setup step the user is on based on current config state */
function detectCurrentStep(ctx: ServerContext): string {
  if (!ctx.config) return "wallet";
  if (!ctx.config.agentId) return "register";
  if (!ctx.config.llm?.apiKey) return "llm";
  return "specialization";
}

async function handleConfigUpdate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  try {
    const body = await readBody(req);
    const updates = parseJsonBody<Partial<CashClawConfig>>(body);

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
    if (updates.autoQuote !== undefined) ctx.config.autoQuote = updates.autoQuote;
    if (updates.autoWork !== undefined) ctx.config.autoWork = updates.autoWork;
    if (updates.maxConcurrentTasks !== undefined) {
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
      // Cap customInstructions to prevent prompt bloat
      if (p.customInstructions && p.customInstructions.length > 2000) {
        json(res, { error: "customInstructions must be under 2000 characters" }, 400);
        return;
      }
      ctx.config.personality = p;
    }
    if (updates.learningEnabled !== undefined) ctx.config.learningEnabled = updates.learningEnabled;
    if (updates.studyIntervalMs !== undefined) {
      const val = Number(updates.studyIntervalMs);
      if (val < 60_000 || val > 86_400_000) {
        json(res, { error: "studyIntervalMs must be 60000-86400000" }, 400);
        return;
      }
      ctx.config.studyIntervalMs = val;
    }
    if (updates.polling) ctx.config.polling = updates.polling;
    if (updates.agentCashEnabled !== undefined) ctx.config.agentCashEnabled = updates.agentCashEnabled;

    // LLM hot-swap: preserve existing apiKey if masked, restart heartbeat
    if (updates.llm) {
      const newLlm = { ...updates.llm };
      const providerChanged = newLlm.provider !== ctx.config.llm.provider;
      if (newLlm.apiKey === "***") {
        if (providerChanged) {
          json(res, { error: "New provider selected — please enter your API key" }, 400);
          return;
        }
        newLlm.apiKey = ctx.config.llm.apiKey;
      }
      ctx.config.llm = newLlm;

      // Restart heartbeat with new LLM provider
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

// Cache wallet info to avoid calling CLI every 3s
let walletCache: { info: { address: string; balance?: string }; fetchedAt: number } | null = null;
const WALLET_CACHE_TTL = 60_000; // 1 min

async function handleWallet(
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  try {
    const now = Date.now();
    if (!walletCache || now - walletCache.fetchedAt > WALLET_CACHE_TTL) {
      const info = await cli.walletShow();
      walletCache = { info, fetchedAt: now };
    }
    json(res, walletCache.info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}

async function handleAgentInfo(
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  try {
    const wallet = await cli.walletShow();
    const agent = await cli.getAgentByWallet(wallet.address);
    json(res, { agent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}

async function handleAgentCashBalance(
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  if (!ctx.config?.agentCashEnabled) {
    json(res, { error: "AgentCash not enabled" }, 400);
    return;
  }
  try {
    const result = await agentcashBalance.execute({}, { config: ctx.config!, taskId: "" });
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

// ETH price cache — 60s TTL
let ethPriceCache: { price: number; fetchedAt: number } | null = null;
const ETH_PRICE_CACHE_TTL = 60_000;

async function handleEthPrice(res: http.ServerResponse) {
  try {
    const now = Date.now();
    if (!ethPriceCache || now - ethPriceCache.fetchedAt > ETH_PRICE_CACHE_TTL) {
      const resp = await fetch(
        "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD",
      );
      const data = (await resp.json()) as { USD?: number };
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

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
) {
  try {
    const body = parseJsonBody(await readBody(req)) as { message: string };
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
    const specialties = ctx.config.specialties.length > 0
      ? ctx.config.specialties.join(", ")
      : "general tasks";

    // Gather self-awareness context
    const allKnowledge = loadKnowledge();
    const relevantKnowledge = getRelevantKnowledge(ctx.config.specialties, 5);
    const stats = getFeedbackStats();
    const hbState = ctx.heartbeat?.state;
    const studySessions = hbState?.totalStudySessions ?? 0;
    const isRunning = hbState?.running ?? false;

    const knowledgeSection = relevantKnowledge.length > 0
      ? `\n\nYou've learned these insights from self-study:\n${relevantKnowledge.map((k) => `- ${k.insight.slice(0, 200)}`).join("\n")}`
      : "";

    const personalitySection = ctx.config.personality
      ? `\nYour personality: tone=${ctx.config.personality.tone}, style=${ctx.config.personality.responseStyle}.${ctx.config.personality.customInstructions ? ` Custom instructions: ${ctx.config.personality.customInstructions}` : ""}`
      : "";

    const systemPrompt = `You are CashClaw (agent "${ctx.config.agentId}"), an autonomous work agent on the moltlaunch marketplace.
Your specialties: ${specialties}. These are your ONLY areas of expertise — always reference these specific skills, never claim to be "general-purpose".

## Self-awareness
- Status: ${isRunning ? "RUNNING" : "STOPPED"}
- Learning: ${ctx.config.learningEnabled ? "ACTIVE" : "DISABLED"} — study sessions every ${Math.round(ctx.config.studyIntervalMs / 60000)} min
- Study sessions completed: ${studySessions}
- Knowledge entries: ${allKnowledge.length}
- Tasks completed: ${stats.totalTasks}, avg score: ${stats.avgScore}/5
- Tools: quote, decline, submit work, message clients, browse bounties, check wallet, read feedback${personalitySection}

You're chatting with your operator. Be helpful, concise, and direct. Discuss performance, knowledge, tasks, and capabilities. Keep responses grounded in your actual data.${knowledgeSection}`;

    // Build conversation from history (last 20 messages for context)
    const history = loadChat().slice(-20);
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await llm.chat(messages);
    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    appendChat({ role: "assistant", content: text, timestamp: Date.now() });
    json(res, { reply: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}

async function handleKnowledgeDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const body = parseJsonBody<{ id: string }>(await readBody(req));
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

function serveStatic(pathname: string, res: http.ServerResponse) {
  // Resolve the built UI dist directory.
  // In dev (tsx): import.meta.dirname = src/, built UI at ../dist/ui
  // In prod (dist/index.js): import.meta.dirname = dist/, built UI at ./ui
  const baseDir = import.meta.dirname ?? __dirname;
  const distUi = path.join(baseDir, "..", "dist", "ui");
  const uiDir = fs.existsSync(path.join(distUi, "index.html"))
    ? distUi
    : path.join(baseDir, "ui");

  const resolvedUiDir = path.resolve(uiDir);
  let filePath = path.resolve(uiDir, pathname === "/" ? "index.html" : pathname.slice(1));

  // Path traversal guard — ensure resolved path is under uiDir
  if (!filePath.startsWith(resolvedUiDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!path.extname(filePath)) {
    filePath = path.join(resolvedUiDir, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };

  res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "text/plain" });
  fs.createReadStream(filePath).pipe(res);
}

/** Built by Aditya Waghamare */
import WebSocket from "ws";
import PQueue from "p-queue";
import type { CashClawConfig } from "./config.js";
import type { LLMProvider } from "./llm/types.js";
import type { Task } from "./moltlaunch/types.js";
import * as cli from "./moltlaunch/cli.js";
import { runAgentLoop, type LoopResult } from "./loop/index.js";
import { autonomousAdapter, keyManager } from "./llm/adaptation.js";
import { runStudySession } from "./loop/study.js";
import { storeFeedback } from "./memory/feedback.js";
import { appendLog } from "./memory/log.js";
import { applyHourlyDecay, recordEarning, loadSurvivalState } from "./memory/survival.js";
import { autoSettlePendingEarnings } from "./memory/settlement.js";
import {
  dbRecordEarning,
  dbUpdateTaskStatus,
  dbLogExecution,
  dbGetStats,
  dbGetTaskById,
  dbRecordDiscovery,
  dbGetAllTasks,
  dbRecordEvent,
  dbGetAllEvents,
} from "./memory/db.js";

export interface HeartbeatState {
  running: boolean;
  activeTasks: Map<string, Task>;
  lastPoll: number;
  totalPolls: number;
  startedAt: number;
  events: ActivityEvent[];
  wsConnected: boolean;
  lastStudyTime: number;
  totalStudySessions: number;
  workerConcurrency: number;
  activeWorkers: number;
  queuedTasks: number;
}

export interface ActivityEvent {
  timestamp: number;
  type: "poll" | "loop_start" | "loop_complete" | "tool_call" | "feedback" | "error" | "ws" | "study" | "exec";
  taskId?: string;
  message: string;
}

type EventListener = (event: ActivityEvent) => void;

const TERMINAL_STATUSES = new Set([
  "completed", "declined", "cancelled", "expired", "resolved", "disputed",
]);

const WS_URL = "wss://api.moltlaunch.com/ws";
const WS_INITIAL_RECONNECT_MS = 5_000;
const WS_MAX_RECONNECT_MS = 300_000;
const WS_POLL_INTERVAL_MS = 120_000;
const TASK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
// Rate-limit cooldown after 429
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 min

export function createHeartbeat(
  config: CashClawConfig,
  llm: LLMProvider,
) {
  // ⚡ Concurrent Worker Queue — capped at 2 to preserve free-tier API quotas
  const maxConcurrency = Math.min(Math.max(1, config.maxConcurrentTasks || 2), 2);
  const taskQueue = new PQueue({
    concurrency: maxConcurrency,
    autoStart: true,
  });

  const state: HeartbeatState = {
    running: false,
    activeTasks: new Map(),
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
    },
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wsReconnectDelay = WS_INITIAL_RECONNECT_MS;
  let wsFailLogged = false;
  const processing = new Set<string>();
  const completedTasks = new Set<string>();
  const processedVersions = new Map<string, string>();
  const listeners: EventListener[] = [];
  // Retry tracking
  const taskRetryAfter = new Map<string, number>();
  const taskRetryCounts = new Map<string, number>();
  let rateLimitedUntil = 0;
  // Track consecutive 429s to detect sustained outage
  let consecutive429s = 0;

  function hydrateStateFromDb() {
    try {
      const storedTasks = dbGetAllTasks(500);
      for (const st of storedTasks) {
        const isTerminal = TERMINAL_STATUSES.has(st.status) || st.status === "completed" || st.status === "failed" || st.status === "skipped";
        if (!isTerminal && !state.activeTasks.has(st.id)) {
          state.activeTasks.set(st.id, {
            id: st.id,
            agentId: config.agentId || "agent_claw",
            task: st.title,
            status: st.status as any,
            quotedPriceWei: st.earnedUsd ? String(st.earnedUsd) : undefined,
            result: st.solutionSnippet,
            clientAddress: st.source,
          });
        }
      }
    } catch {}

    try {
      const storedEvents = dbGetAllEvents(100);
      if (storedEvents && storedEvents.length > 0) {
        state.events = storedEvents as ActivityEvent[];
      }
    } catch {}
  }

  // Hydrate stored DB tasks and events on startup
  hydrateStateFromDb();

  function emit(event: Omit<ActivityEvent, "timestamp">) {
    const full: ActivityEvent = { ...event, timestamp: Date.now() };
    state.events.push(full);
    if (state.events.length > 100) {
      state.events = state.events.slice(-100);
    }
    dbRecordEvent(full);
    for (const fn of listeners) fn(full);
  }

  function onEvent(fn: EventListener) {
    listeners.push(fn);
  }

  // --- WebSocket ---

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

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            event: string;
            task?: Task;
          };
          if (msg.event === "connected") return;
          if (msg.task) handleTaskEvent(msg.task);
        } catch { }
      });

      ws.on("close", () => {
        state.wsConnected = false;
        if (!wsFailLogged) {
          emit({ type: "ws", message: "WebSocket disconnected — HTTP polling active" });
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
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
    if (ws) { ws.removeAllListeners(); ws.close(); ws = null; }
    state.wsConnected = false;
  }

  // --- CONCURRENT WORKER EXECUTION ENGINE (Pillar 3) ---

  async function executeTaskWorker(task: Task): Promise<void> {
    const startTime = Date.now();
    emit({
      type: "exec",
      taskId: task.id,
      message: `⚡ WORKER EXECUTING [Active Workers: ${taskQueue.pending}/${taskQueue.concurrency}]: ${task.task.slice(0, 70)}`,
    });
    appendLog(`⚡ Executing task ${task.id} (Workers: ${taskQueue.pending}/${taskQueue.concurrency}): ${task.task.slice(0, 100)}`);

    dbUpdateTaskStatus(task.id, "executing");

    try {
      const result: LoopResult = await runAgentLoop(llm, task, config);
      const toolNames = result.toolCalls.map((tc) => tc.name).join(", ");
      const hasSubmit = result.toolCalls.some((tc) => tc.name === "submit_work");

      emit({
        type: "loop_complete",
        taskId: task.id,
        message: `✅ Done in ${result.turns} turns: [${toolNames}]${hasSubmit ? " → SUBMITTED" : ""}`,
      });
      appendLog(`Task ${task.id} done: ${result.turns} turns, tools=[${toolNames}]`);

      for (const tc of result.toolCalls) {
        emit({
          type: "tool_call",
          taskId: task.id,
          message: `${tc.name}(${JSON.stringify(tc.input).slice(0, 80)}) → ${tc.success ? "✓" : "✗"}`,
        });
      }

      dbLogExecution({
        taskId: task.id,
        startedAt: startTime,
        completedAt: Date.now(),
        turns: result.turns,
        toolsUsed: result.toolCalls.map((tc) => tc.name),
        success: hasSubmit,
      });

      if (hasSubmit) {
        const earnedUsd = Number(task.budgetWei) || 25;
        dbRecordEarning({
          taskId: task.id,
          source: task.clientAddress || "bounty",
          amountUsd: earnedUsd,
          title: task.task.slice(0, 100),
          payoutStatus: "pending_escrow",
        });
        dbUpdateTaskStatus(task.id, "submitted", { solutionSnippet: result.reasoning.slice(0, 500) });

        emit({
          type: "feedback",
          taskId: task.id,
          message: `🟡 SUBMITTED! Bounty +$${earnedUsd} pending escrow release...`,
        });

        autoSettlePendingEarnings()
          .then((res) => {
            if (res.settled.length > 0) {
              emit({
                type: "feedback",
                taskId: task.id,
                message: `🟢 CONFIRMED! $${res.totalSettledUsd} transferred to wallet ${res.settled[0]?.destinationWallet || ""}`,
              });
            }
          })
          .catch((err) => {
            appendLog(`[Settlement Warning] Instant settlement attempt: ${err.message}`);
          });
      } else {
        dbUpdateTaskStatus(task.id, "completed");
      }

      consecutive429s = 0;
      taskRetryCounts.delete(task.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", taskId: task.id, message: `❌ Error: ${msg.slice(0, 200)}` });
      appendLog(`Error for ${task.id}: ${msg}`);

      const isCircuitBreaker = msg.includes("Circuit Breaker");
      const is429 = isCircuitBreaker || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("rate");
      if (is429) {
        consecutive429s++;

        // When ALL providers are exhausted, pause the worker queue immediately.
        // This prevents already-queued tasks from waking up just to fail.
        if (keyManager.isAllProvidersExhausted() && !taskQueue.isPaused) {
          taskQueue.pause();
          emit({
            type: "error",
            message: `⏸️ All provider keys exhausted — worker queue paused until quota resets.`,
          });
        }

        const retries = (taskRetryCounts.get(task.id) || 0) + 1;
        taskRetryCounts.set(task.id, retries);

        const backoffMs = Math.min(RATE_LIMIT_COOLDOWN_MS * Math.pow(2, retries - 1), 10 * 60 * 1000);
        taskRetryAfter.set(task.id, Date.now() + backoffMs);
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        processedVersions.delete(task.id);

        dbUpdateTaskStatus(task.id, "queued", { errorMsg: isCircuitBreaker ? `circuit-breaker - retry #${retries}` : `429 - retry #${retries}`, retries });

        emit({
          type: "error",
          taskId: task.id,
          message: `⏳ Rate limited — retry in ${Math.round(backoffMs / 60000)} min (attempt ${retries})`,
        });
      } else {
        const retryCount = (taskRetryCounts.get(task.id) || 0) + 1;
        if (retryCount <= 3) {
          taskRetryCounts.set(task.id, retryCount);
          taskRetryAfter.set(task.id, Date.now() + 30_000);
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
        errorMsg: msg.slice(0, 300),
      });
    }
  }

  function handleTaskEvent(task: Task) {
    try {
      dbRecordDiscovery({
        id: task.id,
        source: task.clientAddress || "moltlaunch",
        title: task.task,
        url: task.id,
      });
      dbUpdateTaskStatus(task.id, task.status as any, {
        earnedUsd: task.quotedPriceWei ? Number(task.quotedPriceWei) : undefined,
        solutionSnippet: task.result,
      });
    } catch {}

    if (TERMINAL_STATUSES.has(task.status)) {
      if (task.status === "completed" && task.ratedScore !== undefined) {
        handleCompleted(task);
      }
      state.activeTasks.delete(task.id);
      processedVersions.delete(task.id);
      taskRetryAfter.delete(task.id);
      taskRetryCounts.delete(task.id);
      return;
    }

    // Skip if globally rate-limited
    if (Date.now() < rateLimitedUntil) {
      state.activeTasks.set(task.id, task);
      return;
    }

    // Skip if task in retry backoff
    const retryAfter = taskRetryAfter.get(task.id);
    if (retryAfter && Date.now() < retryAfter) {
      state.activeTasks.set(task.id, task);
      return;
    }

    // Dedup — but allow retries
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

    // Guard: Skip execution if all LLM providers are quota-exhausted across all keys.
    // No consecutive429s threshold needed — isAllProvidersExhausted() is authoritative.
    // The circuit breaker (Fix 1) prevents fetch() calls; this prevents task dispatch entirely.
    if (keyManager.isAllProvidersExhausted()) {
      if (!taskQueue.isPaused) {
        taskQueue.pause();
      }
      emit({
        type: "error",
        taskId: task.id,
        message: `⏸️ All API keys across all providers exhausted. Task deferred until quota resets.`,
      });
      state.activeTasks.set(task.id, task);
      return;
    }

    state.activeTasks.set(task.id, task);
    processedVersions.set(task.id, version);
    taskRetryAfter.delete(task.id);
    processing.add(task.id);

    // ⚡ ENQUEUE TASK INTO CONCURRENT WORKER POOL
    taskQueue
      .add(async () => {
        await executeTaskWorker(task);
      })
      .catch((err) => {
        appendLog(`[Worker Queue Exception] Task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        processing.delete(task.id);
      });
  }

  /**
   * Continuous Lifecycle Observer:
   * Monitors submitted GitHub bounties, checks if PRs/Issues are merged or closed by maintainers,
   * updates task state to completed, and triggers instant on-chain escrow settlement.
   */
  async function checkSubmittedBountiesLifecycle() {
    const token = process.env.GITHUB_TOKEN;
    const authHeaders: Record<string, string> = {
      "User-Agent": "AgentClaw-Engine",
      "Accept": "application/vnd.github.v3+json",
      ...(token ? { Authorization: token.startsWith("github_pat_") || token.startsWith("ghp_") ? `Bearer ${token}` : `token ${token}` } : {}),
    };

    for (const [id, task] of state.activeTasks.entries()) {
      if (task.status !== "submitted") continue;

      const ghMatch = task.task.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
      if (!ghMatch) continue;

      const [, owner, repo, itemType, num] = ghMatch;
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${num}`, { headers: authHeaders });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.state === "closed") {
            appendLog(`🎉 [Lifecycle Observer] Submitted bounty ${id} (${owner}/${repo} #${num}) confirmed ACCEPTED/CLOSED!`);
            dbUpdateTaskStatus(id, "completed");
            task.status = "completed";
            emit({
              type: "feedback",
              taskId: id,
              message: `🎉 ACCEPTED! Maintainer closed/merged #${num} in ${owner}/${repo}. Triggering payout...`,
            });
            await autoSettlePendingEarnings().catch(() => {});
          }
        }
      } catch {}
    }
  }

  // --- Polling ---

  async function tick() {
    try {
      applyHourlyDecay();
      await checkSubmittedBountiesLifecycle().catch(() => {});
      await autoSettlePendingEarnings().catch(() => {});
      const tasks = await cli.getInbox(config.agentId);
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

  function handleCompleted(task: Task) {
    if (task.ratedScore === undefined) return;
    if (completedTasks.has(task.id)) return;
    completedTasks.add(task.id);

    storeFeedback({
      taskId: task.id,
      taskDescription: task.task,
      score: task.ratedScore,
      comments: task.ratedComment ?? "",
      timestamp: Date.now(),
    });

    emit({
      type: "feedback",
      taskId: task.id,
      message: `Rated ${task.ratedScore}/5`,
    });
  }

  function scheduleNext() {
    if (!state.running) return;

    // Prune stale & terminal tasks from activeTasks Map
    const now = Date.now();
    for (const [id, task] of state.activeTasks) {
      const statusStr = task.status as string;
      const isTerminal = TERMINAL_STATUSES.has(task.status) || statusStr === "completed" || statusStr === "failed" || statusStr === "skipped";
      const taskTime = task.quotedAt ?? task.acceptedAt ?? task.submittedAt ?? state.startedAt;
      if (isTerminal || (!processing.has(id) && now - taskTime > TASK_EXPIRY_MS)) {
        state.activeTasks.delete(id);
        processedVersions.delete(id);
        taskRetryAfter.delete(id);
        taskRetryCounts.delete(id);
      }
    }

    if (global.gc) {
      try { global.gc(); } catch {}
    }

    // Resume worker queue if providers have recovered (e.g., after UTC midnight quota reset)
    if (taskQueue.isPaused && !keyManager.isAllProvidersExhausted()) {
      taskQueue.start();
      consecutive429s = 0;
      emit({
        type: "poll",
        message: `▶️ Provider keys recovered — worker queue resumed.`,
      });
    }

    // Study ONLY if completely idle and not rate-limited
    void maybeStudy();

    if (state.wsConnected) {
      timer = setTimeout(() => void tick(), WS_POLL_INTERVAL_MS);
      return;
    }

    const hasWork = [...state.activeTasks.values()].some(
      (t) => t.status === "requested" || t.status === "revision" || t.status === "accepted",
    );

    const interval = hasWork
      ? config.polling.urgentIntervalMs
      : config.polling.intervalMs;

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

    const STUDY_INTERVAL = Math.max(config.studyIntervalMs, 7_200_000);
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
      processingTaskIds: Array.from(processing),
    };
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = Date.now();
    if (state.lastStudyTime === 0) {
      state.lastStudyTime = Date.now();
    }
    appendLog("🔥 AgentClaw execution engine started — CONCURRENT WORKER POOL ACTIVE (Pillar 3)");
    console.log("🔥 [Heartbeat] Execution engine started — CONCURRENT WORKER POOL ACTIVE (Pillar 3)");
    connectWs();
    void tick();
  }

  function stop() {
    state.running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    disconnectWs();
    taskQueue.clear();
    appendLog("Heartbeat stopped");
  }

  return { state, start, stop, onEvent, getQueueStatus };
}

export type Heartbeat = ReturnType<typeof createHeartbeat>;

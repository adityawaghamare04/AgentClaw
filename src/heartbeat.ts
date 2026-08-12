import WebSocket from "ws";
import type { CashClawConfig } from "./config.js";
import type { LLMProvider } from "./llm/types.js";
import type { Task } from "./moltlaunch/types.js";
import * as cli from "./moltlaunch/cli.js";
import { runAgentLoop, type LoopResult } from "./loop/index.js";
import { runStudySession } from "./loop/study.js";
import { storeFeedback } from "./memory/feedback.js";
import { appendLog } from "./memory/log.js";
import { applyHourlyDecay, recordEarning, loadSurvivalState } from "./memory/survival.js";
import {
  dbRecordEarning,
  dbUpdateTaskStatus,
  dbLogExecution,
  dbGetStats,
  dbGetTaskById,
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
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 min (shorter — we use free models now)

export function createHeartbeat(
  config: CashClawConfig,
  llm: LLMProvider,
) {
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

  function emit(event: Omit<ActivityEvent, "timestamp">) {
    const full: ActivityEvent = { ...event, timestamp: Date.now() };
    state.events.push(full);
    if (state.events.length > 300) {
      state.events = state.events.slice(-300);
    }
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

  // --- AGGRESSIVE TASK EXECUTION ENGINE ---

  function handleTaskEvent(task: Task) {
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

    // Skip if this task is in retry backoff
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

    // DON'T skip quoted/submitted — only skip if truly terminal
    if (task.status === "quoted" || task.status === "submitted") {
      state.activeTasks.set(task.id, task);
      processedVersions.set(task.id, version);
      return;
    }

    if (processing.size >= config.maxConcurrentTasks) return;

    // ⚡ EXECUTE
    state.activeTasks.set(task.id, task);
    processedVersions.set(task.id, version);
    taskRetryAfter.delete(task.id);
    processing.add(task.id);

    const startTime = Date.now();
    emit({ type: "exec", taskId: task.id, message: `⚡ EXECUTING: ${task.task.slice(0, 80)}` });
    appendLog(`⚡ Executing task ${task.id}: ${task.task.slice(0, 100)}`);

    // Update DB
    dbUpdateTaskStatus(task.id, "executing");

    runAgentLoop(llm, task, config)
      .then((result: LoopResult) => {
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

        // Record in DB
        dbLogExecution({
          taskId: task.id,
          startedAt: startTime,
          completedAt: Date.now(),
          turns: result.turns,
          toolsUsed: result.toolCalls.map(tc => tc.name),
          success: hasSubmit,
        });

        if (hasSubmit) {
          // Log earning in Pending Escrow state
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
            message: `🟡 SUBMITTED! Bounty +$${earnedUsd} pending escrow release to MetaWallet`,
          });
        } else {
          dbUpdateTaskStatus(task.id, "completed");
        }

        // Reset 429 counter on success
        consecutive429s = 0;
        taskRetryCounts.delete(task.id);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: "error", taskId: task.id, message: `❌ Error: ${msg.slice(0, 200)}` });
        appendLog(`Error for ${task.id}: ${msg}`);

        const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("rate");
        if (is429) {
          consecutive429s++;
          const retries = (taskRetryCounts.get(task.id) || 0) + 1;
          taskRetryCounts.set(task.id, retries);

          // Backoff: 1min, 2min, 4min, max 10min
          const backoffMs = Math.min(RATE_LIMIT_COOLDOWN_MS * Math.pow(2, retries - 1), 10 * 60 * 1000);
          taskRetryAfter.set(task.id, Date.now() + backoffMs);
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          processedVersions.delete(task.id);

          dbUpdateTaskStatus(task.id, "queued", { errorMsg: `429 - retry #${retries}`, retries });

          emit({
            type: "error",
            taskId: task.id,
            message: `⏳ Rate limited — retry in ${Math.round(backoffMs / 60000)} min (attempt ${retries})`,
          });
        } else {
          // Non-429: retry up to 3 times
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
      })
      .finally(() => {
        processing.delete(task.id);
      });
  }

  // --- Polling ---

  async function tick() {
    try {
      applyHourlyDecay();
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

    // Expire stale tasks
    const now = Date.now();
    for (const [id, task] of state.activeTasks) {
      const taskTime = task.quotedAt ?? task.acceptedAt ?? task.submittedAt ?? state.startedAt;
      if (!processing.has(id) && now - taskTime > TASK_EXPIRY_MS) {
        state.activeTasks.delete(id);
        processedVersions.delete(id);
      }
    }

    // Study ONLY if completely idle and not rate-limited (deprioritized)
    void maybeStudy();

    if (state.wsConnected) {
      timer = setTimeout(() => void tick(), WS_POLL_INTERVAL_MS);
      return;
    }

    // Fast polling when tasks exist — we want to execute ASAP
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
    if (processing.size > 0) return;

    // Don't study if rate-limited
    if (Date.now() < rateLimitedUntil) return;

    // Don't study if there are ANY pending tasks
    const hasTasks = state.activeTasks.size > 0;
    if (hasTasks) return;

    // Don't study if tasks waiting for retry
    if (taskRetryAfter.size > 0) return;

    // Study much less frequently — every 2 hours instead of 30 min
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

  function start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = Date.now();
    if (state.lastStudyTime === 0) {
      state.lastStudyTime = Date.now();
    }
    appendLog("🔥 AgentClaw execution engine started — AGGRESSIVE MODE");
    console.log("🔥 [Heartbeat] Execution engine started — AGGRESSIVE MODE");
    connectWs();
    void tick();
  }

  function stop() {
    state.running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    disconnectWs();
    appendLog("Heartbeat stopped");
  }

  return { state, start, stop, onEvent };
}

export type Heartbeat = ReturnType<typeof createHeartbeat>;

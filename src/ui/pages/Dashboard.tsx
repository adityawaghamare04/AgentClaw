import { useState, useEffect } from "react";
import { api, type StatusData, type ActivityEvent, type StatsData, type KnowledgeEntry, type FeedbackEntry, type WalletInfo, type AgentCashBalance, type SurvivalState } from "../lib/api.js";
import { ethToUsd } from "../lib/ethPrice.js";
import { PlatformStatsWidget } from "../components/PlatformStatsWidget";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const EVENT_COLORS: Record<string, string> = {
  poll: "text-zinc-600",
  loop_start: "text-blue-400",
  loop_complete: "text-emerald-400",
  tool_call: "text-amber-400",
  feedback: "text-violet-400",
  error: "text-red-400",
  ws: "text-zinc-600",
  study: "text-amber-300",
};

const EVENT_LABELS: Record<string, string> = {
  poll: "sync",
  loop_start: "exec",
  loop_complete: "done",
  tool_call: "tool",
  feedback: "rate",
  error: "error",
  ws: "link",
  study: "learn",
};

const EVENT_BAR_COLORS: Record<string, string> = {
  poll: "bg-zinc-700",
  loop_start: "bg-blue-500",
  loop_complete: "bg-emerald-500",
  tool_call: "bg-amber-500",
  feedback: "bg-violet-500",
  error: "bg-red-500",
  ws: "bg-zinc-700",
  study: "bg-amber-400",
};

const FILTER_OPTIONS: { label: string; type: string | null }[] = [
  { label: "All", type: null },
  { label: "Exec", type: "loop_start" },
  { label: "Tools", type: "tool_call" },
  { label: "Errors", type: "error" },
  { label: "Learn", type: "study" },
];

const TOPIC_COLORS: Record<string, string> = {
  feedback_analysis: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  specialty_research: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  task_simulation: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

type IntelTab = "knowledge" | "feedback";

export function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [agentCashBalance, setAgentCashBalance] = useState<AgentCashBalance | null>(null);
  const [agentCashEnabled, setAgentCashEnabled] = useState(false);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [survival, setSurvival] = useState<SurvivalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [intelTab, setIntelTab] = useState<IntelTab>("knowledge");
  const [expandedKnowledge, setExpandedKnowledge] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [s, t, st, w, k, f, cfg, surv] = await Promise.all([
          api.getStatus(),
          api.getTasks(),
          api.getStats(),
          api.getWalletCached().catch(() => null),
          api.getKnowledge().catch(() => ({ entries: [] })),
          api.getFeedback().catch(() => ({ entries: [] })),
          api.getConfig().catch(() => null),
          api.getSurvival().catch(() => null),
        ]);
        if (!active) return;
        setStatus(s);
        setEvents([...t.events].reverse());
        setStats(st);
        setWallet(w);
        setKnowledge(k.entries);
        setFeedback(f.entries);
        setSurvival(surv);
        setError(null);

        const cashEnabled = cfg?.agentCashEnabled ?? false;
        setAgentCashEnabled(cashEnabled);
        if (cashEnabled) {
          api.getAgentCashBalance()
            .then((b) => { if (active) setAgentCashBalance(b); })
            .catch(() => { if (active) setAgentCashBalance(null); });
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 3000);

    // Fetch ETH price once (has its own server-side cache)
    api.getEthPrice()
      .then(({ price }) => { if (active) setEthPrice(price); })
      .catch(() => {});

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggleAgent() {
    if (!status) return;
    setToggleError(null);
    try {
      if (status.running) {
        await api.stop();
      } else {
        await api.start();
      }
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (error) {
    return (
      <div className="text-center py-32">
        <p className="text-xl text-zinc-300 mb-2">Connection Lost</p>
        <p className="text-sm text-zinc-600 mb-6">{error}</p>
        <p className="text-sm text-zinc-600">Run <code className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-sm font-mono text-xs">agentclaw start</code> to reconnect</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-32">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-zinc-600">Connecting...</p>
      </div>
    );
  }

  const isStudying = events.length > 0
    && events[0]?.type === "study"
    && events[0]?.message.startsWith("Starting");

  const agentState = isStudying ? "studying" : status.running ? "active" : "idle";

  const filteredEvents = eventFilter
    ? events.filter((ev) => ev.type === eventFilter)
    : events;

  const balanceEth = wallet?.balance ? parseFloat(wallet.balance).toFixed(4) : null;
  const balanceDisplay = balanceEth
    ? ethPrice > 0
      ? `${balanceEth} ETH (~$${ethToUsd(balanceEth, ethPrice)})`
      : `${balanceEth} ETH`
    : "--";

  const recentKnowledge = knowledge.slice(-10).reverse();
  const recentFeedback = feedback.slice(-10).reverse();

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className={`w-2 h-2 rounded-sm ${
              agentState === "studying" ? "bg-amber-400" : agentState === "active" ? "bg-emerald-400" : "bg-zinc-600"
            }`} />
            <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Monitor</h1>
          </div>
          <p className="text-sm text-zinc-500 font-mono">
            {agentState === "studying" ? "STUDYING" : agentState === "active" ? "OPERATIONAL" : "STOPPED"}
            {status.running && ` \u2022 ${formatUptime(status.uptime)}`}
            {status.running && status.totalPolls > 0 && ` \u2022 ${status.totalPolls} polls`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {toggleError && <span className="text-xs text-red-400 font-mono">{toggleError}</span>}
          <button
            onClick={() => void toggleAgent()}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              status.running
                ? "text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50"
                : "text-white bg-red-600 hover:bg-red-500"
            }`}
          >
            {status.running ? "Stop Agent" : "Start Agent"}
          </button>
        </div>
      </div>

      {/* 24/7 Multi-Platform Radar Scanner Stats */}
      <PlatformStatsWidget />

      {/* Survival Gauge & Level Roadmap */}
      {survival && (
        <div className="card p-5 border border-zinc-700/60 bg-gradient-to-r from-zinc-900/90 via-zinc-900 to-zinc-950">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  LEVEL {survival.level}
                </span>
                <h2 className="text-lg font-bold text-zinc-100 font-mono">{survival.rankTitle}</h2>
                {survival.paidApiUnlocked && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    🔑 PAID API UNLOCKED
                  </span>
                )}
                {survival.companyLaunchUnlocked && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    🚀 COMPANY LAUNCHED
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                Total Revenue: <span className="text-emerald-400 font-bold">${survival.totalEarnedUsd.toFixed(2)}</span>
                {survival.totalEarnedUsd < 500 && ` • Next Unlock ($500 Paid API): $${(500 - survival.totalEarnedUsd).toFixed(2)} remaining`}
                {survival.totalEarnedUsd >= 500 && survival.totalEarnedUsd < 1000 && ` • Next Unlock ($1,000 Company Launch): $${(1000 - survival.totalEarnedUsd).toFixed(2)} remaining`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {survival.isHibernating && (
                <button
                  onClick={() => {
                    api.reviveSurvival().then(setSurvival).catch(() => {});
                  }}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-red-600 hover:bg-red-500 text-white animate-pulse"
                >
                  ⚡ REVIVE AGENT (50 HP)
                </button>
              )}
            </div>
          </div>

          {/* HP Health Gauge Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 flex items-center gap-1.5">
                🩸 SURVIVAL HEALTH (HP)
                {survival.health <= 20 && <span className="text-red-400 font-bold animate-pulse">(CRITICAL)</span>}
              </span>
              <span className={`font-bold ${survival.health >= 70 ? "text-emerald-400" : survival.health >= 30 ? "text-amber-400" : "text-red-400"}`}>
                {survival.health} / 100 HP
              </span>
            </div>
            <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  survival.health >= 70 ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : survival.health >= 30 ? "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]" : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                }`}
                style={{ width: `${Math.max(4, survival.health)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Tasks" value={String(status.activeTasks)} highlight={status.activeTasks > 0} />
        <StatCard label="Completed" value={stats ? String(stats.totalTasks) : "0"} />
        <StatCard label="Avg Score" value={stats && stats.avgScore > 0 ? stats.avgScore.toFixed(1) + "/5" : "--"} />
        <StatCard label="Balance" value={balanceDisplay} />
      </div>

      {/* Stats Row 2 — conditional */}
      {(agentCashEnabled || (stats && (stats.completionRate > 0 || stats.knowledgeEntries > 0 || stats.studySessions > 0))) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {agentCashEnabled && (
            <StatCard
              label="USDC Balance"
              value={agentCashBalance ? `$${parseFloat(agentCashBalance.balance).toFixed(2)}` : "--"}
            />
          )}
          <StatCard label="Success Rate" value={stats && stats.totalTasks > 0 ? `${stats.completionRate}%` : "--"} />
          <StatCard label="Knowledge" value={stats ? String(stats.knowledgeEntries) : "0"} />
          <StatCard label="Study Sessions" value={stats ? String(stats.studySessions) : "0"} />
        </div>
      )}

      {/* Event Log + Intelligence side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Event log — takes 3 cols */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-zinc-200 tracking-tight">Activity</h2>
              <span className="text-xs text-zinc-600 font-mono readout">{filteredEvents.length}</span>
            </div>
            <div className="flex gap-0.5">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setEventFilter(eventFilter === f.type ? null : f.type)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    eventFilter === f.type
                      ? "bg-zinc-700 text-zinc-200"
                      : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            {filteredEvents.length === 0 ? (
              <p className="text-zinc-600 py-20 text-center text-sm">No events yet</p>
            ) : (
              <div className="max-h-[560px] overflow-y-auto divide-y divide-zinc-800/40">
                {filteredEvents.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${ev.type}-${ev.taskId ?? ""}`}
                    className={`flex items-center gap-3 hover:bg-zinc-800/25 transition-colors ${
                      idx === 0 ? "bg-zinc-800/15" : ""
                    }`}
                  >
                    <div className={`w-[2px] self-stretch shrink-0 ${EVENT_BAR_COLORS[ev.type] ?? "bg-zinc-700"}`} />
                    <span className="text-[11px] text-zinc-600 font-mono tabular-nums shrink-0 w-14 py-2.5">
                      {formatTime(ev.timestamp)}
                    </span>
                    <span className={`text-[11px] font-semibold font-mono shrink-0 w-9 uppercase ${EVENT_COLORS[ev.type] ?? "text-zinc-600"}`}>
                      {EVENT_LABELS[ev.type] ?? ev.type.slice(0, 5)}
                    </span>
                    {ev.taskId && (
                      <code className="text-[10px] text-zinc-700 font-mono shrink-0">{ev.taskId.slice(0, 8)}</code>
                    )}
                    <span className="text-[13px] text-zinc-400 truncate pr-3">{ev.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Intelligence — takes 2 cols */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-zinc-200 tracking-tight">Intelligence</h2>
            <div className="flex gap-0.5 ml-auto">
              <button
                onClick={() => setIntelTab("knowledge")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  intelTab === "knowledge" ? "bg-zinc-700 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                Knowledge ({knowledge.length})
              </button>
              <button
                onClick={() => setIntelTab("feedback")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  intelTab === "feedback" ? "bg-zinc-700 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                Feedback ({feedback.length})
              </button>
            </div>
          </div>

          <div className="card overflow-hidden max-h-[560px] overflow-y-auto">
            {intelTab === "knowledge" ? (
              recentKnowledge.length === 0 ? (
                <p className="text-zinc-600 py-20 text-center text-sm">No knowledge yet</p>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  {recentKnowledge.map((k) => {
                    const isExpanded = expandedKnowledge === k.id;
                    return (
                      <div key={k.id} className="px-4 py-3.5 hover:bg-zinc-800/25 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold border ${
                            TOPIC_COLORS[k.topic] ?? "bg-zinc-800 text-zinc-400 border-zinc-700/50"
                          }`}>
                            {k.topic.replace(/_/g, " ")}
                          </span>
                          <span className="text-[11px] text-zinc-600 font-mono">{k.specialty}</span>
                          <span className="text-[10px] text-zinc-700 ml-auto font-mono">{formatRelative(k.timestamp)}</span>
                        </div>
                        <button
                          onClick={() => setExpandedKnowledge(isExpanded ? null : k.id)}
                          className="text-left w-full"
                        >
                          <p className={`text-[13px] text-zinc-400 leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                            {k.insight}
                          </p>
                        </button>
                        <div className="flex items-center gap-2 mt-1">
                          {k.source && (
                            <p className="text-[10px] text-zinc-700 truncate font-mono">src: {k.source}</p>
                          )}
                          {isExpanded && (
                            <button
                              onClick={() => {
                                api.deleteKnowledge(k.id)
                                  .then(() => setKnowledge((prev) => prev.filter((e) => e.id !== k.id)))
                                  .catch((err) => console.error("Failed to delete:", err));
                              }}
                              className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors font-mono ml-auto shrink-0"
                            >
                              delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              recentFeedback.length === 0 ? (
                <p className="text-zinc-600 py-20 text-center text-sm">No feedback yet</p>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  {recentFeedback.map((f) => (
                    <div key={f.taskId} className="px-4 py-3.5 hover:bg-zinc-800/25 transition-colors">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className={`text-sm font-bold font-mono ${
                          f.score >= 4 ? "text-emerald-400" : f.score >= 3 ? "text-amber-400" : "text-red-400"
                        }`}>
                          {f.score}/5
                        </span>
                        <ScorePips score={f.score} />
                        <span className="text-[10px] text-zinc-700 ml-auto font-mono">{formatRelative(f.timestamp)}</span>
                      </div>
                      <p className="text-[13px] text-zinc-400 leading-relaxed">{f.taskDescription}</p>
                      {f.comments && (
                        <p className="text-[12px] text-zinc-600 mt-1 italic">&ldquo;{f.comments}&rdquo;</p>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorePips({ score }: { score: number }) {
  return (
    <div className="flex gap-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-2.5 h-[5px] rounded-[1px] ${
            i <= score
              ? score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-amber-500" : "bg-red-500"
              : "bg-zinc-800"
          }`}
        />
      ))}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card px-4 py-4">
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold font-mono readout ${highlight ? "text-zinc-100" : "text-zinc-300"}`}>
        {value}
      </p>
    </div>
  );
}

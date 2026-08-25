/** Built by Aditya Waghamare */
import { useState, useEffect } from "react";
import { api, type TaskData, type ActivityEvent } from "../lib/api.js";

function extractPrUrl(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/(https:\/\/github\.com\/[^\s<>"'\)]+\/(?:pull|compare)\/[^\s<>"'\)]+)/i);
  return match ? match[1] : null;
}

function extractRewardAmount(task: TaskData): number {
  if (task.earnedUsd) return task.earnedUsd;
  if (task.quotedPriceWei) {
    const val = parseFloat(task.quotedPriceWei);
    if (!isNaN(val) && val > 0) return val;
  }
  const match = task.task.match(/Est\.\s*Reward:\s*\$(\d+)/i) || task.task.match(/\$(\d+)/);
  if (match && match[1]) return parseInt(match[1], 10);
  return 50;
}

export function BountyHub() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pr_ready" | "active" | "completed">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    function load() {
      api.getTasks()
        .then((res) => {
          setTasks(res.tasks || []);
          setEvents(res.events || []);
        })
        .catch((err) => console.warn("Failed to load tasks:", err))
        .finally(() => setLoading(false));
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter for BountyHub or general Web3 GitHub bounty tasks
  const bountyTasks = tasks.filter((t) => {
    const isBounty =
      t.id.includes("bounty") ||
      t.source?.toLowerCase().includes("bounty") ||
      t.task.toLowerCase().includes("bounty") ||
      t.task.toLowerCase().includes("bountyhub") ||
      t.task.toLowerCase().includes("reward");
    return isBounty || true; // Show all actionable code tasks
  });

  const prReadyCount = bountyTasks.filter((t) => extractPrUrl(t.result) || t.status === "submitted" || t.status === "completed").length;
  const totalBountyValue = bountyTasks.reduce((sum, t) => sum + extractRewardAmount(t), 0);

  const filteredTasks = bountyTasks.filter((t) => {
    const prUrl = extractPrUrl(t.result);
    if (filter === "pr_ready") return !!prUrl || t.status === "submitted" || t.status === "completed";
    if (filter === "active") return t.status === "executing" || t.status === "queued" || t.status === "requested";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const handleCopyPr = (t: TaskData) => {
    const prUrl = extractPrUrl(t.result) || t.url || `https://github.com/adityawaghamare04`;
    navigator.clipboard.writeText(prUrl);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-xl border border-zinc-800/80 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                BountyHub Radar & PR Claim Hub
                <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  LIVE SCANNED
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automatically scans BountyHub.dev & GitHub issue bounties, solves code, and prepares PR links for manual claiming.
              </p>
            </div>
          </div>
        </div>

        <a
          href="https://www.bountyhub.dev/en/bounties"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors shadow-lg shadow-red-900/20 shrink-0"
        >
          <span>Visit BountyHub.dev</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">Total Bounties Tracked</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{bountyTasks.length}</p>
        </div>
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">PR Solutions Ready to Claim</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{prReadyCount}</p>
        </div>
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">Est. Bounty Pool Value</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">${totalBountyValue.toLocaleString()} USD</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        {(["all", "pr_ready", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            {f === "all" && "All Bounties"}
            {f === "pr_ready" && `PR Ready to Claim (${prReadyCount})`}
            {f === "active" && "Active Execution"}
            {f === "completed" && "Completed"}
          </button>
        ))}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="p-8 text-center text-zinc-500 text-xs font-mono">Loading BountyHub tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
          <p className="text-sm font-medium text-zinc-400">No bounties matching filter</p>
          <p className="text-xs text-zinc-600 mt-1">Category A scanner is continuously scanning for new BountyHub tasks.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((t) => {
            const prUrl = extractPrUrl(t.result);
            const reward = extractRewardAmount(t);
            const taskUrl = t.url || `https://github.com/search?q=${encodeURIComponent(t.task.slice(0, 30))}`;

            return (
              <div
                key={t.id}
                className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-300 rounded border border-zinc-700">
                        {t.source || "BountyHub"}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                        Est. ${reward} USD
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800/80 text-zinc-400 rounded">
                        Status: {t.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{t.task}</h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={taskUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span>🔗 Bounty Link</span>
                    </a>

                    {prUrl ? (
                      <a
                        href={prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors inline-flex items-center gap-1.5 shadow-sm shadow-emerald-900/20"
                      >
                        <span>🔀 View PR</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => handleCopyPr(t)}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                      >
                        {copiedId === t.id ? "✓ Copied Link" : "📋 Copy Task Link"}
                      </button>
                    )}
                  </div>
                </div>

                {/* PR Claim Box */}
                {prUrl && (
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-emerald-300 font-mono overflow-hidden">
                      <span className="font-semibold shrink-0">PR Ready:</span>
                      <span className="truncate">{prUrl}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCopyPr(t)}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                      >
                        {copiedId === t.id ? "✓ Copied PR URL" : "📋 Copy PR URL"}
                      </button>
                      <a
                        href="https://www.bountyhub.dev/en/bounties"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                      >
                        Claim on BountyHub ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Built by Aditya Waghamare */
import { useState, useEffect } from "react";
import { api, type TaskData, type EarningRecord, type RevenueData } from "../lib/api.js";
import { formatEther } from "viem";
import { formatEthUsd } from "../lib/ethPrice.js";

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  requested: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", label: "📥 Requested" },
  quoted: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/30", label: "💬 Quoted" },
  accepted: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30", label: "⚡ Executing" },
  submitted: { bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/30", label: "🟡 Submitted (Escrow)" },
  revision: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: "🔄 Revision" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/30", label: "🟢 Completed (Transferred)" },
  declined: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "🔴 Declined" },
  cancelled: { bg: "bg-zinc-800", text: "text-zinc-500", border: "border-zinc-700", label: "⚪ Cancelled" },
};

function extractUrls(text?: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  const matches = text.match(urlRegex) || [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;)]$/, ""))));
}

function getTaskSubmissionUrl(t: TaskData): string {
  const urls = [...extractUrls(t.task), ...extractUrls(t.result)];
  if (urls.length > 0) return urls[0];

  const match = t.task.match(/URL:\s*(https?:\/\/[^\s<>"]+)/i);
  if (match) return match[1];

  if (t.id.startsWith("bitcointalk_")) {
    const topicId = t.id.replace("bitcointalk_", "");
    return `https://bitcointalk.org/index.php?topic=${topicId}`;
  }

  if (t.id.startsWith("gh_")) {
    const issueNum = t.id.replace("gh_", "");
    return `https://github.com/search?q=${issueNum}`;
  }

  return `https://github.com/search?q=${encodeURIComponent(t.task.slice(0, 40))}`;
}

function getFundSettlementUrl(t: TaskData, earning?: EarningRecord, destWallet?: string): { url: string; label: string; isTx: boolean } {
  const tx = earning?.txHash || t.txHash;
  if (tx) {
    return {
      url: `https://basescan.org/tx/${tx}`,
      label: `⛓️ BaseScan Tx (${tx.slice(0, 6)}...${tx.slice(-4)})`,
      isTx: true,
    };
  }

  const wallet = earning?.destinationWallet || destWallet || "0xfdCE8864Ab96584102354Eb2d270187E0E900492";
  return {
    url: `https://basescan.org/address/${wallet}`,
    label: `🦊 Rabby BaseScan Status`,
    isTx: false,
  };
}

export function Tasks() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [selected, setSelected] = useState<TaskData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"tasks" | "flow_guide" | "wallets">("tasks");

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [tasksRes, revRes] = await Promise.all([
          api.getTasks().catch(() => ({ tasks: [] })),
          api.getRevenue().catch(() => null),
        ]);
        if (active) {
          setTasks(tasksRes.tasks || []);
          if (revRes) setRevenue(revRes);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load tasks");
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 4000);

    api.getEthPrice()
      .then(({ price }) => { if (active) setEthPrice(price); })
      .catch(() => {});

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const earningsByTaskId = new Map<string, EarningRecord>();
  revenue?.earnings?.forEach((e) => {
    earningsByTaskId.set(e.taskId, e);
  });

  const requestedCount = tasks.filter((t) => t.status === "requested" || t.status === "quoted").length;
  const executingCount = tasks.filter((t) => t.status === "accepted" || t.status === "revision").length;
  const submittedCount = tasks.filter((t) => t.status === "submitted").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const declinedCount = tasks.filter((t) => t.status === "declined" || t.status === "cancelled").length;

  const filteredTasks = statusFilter === "all"
    ? tasks
    : tasks.filter((t) => {
        if (statusFilter === "requested") return t.status === "requested" || t.status === "quoted";
        if (statusFilter === "executing") return t.status === "accepted" || t.status === "revision";
        if (statusFilter === "submitted") return t.status === "submitted";
        if (statusFilter === "completed") return t.status === "completed";
        if (statusFilter === "declined") return t.status === "declined" || t.status === "cancelled";
        return t.status === statusFilter;
      });

  const destWallet = revenue?.destinationWallet || "0xfdCE8864Ab96584102354Eb2d270187E0E900492";

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Task & Fund Lifecycle Hub</h1>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            Autonomous Bounty Pipeline • Escrow Fund Tracker • Direct Proof & BaseScan Links
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex gap-1 bg-zinc-900/90 p-1.5 rounded-xl border border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "tasks" ? "bg-blue-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            📋 Task Operations ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab("flow_guide")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "flow_guide" ? "bg-blue-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            💸 Fund Flow Architecture
          </button>
          <button
            onClick={() => setActiveTab("wallets")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "wallets" ? "bg-blue-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🦊 Rabby & Wallet Guides
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "tasks" && (
        <>
          {/* Lifecycle Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <button
              onClick={() => setStatusFilter(statusFilter === "requested" ? "all" : "requested")}
              className={`card p-4 text-left transition-all border ${
                statusFilter === "requested" ? "border-blue-500 bg-blue-500/5" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">1. Requested</span>
                <span className="w-2 h-2 rounded-full bg-blue-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-blue-400">{requestedCount}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">Bounty opportunities locked</p>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === "executing" ? "all" : "executing")}
              className={`card p-4 text-left transition-all border ${
                statusFilter === "executing" ? "border-cyan-500 bg-cyan-500/5" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">2. Executing</span>
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-cyan-400">{executingCount}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">Agent writing solutions</p>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === "submitted" ? "all" : "submitted")}
              className={`card p-4 text-left transition-all border ${
                statusFilter === "submitted" ? "border-amber-500 bg-amber-500/5" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">3. Submitted</span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </div>
              <p className="text-2xl font-bold font-mono text-amber-300">{submittedCount}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">In Escrow verification</p>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
              className={`card p-4 text-left transition-all border ${
                statusFilter === "completed" ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">4. Transferred</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-300">{completedCount}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">In Rabby Wallet</p>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === "declined" ? "all" : "declined")}
              className={`card p-4 text-left transition-all border ${
                statusFilter === "declined" ? "border-red-500 bg-red-500/5" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">5. Declined</span>
                <span className="w-2 h-2 rounded-full bg-red-500" />
              </div>
              <p className="text-2xl font-bold font-mono text-red-400">{declinedCount}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">Rejected/Invalid</p>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">
              Showing <span className="text-zinc-100 font-bold">{filteredTasks.length}</span> of {tasks.length} tasks
              {statusFilter !== "all" && ` (Filtered by: ${statusFilter})`}
            </span>
            {statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Reset Filter ✕
              </button>
            )}
          </div>

          {/* Task Operations Table */}
          {filteredTasks.length === 0 ? (
            <div className="card text-center py-20 border border-zinc-800">
              <p className="text-zinc-400 text-sm font-medium mb-1">No tasks in this stage</p>
              <p className="text-zinc-600 text-xs font-mono">
                AgentClaw automatically polls GitHub, MoltLaunch, and Base Bounties 24/7.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden border border-zinc-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800/80 bg-zinc-900/70 text-[11px] uppercase tracking-wider text-zinc-400 font-mono">
                      <th className="py-3 px-4">Task ID</th>
                      <th className="py-3 px-4">Task Description</th>
                      <th className="py-3 px-4">Lifecycle Status</th>
                      <th className="py-3 px-4">Bounty Value</th>
                      <th className="py-3 px-4">Escrow & Settlement</th>
                      <th className="py-3 px-4">Direct Proof & Fund Links</th>
                      <th className="py-3 px-4 text-right">Inspect Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-xs">
                    {filteredTasks.map((t) => {
                      const statusMeta = STATUS_COLORS[t.status] || STATUS_COLORS.cancelled;
                      const earning = earningsByTaskId.get(t.id);
                      const subUrl = getTaskSubmissionUrl(t);
                      const fundUrlInfo = getFundSettlementUrl(t, earning, destWallet);

                      return (
                        <tr
                          key={t.id}
                          className={`hover:bg-zinc-800/25 transition-colors cursor-pointer ${
                            selected?.id === t.id ? "bg-zinc-800/40" : ""
                          }`}
                          onClick={() => setSelected(selected?.id === t.id ? null : t)}
                        >
                          {/* Task ID */}
                          <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap">
                            <code className="text-zinc-300 font-bold">{t.id.slice(0, 12)}</code>
                          </td>

                          {/* Task Description */}
                          <td className="py-3.5 px-4 max-w-sm">
                            <p className="text-zinc-200 font-medium line-clamp-2 leading-relaxed">{t.task}</p>
                          </td>

                          {/* Lifecycle Status Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                              {statusMeta.label}
                            </span>
                          </td>

                          {/* Bounty Value */}
                          <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap text-zinc-200">
                            {t.quotedPriceWei
                              ? ethPrice > 0
                                ? formatEthUsd(formatEther(BigInt(t.quotedPriceWei)), ethPrice)
                                : `${formatEther(BigInt(t.quotedPriceWei))} ETH`
                              : earning
                              ? `$${earning.amountUsd.toFixed(2)}`
                              : "$25.00"}
                          </td>

                          {/* Escrow & Fund Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px]">
                            {earning?.payoutStatus === "verified_transferred" || t.status === "completed" ? (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <span>🟢</span> Verified Transferred
                              </span>
                            ) : earning?.payoutStatus === "pending_escrow" || t.status === "submitted" ? (
                              <span className="text-amber-400 font-semibold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                🟡 Pending Escrow Release
                              </span>
                            ) : t.status === "declined" ? (
                              <span className="text-zinc-500">🚫 Declined</span>
                            ) : (
                              <span className="text-zinc-600">⏳ In Pipeline</span>
                            )}
                          </td>

                          {/* DIRECT PROOF & FUND LINKS COLUMN */}
                          <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {/* 1. Submitted Task / Fix Link */}
                              <a
                                href={subUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-colors shadow-sm"
                                title="Open submitted task / GitHub PR / Bitcointalk thread"
                              >
                                <span>🔗 View Task / Fix ↗</span>
                              </a>

                              {/* 2. Fund Settlement Status on BaseScan */}
                              <a
                                href={fundUrlInfo.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-colors shadow-sm ${
                                  fundUrlInfo.isTx
                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                                }`}
                                title="View real-time settlement on BaseScan / Rabby Wallet"
                              >
                                <span>{fundUrlInfo.label} ↗</span>
                              </a>
                            </div>
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(selected?.id === t.id ? null : t);
                              }}
                              className="px-3 py-1 rounded text-xs font-mono font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors"
                            >
                              {selected?.id === t.id ? "Hide Details" : "Inspect Task"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Selected Task Drawer / Modal Inspector */}
          {selected && (
            <div className="card p-6 border border-blue-500/30 bg-zinc-900/95 space-y-5 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-start border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                      Task Inspection Panel
                    </span>
                    <code className="px-2 py-0.5 rounded text-xs bg-zinc-800 font-mono text-blue-300 border border-zinc-700">
                      {selected.id}
                    </code>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100">{selected.task}</h2>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono font-bold"
                >
                  ✕ Close
                </button>
              </div>

              {/* Direct Task & Fund Links Header Bar */}
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-950/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-300 uppercase tracking-wider">
                    🌐 Direct Operational & Settlement Links
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={getTaskSubmissionUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors inline-flex items-center gap-1.5 shadow"
                  >
                    <span>🔗 Open Submitted Task / Issue ↗</span>
                  </a>
                  <a
                    href={getFundSettlementUrl(selected, earningsByTaskId.get(selected.id), destWallet).url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 transition-colors inline-flex items-center gap-1.5 shadow"
                  >
                    <span>⛓️ Check Fund Status on BaseScan ↗</span>
                  </a>
                </div>
              </div>

              {/* Fund Transfer Pipeline Diagram for this specific task */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/80 space-y-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                  ⛓️ Fund Settlement Flow Status
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-center text-xs font-mono">
                  {/* Step 1 */}
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
                    <div className="text-[10px] text-zinc-500 font-bold mb-1">STEP 1: REQUESTED</div>
                    <div className="text-blue-400 font-bold">Bounty Locked</div>
                    <p className="text-[10px] text-zinc-500 mt-1">Client funds placed into escrow contract</p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
                    <div className="text-[10px] text-zinc-500 font-bold mb-1">STEP 2: SUBMITTED</div>
                    <div className="text-amber-400 font-bold">Proof of Work</div>
                    <p className="text-[10px] text-zinc-500 mt-1">Agent submits solution & link</p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
                    <div className="text-[10px] text-zinc-500 font-bold mb-1">STEP 3: SETTLEMENT</div>
                    <div className="text-emerald-400 font-bold">Escrow Released</div>
                    <p className="text-[10px] text-zinc-500 mt-1">Base Blockchain settlement verifies work</p>
                  </div>

                  {/* Step 4 */}
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
                    <div className="text-[10px] text-zinc-500 font-bold mb-1">STEP 4: WALLET</div>
                    <div className="text-emerald-300 font-bold">Funds In Rabby Wallet</div>
                    <p className="text-[10px] text-zinc-500 mt-1">Available in destination address</p>
                  </div>
                </div>
              </div>

              {/* Task Solution Code & Outputs */}
              {selected.result && (
                <div>
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono mb-2">
                    📄 Agent Output & Solution Code
                  </h3>
                  <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
                    {selected.result}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fund Flow Guide Tab */}
      {activeTab === "flow_guide" && (
        <div className="card p-6 border border-zinc-800 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 font-mono mb-1">💸 How Autonomous Bounty Funds Flow</h2>
            <p className="text-xs text-zinc-400 font-mono">
              Complete guide on how client funds move from escrow to your Rabby Wallet treasury.
            </p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <span>1️⃣ Opportunity Lock & Escrow Deposit</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                When a GitHub Issue or Bounty is posted, the sponsor locks funds into an Escrow Smart Contract.
                AgentClaw detects the opportunity via radar scans and quotes execution cost.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <span>2️⃣ Autonomous Execution & Submission</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                AgentClaw generates the code, opens a Pull Request or posts a solution comment on GitHub/Bitcointalk, and registers the solution submission hash in the local ledger.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <span>3️⃣ Automated Escrow Settlement</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                Our background Settlement Engine (`src/memory/settlement.ts`) polls Base L2 smart contracts. Once task completion is verified on-chain, the status transitions from <code className="text-amber-300">pending_escrow</code> to <code className="text-emerald-400">verified_transferred</code>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <span>4️⃣ Transfer to Rabby Wallet</span>
              </div>
              <p className="text-zinc-200 leading-relaxed">
                The settlement contract disburses funds directly to your registered Rabby Wallet Treasury:
                <br />
                <code className="text-emerald-300 font-bold text-sm bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 mt-1 inline-block">
                  {destWallet}
                </code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Guides Tab */}
      {activeTab === "wallets" && (
        <div className="card p-6 border border-zinc-800 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 font-mono mb-1">🦊 Rabby & Web3 Wallet Integration</h2>
            <p className="text-xs text-zinc-400 font-mono">
              Recommended wallets for real-time tracking of AgentClaw autonomous earnings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Rabby Wallet */}
            <div className="p-5 rounded-xl bg-gradient-to-b from-blue-950/40 to-zinc-900 border border-blue-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🐰</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  RECOMMENDED WALLET
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-100">Rabby Wallet</h3>
              <p className="text-zinc-300 leading-relaxed">
                The most secure Web3 wallet for multi-chain & Base L2 tracking. Automatically reveals pre-execution security checks and incoming bounty settlements.
              </p>
              <a
                href="https://rabby.io"
                target="_blank"
                rel="noreferrer"
                className="inline-block px-3 py-1.5 rounded text-xs font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
              >
                Download Rabby Wallet ↗
              </a>
            </div>

            {/* BaseScan Explorer */}
            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">⛓️</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                  BLOCKCHAIN EXPLORER
                </span>
              </div>
              <h3 className="text-sm font-bold text-zinc-100">BaseScan (Base L2)</h3>
              <p className="text-zinc-300 leading-relaxed">
                Verify all contract calls, transaction hashes, and live USDC/ETH transfers directly on the Base L2 blockchain ledger.
              </p>
              <a
                href={`https://basescan.org/address/${destWallet}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block px-3 py-1.5 rounded text-xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
              >
                Inspect Treasury on BaseScan ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { api, type RevenueData, type EarningRecord, type SurvivalState } from "../lib/api.js";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Revenue() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [survival, setSurvival] = useState<SurvivalState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending_escrow" | "verified_transferred">("all");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [rev, surv] = await Promise.all([
          api.getRevenue().catch(() => null),
          api.getSurvival().catch(() => null),
        ]);
        if (!active) return;
        if (rev) setRevenue(rev);
        if (surv) setSurvival(surv);
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    }

    void loadData();
    const interval = setInterval(() => void loadData(), 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function handleConfirmTransfer(earningId: string) {
    setConfirmingId(earningId);
    try {
      const res = await api.confirmRevenue(earningId);
      if (res.ok) {
        setToastMsg(`✅ Wallet Transfer Verified! +$${res.record.amountUsd.toFixed(2)} added to Confirmed Revenue & Agent HP updated.`);
        setTimeout(() => setToastMsg(null), 5000);
        // Refresh
        const [rev, surv] = await Promise.all([api.getRevenue(), api.getSurvival()]);
        setRevenue(rev);
        setSurvival(surv);
      }
    } catch (err) {
      setToastMsg(`❌ Verification failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setConfirmingId(null);
    }
  }

  if (loading && !revenue) {
    return (
      <div className="text-center py-32">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-zinc-600">Loading Revenue Audit Stream...</p>
      </div>
    );
  }

  const earningsList = revenue?.earnings || [];
  const filteredEarnings = filterStatus === "all"
    ? earningsList
    : earningsList.filter((e) => e.payoutStatus === filterStatus);

  const pendingCount = earningsList.filter((e) => e.payoutStatus === "pending_escrow").length;
  const verifiedCount = earningsList.filter((e) => e.payoutStatus === "verified_transferred").length;
  const conversionRate = earningsList.length > 0 ? Math.round((verifiedCount / earningsList.length) * 100) : 100;

  const destWallet = revenue?.destinationWallet || "0xfdCE8864Ab96584102354Eb2d270187E0E900492";

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-mono flex items-center justify-between shadow-lg animate-fade-in">
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="text-zinc-500 hover:text-zinc-300 ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Revenue & Wallet Audit</h1>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            Direct Financial Settlement Layer • Confirmed Payouts Released to MetaWallet
          </p>
        </div>

        {/* Target MetaWallet Card */}
        <div className="px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/90 flex items-center gap-3 shadow-inner">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-base">
            🦊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">MetaWallet Destination</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <code className="text-xs font-mono font-bold text-zinc-200">{destWallet.slice(0, 8)}...{destWallet.slice(-6)}</code>
          </div>
        </div>
      </div>

      {/* Top 4 Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Confirmed Revenue */}
        <div className="card p-5 border border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-zinc-900 to-zinc-950 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">
            Confirmed MetaWallet Revenue
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-emerald-400">
              ${(revenue?.confirmedRevenue || 0).toFixed(2)}
            </span>
            <span className="text-xs text-emerald-500/80 font-mono">USD</span>
          </div>
          <p className="text-[10px] text-zinc-500 font-mono mt-2 flex items-center gap-1">
            <span>🟢</span> {verifiedCount} Task Payouts Verified in Wallet
          </p>
        </div>

        {/* Card 2: Pending Escrow Payouts */}
        <div className="card p-5 border border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-zinc-900 to-zinc-950 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">
            Pending Escrow Verification
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-amber-400">
              ${(revenue?.pendingRevenue || 0).toFixed(2)}
            </span>
            <span className="text-xs text-amber-500/80 font-mono">EST</span>
          </div>
          <p className="text-[10px] text-zinc-500 font-mono mt-2 flex items-center gap-1">
            <span>🟡</span> {pendingCount} Submitted Bounties Awaiting Settlement
          </p>
        </div>

        {/* Card 3: Verification Conversion Rate */}
        <div className="card p-5 border border-zinc-800 bg-zinc-900/90">
          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">
            Settlement Release Rate
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-zinc-100">{conversionRate}%</span>
          </div>
          <p className="text-[10px] text-zinc-500 font-mono mt-2">
            {verifiedCount} confirmed / {earningsList.length} total tasks
          </p>
        </div>

        {/* Card 4: Agent Survival Level Progress */}
        <div className="card p-5 border border-zinc-800 bg-zinc-900/90">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Earner Progression</p>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 font-mono">
              LEVEL {survival?.level || 1}
            </span>
          </div>
          <p className="text-sm font-bold text-zinc-200 font-mono truncate">{survival?.rankTitle || "Rookie Survivor"}</p>
          <div className="mt-2.5 w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (((survival?.totalEarnedUsd || 0) % 500) / 500) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Settlement Rules Explainer Banner */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 text-sm font-bold">
            🛡️
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-0.5 font-mono">Strict Wallet Settlement Rule</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When AgentClaw completes & submits a task solution, the bounty is placed in <span className="text-amber-300 font-medium">🟡 Pending Escrow</span>. Total Revenue and Agent Survival HP are updated <span className="text-emerald-400 font-medium">ONLY when funds are released & verified in your MetaWallet</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Revenue Audit Table & Filter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-200 tracking-tight">Audit Log</h2>
            <span className="text-xs text-zinc-500 font-mono">({filteredEarnings.length} records)</span>
          </div>

          <div className="flex gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "all" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All ({earningsList.length})
            </button>
            <button
              onClick={() => setFilterStatus("pending_escrow")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "pending_escrow" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              🟡 Pending Escrow ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus("verified_transferred")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "verified_transferred" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              🟢 Transferred ({verifiedCount})
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="card overflow-hidden border border-zinc-800">
          {filteredEarnings.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <p className="text-zinc-500 text-sm font-mono">No financial transactions recorded for this filter.</p>
              <p className="text-zinc-600 text-xs">As AgentClaw submits bounty fixes, payouts will populate here automatically.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-900/60 text-[11px] uppercase tracking-wider text-zinc-400 font-mono">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Task Title & ID</th>
                    <th className="py-3 px-4">Source / Platform</th>
                    <th className="py-3 px-4">Bounty Amount</th>
                    <th className="py-3 px-4">Settlement Status</th>
                    <th className="py-3 px-4">Destination MetaWallet</th>
                    <th className="py-3 px-4 text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-xs">
                  {filteredEarnings.map((item) => {
                    const isPending = item.payoutStatus === "pending_escrow";
                    const isConfirming = confirmingId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap">
                          {formatTime(item.timestamp)}
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="text-zinc-200 font-medium line-clamp-1 max-w-xs">{item.title}</p>
                          <code className="text-[10px] text-zinc-600 font-mono">{item.taskId}</code>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-400">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 text-[10px] text-zinc-300">
                            {item.source}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-sm">
                          <span className={isPending ? "text-amber-400" : "text-emerald-400"}>
                            +${item.amountUsd.toFixed(2)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                              🟡 PENDING ESCROW
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              🟢 TRANSFERRED TO WALLET
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          <code>{item.destinationWallet.slice(0, 6)}...{item.destinationWallet.slice(-4)}</code>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {isPending ? (
                            <button
                              onClick={() => void handleConfirmTransfer(item.id)}
                              disabled={isConfirming}
                              className="px-3 py-1.5 rounded-md text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm font-mono"
                            >
                              {isConfirming ? "Verifying..." : "Confirm MetaWallet Payout"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono italic">
                              Verified {item.verifiedAt ? formatTime(item.verifiedAt) : "✓"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

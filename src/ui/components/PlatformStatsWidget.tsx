import React, { useEffect, useState } from "react";
import { api, type PlatformStat } from "../lib/api";

export const PlatformStatsWidget: React.FC = () => {
  const [platforms, setPlatforms] = useState<PlatformStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await api.getPlatformStats();
      if (res.ok && res.platforms) {
        setPlatforms(res.platforms);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load platform stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 15000); // Auto-refresh stats every 15s
    return () => clearInterval(interval);
  }, []);

  const totalVisits = platforms.reduce((acc, p) => acc + p.scanCount, 0);
  const totalBounties = platforms.reduce((acc, p) => acc + p.bountiesFound, 0);

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-cyan-500/20 rounded-2xl p-6 shadow-xl mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold tracking-wide uppercase text-xs">
            <svg className="w-4 h-4 text-cyan-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeWidth="2" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            <span>24/7 Multi-Platform Radar Scanner</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Platform Visit & Bounty Monitor</h2>
          <p className="text-slate-400 text-sm">
            Tracking AgentClaw autonomous scan visits across {platforms.length || 16} active platforms.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50 text-right">
            <div className="text-xs text-slate-400">Total Scans</div>
            <div className="text-base font-bold text-cyan-300">{totalVisits} visits</div>
          </div>
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50 text-right">
            <div className="text-xs text-slate-400">Total Found</div>
            <div className="text-base font-bold text-emerald-400">{totalBounties} tasks</div>
          </div>
          <button
            onClick={loadStats}
            className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all border border-cyan-500/30"
            title="Refresh Stats"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {platforms.map((p) => (
            <div
              key={p.id}
              className="bg-slate-950/40 hover:bg-slate-900/80 border border-slate-800 hover:border-cyan-500/30 transition-all rounded-xl p-3.5 flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors text-sm truncate">
                  {p.name}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 whitespace-nowrap">
                  {p.category}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs mt-1 pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="font-semibold text-slate-200">{p.scanCount}</span> visits
                </div>

                <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{p.bountiesFound} tasks</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mt-2 text-right">
                Last scan: {p.lastScanned}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

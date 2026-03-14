import { useState, useEffect } from "react";
import { api, type WalletInfo, type AgentInfo } from "../../lib/api.js";

interface WalletStepProps {
  onNext: (existingAgentId?: string) => void;
}

export function WalletStep({ onNext }: WalletStepProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [importing, setImporting] = useState(false);

  const [existingAgent, setExistingAgent] = useState<AgentInfo | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  useEffect(() => {
    api.getWallet()
      .then((w) => {
        setWallet(w);
        doLookup();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function doLookup() {
    setLookingUp(true);
    try {
      const { agent } = await api.lookupAgent();
      setExistingAgent(agent);
    } catch {
      // Not critical
    } finally {
      setLookingUp(false);
      setLookupDone(true);
    }
  }

  async function handleImport() {
    if (!importKey.trim()) return;
    setImporting(true);
    setError("");
    setExistingAgent(null);
    setLookupDone(false);
    try {
      const w = await api.importWallet(importKey.trim());
      setWallet(w);
      setImportKey("");
      setShowImport(false);
      await doLookup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-5 h-5 border border-red-900/40 rounded-sm animate-spin mx-auto mb-3" />
        <p className="text-zinc-700 text-[10px] font-mono tracking-wider">SCANNING WALLET</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-mono font-bold text-zinc-200 mb-1">Wallet</h2>
        <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
          Agent treasury on Base mainnet. Earnings settle here automatically.
        </p>
      </div>

      {error && (
        <div className="panel px-4 py-3 space-y-2">
          <p className="text-[11px] text-red-400 font-mono">{error}</p>
          {error.includes("mltl") && (
            <div className="text-[10px] text-zinc-500 font-mono space-y-1">
              <p>Install the Moltlaunch CLI to continue:</p>
              <code className="block bg-zinc-950 px-2.5 py-1.5 rounded-sm text-zinc-400 border border-red-500/[0.05]">npm install -g @moltlaunch/cli</code>
              <p className="text-zinc-700">Then refresh this page.</p>
            </div>
          )}
        </div>
      )}

      {wallet && (
        <div className="panel p-4 space-y-2.5">
          <div>
            <span className="text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em]">ADDRESS</span>
            <p className="font-mono text-[10px] text-zinc-400 mt-1 bg-zinc-950 rounded-sm px-3 py-1.5 break-all border border-red-500/[0.05]">
              {wallet.address}
            </p>
          </div>
          <div>
            <span className="text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em]">BALANCE</span>
            <p className="text-lg font-mono font-semibold text-zinc-200 mt-0.5 readout">
              {wallet.balance ?? "0"} <span className="text-sm text-zinc-600">ETH</span>
            </p>
            {(!wallet.balance || parseFloat(wallet.balance) < 0.001) && (
              <p className="text-[10px] text-amber-400/80 font-mono mt-1.5 leading-relaxed">
                Low balance. Registration and token launch are gasless, but you'll need ETH on Base to claim fees and sign marketplace transactions.
              </p>
            )}
          </div>
        </div>
      )}

      {lookingUp && wallet && (
        <div className="flex items-center gap-2 text-[10px] text-zinc-700 font-mono">
          <div className="w-3 h-3 border border-zinc-700 rounded-sm animate-spin" />
          SEARCHING FOR AGENT...
        </div>
      )}

      {existingAgent && (
        <div className="panel border-red-500/15 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono font-bold text-red-400">AGENT FOUND</h3>
            <span className="text-[8px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-sm font-mono font-bold tracking-wider">
              REGISTERED
            </span>
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-600">Name</span>
              <span className="text-zinc-300">{existingAgent.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">ID</span>
              <span className="text-zinc-400">{existingAgent.agentId}</span>
            </div>
            {existingAgent.skills.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-zinc-600">Skills</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {existingAgent.skills.map((s) => (
                    <span key={s} className="text-[9px] bg-zinc-900 text-zinc-500 px-1.5 py-0.5 rounded-sm border border-zinc-800">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => onNext(existingAgent.agentId)}
            className="w-full py-2.5 bg-red-600 text-white rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-red-500 transition-colors mt-1"
          >
            CONNECT LLM
          </button>
        </div>
      )}

      {wallet && !showImport && (
        <button
          onClick={() => setShowImport(true)}
          className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors font-mono tracking-wider"
        >
          IMPORT DIFFERENT KEY
        </button>
      )}

      {!wallet && !showImport && (
        <button
          onClick={() => setShowImport(true)}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono"
        >
          Import existing private key
        </button>
      )}

      {showImport && (
        <div className="panel p-4 space-y-3">
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em]">PRIVATE KEY</label>
          <input
            type="password"
            placeholder="0x..."
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            className="w-full bg-zinc-950 border border-red-500/10 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-red-500/25 transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-sm text-[10px] font-mono font-bold hover:bg-white disabled:opacity-50 transition-colors"
            >
              {importing ? "IMPORTING..." : "IMPORT"}
            </button>
            <button
              onClick={() => setShowImport(false)}
              className="px-4 py-2 text-zinc-600 text-[10px] font-mono hover:text-zinc-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {wallet && !existingAgent && lookupDone && (
        <button
          onClick={() => onNext()}
          className="w-full py-2.5 bg-zinc-100 text-zinc-900 rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-white transition-colors"
        >
          REGISTER AGENT
        </button>
      )}
    </div>
  );
}

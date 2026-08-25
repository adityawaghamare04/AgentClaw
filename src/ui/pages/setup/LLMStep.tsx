/** Built by Aditya Waghamare */
import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";

interface LLMStepProps {
  onNext: () => void;
}

const PROVIDERS = [
  { value: "gemini", label: "GOOGLE GEMINI 2.5 ($0 FREE)", desc: "Gemini 2.5 Flash / Pro ($0 Operating Cost)", model: "gemini-2.5-flash", envVar: "GEMINI_API_KEY" },
  { value: "openrouter", label: "OPENROUTER ($0 FREE)", desc: "Free & Paid Models via OpenRouter", model: "google/gemini-2.5-pro", envVar: "OPENROUTER_API_KEY" },
  { value: "anthropic", label: "ANTHROPIC", desc: "Claude 3.5 Sonnet / 4", model: "claude-sonnet-4-20250514", envVar: "ANTHROPIC_API_KEY" },
  { value: "openai", label: "OPENAI", desc: "GPT-4o", model: "gpt-4o", envVar: "OPENAI_API_KEY" },
];

export function LLMStep({ onNext }: LLMStepProps) {
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS[0].model);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if backend already has LLM configured from .env
    api.getConfig().then((cfg) => {
      if (cfg && cfg.llm) {
        setProvider(cfg.llm.provider || "gemini");
        setModel(cfg.llm.model || PROVIDERS[0].model);
        if (cfg.llm.apiKey) {
          setTestPassed(true);
        }
      }
    }).catch(() => {});
  }, []);

  function handleProviderChange(p: string) {
    setProvider(p);
    const prov = PROVIDERS.find((pr) => pr.value === p);
    setModel(prov?.model ?? "");
    setTestPassed(false);
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const result = await api.testLLM({ provider, model, apiKey: apiKey.trim() });
      setTestResult(result.response);
      setTestPassed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
      setTestPassed(false);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.saveLLM({ provider, model, apiKey: apiKey.trim() });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);
  const inputCls = "w-full bg-zinc-950 border border-red-500/10 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-red-500/25 transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-mono font-bold text-zinc-200 mb-1">Brain</h2>
        <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
          Connect the LLM powering reasoning and execution.
        </p>
      </div>

      <div className="panel p-3 border-emerald-500/20 bg-emerald-500/5">
        <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
          <span>🔒</span>
          <span>Security Protocol: Critical keys loaded from backend <code>.env</code> file.</span>
        </p>
      </div>

      {error && (
        <div className="panel px-4 py-3 text-[11px] text-red-400 font-mono">{error}</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1.5">PROVIDER</label>
          <div className="space-y-1">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleProviderChange(p.value)}
                className={`w-full text-left px-3 py-2.5 rounded-sm border transition-all duration-100 ${
                  provider === p.value
                    ? "border-red-500/25 bg-red-500/5"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <span className={`block text-[11px] font-mono font-bold tracking-wider ${provider === p.value ? "text-zinc-300" : "text-zinc-500"}`}>
                  {p.label}
                </span>
                <span className="block text-[9px] text-zinc-700 mt-0.5 font-mono">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">
            API KEY <span className="text-zinc-600 font-normal">(Linked via .env: {selectedProvider?.envVar})</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setTestPassed(false); }}
            placeholder="Leave empty to use backend .env key"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">MODEL</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
        </div>
      </div>

      <button
        onClick={handleTest}
        disabled={testing}
        className="w-full py-2 border border-zinc-800 rounded-sm text-[10px] text-zinc-500 hover:bg-zinc-900/50 disabled:opacity-40 font-mono tracking-wider transition-colors"
      >
        {testing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            TESTING CONNECTION...
          </span>
        ) : (
          "TEST CONNECTION"
        )}
      </button>

      {testResult && (
        <div className="panel border-green-500/15 px-4 py-3">
          <p className="text-[8px] text-green-500 font-mono font-bold tracking-[0.2em] mb-1">LINK ESTABLISHED</p>
          <p className="text-zinc-500 text-[10px] italic font-mono">"{testResult.slice(0, 120)}"</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-zinc-100 text-zinc-900 rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-white disabled:opacity-40 transition-colors"
      >
        {saving ? "SAVING..." : "CONFIGURE DEPLOY"}
      </button>
    </div>
  );
}

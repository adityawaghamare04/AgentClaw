/** Built by Aditya Waghamare */
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

interface ManualBounty {
  id: string;
  title: string;
  url: string;
  source: string;
  reward: number;
  status: "pending" | "submitted" | "claimed";
  prUrl?: string;
  notes?: string;
  addedAt: number;
}

const STORAGE_KEY = "agentclaw_manual_bounties";

function loadManualBounties(): ManualBounty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveManualBounties(bounties: ManualBounty[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bounties));
}

export function AddBounty() {
  const [bounties, setBounties] = useState<ManualBounty[]>(loadManualBounties);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("BountyHub.dev");
  const [reward, setReward] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [notes, setNotes] = useState("");

  const persist = useCallback((updated: ManualBounty[]) => {
    setBounties(updated);
    saveManualBounties(updated);
  }, []);

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setSource("BountyHub.dev");
    setReward("");
    setPrUrl("");
    setNotes("");
    setEditingId(null);
    setSubmitStatus("idle");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setSubmitStatus("submitting");

    const bounty: ManualBounty = {
      id: editingId || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      url: url.trim(),
      source: source.trim() || "Manual",
      reward: parseFloat(reward) || 50,
      status: prUrl.trim() ? "submitted" : "pending",
      prUrl: prUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      addedAt: editingId ? bounties.find((b) => b.id === editingId)?.addedAt || Date.now() : Date.now(),
    };

    // Also inject into AgentClaw's task inbox via backend
    try {
      await api.addManualBounty({
        title: bounty.title,
        url: bounty.url,
        source: bounty.source,
        reward: bounty.reward,
      });
    } catch {
      // Still save locally even if backend is down
    }

    const updated = editingId
      ? bounties.map((b) => (b.id === editingId ? bounty : b))
      : [bounty, ...bounties];

    persist(updated);
    setSubmitStatus("success");
    setTimeout(() => {
      resetForm();
      setShowForm(false);
    }, 1200);
  };

  const handleEdit = (b: ManualBounty) => {
    setTitle(b.title);
    setUrl(b.url);
    setSource(b.source);
    setReward(String(b.reward));
    setPrUrl(b.prUrl || "");
    setNotes(b.notes || "");
    setEditingId(b.id);
    setShowForm(true);
    setSubmitStatus("idle");
  };

  const handleDelete = (id: string) => {
    persist(bounties.filter((b) => b.id !== id));
  };

  const handleMarkClaimed = (id: string) => {
    persist(bounties.map((b) => (b.id === id ? { ...b, status: "claimed" as const } : b)));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pendingCount = bounties.filter((b) => b.status === "pending").length;
  const submittedCount = bounties.filter((b) => b.status === "submitted").length;
  const claimedCount = bounties.filter((b) => b.status === "claimed").length;
  const totalReward = bounties.reduce((sum, b) => sum + b.reward, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900/80 to-zinc-900/40 p-6 rounded-xl border border-zinc-800/80 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                Manual Bounty Tracker
                <span className="px-2 py-0.5 text-[11px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full">
                  {bounties.length} SAVED
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manually add bounties you find anywhere. Track progress, PR URLs, and claim status.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-lg shrink-0 ${
            showForm
              ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
              : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20"
          }`}
        >
          {showForm ? "✕ Cancel" : "＋ Add Bounty"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">Pending</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">PR Submitted</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{submittedCount}</p>
        </div>
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">Claimed ✓</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{claimedCount}</p>
        </div>
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
          <p className="text-xs font-medium text-zinc-400">Total Reward Value</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">${totalReward.toLocaleString()}</p>
        </div>
      </div>

      {/* Add Bounty Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/60 p-6 rounded-xl border border-violet-500/30 space-y-4 animate-fade-in"
        >
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            {editingId ? "✏️ Edit Bounty" : "＋ Add New Bounty"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Bounty Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fix auth middleware in express app"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Bounty / Issue URL *</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/org/repo/issues/123"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Source Platform</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs focus:outline-none focus:border-violet-500/50"
              >
                <option>BountyHub.dev</option>
                <option>GitHub</option>
                <option>Algora</option>
                <option>Gitcoin</option>
                <option>Replit Bounties</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Reward Amount (USD)</label>
              <input
                type="number"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                placeholder="100"
                min="0"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">PR URL (if already submitted)</label>
              <input
                type="url"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/org/repo/pull/456"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details or context..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitStatus === "submitting"}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {submitStatus === "submitting"
                ? "Saving..."
                : submitStatus === "success"
                ? "✓ Saved!"
                : editingId
                ? "Update Bounty"
                : "Add Bounty"}
            </button>
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false); }}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bounty List */}
      {bounties.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-400">No manual bounties added yet</p>
            <p className="text-xs text-zinc-600">
              Click <strong>"＋ Add Bounty"</strong> to track bounties you find on BountyHub, GitHub, Algora, or anywhere else.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {bounties.map((b) => (
            <div
              key={b.id}
              className={`bg-zinc-900/50 p-5 rounded-xl border transition-all space-y-3 ${
                b.status === "claimed"
                  ? "border-emerald-500/30 opacity-75"
                  : b.status === "submitted"
                  ? "border-amber-500/30"
                  : "border-zinc-800/80 hover:border-violet-500/30"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-violet-500/10 text-violet-400 rounded border border-violet-500/20">
                      {b.source}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                      ${b.reward} USD
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      b.status === "claimed"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : b.status === "submitted"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}>
                      {b.status === "claimed" ? "✓ Claimed" : b.status === "submitted" ? "PR Submitted" : "Pending"}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-mono">
                      {new Date(b.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{b.title}</h3>
                  {b.notes && <p className="text-xs text-zinc-500 italic">{b.notes}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                  >
                    🔗 Bounty
                  </a>
                  {b.prUrl && (
                    <>
                      <a
                        href={b.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                      >
                        🔀 PR
                      </a>
                      <button
                        onClick={() => handleCopy(b.prUrl!, `pr_${b.id}`)}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                      >
                        {copiedId === `pr_${b.id}` ? "✓ Copied!" : "📋 PR URL"}
                      </button>
                    </>
                  )}
                  {b.status !== "claimed" && (
                    <button
                      onClick={() => handleMarkClaimed(b.id)}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                    >
                      ✓ Mark Claimed
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(b)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

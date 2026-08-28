/** Built by Aditya Waghamare */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dbSaveKeyHealth, dbGetAllKeyHealth, type KeyHealthRecord } from "../memory/db.js";

const CONFIG_DIR = path.join(os.homedir(), ".agentclaw");
const REGISTRY_FILE = path.join(CONFIG_DIR, "model_registry.json");
const AGENTCLAW_CONFIG_FILE = path.join(CONFIG_DIR, "agentclaw.json");

// Curated high-capacity free tier models supporting tool calls on OpenRouter
const DEFAULT_FREE_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

// Keywords for models that DO NOT support general tool calling / chat
const NON_CHAT_KEYWORDS = [
  "content-safety",
  "lyria",
  "clip",
  "embed",
  "whisper",
  "moderation",
  "guard",
  "tts",
  "stt",
  "image",
  "audio",
  "vision-preview",
];

interface ModelRegistryData {
  blacklistedModels: string[];
  lastDiscoveredFreeModels: string[];
  activePrimaryModel: string;
  updatedAt: string;
}

// ==================== UNIVERSAL MULTI-KEY MANAGER ====================

type ProviderName = "gemini" | "groq" | "openrouter";

interface KeyState {
  key: string;
  exhaustedAt: number | null;   // timestamp when key hit daily limit
  rateLimitedUntil: number;     // timestamp when 429 cooloff expires
  consecutiveErrors: number;    // track consecutive failures
}

/**
 * Manages API key pools for ALL providers (Gemini, Groq, OpenRouter).
 * Features:
 * - Automatic rotation when a key hits 429 rate limit
 * - Per-key exhaustion tracking (marks key dead for the day)
 * - Auto-reset at midnight UTC or after 6 hours
 * - Round-robin key selection for even load distribution
 */
class MultiProviderKeyManager {
  private pools: Record<ProviderName, KeyState[]> = {
    gemini: [],
    groq: [],
    openrouter: [],
  };
  private activeIndex: Record<ProviderName, number> = {
    gemini: 0,
    groq: 0,
    openrouter: 0,
  };

  constructor() {
    this.loadKeysFromEnv();
  }

  /**
   * Loads all API keys from environment variables.
   * Supports both singular (GEMINI_API_KEY) and plural (GEMINI_API_KEYS) forms.
   * Keys are comma-separated.
   */
  public loadKeysFromEnv(): void {
    this.pools.gemini = this.parseKeys(
      process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ""
    );
    this.pools.groq = this.parseKeys(
      process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || ""
    );
    this.pools.openrouter = this.parseKeys(
      process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || ""
    );

    // Restore historical health from SQLite
    try {
      const stored = dbGetAllKeyHealth();
      for (const record of stored) {
        const providerPool = this.pools[record.provider as ProviderName];
        if (providerPool) {
          const match = providerPool.find((s) => this.hashKey(s.key) === record.keyHash);
          if (match) {
            match.exhaustedAt = record.exhaustedAt;
            match.rateLimitedUntil = record.rateLimitedUntil;
            match.consecutiveErrors = record.consecutiveErrors;
          }
        }
      }
    } catch {}

    const counts = {
      gemini: this.pools.gemini.length,
      groq: this.pools.groq.length,
      openrouter: this.pools.openrouter.length,
    };
    console.log(
      `🔑 [Multi-Key Manager] Loaded keys: Gemini(${counts.gemini}) | Groq(${counts.groq}) | OpenRouter(${counts.openrouter})`
    );
  }

  private hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return `key_${Math.abs(hash).toString(16)}_${key.slice(-4)}`;
  }

  private persistKey(provider: ProviderName, state: KeyState): void {
    try {
      const keyHash = this.hashKey(state.key);
      const status = state.exhaustedAt !== null ? "exhausted" : (state.rateLimitedUntil > Date.now() ? "rate_limited" : "active");
      dbSaveKeyHealth({
        keyHash,
        provider,
        status,
        exhaustedAt: state.exhaustedAt,
        rateLimitedUntil: state.rateLimitedUntil,
        consecutiveErrors: state.consecutiveErrors,
        updatedAt: Date.now(),
      });
    } catch {}
  }

  private async triggerAlertWebhook(event: string, details: Record<string, any>): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const payload = {
        event,
        timestamp: Date.now(),
        agent: "AgentClaw",
        ...details,
      };
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn(`⚠️ [Alert Webhook] Failed to deliver alert to ${webhookUrl}: ${err}`);
    }
  }

  private parseKeys(raw: string): KeyState[] {
    const keys = raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    // Deduplicate
    const unique = Array.from(new Set(keys));
    return unique.map((key) => ({
      key,
      exhaustedAt: null,
      rateLimitedUntil: 0,
      consecutiveErrors: 0,
    }));
  }

  /**
   * Returns true if the provider has ANY keys configured.
   */
  public hasKeys(provider: ProviderName): boolean {
    return this.pools[provider].length > 0;
  }

  /**
   * Returns ALL raw keys for a provider (for backward compat).
   */
  public getAllKeys(provider: ProviderName): string[] {
    return this.pools[provider].map((s) => s.key);
  }

  /**
   * Gets the best available API key for a provider.
   * Skips exhausted and rate-limited keys. Uses round-robin for load distribution.
   * Returns null if ALL keys are exhausted/rate-limited.
   */
  public getActiveKey(provider: ProviderName): string | null {
    this.resetExpiredKeys(provider);
    const pool = this.pools[provider];
    if (pool.length === 0) return null;

    const now = Date.now();

    // Try round-robin starting from current index
    for (let attempt = 0; attempt < pool.length; attempt++) {
      const idx = (this.activeIndex[provider] + attempt) % pool.length;
      const state = pool[idx];

      if (state.exhaustedAt !== null) continue;  // skip daily-exhausted keys
      if (state.rateLimitedUntil > now) continue; // skip temporarily rate-limited keys

      // Found a usable key — update active index to next for round-robin
      this.activeIndex[provider] = (idx + 1) % pool.length;
      return state.key;
    }

    // All keys are temporarily limited — return least-recently-limited key
    const sorted = [...pool].sort((a, b) => a.rateLimitedUntil - b.rateLimitedUntil);
    if (sorted[0] && sorted[0].exhaustedAt === null) {
      return sorted[0].key;
    }

    return null; // truly all exhausted
  }

  /**
   * Called when a key gets HTTP 429 (rate limited).
   * Applies a temporary cooldown (default 60s).
   */
  public reportRateLimit(provider: ProviderName, key: string, cooloffMs = 60_000): void {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.rateLimitedUntil = Date.now() + cooloffMs;
      state.consecutiveErrors++;
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_rate_limited", {
        provider,
        keyMasked: `...${key.slice(-4)}`,
        cooloffSeconds: cooloffMs / 1000,
        availableKeys: this.getAvailableCount(provider),
        totalKeys: this.pools[provider].length,
      });
      console.warn(
        `⏳ [Key Rotation] ${provider} key ...${key.slice(-4)} rate-limited. Cooloff ${cooloffMs / 1000}s. ` +
        `(${this.getAvailableCount(provider)}/${this.pools[provider].length} keys available)`
      );
    }
  }

  /**
   * Called when a key's daily free quota is exhausted.
   * Marks the key as dead until midnight UTC reset.
   */
  public reportQuotaExhausted(provider: ProviderName, key: string): string | null {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.exhaustedAt = Date.now();
      state.consecutiveErrors++;
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_quota_exhausted", {
        provider,
        keyMasked: `...${key.slice(-4)}`,
        remainingKeys: this.getAvailableCount(provider),
        totalKeys: this.pools[provider].length,
      });
      console.warn(
        `🔴 [Key Rotation] ${provider} key ...${key.slice(-4)} daily quota exhausted. ` +
        `(${this.getAvailableCount(provider)}/${this.pools[provider].length} keys remaining)`
      );
    }

    // Try to get next available key
    const nextKey = this.getActiveKey(provider);
    if (nextKey) {
      console.log(
        `🔑 [Key Rotation] Auto-rotated ${provider} to key ...${nextKey.slice(-4)}`
      );
    } else {
      this.triggerAlertWebhook("provider_all_keys_exhausted", {
        provider,
        message: `🔴 ALL ${provider} keys exhausted for today.`,
      });
      console.warn(
        `⚠️ [Key Rotation] ALL ${provider} keys exhausted for today. Will reset at midnight UTC.`
      );
    }
    return nextKey;
  }

  /**
   * Called on HTTP 401 (invalid key). Permanently marks the key as exhausted.
   */
  public reportInvalidKey(provider: ProviderName, key: string): string | null {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.exhaustedAt = Date.now();
      this.persistKey(provider, state);
      this.triggerAlertWebhook("key_invalid", {
        provider,
        keyMasked: `...${key.slice(-4)}`,
      });
      console.warn(
        `🚫 [Key Rotation] ${provider} key ...${key.slice(-4)} invalid/expired (401). Removed from rotation.`
      );
    }
    return this.getActiveKey(provider);
  }

  /**
   * Called on successful API call. Resets the key's error counter.
   */
  public reportSuccess(provider: ProviderName, key: string): void {
    const state = this.findKeyState(provider, key);
    if (state) {
      state.consecutiveErrors = 0;
      state.rateLimitedUntil = 0;
      this.persistKey(provider, state);
    }
  }

  /**
   * Returns true if ALL keys for a provider are daily-exhausted.
   */
  public isProviderExhausted(provider: ProviderName): boolean {
    this.resetExpiredKeys(provider);
    const pool = this.pools[provider];
    if (pool.length === 0) return true;
    return pool.every((s) => s.exhaustedAt !== null);
  }

  /**
   * Returns true if ALL providers (Gemini + Groq + OpenRouter) are completely exhausted.
   */
  public isAllProvidersExhausted(): boolean {
    const providers: ProviderName[] = ["gemini", "groq", "openrouter"];
    return providers.every(
      (p) => this.pools[p].length === 0 || this.isProviderExhausted(p)
    );
  }

  /**
   * Get status summary for logging/dashboard.
   */
  public getStatus(): Record<ProviderName, { total: number; available: number; exhausted: number }> {
    this.resetExpiredKeys("gemini");
    this.resetExpiredKeys("groq");
    this.resetExpiredKeys("openrouter");

    const result = {} as Record<ProviderName, { total: number; available: number; exhausted: number }>;
    for (const provider of ["gemini", "groq", "openrouter"] as ProviderName[]) {
      const pool = this.pools[provider];
      const exhausted = pool.filter((s) => s.exhaustedAt !== null).length;
      result[provider] = {
        total: pool.length,
        available: pool.length - exhausted,
        exhausted,
      };
    }
    return result;
  }

  // --- Internal helpers ---

  private findKeyState(provider: ProviderName, key: string): KeyState | undefined {
    return this.pools[provider].find((s) => s.key === key);
  }

  private getAvailableCount(provider: ProviderName): number {
    const now = Date.now();
    return this.pools[provider].filter(
      (s) => s.exhaustedAt === null && s.rateLimitedUntil <= now
    ).length;
  }

  /**
   * Auto-resets exhausted keys after 6 hours or at midnight UTC.
   * Gemini's free-tier daily quota (RPD) resets at UTC midnight, so we check
   * whether we've crossed a UTC day boundary since the key was marked exhausted.
   */
  private resetExpiredKeys(provider: ProviderName): void {
    const now = Date.now();
    const nowDate = new Date(now);
    for (const state of this.pools[provider]) {
      if (state.exhaustedAt === null) continue;
      const hoursSinceExhaustion = (now - state.exhaustedAt) / (1000 * 60 * 60);
      // Reset after 6 hours (fallback for non-daily quotas)
      if (hoursSinceExhaustion >= 6) {
        state.exhaustedAt = null;
        state.consecutiveErrors = 0;
        state.rateLimitedUntil = 0;
        continue;
      }
      // Reset if we've crossed a UTC midnight boundary (daily quota reset)
      const exhaustedDate = new Date(state.exhaustedAt);
      if (exhaustedDate.getUTCDate() !== nowDate.getUTCDate() ||
          exhaustedDate.getUTCMonth() !== nowDate.getUTCMonth() ||
          exhaustedDate.getUTCFullYear() !== nowDate.getUTCFullYear()) {
        state.exhaustedAt = null;
        state.consecutiveErrors = 0;
        state.rateLimitedUntil = 0;
      }
    }
  }
}

// ==================== OPENROUTER MODEL ADAPTER ====================

class AutonomousModelAdapter {
  private blacklisted = new Set<string>([
    "deepseek/deepseek-r1:free",
    "google/lyria-3-pro-preview",
    "google/lyria-3-clip-preview",
    "nvidia/nemotron-3.5-content-safety:free",
    "openrouter/free",
    // Pre-blacklisted deprecated Gemini models (August 2026)
    // gemini-2.5-flash returns 404, gemini-3.5-flash-lite fails tool call validation
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
  ]);
  private discoveredFreeModels: string[] = [...DEFAULT_FREE_MODELS];
  private activePrimaryModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  private lastFetchTime = 0;
  private rateLimitedUntil = new Map<string, number>();

  constructor() {
    this.loadState();
    // Background fetch free models from OpenRouter API
    this.refreshOpenRouterFreeModels().catch(() => {});
  }

  private loadState() {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        const raw = fs.readFileSync(REGISTRY_FILE, "utf-8");
        const data = JSON.parse(raw) as ModelRegistryData;
        if (data.blacklistedModels) {
          data.blacklistedModels.forEach((m) => this.blacklisted.add(m));
        }
        if (data.lastDiscoveredFreeModels?.length) {
          const cleanDiscovered = data.lastDiscoveredFreeModels.filter(
            (m) => !NON_CHAT_KEYWORDS.some((kw) => m.toLowerCase().includes(kw))
          );
          this.discoveredFreeModels = Array.from(
            new Set([...cleanDiscovered, ...DEFAULT_FREE_MODELS])
          );
        }
        if (data.activePrimaryModel) {
          this.activePrimaryModel = data.activePrimaryModel;
        }
      }
    } catch {
      // fallback to defaults
    }
  }

  private saveState() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      const data: ModelRegistryData = {
        blacklistedModels: Array.from(this.blacklisted),
        lastDiscoveredFreeModels: this.discoveredFreeModels,
        activePrimaryModel: this.activePrimaryModel,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));

      // Synchronize with main agentclaw.json config if present
      if (fs.existsSync(AGENTCLAW_CONFIG_FILE)) {
        const rawConfig = fs.readFileSync(AGENTCLAW_CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(rawConfig);
        if (parsed.llm) {
          parsed.llm.model = this.activePrimaryModel;
          fs.writeFileSync(AGENTCLAW_CONFIG_FILE, JSON.stringify(parsed, null, 2));
        }
      }
    } catch {
      // ignore write errors
    }
  }

  /**
   * Queries OpenRouter public models API to dynamically discover available free models.
   * Filters out moderation, audio, embedding, and non-chat models.
   */
  public async refreshOpenRouterFreeModels(): Promise<string[]> {
    const now = Date.now();
    // Cache for 30 minutes
    if (now - this.lastFetchTime < 30 * 60 * 1000 && this.discoveredFreeModels.length > 0) {
      return this.getHealthyFreeModels();
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (res.ok) {
        const data = (await res.json()) as {
          data: Array<{ id: string; pricing?: { prompt: string }; architecture?: { modality?: string } }>;
        };
        const apiFreeModels = data.data
          .filter((m) => m.id.endsWith(":free") || (m.pricing && m.pricing.prompt === "0"))
          .map((m) => m.id)
          .filter((id) => !NON_CHAT_KEYWORDS.some((kw) => id.toLowerCase().includes(kw)));

        if (apiFreeModels.length > 0) {
          const combined = Array.from(new Set([...apiFreeModels, ...DEFAULT_FREE_MODELS]));
          this.discoveredFreeModels = combined;
          this.lastFetchTime = now;
          this.saveState();
        }
      }
    } catch {
      // network offline fallback
    }

    return this.getHealthyFreeModels();
  }

  /**
   * Temporary rate-limit cooloff registration (60s)
   */
  public reportRateLimit(model: string, cooloffMs = 60_000): void {
    this.rateLimitedUntil.set(model, Date.now() + cooloffMs);
  }

  /**
   * Returns healthy free models, excluding blacklisted ones and cool-off models.
   */
  public getHealthyFreeModels(): string[] {
    const now = Date.now();
    const nonBlacklisted = this.discoveredFreeModels.filter(
      (m) => !this.blacklisted.has(m) && !NON_CHAT_KEYWORDS.some((kw) => m.toLowerCase().includes(kw))
    );

    // Exclude models currently in rate-limit cooloff
    const available = nonBlacklisted.filter(
      (m) => (this.rateLimitedUntil.get(m) || 0) <= now
    );

    // If all models are temporarily cooloff rate-limited, return all non-blacklisted models to avoid empty queue
    return available.length > 0 ? available : nonBlacklisted;
  }

  /**
   * Builds prioritized candidate model queue for OpenRouter requests.
   */
  public getModelQueue(configuredModel?: string): string[] {
    const healthy = this.getHealthyFreeModels();

    let candidate = configuredModel;
    if (!candidate || this.blacklisted.has(candidate) || candidate.includes("deepseek-r1:free")) {
      candidate = this.activePrimaryModel;
    }
    if (this.blacklisted.has(candidate)) {
      candidate = healthy[0] || DEFAULT_FREE_MODELS[0];
    }

    const queue = [candidate, ...healthy];
    return Array.from(new Set(queue));
  }

  /**
   * Autonomous Event Handler: Called when an HTTP 404/410/400 model failure occurs.
   * Blacklists broken model, promotes top healthy free model, and updates disk config.
   */
  public reportModelFailure(model: string, httpStatus: number, errText: string): string {
    console.warn(
      `🤖 [Autonomous Model Adaptation] Blacklisting model '${model}' (HTTP ${httpStatus}: ${errText.slice(0, 80)}...).`
    );

    this.blacklisted.add(model);

    // Pick best healthy model as new primary
    const healthy = this.getHealthyFreeModels();
    const newPrimary = healthy[0] || DEFAULT_FREE_MODELS[0];

    if (this.activePrimaryModel === model || this.blacklisted.has(this.activePrimaryModel)) {
      this.activePrimaryModel = newPrimary;
      console.log(
        `⚡ [Autonomous Model Adaptation] Autonomously promoted '${newPrimary}' as new active primary model (zero human intervention required).`
      );
    }

    this.saveState();
    return newPrimary;
  }

  /**
   * Record successful model call to ensure it stays active and clears rate-limit flags.
   */
  public reportModelSuccess(model: string): void {
    this.rateLimitedUntil.delete(model);
    if (model && !this.blacklisted.has(model) && this.activePrimaryModel !== model) {
      this.activePrimaryModel = model;
      this.saveState();
    }
  }

  public getActivePrimaryModel(): string {
    return this.activePrimaryModel;
  }
}

// ==================== EXPORTS (Singletons) ====================

export const keyManager = new MultiProviderKeyManager();
export const autonomousAdapter = new AutonomousModelAdapter();

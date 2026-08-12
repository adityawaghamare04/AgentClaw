import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".agentclaw");
const REGISTRY_FILE = path.join(CONFIG_DIR, "model_registry.json");
const AGENTCLAW_CONFIG_FILE = path.join(CONFIG_DIR, "agentclaw.json");

// Default curated fallback list of top free tier models on OpenRouter
const DEFAULT_FREE_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "openchat/openchat-7b:free",
];

interface ModelRegistryData {
  blacklistedModels: string[];
  lastDiscoveredFreeModels: string[];
  activePrimaryModel: string;
  updatedAt: string;
}

class AutonomousModelAdapter {
  private blacklisted = new Set<string>(["deepseek/deepseek-r1:free"]);
  private discoveredFreeModels: string[] = [...DEFAULT_FREE_MODELS];
  private activePrimaryModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  private lastFetchTime = 0;

  constructor() {
    this.loadState();
    // Background fetch free models from OpenRouter API every 1 hour
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
          this.discoveredFreeModels = Array.from(
            new Set([...data.lastDiscoveredFreeModels, ...DEFAULT_FREE_MODELS])
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
        const data = (await res.json()) as { data: Array<{ id: string; pricing?: { prompt: string } }> };
        const apiFreeModels = data.data
          .filter((m) => m.id.endsWith(":free") || (m.pricing && m.pricing.prompt === "0"))
          .map((m) => m.id);

        if (apiFreeModels.length > 0) {
          // Merge API discovered free models with default pool
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
   * Returns healthy free models, excluding blacklisted ones.
   */
  public getHealthyFreeModels(): string[] {
    return this.discoveredFreeModels.filter((m) => !this.blacklisted.has(m));
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
   * Record successful model call to ensure it stays active.
   */
  public reportModelSuccess(model: string): void {
    if (model && !this.blacklisted.has(model) && this.activePrimaryModel !== model) {
      this.activePrimaryModel = model;
      this.saveState();
    }
  }

  public getActivePrimaryModel(): string {
    return this.activePrimaryModel;
  }
}

export const autonomousAdapter = new AutonomousModelAdapter();

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LLMConfig {
  provider: "anthropic" | "openai" | "openrouter" | "gemini";
  model: string;
  apiKey: string;
}

export interface PricingConfig {
  strategy: "fixed" | "complexity";
  baseRateEth: string;
  maxRateEth: string;
}

export interface PollingConfig {
  intervalMs: number;
  urgentIntervalMs: number;
}

export interface PersonalityConfig {
  tone: "professional" | "casual" | "friendly" | "technical";
  responseStyle: "concise" | "detailed" | "balanced";
  customInstructions?: string;
}

export interface CashClawConfig {
  agentId: string;
  llm: LLMConfig;
  polling: PollingConfig;
  pricing: PricingConfig;
  specialties: string[];
  autoQuote: boolean;
  autoWork: boolean;
  maxConcurrentTasks: number;
  maxLoopTurns?: number;
  declineKeywords: string[];
  personality?: PersonalityConfig;
  learningEnabled: boolean;
  studyIntervalMs: number;
  agentCashEnabled: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".agentclaw");
const CONFIG_PATH = path.join(CONFIG_DIR, "agentclaw.json");

const DEFAULT_CONFIG: Omit<CashClawConfig, "agentId" | "llm"> = {
  polling: { intervalMs: 30000, urgentIntervalMs: 10000 },
  pricing: { strategy: "fixed", baseRateEth: "0.005", maxRateEth: "0.05" },
  specialties: [],
  autoQuote: true,
  autoWork: true,
  maxConcurrentTasks: 3,
  declineKeywords: [],
  learningEnabled: true,
  studyIntervalMs: 1_800_000, // 30 minutes
  agentCashEnabled: false,
};

export function loadEnvFile(): void {
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(CONFIG_DIR, ".env"),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // ignore read error
      }
    }
  }
}

// Auto load .env at start
loadEnvFile();

export function getApiKeyFromEnv(provider: LLMConfig["provider"]): string {
  switch (provider) {
    case "gemini": return process.env.GEMINI_API_KEY || "";
    case "openrouter": return process.env.OPENROUTER_API_KEY || "";
    case "openai": return process.env.OPENAI_API_KEY || "";
    case "anthropic": return process.env.ANTHROPIC_API_KEY || "";
    default: return "";
  }
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function loadConfig(): CashClawConfig | null {
  loadEnvFile();
  let parsed: CashClawConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      parsed = JSON.parse(raw) as CashClawConfig;
    } catch {
      // ignore
    }
  }

  const provider = (process.env.LLM_PROVIDER as LLMConfig["provider"]) || parsed?.llm?.provider || "gemini";
  const envKey = getApiKeyFromEnv(provider);

  const config: CashClawConfig = {
    ...DEFAULT_CONFIG,
    agentId: parsed?.agentId || "agentclaw_agent",
    llm: {
      provider,
      model: process.env.LLM_MODEL || parsed?.llm?.model || "gemini-2.5-flash",
      apiKey: envKey || parsed?.llm?.apiKey || "",
    },
    ...parsed,
  };

  // Override key from backend .env if set
  if (envKey) {
    config.llm.apiKey = envKey;
  }

  return config;
}

export function requireConfig(): CashClawConfig {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      "No config found. Ensure .env or ~/.cashclaw/cashclaw.json is configured.",
    );
  }
  return config;
}

export function saveConfig(config: CashClawConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
}

/** Check if config has all required fields for running the agent */
export function isConfigured(): boolean {
  const config = loadConfig();
  if (!config) return false;
  return Boolean(config.agentId && config.llm?.apiKey && config.llm?.provider);
}

/** Save partial config fields, merging with existing config or defaults */
export function savePartialConfig(partial: Partial<CashClawConfig>): CashClawConfig {
  const existing = loadConfig() || {
    ...DEFAULT_CONFIG,
    agentId: "cashclaw_agent",
    llm: { provider: "gemini" as const, model: "gemini-2.5-pro", apiKey: "" },
  };
  const config = {
    ...existing,
    ...partial,
  };
  saveConfig(config);
  return config;
}

export function initConfig(opts: {
  agentId: string;
  provider: LLMConfig["provider"];
  model?: string;
  apiKey: string;
  specialties?: string[];
}): CashClawConfig {
  const modelDefaults: Record<LLMConfig["provider"], string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    openrouter: "google/gemini-2.5-pro",
    gemini: "gemini-2.5-pro",
  };

  const config: CashClawConfig = {
    ...DEFAULT_CONFIG,
    agentId: opts.agentId,
    llm: {
      provider: opts.provider,
      model: opts.model ?? modelDefaults[opts.provider],
      apiKey: opts.apiKey || getApiKeyFromEnv(opts.provider),
    },
    specialties: opts.specialties ?? [],
  };

  saveConfig(config);
  return config;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Check if AgentCash CLI wallet exists on disk */
export function isAgentCashAvailable(): boolean {
  const walletPath = path.join(os.homedir(), ".agentcash", "wallet.json");
  return fs.existsSync(walletPath);
}

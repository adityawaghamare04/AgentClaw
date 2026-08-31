/** Built by Aditya Waghamare */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LLMConfig {
  provider: "anthropic" | "openai" | "openrouter" | "gemini" | "ollama" | "local" | "lmstudio" | "groq" | "custom";
  model: string;
  apiKey: string;
  baseUrl?: string;
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
  pricing: { strategy: "fixed", baseRateEth: "0.002", maxRateEth: "0.05" },
  specialties: [],
  autoQuote: true,
  autoWork: true,
  maxConcurrentTasks: 5,
  declineKeywords: [],
  learningEnabled: true,
  studyIntervalMs: 14_400_000, // 4 hours — save API quota for execution
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
    case "gemini": return process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    case "openrouter": return process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
    case "openai": return process.env.OPENAI_API_KEY || "";
    case "anthropic": return process.env.ANTHROPIC_API_KEY || "";
    case "groq": return process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
    case "ollama":
    case "local":
    case "custom":
    case "lmstudio": return "ollama";
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

  const geminiKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  const groqKeys = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY;
  const openrouterKeys = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY;

  // Environment variable takes highest priority if explicitly specified
  let provider = (process.env.LLM_PROVIDER as LLMConfig["provider"]) || undefined;

  // Auto-detect primary provider from available keys
  if (!provider) {
    if (geminiKeys) {
      provider = "gemini";
    } else if (groqKeys) {
      provider = "groq";
    } else if (openrouterKeys) {
      provider = "openrouter";
    } else {
      provider = "gemini";
    }
  }

  const envModel = process.env.LLM_MODEL || undefined;
  const defaultModelMap: Record<LLMConfig["provider"], string> = {
    gemini: "gemini-3.5-flash-lite",
    groq: "openai/gpt-oss-120b",
    openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
    anthropic: "claude-3-5-sonnet-20241022",
    openai: "gpt-4o",
    ollama: "qwen2.5-coder",
    local: "qwen2.5-coder",
    custom: "qwen2.5-coder:14b-instruct-q4_K_M",
    lmstudio: "qwen2.5-coder",
  };

  let model = envModel || parsed?.llm?.model || defaultModelMap[provider] || "gemini-2.5-flash";
  if (model.includes("deepseek-r1:free")) {
    model = "nvidia/nemotron-3-ultra-550b-a55b:free";
  }
  
  let apiKey = getApiKeyFromEnv(provider) || parsed?.llm?.apiKey || "";

  const config: CashClawConfig = {
    ...DEFAULT_CONFIG,
    ...parsed,
    agentId: parsed?.agentId || "agentclaw_agent",
    llm: {
      provider,
      model,
      apiKey,
    },
  };

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
    openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
    gemini: "gemini-3.5-flash-lite",
    ollama: "qwen2.5-coder",
    local: "qwen2.5-coder",
    custom: "qwen2.5-coder:14b-instruct-q4_K_M",
    lmstudio: "qwen2.5-coder",
    groq: "openai/gpt-oss-120b",
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

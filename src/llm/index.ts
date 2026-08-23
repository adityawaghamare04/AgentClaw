import type { LLMConfig } from "../config.js";
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ContentBlock,
  ToolResultBlock,
} from "./types.js";

import { autonomousAdapter, keyManager } from "./adaptation.js";

export type { LLMProvider, LLMMessage, LLMResponse } from "./types.js";

// Specialized Free Model Cascade Pool for OpenRouter
const OPENROUTER_MODEL_CASCADE = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",      // Tier 1: Agentic Orchestration & Research
  "google/gemma-4-31b-it:free",                   // Tier 2: Strong general-purpose
  "google/gemma-4-26b-a4b-it:free",               // Tier 3: Efficient mid-range
  "nvidia/nemotron-3-super-120b-a12b:free",       // Tier 4: High-capacity fallback
  "nvidia/nemotron-3-nano-30b-a3b:free",          // Tier 5: Lightweight fallback
  "nvidia/nemotron-nano-12b-v2-vl:free",          // Tier 6: Minimum viable fallback
];

function createAnthropicProvider(config: LLMConfig): LLMProvider {
  return {
    async chat(messages, tools) {
      const systemMsg = messages.find((m) => m.role === "system");
      const nonSystem = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: 4096,
        system: typeof systemMsg?.content === "string" ? systemMsg.content : undefined,
        messages: nonSystem.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${err}`);
      }

      const data = (await res.json()) as {
        content: ContentBlock[];
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      return {
        content: data.content,
        stopReason: data.stop_reason as LLMResponse["stopReason"],
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
      };
    },
  };
}

// Translate our ToolDefinition[] to OpenAI's { type: "function", function: {...} }
function toOpenAITools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// Translate our messages to OpenAI format
function toOpenAIMessages(messages: LLMMessage[]): unknown[] {
  return messages
    .map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }

      if (m.role === "assistant" && Array.isArray(m.content)) {
        const textParts = m.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("");

        const toolCalls = m.content
          .filter(
            (
              b,
            ): b is {
              type: "tool_use";
              id: string;
              name: string;
              input: Record<string, unknown>;
              extra_content?: Record<string, unknown>;
            } => b.type === "tool_use",
          )
          .map((b) => ({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
            // Preserve Gemini thought_signature for multi-turn tool calling
            ...(b.extra_content ? { extra_content: b.extra_content } : {}),
          }));

        return {
          role: "assistant",
          content: textParts || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
      }

      if (m.role === "user" && Array.isArray(m.content)) {
        const results = m.content as ToolResultBlock[];
        return results.map((r) => ({
          role: "tool",
          tool_call_id: r.tool_use_id,
          content: r.content,
        }));
      }

      return { role: m.role, content: m.content };
    })
    .flat();
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: Record<string, unknown>;
}

// ==================== RATE LIMITER ====================
// Prevents blowing through free tier RPM limits by queuing requests
class RateLimiter {
  private queue: Array<{ resolve: () => void }> = [];
  private activeCount = 0;
  private timestamps: number[] = [];

  constructor(
    private readonly maxRpm: number,
    private readonly maxConcurrent: number,
  ) {}

  async acquire(): Promise<void> {
    // Wait until we're strictly under the concurrency cap
    while (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push({ resolve }));
    }

    // Enforce RPM sliding window strictly
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
      if (this.timestamps.length < this.maxRpm) {
        break;
      }
      const waitMs = Math.max(100, 60_000 - (now - this.timestamps[0]) + 100);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    this.activeCount++;
    this.timestamps.push(Date.now());
  }

  release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) next.resolve();
  }
}

// Provider-specific rate limiters (shared across all calls)
// Provider-specific rate limiters (shared across all calls)
// Conservative limits to avoid burning free-tier quotas
const geminiLimiter = new RateLimiter(10, 1);   // 10 RPM, max 1 concurrent (tool calls are multi-turn)
const groqLimiter = new RateLimiter(25, 1);     // 25 RPM (buffer from 30), max 1 concurrent
const defaultLimiter = new RateLimiter(30, 2);  // reasonable for other providers

function createOpenAICompatibleProvider(
  config: LLMConfig,
  baseUrl: string,
): LLMProvider {
  return {
    async chat(messages, tools) {
      const isOpenRouter = baseUrl.includes("openrouter");
      const isGemini = config.provider === "gemini" || baseUrl.includes("generativelanguage.googleapis.com");
      const isGroq = config.provider === "groq" || baseUrl.includes("groq.com");

      const providerName: "gemini" | "groq" | "openrouter" = isGemini
        ? "gemini"
        : isGroq
        ? "groq"
        : "openrouter";

      let activeKey = keyManager.getActiveKey(providerName) || config.apiKey;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeKey}`,
      };

      if (isOpenRouter) {
        headers["HTTP-Referer"] = "https://cashclaw.dev";
        headers["X-Title"] = "AgentClaw Engine";
      }

      // Use models that WORK with OpenAI-compatible endpoint + tool calling
      // gemini-2.5-flash requires thought_signature passthrough (now supported)
      // gemini-3.5-flash-lite is the most reliable for tool calling
      const GEMINI_MODEL_CASCADE = [
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash",
      ];
      const GROQ_MODEL_CASCADE = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.6-27b",
      ];

      // Build model candidate queue using Autonomous Model Adapter
      const modelQueue = isOpenRouter
        ? autonomousAdapter.getModelQueue(config.model)
        : isGemini
        ? GEMINI_MODEL_CASCADE
        : isGroq
        ? GROQ_MODEL_CASCADE
        : [config.model];

      // Select rate limiter by provider
      const limiter = isGemini ? geminiLimiter : isGroq ? groqLimiter : defaultLimiter;

      let lastError: Error | null = null;

      for (let i = 0; i < modelQueue.length; i++) {
        const currentModel = modelQueue[i];
        const body: Record<string, unknown> = {
          model: currentModel,
          max_tokens: 4096,
          messages: toOpenAIMessages(messages),
        };

        if (tools && tools.length > 0) {
          body.tools = toOpenAITools(tools);
        }

        try {
          // Acquire rate limiter slot before making API call
          await limiter.acquire();

          // Build request URL
          const requestUrl = `${baseUrl}/chat/completions`;
          activeKey = keyManager.getActiveKey(providerName) || activeKey;
          headers.Authorization = `Bearer ${activeKey}`;

          let res: Response;
          try {
            res = await fetch(requestUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
            });
          } finally {
            limiter.release();
          }

          if (!res.ok) {
            const errText = await res.text();
            
            // Autonomously handle 401 Unauthorized / Invalid API Key
            if (res.status === 401) {
              const nextKey = keyManager.reportInvalidKey(providerName, activeKey);
              if (nextKey && nextKey !== activeKey) {
                activeKey = nextKey;
                headers.Authorization = `Bearer ${activeKey}`;
                console.log(`⚡ Retrying model '${currentModel}' with rotated ${providerName} key after 401 error.`);
                i--; // Retry current model with rotated API key
                continue;
              }
              throw new Error(`LLM API 401 Unauthorized: ${providerName} key (...${activeKey.slice(-4)}) invalid or expired.`);
            }

            // Autonomously handle 404 / 410 / 400 model deprecation or non-tool errors
            if (res.status === 404 || res.status === 410 || res.status === 400) {
              autonomousAdapter.reportModelFailure(currentModel, res.status, errText);
            } else if (res.status === 413) {
              // Payload too large for this model's context window — cascade to next model
              console.warn(`[LLM Router] ${currentModel} rejected payload (413 too large). Cascading...`);
            } else if (res.status === 429) {
              // Check if quota limit reached
              const isQuotaExhausted =
                errText.includes("free-models-per-day") ||
                errText.includes("Quota exceeded") ||
                errText.includes("RESOURCE_EXHAUSTED") ||
                errText.includes("daily limit");

              if (isQuotaExhausted) {
                const nextKey = keyManager.reportQuotaExhausted(providerName, activeKey);
                if (nextKey && nextKey !== activeKey) {
                  activeKey = nextKey;
                  headers.Authorization = `Bearer ${activeKey}`;
                  console.log(`⚡ Rotated ${providerName} key after daily quota hit. Retrying '${currentModel}'...`);
                  i--; // Retry with new key
                  continue;
                }
              } else {
                keyManager.reportRateLimit(providerName, activeKey);
                autonomousAdapter.reportRateLimit(currentModel);
                // Try rotating key even on standard RPM 429 if another key exists
                const altKey = keyManager.getActiveKey(providerName);
                if (altKey && altKey !== activeKey) {
                  activeKey = altKey;
                  headers.Authorization = `Bearer ${activeKey}`;
                  console.log(`⚡ Switching to parallel ${providerName} key due to rate-limit RPM spike.`);
                  i--;
                  continue;
                }
              }
            }

            // Cascade to next available model in candidate queue
            if (i < modelQueue.length - 1) {
              console.warn(
                `[LLM Router Warning] ${currentModel} returned ${res.status}. Autonomously cascading to: ${modelQueue[i + 1]}`,
              );
              if (res.status === 429) {
                // Short jittered delay (1500ms) to allow LLM rate-limit bucket to refill
                await new Promise((r) => setTimeout(r, 1500 + Math.random() * 500));
              }
              continue;
            }
            throw new Error(`LLM API ${res.status}: ${errText}`);
          }

          // Mark model and key as verified healthy on successful completion
          keyManager.reportSuccess(providerName, activeKey);
          if (isOpenRouter) {
            autonomousAdapter.reportModelSuccess(currentModel);
          }

          const data = (await res.json()) as {
            choices: Array<{
              message: {
                content: string | null;
                tool_calls?: OpenAIToolCall[];
              };
              finish_reason: string;
            }>;
            usage: { prompt_tokens: number; completion_tokens: number };
          };

          const choice = data.choices[0];
          const content: ContentBlock[] = [];

          if (choice.message.content) {
            content.push({ type: "text", text: choice.message.content });
          }

          if (choice.message.tool_calls) {
            for (const tc of choice.message.tool_calls) {
              let input: Record<string, unknown>;
              try {
                input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
              } catch {
                input = { _raw: tc.function.arguments, _error: "malformed JSON from LLM" };
              }
              content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
                input,
                // Preserve Gemini thought_signature for multi-turn tool calling
                extra_content: (tc as any).extra_content || undefined,
              });
            }
          }

          const stopReasonMap: Record<string, LLMResponse["stopReason"]> = {
            stop: "end_turn",
            tool_calls: "tool_use",
            length: "max_tokens",
          };

          return {
            content,
            stopReason: stopReasonMap[choice.finish_reason] ?? "end_turn",
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            },
          };
        } catch (err: any) {
          lastError = err;
          if (i < modelQueue.length - 1) {
            console.warn(
              `[LLM Router Error] ${currentModel} failed (${err.message}). Switching to fallback: ${modelQueue[i + 1]}`,
            );
          }
        }
      }

      throw lastError || new Error("All LLM models in cascade pool failed.");
    },
  };
}

function createCascadeLLMProvider(
  providers: Array<{ name: string; provider: LLMProvider }>
): LLMProvider {
  if (providers.length === 1) {
    return providers[0].provider;
  }

  return {
    async chat(messages, tools) {
      let lastError: Error | null = null;
      for (let i = 0; i < providers.length; i++) {
        const p = providers[i];
        try {
          return await p.provider.chat(messages, tools);
        } catch (err: any) {
          lastError = err;
          if (i < providers.length - 1) {
            console.warn(
              `⚠️ [LLM Failover Cascade] ${p.name} failed (${err.message}). Seamlessly cascading to fallback provider: ${providers[i + 1].name}`,
            );
          }
        }
      }
      throw lastError || new Error("All providers in failover cascade pool failed.");
    },
  };
}

export function createLLMProvider(config: LLMConfig): LLMProvider {
  const cascadeList: Array<{ name: string; provider: LLMProvider }> = [];

  // Reload keys from process.env to pick up any runtime additions
  keyManager.loadKeysFromEnv();

  // 1. Primary: Google Gemini Provider (if any key exists)
  if (keyManager.hasKeys("gemini")) {
    const geminiModel = "gemini-3.5-flash-lite"; // Verified working with tool calling via OpenAI-compat
    const geminiConfig: LLMConfig = {
      ...config,
      provider: "gemini",
      apiKey: keyManager.getActiveKey("gemini") || config.apiKey,
      model: geminiModel,
    };
    cascadeList.push({
      name: `Google Gemini (${geminiModel})`,
      provider: createOpenAICompatibleProvider(
        geminiConfig,
        "https://generativelanguage.googleapis.com/v1beta/openai",
      ),
    });
  }

  // 2. Secondary: Groq Provider (Ultra-fast fallback)
  if (keyManager.hasKeys("groq")) {
    const groqModel = "openai/gpt-oss-120b"; // Verified working on Groq August 2026
    const groqConfig: LLMConfig = {
      ...config,
      provider: "groq",
      apiKey: keyManager.getActiveKey("groq") || config.apiKey,
      model: groqModel,
    };
    cascadeList.push({
      name: `Groq (${groqModel})`,
      provider: createOpenAICompatibleProvider(groqConfig, "https://api.groq.com/openai/v1"),
    });
  }

  // 3. Tertiary: OpenRouter Provider (if any key exists)
  if (keyManager.hasKeys("openrouter")) {
    const openRouterModel = config.model && !config.model.includes("gemini") ? config.model : "nvidia/nemotron-3-ultra-550b-a55b:free";
    const openRouterConfig: LLMConfig = {
      ...config,
      provider: "openrouter",
      apiKey: keyManager.getActiveKey("openrouter") || config.apiKey,
      model: openRouterModel,
    };
    cascadeList.push({
      name: `OpenRouter (${openRouterModel})`,
      provider: createOpenAICompatibleProvider(openRouterConfig, "https://openrouter.ai/api/v1"),
    });
  }

  // 4. Quaternary: Local Ollama (if running)
  if (process.env.OLLAMA_BASE_URL || config.provider === "ollama" || config.provider === "local") {
    const baseUrl = process.env.OLLAMA_BASE_URL || config.baseUrl || "http://localhost:11434/v1";
    const localConfig: LLMConfig = {
      ...config,
      provider: "ollama",
      apiKey: config.apiKey || "ollama",
      model: config.model || "qwen2.5-coder",
    };
    cascadeList.push({
      name: `Local Ollama (${localConfig.model})`,
      provider: createOpenAICompatibleProvider(localConfig, baseUrl),
    });
  }

  if (cascadeList.length > 0) {
    console.log(`🛡️ [LLM Router] Initialized Failover Chain: ${cascadeList.map((c) => c.name).join(" -> ")}`);
    return createCascadeLLMProvider(cascadeList);
  }

  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
      return createOpenAICompatibleProvider(config, "https://api.openai.com/v1");
    case "groq":
      return createOpenAICompatibleProvider(config, "https://api.groq.com/openai/v1");
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

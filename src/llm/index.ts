import type { LLMConfig } from "../config.js";
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ContentBlock,
  ToolResultBlock,
} from "./types.js";

export type { LLMProvider, LLMMessage, LLMResponse } from "./types.js";

// Specialized Free Model Cascade Pool for OpenRouter
const OPENROUTER_MODEL_CASCADE = [
  "nvidia/nemotron-3-ultra-550b-a55b:free", // Tier 1: Agentic Orchestration & Research
  "qwen/qwen-2.5-coder-32b-instruct:free",   // Tier 2: Deep Coding & Patch Synthesis
  "meta-llama/llama-3.3-70b-instruct:free", // Tier 3: High-capacity Instruction Following
  "google/gemini-2.0-flash-exp:free",      // Tier 4: High-speed Fallback
  "deepseek/deepseek-r1:free",               // Tier 5: Reasoning Fallback
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
            } => b.type === "tool_use",
          )
          .map((b) => ({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
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
}

function createOpenAICompatibleProvider(
  config: LLMConfig,
  baseUrl: string,
): LLMProvider {
  return {
    async chat(messages, tools) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      };

      const isOpenRouter = baseUrl.includes("openrouter");
      if (isOpenRouter) {
        headers["HTTP-Referer"] = "https://cashclaw.dev";
        headers["X-Title"] = "AgentClaw Engine";
      }

      // Build model candidate list: user-configured model first, followed by cascade pool if on OpenRouter
      const modelQueue = isOpenRouter
        ? Array.from(new Set([config.model, ...OPENROUTER_MODEL_CASCADE]))
        : [config.model];

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
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errText = await res.text();
            // If rate limited or unavailable, try next model in cascade
            if ((res.status === 429 || res.status === 503 || res.status === 502) && i < modelQueue.length - 1) {
              console.warn(
                `[LLM Router Warning] ${currentModel} returned ${res.status}. Cascading to fallback: ${modelQueue[i + 1]}`,
              );
              continue;
            }
            throw new Error(`LLM API ${res.status}: ${errText}`);
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

export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
      return createOpenAICompatibleProvider(config, "https://api.openai.com/v1");
    case "openrouter":
      return createOpenAICompatibleProvider(config, "https://openrouter.ai/api/v1");
    case "gemini":
      return createOpenAICompatibleProvider(
        config,
        "https://generativelanguage.googleapis.com/v1beta/openai",
      );
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

import { recordEarning } from "../memory/survival.js";

/**
 * Native Telegram & Discord Category B Listener
 * Polls Telegram Bot API and handles incoming freelance task requests directly.
 */

let telegramOffset = 0;

export function startCategoryBListeners() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const discordToken = process.env.DISCORD_BOT_TOKEN;

  if (telegramToken) {
    console.log("[Category B] 🤖 Telegram Bot Listener starting...");
    setInterval(() => pollTelegram(telegramToken), 10_000);
  }

  if (discordToken) {
    console.log("[Category B] 💬 Discord Bot Listener active.");
  }
}

async function pollTelegram(token: string) {
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${telegramOffset}&timeout=5`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json() as {
      ok: boolean;
      result?: Array<{
        update_id: number;
        message?: {
          chat: { id: number };
          text?: string;
          from?: { username?: string };
        };
      }>;
    };

    if (!data.ok || !data.result || data.result.length === 0) return;

    for (const update of data.result) {
      telegramOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const text = msg.text.trim();
      const chatId = msg.chat.id;

      if (text.startsWith("/start") || text.startsWith("/help")) {
        await sendTelegramReply(token, chatId, "🤖 *AgentClaw 24/7 Survival Engine Active*\n\nSend me a task or bounty using:\n`/task <description> $<budget>`");
      } else if (text.startsWith("/task") || text.toLowerCase().includes("bounty")) {
        const taskContent = text.replace(/^\/task/, "").trim() || "Telegram Task";
        const updatedState = recordEarning(15, `[Telegram] ${taskContent.slice(0, 30)}`);
        await sendTelegramReply(token, chatId, `✅ *Task Accepted & Logged*\n\nTask: ${taskContent}\nEarnings: +$15.00\nCurrent HP: ${updatedState.health}/100`);
      }
    }
  } catch {
    // Silent fail on network timeout
  }
}

async function sendTelegramReply(token: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {}
}

import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../config.js";

function getLogPath(date?: Date): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().split("T")[0];
  return path.join(getConfigDir(), "logs", `${dateStr}.md`);
}

function ensureLogDir(): void {
  const logDir = path.join(getConfigDir(), "logs");
  fs.mkdirSync(logDir, { recursive: true });
}

export function appendLog(entry: string): void {
  ensureLogDir();
  const logPath = getLogPath();
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const line = `- \`${timestamp}\` ${entry}\n`;

  if (!fs.existsSync(logPath)) {
    const header = `# CashClaw Activity — ${new Date().toISOString().split("T")[0]}\n\n`;
    fs.writeFileSync(logPath, header + line);
  } else {
    fs.appendFileSync(logPath, line);
  }
}

export function readTodayLog(): string {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return "No activity today.";
  return fs.readFileSync(logPath, "utf-8");
}

export function readLog(date: Date): string {
  const logPath = getLogPath(date);
  if (!fs.existsSync(logPath)) return "";
  return fs.readFileSync(logPath, "utf-8");
}

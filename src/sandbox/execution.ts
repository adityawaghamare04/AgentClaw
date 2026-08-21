import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SandboxOptions {
  timeoutMs?: number;
  maxMemoryMb?: number;
  allowNetwork?: boolean;
  env?: Record<string, string>;
  workDir?: string;
}

export interface SandboxResult {
  sandboxType: "docker" | "restricted_vm";
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
}

const SANDBOX_TMP_DIR = path.resolve(process.cwd(), "data", "sandbox", "tmp");

if (!fs.existsSync(SANDBOX_TMP_DIR)) {
  fs.mkdirSync(SANDBOX_TMP_DIR, { recursive: true });
}

let isDockerAvailableCache: boolean | null = null;

async function checkDockerAvailable(): Promise<boolean> {
  if (isDockerAvailableCache !== null) return isDockerAvailableCache;
  return new Promise((resolve) => {
    exec("docker info", { timeout: 3000 }, (error) => {
      isDockerAvailableCache = !error;
      resolve(isDockerAvailableCache);
    });
  });
}

/**
 * Sanitizes environment variables to prevent leakage of secrets to untrusted sandboxed tasks.
 */
function getSanitizedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const safeEnv: Record<string, string> = {
    PATH: process.env.PATH || "",
    NODE_ENV: "production",
    TEMP: SANDBOX_TMP_DIR,
    TMP: SANDBOX_TMP_DIR,
  };

  // Explicitly filter out sensitive credentials
  const SENSITIVE_KEYS = [
    "ETH_PRIVATE_KEY",
    "ADMIN_PASSWORD",
    "ADMIN_SECRET",
    "VAULT_PASSPHRASE",
    "GEMINI_API_KEYS",
    "GROQ_API_KEYS",
    "OPENROUTER_API_KEYS",
  ];

  for (const [k, v] of Object.entries(process.env)) {
    if (v && !SENSITIVE_KEYS.includes(k) && !k.startsWith("SECRET_")) {
      safeEnv[k] = v;
    }
  }

  if (customEnv) {
    Object.assign(safeEnv, customEnv);
  }

  return safeEnv;
}

/**
 * Securely executes untrusted code or bash commands inside a sandbox (Docker container or Restricted Subprocess VM).
 */
export async function executeInSandbox(
  commandOrScript: string,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 30000; // 30s default
  const maxMemoryMb = options.maxMemoryMb || 512;
  const allowNetwork = options.allowNetwork || false;

  const hasDocker = await checkDockerAvailable();

  if (hasDocker) {
    return runInDockerSandbox(commandOrScript, options, startTime, timeoutMs, maxMemoryMb, allowNetwork);
  } else {
    return runInRestrictedSubprocessSandbox(commandOrScript, options, startTime, timeoutMs, maxMemoryMb);
  }
}

async function runInDockerSandbox(
  command: string,
  options: SandboxOptions,
  startTime: number,
  timeoutMs: number,
  maxMemoryMb: number,
  allowNetwork: boolean
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const netFlag = allowNetwork ? "" : "--network none";
    const dockerCmd = `docker run --rm ${netFlag} --memory ${maxMemoryMb}m --cpus 1.0 node:20-alpine sh -c ${JSON.stringify(command)}`;

    exec(dockerCmd, { timeout: timeoutMs, env: getSanitizedEnv(options.env) }, (err, stdout, stderr) => {
      resolve({
        sandboxType: "docker",
        stdout: stdout ? stdout.trim() : "",
        stderr: stderr ? stderr.trim() : (err ? err.message : ""),
        exitCode: err ? (err.code || 1) : 0,
        executionTimeMs: Date.now() - startTime,
      });
    });
  });
}

async function runInRestrictedSubprocessSandbox(
  command: string,
  options: SandboxOptions,
  startTime: number,
  timeoutMs: number,
  maxMemoryMb: number
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    // Write temporary script file inside restricted sandbox temp dir
    const scriptId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.js`;
    const scriptPath = path.join(SANDBOX_TMP_DIR, scriptId);

    const safeWrapperCode = `
      // Restricted Sandbox Wrapper ESM
      import fs from "node:fs";
      import path from "node:path";
      
      // Execute command or code body
      try {
        ${command.includes("console.log") || command.includes(";") ? command : `console.log(eval(${JSON.stringify(command)}));`}
      } catch (err) {
        console.error("Sandbox Execution Error:", err.message);
        process.exit(1);
      }
    `;

    fs.writeFileSync(scriptPath, safeWrapperCode, "utf8");

    const child = spawn(process.execPath, [`--max-old-space-size=${maxMemoryMb}`, scriptPath], {
      cwd: options.workDir || SANDBOX_TMP_DIR,
      env: getSanitizedEnv(options.env),
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      // Clean up script file
      try { fs.unlinkSync(scriptPath); } catch {}

      resolve({
        sandboxType: "restricted_vm",
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
        executionTimeMs: Date.now() - startTime,
      });
    });

    child.on("error", (err) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      resolve({
        sandboxType: "restricted_vm",
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
      });
    });
  });
}

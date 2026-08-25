/** Built by Aditya Waghamare */
import { startAgent } from "./agent.js";
import { vaultManager } from "./security/vault.js";
import { clusterManager } from "./cluster/manager.js";

async function main() {
  console.log("⚡ Starting AgentClaw Enterprise Cluster...");

  // Initialize AES-256-GCM Vault Manager
  vaultManager.initializeVault();

  // Start Node Multi-Process Cluster Engine
  const clusterStatus = clusterManager.startCluster();
  if (!clusterStatus.isPrimary) {
    // Worker processes run background tasks
    return;
  }

  const server = await startAgent();

  // Open browser in local development mode only
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.AGENTCLAW_PORT || process.env.CASHCLAW_PORT || process.env.PORT || "3777";
    const url = `http://localhost:${port}`;
    const { execFile: execFileCb } = await import("node:child_process");
    const opener = process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
    execFileCb(opener, [url], { shell: process.platform === "win32" }, () => {});
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

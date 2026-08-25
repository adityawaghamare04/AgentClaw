import cluster from "node:cluster";
import os from "node:os";
import { dbSaveClusterNode, dbGetClusterNodes, type ClusterNodeRecord } from "../memory/db.js";

export interface ClusterStatus {
  isPrimary: boolean;
  nodeId: string;
  workerCount: number;
  activeNodes: ClusterNodeRecord[];
}

export class ClusterManager {
  private nodeId: string;
  private isPrimary: boolean;
  private workerCount: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(customWorkerCount?: number) {
    this.isPrimary = cluster.isPrimary;
    this.nodeId = this.isPrimary
      ? `primary_${process.pid}`
      : `worker_${cluster.worker?.id || process.pid}`;
    
    // Cloud / Container Environment Optimization:
    // Spawning node cluster workers inside a 512MB RAM cloud container (Railway/Docker/Render)
    // multiplies Node process baseline memory and causes instant Out of Memory (OOM) crashes.
    // Default to Single-Process Mode (workerCount = 0) unless ENABLE_CLUSTER=true or WORKER_COUNT > 0 is set.
    const envWorkerCount = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT, 10) : undefined;
    const enableCluster = process.env.ENABLE_CLUSTER === "true" || process.env.ENABLE_CLUSTER === "1";

    if (customWorkerCount !== undefined) {
      this.workerCount = customWorkerCount;
    } else if (envWorkerCount !== undefined) {
      this.workerCount = Math.max(0, envWorkerCount);
    } else if (enableCluster) {
      const numCores = os.cpus().length;
      this.workerCount = Math.max(1, Math.min(4, numCores));
    } else {
      this.workerCount = 0; // Default: Single process mode for container memory safety
    }
  }

  /**
   * Initializes the cluster environment.
   * If Primary: Spawns worker processes and monitors health.
   * If Worker: Registers IPC message listeners and executes work.
   */
  public startCluster(onWorkerStart?: () => void): ClusterStatus {
    if (this.isPrimary) {
      if (this.workerCount > 0) {
        console.log(`⚡ [Cluster Engine] Primary Node active (PID: ${process.pid}) — Spawning ${this.workerCount} Cluster Workers...`);
      } else {
        console.log(`⚡ [Cluster Engine] Single-Process Mode active (PID: ${process.pid}) — Container Memory Optimized.`);
      }
      
      this.registerHeartbeat("primary");

      // Spawn workers if enabled
      for (let i = 0; i < this.workerCount; i++) {
        this.spawnWorker();
      }

      cluster.on("exit", (worker, code, signal) => {
        console.warn(`⚠️ [Cluster Engine] Worker ${worker.id} (PID: ${worker.process.pid}) died (Code: ${code}, Signal: ${signal}). Re-spawning replacement...`);
        this.spawnWorker();
      });

    } else {
      console.log(`👷 [Cluster Engine] Worker Node active (ID: ${cluster.worker?.id}, PID: ${process.pid})`);
      this.registerHeartbeat("worker");

      process.on("message", (msg: any) => {
        if (msg.type === "PING") {
          if (process.send) process.send({ type: "PONG", pid: process.pid });
        }
      });

      if (onWorkerStart) onWorkerStart();
    }

    return this.getStatus();
  }

  private spawnWorker() {
    const worker = cluster.fork();
    worker.on("message", (msg) => {
      if (msg && msg.type === "TASK_COMPLETED") {
        console.log(`[Cluster Primary] Worker ${worker.id} finished task: ${msg.taskId}`);
      }
    });
  }

  private registerHeartbeat(role: "primary" | "worker") {
    const update = () => {
      dbSaveClusterNode({
        nodeId: this.nodeId,
        role,
        pid: process.pid,
        activeTasks: 0,
        lastHeartbeat: Date.now(),
      });
    };

    update();
    this.heartbeatTimer = setInterval(update, 5000);
  }

  public getStatus(): ClusterStatus {
    const nodes = dbGetClusterNodes();
    // Active nodes within last 15 seconds
    const activeNodes = nodes.filter((n) => Date.now() - n.lastHeartbeat < 15000);

    return {
      isPrimary: this.isPrimary,
      nodeId: this.nodeId,
      workerCount: this.isPrimary ? Object.keys(cluster.workers || {}).length : 0,
      activeNodes,
    };
  }

  public stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
}

export const clusterManager = new ClusterManager();

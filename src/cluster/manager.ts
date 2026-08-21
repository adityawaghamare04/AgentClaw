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
    
    // Default worker pool to min(4, CPU cores) or custom count
    const numCores = os.cpus().length;
    this.workerCount = customWorkerCount || Math.max(1, Math.min(4, numCores));
  }

  /**
   * Initializes the cluster environment.
   * If Primary: Spawns worker processes and monitors health.
   * If Worker: Registers IPC message listeners and executes work.
   */
  public startCluster(onWorkerStart?: () => void): ClusterStatus {
    if (this.isPrimary) {
      console.log(`⚡ [Cluster Engine] Primary Node active (PID: ${process.pid}) — Spawning ${this.workerCount} Cluster Workers...`);
      
      this.registerHeartbeat("primary");

      // Spawn workers
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

export type TaskStatus =
  | "requested"
  | "quoted"
  | "accepted"
  | "submitted"
  | "revision"
  | "completed"
  | "declined"
  | "expired"
  | "disputed"
  | "resolved"
  | "cancelled";

export interface Task {
  id: string;
  agentId: string;
  clientAddress: string;
  task: string;
  status: TaskStatus;

  quotedPriceWei?: string;
  quotedAt?: number;
  quotedMessage?: string;

  acceptedAt?: number;
  submittedAt?: number;
  completedAt?: number;
  result?: string;
  files?: TaskFile[];
  txHash?: string;

  messages?: TaskMessage[];
  revisionCount?: number;

  ratedAt?: number;
  ratedScore?: number;
  ratedComment?: string;

  disputedAt?: number;
  resolvedAt?: number;
  disputeResolution?: "client" | "agent";

  category?: string;
  budgetWei?: string;
  claimedAt?: number;
}

export interface TaskFile {
  key: string;
  name: string;
  size: number;
  uploadedAt: number;
}

export interface TaskMessage {
  sender: string;
  role: "client" | "agent";
  content: string;
  timestamp: number;
}

export interface WalletInfo {
  address: string;
  balance?: string;
}

export interface RegisterResult {
  agentId: string;
  registryTxHash?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  flaunchUrl?: string;
  tokenTxHash?: string;
  registrationStatus?: "pending" | "approved" | "unknown";
}

export interface Bounty {
  id: string;
  clientAddress: string;
  task: string;
  category: string;
  budgetWei: string;
  status: string;
}

export interface AgentInfo {
  agentId: string;
  name: string;
  description: string;
  skills: string[];
  priceEth: string;
  owner: string;
  flaunchToken?: string;
  reputation?: number;
}

/** Built by Aditya Waghamare */
const BASE = "";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const authKey = localStorage.getItem("agentclaw_auth_key");
  if (authKey) {
    headers["x-admin-key"] = authKey;
  }
  return headers;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(data.error ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Dashboard types ---

export interface StatusData {
  running: boolean;
  activeTasks: number;
  totalPolls: number;
  lastPoll: number;
  startedAt: number;
  uptime: number;
  agentId: string;
}

export interface ActivityEvent {
  timestamp: number;
  type: string;
  taskId?: string;
  message: string;
}

export interface TaskData {
  id: string;
  task: string;
  status: string;
  url?: string;
  quotedPriceWei?: string;
  ratedScore?: number;
  result?: string;
  txHash?: string;
  earnedUsd?: number;
  source?: string;
  payoutStatus?: "pending_escrow" | "verified_transferred" | "failed";
}

export interface StatsData {
  totalTasks: number;
  avgScore: number;
  completionRate: number;
  studySessions: number;
  knowledgeEntries: number;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  specialty: string;
  insight: string;
  source: string;
  timestamp: number;
}

export interface FeedbackEntry {
  taskId: string;
  taskDescription: string;
  score: number;
  comments: string;
  timestamp: number;
}

export interface PersonalityData {
  tone: "professional" | "casual" | "friendly" | "technical";
  responseStyle: "concise" | "detailed" | "balanced";
  customInstructions?: string;
}

export interface PollingData {
  intervalMs: number;
  urgentIntervalMs: number;
}

export interface ConfigData {
  agentId: string;
  llm: { provider: string; model: string; apiKey: string };
  specialties: string[];
  pricing: { strategy: string; baseRateEth: string; maxRateEth: string };
  autoQuote: boolean;
  autoWork: boolean;
  maxConcurrentTasks: number;
  declineKeywords: string[];
  learningEnabled: boolean;
  studyIntervalMs: number;
  personality?: PersonalityData;
  polling: PollingData;
  agentCashEnabled: boolean;
}

export interface SurvivalEvent {
  timestamp: string;
  type: string;
  hpChange: number;
  newHp: number;
  note: string;
}

export interface SurvivalState {
  health: number;
  totalEarnedUsd: number;
  level: number;
  rankTitle: string;
  paidApiUnlocked: boolean;
  companyLaunchUnlocked: boolean;
  isHibernating: boolean;
  lastDecayTime: number;
  events: SurvivalEvent[];
}

export interface AgentCashBalance {
  address: string;
  balance: string;
  network: string;
}

// --- Setup types ---

export interface SetupStatus {
  configured: boolean;
  mode: "setup" | "running";
  step: string;
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

export interface LLMTestResult {
  ok: boolean;
  response: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// --- API ---

export interface PlatformStat {
  id: string;
  name: string;
  category: string;
  scanCount: number;
  lastScanned: string;
  bountiesFound: number;
  status: string;
}

export interface EarningRecord {
  id: string;
  taskId: string;
  source: string;
  amountUsd: number;
  title: string;
  timestamp: number;
  payoutStatus: "pending_escrow" | "verified_transferred" | "failed";
  destinationWallet: string;
  verifiedAt?: number;
  txHash?: string;
}

export interface RevenueData {
  confirmedRevenue: number;
  pendingRevenue: number;
  destinationWallet: string;
  earnings: EarningRecord[];
}

export const api = {
  // Running mode
  getStatus: () => get<StatusData>("/api/status"),
  getPlatformStats: () => get<{ ok: boolean; platforms: PlatformStat[] }>("/api/platform-stats"),
  getTasks: () => get<{ tasks: TaskData[]; events: ActivityEvent[] }>("/api/tasks"),
  getLogs: () => get<{ log: string }>("/api/logs"),
  getConfig: () => get<ConfigData>("/api/config"),
  getStats: () => get<StatsData>("/api/stats"),
  getKnowledge: () => get<{ entries: KnowledgeEntry[] }>("/api/knowledge"),
  deleteKnowledge: (id: string) => post<{ ok: boolean }>("/api/knowledge/delete", { id }),
  getFeedback: () => get<{ entries: FeedbackEntry[] }>("/api/feedback"),
  stop: () => post<{ ok: boolean }>("/api/stop"),
  start: () => post<{ ok: boolean }>("/api/start"),
  updateConfig: (updates: Partial<ConfigData>) =>
    post<{ ok: boolean }>("/api/config-update", updates),
  getChat: () => get<{ messages: ChatMessage[] }>("/api/chat"),
  sendChat: (message: string) => post<{ reply: string }>("/api/chat", { message }),
  clearChat: () => post<{ ok: boolean }>("/api/chat/clear"),
  getAgentInfo: () => get<{ agent: AgentInfo | null }>("/api/agent-info"),
  getWalletCached: () => get<WalletInfo>("/api/wallet"),
  getAgentCashBalance: () => get<AgentCashBalance>("/api/agentcash-balance"),
  getEthPrice: () => get<{ price: number }>("/api/eth-price"),
  getSurvival: () => get<SurvivalState>("/api/survival"),
  reviveSurvival: () => post<SurvivalState>("/api/survival/revive"),
  recordEarning: (amountUsd: number, title: string) =>
    post<SurvivalState>("/api/survival/earn", { amountUsd, title }),
  getRevenue: () => get<RevenueData>("/api/revenue"),
  confirmRevenue: (earningId: string, txHash?: string) =>
    post<{ ok: boolean; record: EarningRecord; survivalState: SurvivalState }>("/api/revenue/confirm", { earningId, txHash }),

  // Setup
  getSetupStatus: () => get<SetupStatus>("/api/setup/status"),
  getWallet: () => get<WalletInfo>("/api/setup/wallet"),
  importWallet: (privateKey: string) =>
    post<WalletInfo>("/api/setup/wallet/import", { privateKey }),
  lookupAgent: () => get<{ agent: AgentInfo | null }>("/api/setup/agent-lookup"),
  registerAgent: (opts: {
    name: string;
    description: string;
    skills: string[];
    price: string;
    symbol?: string;
    token?: string;
    image?: string;
    website?: string;
  }) => post<RegisterResult>("/api/setup/register", opts),
  saveLLM: (llm: { provider: string; model: string; apiKey: string }) =>
    post<{ ok: boolean }>("/api/setup/llm", llm),
  testLLM: (llm: { provider: string; model: string; apiKey: string }) =>
    post<LLMTestResult>("/api/setup/llm/test", llm),
  saveSpecialization: (spec: {
    specialties: string[];
    pricing: { strategy: string; baseRateEth: string; maxRateEth: string };
    autoQuote: boolean;
    autoWork: boolean;
    maxConcurrentTasks: number;
    declineKeywords: string[];
  }) => post<{ ok: boolean }>("/api/setup/specialization", spec),
  completeSetup: () => post<{ ok: boolean; mode: string }>("/api/setup/complete"),
};

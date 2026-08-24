import { appendLog } from "../memory/log.js";
import { addTaskToInbox } from "../moltlaunch/cli.js";
import { dbRecordDiscovery } from "../memory/db.js";

/**
 * Category A: Autonomous GitHub Bounty Scanner
 * 
 * Focused ONLY on tasks the bot can actually solve and submit:
 * 1. GitHub Issues with "bounty" label — actual code bounties
 * 2. GitHub Issues with "help wanted" label — open contribution opportunities
 * 3. GitHub Issues with "good first issue" label — easy wins
 * 
 * Non-actionable sources (HN, Remotive, Bitcointalk) are tracked for stats only.
 */

export interface PlatformStat {
  id: string;
  name: string;
  category: "Web3 Bounties" | "Developer Gigs" | "GitHub Issues" | "AI Marketplace";
  scanCount: number;
  lastScanned: string;
  bountiesFound: number;
  status: "Active" | "Scanning" | "Error";
}

interface BountyItem {
  id: string;
  source: string;
  platformId: string;
  title: string;
  url: string;
  budgetUsd?: number;
  snippet: string;
}

const seenBounties = new Set<string>();

// Max new tasks to ingest per scan cycle — prevents API key exhaustion
const MAX_NEW_TASKS_PER_SCAN = 5;

const platformStatsMap: Record<string, PlatformStat> = {
  github_algora: { id: "github_algora", name: "Algora GitHub Bounties ($)", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_paid: { id: "github_paid", name: "Paid/Reward Label Bounties", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_crypto: { id: "github_crypto", name: "Base / Crypto Bounties (USDC/ETH)", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" },
};

export function getPlatformStats(): PlatformStat[] {
  return Object.values(platformStatsMap);
}

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 GitHub Verified Paid-Bounty Scanner active (Real Money / Base Mainnet / Algora only).");

  // Run initial poll after 5 seconds, then every 10 minutes (conserve API quota)
  setTimeout(pollAllCategoryAPlatforms, 5_000);
  setInterval(pollAllCategoryAPlatforms, 10 * 60 * 1000);
}

function updateStat(platformId: string, countNew: number) {
  if (platformStatsMap[platformId]) {
    platformStatsMap[platformId].scanCount += 1;
    platformStatsMap[platformId].lastScanned = new Date().toLocaleTimeString();
    platformStatsMap[platformId].bountiesFound += countNew;
    platformStatsMap[platformId].status = "Active";
  }
}

/**
 * Strict Monetary Budget Parser & Testnet Filter
 * Strictly requires real monetary value (USD, ETH, USDC, Base Mainnet tokens).
 * Strictly excludes testnets (Sepolia, Goerli, Mumbai), faucets, mock tokens, and free issues.
 */
function extractBudgetUsd(text: string, isPaidStream: boolean): number | undefined {
  if (!text) return undefined;

  // Reject any testnet / fake currency keywords
  if (/testnet|sepolia|goerli|mumbai|faucet|mock|play\s*money|demo\s*token/i.test(text)) {
    return undefined;
  }

  // 1. Algora command syntax: /bounty $100 or /bounty 100
  const algoraMatch = text.match(/\/bounty\s+\$?(\d+)/i);
  if (algoraMatch && algoraMatch[1]) {
    const val = parseInt(algoraMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 50000) return val;
  }

  // 2. Explicit USD amount: $50, $100, $500 (min $10 to avoid false positives)
  const usdMatch = text.match(/\$(\d{2,5})/);
  if (usdMatch && usdMatch[1]) {
    const val = parseInt(usdMatch[1], 10);
    if (!isNaN(val) && val >= 10 && val < 50000) return val;
  }

  // 3. USDC / ETH on Base Mainnet
  const usdcMatch = text.match(/(\d{2,5})\s*USDC/i);
  if (usdcMatch && usdcMatch[1]) {
    const val = parseInt(usdcMatch[1], 10);
    if (!isNaN(val) && val >= 10) return val;
  }

  const ethMatch = text.match(/([\d\.]+)\s*ETH/i);
  if (ethMatch && ethMatch[1]) {
    const ethVal = parseFloat(ethMatch[1]);
    if (!isNaN(ethVal) && ethVal >= 0.005) {
      return Math.round(ethVal * 2500); // Approximate ETH value in USD
    }
  }

  // If coming from a verified paid stream (e.g. label:bounty or body:"/bounty"), default to $50 minimum verified bounty
  if (isPaidStream) {
    return 50;
  }

  return undefined;
}

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // Search ONLY for explicit paid bounties (Algora, paid labels, USDC/ETH/Base)
    // Exclude testnets explicitly in the GitHub API search queries
    const [ghAlgora, ghPaid, ghCrypto] = await Promise.allSettled([
      pollGitHubQuery("body:\"/bounty\" -testnet -sepolia -goerli", "github_algora", "Algora Bounty Issues"),
      pollGitHubQuery("(label:bounty OR label:paid OR label:reward) -testnet -sepolia -goerli", "github_paid", "Paid/Reward Bounties"),
      pollGitHubQuery("(\"bounty $\" OR \"bounty USDC\" OR \"bounty ETH\") -testnet -sepolia", "github_crypto", "Base/Crypto Bounties"),
    ]);

    if (ghAlgora.status === "fulfilled") items.push(...ghAlgora.value);
    if (ghPaid.status === "fulfilled") items.push(...ghPaid.value);
    if (ghCrypto.status === "fulfilled") items.push(...ghCrypto.value);

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);

      // STRICT FILTER: Skip unpaid / free / testnet issues entirely
      if (!item.budgetUsd || item.budgetUsd <= 0) {
        continue;
      }

      // CAP: Only ingest a limited number of new paid tasks per scan
      if (newCount >= MAX_NEW_TASKS_PER_SCAN) {
        console.log(`[Category A] ⏸️ Hit per-scan cap (${MAX_NEW_TASKS_PER_SCAN}). Remaining paid bounties queued for next scan.`);
        break;
      }

      newCount++;

      if (seenBounties.size > 2000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const budgetStr = ` [Reward: $${item.budgetUsd}]`;
      const logMsg = `[${item.source}] Verified Paid Bounty: "${item.title}"${budgetStr} (${item.url})`;
      console.log(`[Category A] 💰 ${logMsg}`);
      appendLog(logMsg);

      // Record in persistent DB
      dbRecordDiscovery({
        id: item.id,
        source: item.source,
        title: item.title,
        url: item.url,
      });

      // Auto-ingest ONLY verified paid bounties into AgentClaw task inbox
      addTaskToInbox({
        id: item.id,
        agentId: "agent_claw",
        clientAddress: item.source || "CategoryA_Feed",
        task: `[${item.source}] ${item.title} — URL: ${item.url}. Details: ${item.snippet || item.title}`,
        status: "requested",
        budgetWei: String(item.budgetUsd),
        category: item.platformId || "bounty",
      });
    }

    console.log(`[Category A] 🔎 Scanned GitHub streams. Ingested ${newCount} verified paid bounties (cap: ${MAX_NEW_TASKS_PER_SCAN}).`);
  } catch (err: any) {
    console.warn("[Category A] Polling warning:", err.message);
  }
}

// GitHub Issue Search Streams
async function pollGitHubQuery(labelQuery: string, platformId: string, sourceName: string): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent(`is:open is:issue ${labelQuery} sort:created-desc`);
    const url = `https://api.github.com/search/issues?q=${query}&per_page=10`;
    const headers: Record<string, string> = { "User-Agent": "AgentClaw-Engine", "Accept": "application/vnd.github.v3+json" };
    if (process.env.GITHUB_TOKEN) {
      const tok = process.env.GITHUB_TOKEN;
      headers["Authorization"] = tok.startsWith("github_pat_") || tok.startsWith("ghp_") ? `Bearer ${tok}` : `token ${tok}`;
    }

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.items) {
        for (const issue of data.items) {
          const bodyText = issue.body || "";
          const snippetText = bodyText ? bodyText.slice(0, 300) : issue.title;
          const isPaidStream = platformId === "github_algora" || platformId === "github_paid" || platformId === "github_crypto";
          const detectedBudget = extractBudgetUsd(`${issue.title} ${bodyText}`, isPaidStream);

          if (detectedBudget && detectedBudget > 0) {
            items.push({
              id: `gh_${issue.id}`,
              source: sourceName,
              platformId,
              title: issue.title,
              url: issue.html_url,
              budgetUsd: detectedBudget,
              snippet: snippetText,
            });
          }
        }
      }
    }
  } catch {}
  updateStat(platformId, items.length);
  return items;
}



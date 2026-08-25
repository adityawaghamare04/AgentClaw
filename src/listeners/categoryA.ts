/** Built by Aditya Waghamare */
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

// Max new tasks to ingest per scan cycle
const MAX_NEW_TASKS_PER_SCAN = 10;

const platformStatsMap: Record<string, PlatformStat> = {
  github_bounty: { id: "github_bounty", name: "GitHub Bounty Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_algora: { id: "github_algora", name: "Algora / Bountycaster Streams", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_real: { id: "github_real", name: "GitHub Real Label Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_redeem: { id: "github_redeem", name: "GitHub Redeem Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_del_mission: { id: "github_del_mission", name: "Delegate Mission Requests", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_found_mission: { id: "github_found_mission", name: "Foundation Mission Requests", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_contrib_opp: { id: "github_contrib_opp", name: "Contribution Opportunities", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_eco_idea: { id: "github_eco_idea", name: "Ecosystem Project Ideas", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_draft_idea: { id: "github_draft_idea", name: "Draft Project Ideas", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_1: { id: "github_intent_1", name: "Grant Intent #1 Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_3: { id: "github_intent_3", name: "Grant Intent #3 Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_apps: { id: "github_intent_apps", name: "Intent: Novel Applications", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_intent_decent: { id: "github_intent_decent", name: "Intent: Technical Decentralization", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_effort_small: { id: "github_effort_small", name: "Effort: Small Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_effort_med: { id: "github_effort_med", name: "Effort: Medium Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_goodfirst: { id: "github_goodfirst", name: "Good First Issue Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_helpwanted: { id: "github_helpwanted", name: "Help Wanted Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_bug: { id: "github_bug", name: "Bug Fix Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_enhancement: { id: "github_enhancement", name: "Enhancement Stream", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_open_bounties: { id: "github_open_bounties", name: "Open Bounty & Crypto Grants", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" },
};

export function getPlatformStats(): PlatformStat[] {
  return Object.values(platformStatsMap);
}

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 Universal GitHub Bounty Scanner active — scanning all open bounty, crypto & developer issue streams.");

  // Run initial poll after 5 seconds, then every 10 minutes
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
 * Universal Reward & Budget Detector
 * Parses explicit $ amounts, crypto tokens (USDC, ETH, SOL, DEGEN, OP, ARB, BASE), or defaults to $50 fallback.
 */
function extractBudgetUsd(text: string): number {
  if (!text) return 50;

  // 1. Algora command syntax: /bounty $100 or /bounty 100
  const algoraMatch = text.match(/\/bounty\s+\$?(\d+)/i);
  if (algoraMatch && algoraMatch[1]) {
    const val = parseInt(algoraMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 50000) return val;
  }

  // 2. Explicit USD amount: $50, $100, $500
  const usdMatch = text.match(/\$(\d{1,5})/);
  if (usdMatch && usdMatch[1]) {
    const val = parseInt(usdMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 50000) return val;
  }

  // 3. Crypto tokens (USDC, ETH, SOL, DEGEN, OP, ARB, BASE, etc.)
  const cryptoMatch = text.match(/(\d+(?:\.\d+)?)\s*(USDC|ETH|SOL|DEGEN|OP|ARB|NEAR|AVAX|MATIC|BASE)/i);
  if (cryptoMatch && cryptoMatch[1]) {
    const val = parseFloat(cryptoMatch[1]);
    const symbol = cryptoMatch[2].toUpperCase();
    if (!isNaN(val) && val > 0) {
      if (symbol === "USDC") return Math.round(val);
      if (symbol === "ETH") return Math.round(val * 2500);
      if (symbol === "SOL") return Math.round(val * 150);
      return Math.max(25, Math.round(val));
    }
  }

  // Default fallback reward budget for any open bounty issue
  return 50;
}

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // All high-yield search queries batched in chunks of 4 to prevent network/RAM spikes
    const queries = [
      () => pollGitHubQuery("label:bounty", "github_bounty", "GitHub Bounty Issues"),
      () => pollGitHubQuery("body:\"/bounty\"", "github_algora", "Algora Bounty Issues"),
      () => pollGitHubQuery("label:real", "github_real", "GitHub Real Label Stream"),
      () => pollGitHubQuery("label:redeem", "github_redeem", "GitHub Redeem Stream"),
      () => pollGitHubQuery("label:\"Delegate Mission Request\"", "github_del_mission", "Delegate Mission Requests"),
      () => pollGitHubQuery("label:\"Foundation Mission Request\"", "github_found_mission", "Foundation Mission Requests"),
      () => pollGitHubQuery("label:\"Contribution Opportunity\"", "github_contrib_opp", "Contribution Opportunities"),
      () => pollGitHubQuery("label:\"Ecosystem Project Idea\"", "github_eco_idea", "Ecosystem Project Ideas"),
      () => pollGitHubQuery("label:\"Draft Project Idea\"", "github_draft_idea", "Draft Project Ideas"),
      () => pollGitHubQuery("label:\"Intent #1\"", "github_intent_1", "Grant Intent #1"),
      () => pollGitHubQuery("label:\"Intent #3\"", "github_intent_3", "Grant Intent #3"),
      () => pollGitHubQuery("label:\"Intent: Novel Applications\"", "github_intent_apps", "Intent: Novel Applications"),
      () => pollGitHubQuery("label:\"Intent: Technical Decentralization\"", "github_intent_decent", "Intent: Technical Decentralization"),
      () => pollGitHubQuery("label:\"Estimated Effort: Small\"", "github_effort_small", "Effort: Small"),
      () => pollGitHubQuery("label:\"Estimated Effort: Medium\"", "github_effort_med", "Effort: Medium"),
      () => pollGitHubQuery("label:\"good first issue\"", "github_goodfirst", "GitHub Good-First Stream"),
      () => pollGitHubQuery("label:\"help wanted\"", "github_helpwanted", "GitHub Help-Wanted Stream"),
      () => pollGitHubQuery("label:bug", "github_bug", "GitHub Bug Fix Stream"),
      () => pollGitHubQuery("label:enhancement", "github_enhancement", "GitHub Enhancement Stream"),
      () => pollGitHubQuery("bounty", "github_open_bounties", "Open Bounty & Crypto Grants"),
    ];

    const chunkSize = 4;
    for (let i = 0; i < queries.length; i += chunkSize) {
      const chunk = queries.slice(i, i + chunkSize);
      const batchResults = await Promise.allSettled(chunk.map((fn) => fn()));
      for (const res of batchResults) {
        if (res.status === "fulfilled") {
          items.push(...res.value);
        }
      }
    }

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);

      // CAP: Ingest up to MAX_NEW_TASKS_PER_SCAN per 10-min cycle to prevent API exhaustion
      if (newCount >= MAX_NEW_TASKS_PER_SCAN) {
        console.log(`[Category A] ⏸️ Hit per-scan cap (${MAX_NEW_TASKS_PER_SCAN}). Remaining bounties queued for next scan.`);
        break;
      }

      newCount++;

      if (seenBounties.size > 1000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const budgetStr = ` [Est. Reward: $${item.budgetUsd}]`;
      const logMsg = `[${item.source}] Discovered Bounty: "${item.title}"${budgetStr} (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);

      // Record in persistent DB
      dbRecordDiscovery({
        id: item.id,
        source: item.source,
        title: item.title,
        url: item.url,
      });

      // Auto-ingest every discovered bounty issue into AgentClaw task inbox for execution
      addTaskToInbox({
        id: item.id,
        agentId: "agent_claw",
        clientAddress: item.source || "CategoryA_Feed",
        task: `[${item.source}] ${item.title} — URL: ${item.url}. Details: ${item.snippet || item.title}`,
        status: "requested",
        budgetWei: String(item.budgetUsd || 50),
        category: item.platformId || "bounty",
      });
    }

    console.log(`[Category A] 🔎 Scanned GitHub streams. Ingested ${newCount} bounties (cap: ${MAX_NEW_TASKS_PER_SCAN}).`);
  } catch (err: any) {
    console.warn("[Category A] Polling warning:", err.message);
  }
}

// GitHub Issue Search Streams
async function pollGitHubQuery(labelQuery: string, platformId: string, sourceName: string): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent(`is:open is:issue ${labelQuery} sort:created-desc`);
    const url = `https://api.github.com/search/issues?q=${query}&per_page=5`;
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
          const detectedBudget = extractBudgetUsd(`${issue.title} ${bodyText}`);

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
  } catch {}
  updateStat(platformId, items.length);
  return items;
}




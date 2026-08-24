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
  github_algora: { id: "github_algora", name: "Algora GitHub Bounties", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_bounty: { id: "github_bounty", name: "GitHub Bounty Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_paid: { id: "github_paid", name: "GitHub Paid/Reward Streams", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_helpwanted: { id: "github_helpwanted", name: "GitHub Help-Wanted Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_goodfirst: { id: "github_goodfirst", name: "GitHub Good-First-Issue", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" },
};

export function getPlatformStats(): PlatformStat[] {
  return Object.values(platformStatsMap);
}

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 GitHub High-Pay Bounty Scanner active across 5 issue streams.");

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

function extractBudgetUsd(text: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(/\/bounty\s+\$?(\d+)/i) || text.match(/\$(\d{2,5})/);
  if (match && match[1]) {
    const val = parseInt(match[1].replace(/,/g, ""), 10);
    if (!isNaN(val) && val > 0 && val < 50000) return val;
  }
  return undefined;
}

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // Fetch from GitHub — including Algora bounties, paid/reward issues, and standard streams
    const [ghAlgora, ghBounty, ghPaid, ghHelp, ghGood] = await Promise.allSettled([
      pollGitHubQuery("body:\"/bounty\"", "github_algora", "Algora Bounty Issues"),
      pollGitHubQuery("label:bounty", "github_bounty", "GitHub Bounty Issues"),
      pollGitHubQuery("label:paid OR label:reward", "github_paid", "GitHub Paid/Reward Streams"),
      pollGitHubQuery("label:\"help wanted\"", "github_helpwanted", "GitHub Help-Wanted Issues"),
      pollGitHubQuery("label:\"good first issue\"", "github_goodfirst", "GitHub Good-First-Issue"),
    ]);

    if (ghAlgora.status === "fulfilled") items.push(...ghAlgora.value);
    if (ghBounty.status === "fulfilled") items.push(...ghBounty.value);
    if (ghPaid.status === "fulfilled") items.push(...ghPaid.value);
    if (ghHelp.status === "fulfilled") items.push(...ghHelp.value);
    if (ghGood.status === "fulfilled") items.push(...ghGood.value);

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);

      // CAP: Only ingest a limited number of new tasks per scan to prevent API exhaustion
      if (newCount >= MAX_NEW_TASKS_PER_SCAN) {
        console.log(`[Category A] ⏸️ Hit per-scan cap (${MAX_NEW_TASKS_PER_SCAN}). Remaining tasks queued for next scan.`);
        break;
      }

      newCount++;

      if (seenBounties.size > 2000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const budgetStr = item.budgetUsd ? ` [Budget: $${item.budgetUsd}]` : "";
      const logMsg = `[${item.source}] Discovered: "${item.title}"${budgetStr} (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);

      // Record in persistent DB
      dbRecordDiscovery({
        id: item.id,
        source: item.source,
        title: item.title,
        url: item.url,
      });

      // Auto-ingest GitHub bounties into AgentClaw task inbox
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

    console.log(`[Category A] 🔎 Scanned GitHub streams. Ingested ${newCount} new tasks (cap: ${MAX_NEW_TASKS_PER_SCAN}).`);
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


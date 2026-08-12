import { appendLog } from "../memory/log.js";
import { CURATED_BITCOINTALK_BOUNTIES } from "../data/bitcointalkBounties.js";
import { addTaskToInbox } from "../moltlaunch/cli.js";
import { verifyTaskEscrow } from "../tools/escrow.js";
import { dbRecordDiscovery } from "../memory/db.js";

/**
 * Category A: Autonomous Multi-Platform Feed Scraper
 * Focused strictly on active, high-yield task platforms:
 * 1. GitHub Bounty Issues
 * 2. GitHub Help Wanted Issues
 * 3. GitHub Good First Issues
 * 4. Bitcointalk Web3 Bounty Campaigns
 * 5. Hacker News (YC) Hiring & Contracting Threads
 * 6. Remotive Remote Developer Gigs
 * 7. MoltLaunch AI Marketplace
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

const platformStatsMap: Record<string, PlatformStat> = {
  github_bounty: { id: "github_bounty", name: "GitHub Bounty Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_helpwanted: { id: "github_helpwanted", name: "GitHub Help-Wanted Issues", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  github_goodfirst: { id: "github_goodfirst", name: "GitHub Good-First-Issue", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  bitcointalk: { id: "bitcointalk", name: "Bitcointalk Bounties", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  hackernews: { id: "hackernews", name: "Hacker News (YC)", category: "Developer Gigs", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  remotive: { id: "remotive", name: "Remotive Dev Jobs", category: "Developer Gigs", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" },
};

export function getPlatformStats(): PlatformStat[] {
  return Object.values(platformStatsMap);
}

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 High-Yield Multi-Platform Scraper active across 7 real bounty streams.");

  // Run initial poll after 3 seconds, then every 5 minutes
  setTimeout(pollAllCategoryAPlatforms, 3_000);
  setInterval(pollAllCategoryAPlatforms, 5 * 60 * 1000);
}

function updateStat(platformId: string, countNew: number) {
  if (platformStatsMap[platformId]) {
    platformStatsMap[platformId].scanCount += 1;
    platformStatsMap[platformId].lastScanned = new Date().toLocaleTimeString();
    platformStatsMap[platformId].bountiesFound += countNew;
    platformStatsMap[platformId].status = "Active";
  }
}

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // Parallel fetch from all active high-yield endpoints
    const [
      ghBounty, ghHelp, ghGood, bitcointalk, hackernews, remotive
    ] = await Promise.allSettled([
      pollGitHubQuery("label:bounty", "github_bounty", "GitHub Bounty Issues"),
      pollGitHubQuery("label:\"help wanted\"", "github_helpwanted", "GitHub Help-Wanted Issues"),
      pollGitHubQuery("label:\"good first issue\"", "github_goodfirst", "GitHub Good-First-Issue"),
      pollBitcointalk(),
      pollHackerNews(),
      pollRemotive(),
    ]);

    if (ghBounty.status === "fulfilled") items.push(...ghBounty.value);
    if (ghHelp.status === "fulfilled") items.push(...ghHelp.value);
    if (ghGood.status === "fulfilled") items.push(...ghGood.value);
    if (bitcointalk.status === "fulfilled") items.push(...bitcointalk.value);
    if (hackernews.status === "fulfilled") items.push(...hackernews.value);
    if (remotive.status === "fulfilled") items.push(...remotive.value);

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);
      newCount++;

      if (seenBounties.size > 2000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const logMsg = `[${item.source}] Discovered: "${item.title}" (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);

      // Record in persistent DB
      dbRecordDiscovery({
        id: item.id,
        source: item.source,
        title: item.title,
        url: item.url,
      });

      // Fintech Escrow Guard: Verify task budget & backing before committing compute
      const escrowCheck = await verifyTaskEscrow(item.source, item.budgetUsd ? String(item.budgetUsd) : undefined);
      if (!escrowCheck.verified) {
        console.log(`[Category A] ⚠️ Skipped task: ${escrowCheck.reason}`);
        continue;
      }

      // Auto-ingest verified bounties into AgentClaw task inbox
      addTaskToInbox({
        id: item.id,
        agentId: "agent_claw",
        clientAddress: item.source || "CategoryA_Feed",
        task: `[${item.source}] ${item.title} — URL: ${item.url}. Details: ${item.snippet || item.title}`,
        status: "requested",
        budgetWei: String(escrowCheck.estimatedBudgetUsd),
        category: item.platformId || "bounty",
      });
    }

    console.log(`[Category A] 🔎 Scanned active streams. Found ${newCount} new tasks.`);
  } catch (err: any) {
    console.warn("[Category A] Polling warning:", err.message);
  }
}

// 1, 2, 3. GitHub Issue Search Streams
async function pollGitHubQuery(labelQuery: string, platformId: string, sourceName: string): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent(`is:open is:issue ${labelQuery} sort:created-desc`);
    const url = `https://api.github.com/search/issues?q=${query}&per_page=15`;
    const headers: Record<string, string> = { "User-Agent": "AgentClaw-Engine", "Accept": "application/vnd.github.v3+json" };
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.items) {
        for (const issue of data.items) {
          items.push({
            id: `gh_${issue.id}`,
            source: sourceName,
            platformId,
            title: issue.title,
            url: issue.html_url,
            snippet: issue.body ? issue.body.slice(0, 300) : issue.title,
          });
        }
      }
    }
  } catch {}
  updateStat(platformId, items.length);
  return items;
}

// 4. Bitcointalk Bounties
async function pollBitcointalk(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://bitcointalk.org/index.php?type=rss;action=.xml;board=238.0", {
      headers: { "User-Agent": "AgentClaw-Engine" },
    });
    if (res.ok) {
      const xml = await res.text();
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g;
      let match;
      let count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 10) {
        const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        const url = match[2].trim();
        items.push({
          id: `bitcointalk_${url.split("topic=")[1] || Math.random()}`,
          source: "Bitcointalk",
          platformId: "bitcointalk",
          title: title || "Bitcointalk Bounty Campaign",
          url: url || "https://bitcointalk.org/index.php?board=238.0",
          snippet: title,
        });
        count++;
      }
    }
  } catch {}

  // Include curated Bitcointalk bounty campaign database (78 active campaigns)
  for (const b of CURATED_BITCOINTALK_BOUNTIES) {
    if (!items.some((existing) => existing.id === b.id)) {
      items.push(b);
    }
  }

  updateStat("bitcointalk", items.length);
  return items;
}

// 5. Hacker News (YC)
async function pollHackerNews(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://hn.algolia.com/api/v1/search_by_date?tags=story&query=who+is+hiring", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.hits)) {
        for (const hit of data.hits.slice(0, 10)) {
          items.push({ id: `hn_${hit.objectID}`, source: "Hacker News", platformId: "hackernews", title: hit.title || "HN Who is Hiring", url: `https://news.ycombinator.com/item?id=${hit.objectID}`, snippet: hit.title });
        }
      }
    }
  } catch {}
  updateStat("hackernews", items.length);
  return items;
}

// 6. Remotive Dev Jobs
async function pollRemotive(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://remotive.com/api/remote-jobs?category=software-dev&limit=15", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.jobs)) {
        for (const j of data.jobs.slice(0, 15)) {
          items.push({ id: `remotive_${j.id}`, source: "Remotive", platformId: "remotive", title: j.title, url: j.url, snippet: j.category || j.title });
        }
      }
    }
  } catch {}
  updateStat("remotive", items.length);
  return items;
}

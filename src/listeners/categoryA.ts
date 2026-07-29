import { appendLog } from "../memory/log.js";
import { CURATED_BITCOINTALK_BOUNTIES } from "../data/bitcointalkBounties.js";
import { addTaskToInbox } from "../moltlaunch/cli.js";

/**
 * Category A: Autonomous Multi-Platform Feed Scraper
 * Scans 16 public platforms for open bounties, dev gigs, and freelance tasks:
 * 1. GitHub Issue Search
 * 2. Reddit r/forhire
 * 3. Reddit r/freelance_forhire
 * 4. Reddit r/jobbit
 * 5. Algora (algora.io)
 * 6. Bountycaster (bountycaster.xyz)
 * 7. Gitcoin Bounties
 * 8. IssueHunt (issuehunt.io)
 * 9. Opire (opire.dev)
 * 10. Superteam Earn (earn.superteam.fun)
 * 11. Remotive Jobs (remotive.com)
 * 12. Hacker News "Who is Hiring" (news.ycombinator.com)
 * 13. DEV.to Gigs (dev.to)
 * 14. CryptoJobsList (cryptojobslist.com)
 * 15. Web3.career
 * 16. MoltLaunch AI Marketplace
 */

export interface PlatformStat {
  id: string;
  name: string;
  category: "Web3 Bounties" | "Developer Gigs" | "GitHub Issues" | "Reddit Communities" | "AI Marketplace";
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
  github: { id: "github", name: "GitHub Issue Search", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  reddit_forhire: { id: "reddit_forhire", name: "Reddit r/forhire", category: "Reddit Communities", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  reddit_freelance: { id: "reddit_freelance", name: "Reddit r/freelance_forhire", category: "Reddit Communities", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  reddit_jobbit: { id: "reddit_jobbit", name: "Reddit r/jobbit", category: "Reddit Communities", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  algora: { id: "algora", name: "Algora.io", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  bountycaster: { id: "bountycaster", name: "Bountycaster", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  gitcoin: { id: "gitcoin", name: "Gitcoin Bounties", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  issuehunt: { id: "issuehunt", name: "IssueHunt", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  opire: { id: "opire", name: "Opire.dev", category: "GitHub Issues", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  superteam: { id: "superteam", name: "Superteam Earn", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  remotive: { id: "remotive", name: "Remotive Dev Jobs", category: "Developer Gigs", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  hackernews: { id: "hackernews", name: "Hacker News (YC)", category: "Developer Gigs", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  devto: { id: "devto", name: "DEV.to Collabs", category: "Developer Gigs", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  cryptojobs: { id: "cryptojobs", name: "CryptoJobsList", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  web3career: { id: "web3career", name: "Web3.career", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  bitcointalk: { id: "bitcointalk", name: "Bitcointalk Bounties", category: "Web3 Bounties", scanCount: 0, lastScanned: "Never", bountiesFound: 0, status: "Active" },
  moltlaunch: { id: "moltlaunch", name: "MoltLaunch Network", category: "AI Marketplace", scanCount: 1, lastScanned: "Live Stream", bountiesFound: 0, status: "Active" },
};

export function getPlatformStats(): PlatformStat[] {
  return Object.values(platformStatsMap);
}

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 Multi-Platform Autonomous Scraper active across 16 platforms.");

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

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // Parallel fetch from all 14 scanner endpoints
    const [
      gh, reddit, algora, bountycaster, gitcoin, issuehunt, opire,
      superteam, remotive, hackernews, devto, cryptojobs, web3career, bitcointalk
    ] = await Promise.allSettled([
      pollGitHubBounties(),
      pollRedditSubreddits(),
      pollAlgora(),
      pollBountycaster(),
      pollGitcoin(),
      pollIssueHunt(),
      pollOpire(),
      pollSuperteam(),
      pollRemotive(),
      pollHackerNews(),
      pollDevTo(),
      pollCryptoJobsList(),
      pollWeb3Career(),
      pollBitcointalk(),
    ]);

    if (gh.status === "fulfilled") items.push(...gh.value);
    if (reddit.status === "fulfilled") items.push(...reddit.value);
    if (algora.status === "fulfilled") items.push(...algora.value);
    if (bountycaster.status === "fulfilled") items.push(...bountycaster.value);
    if (gitcoin.status === "fulfilled") items.push(...gitcoin.value);
    if (issuehunt.status === "fulfilled") items.push(...issuehunt.value);
    if (opire.status === "fulfilled") items.push(...opire.value);
    if (superteam.status === "fulfilled") items.push(...superteam.value);
    if (remotive.status === "fulfilled") items.push(...remotive.value);
    if (hackernews.status === "fulfilled") items.push(...hackernews.value);
    if (devto.status === "fulfilled") items.push(...devto.value);
    if (cryptojobs.status === "fulfilled") items.push(...cryptojobs.value);
    if (web3career.status === "fulfilled") items.push(...web3career.value);
    if (bitcointalk.status === "fulfilled") items.push(...bitcointalk.value);

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);
      newCount++;

      if (seenBounties.size > 1000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const logMsg = `[${item.source}] Discovered: "${item.title}" (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);

      // Auto-ingest into AgentClaw task inbox so LLM task solver executes work
      addTaskToInbox({
        id: item.id,
        agentId: "agent_claw",
        clientAddress: item.source || "CategoryA_Feed",
        task: `[${item.source}] ${item.title} — URL: ${item.url}. Details: ${item.snippet || item.title}`,
        status: "requested",
        budgetWei: item.budgetUsd ? String(item.budgetUsd) : "50",
        category: item.platformId || "bounty",
      });
    }

    console.log(`[Category A] 🔎 Scanned 16 platforms. Found ${newCount} new tasks.`);
  } catch (err: any) {
    console.warn("[Category A] Polling warning:", err.message);
  }
}

// 1. GitHub
async function pollGitHubBounties(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent("is:open is:issue label:bounty,help-wanted sort:created-desc");
    const url = `https://api.github.com/search/issues?q=${query}&per_page=10`;
    const headers: Record<string, string> = { "User-Agent": "AgentClaw-Engine", "Accept": "application/vnd.github.v3+json" };
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.items) {
        for (const issue of data.items) {
          items.push({ id: `gh_${issue.id}`, source: "GitHub Bounties", platformId: "github", title: issue.title, url: issue.html_url, snippet: issue.body ? issue.body.slice(0, 200) : issue.title });
        }
      }
    }
  } catch { }
  updateStat("github", items.length);
  return items;
}

// 2, 3, 4. Reddit
async function pollRedditSubreddits(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  const subs = [{ id: "reddit_forhire", name: "forhire" }, { id: "reddit_freelance", name: "freelance_forhire" }, { id: "reddit_jobbit", name: "jobbit" }];

  for (const s of subs) {
    let subItems = 0;
    try {
      const res = await fetch(`https://www.reddit.com/r/${s.name}/new.json?limit=5`, { headers: { "User-Agent": "AgentClaw-Engine/1.0" } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data?.data?.children) {
          for (const child of data.data.children) {
            const post = child.data;
            if (post.title.toLowerCase().includes("hiring")) {
              items.push({ id: `reddit_${post.id}`, source: `Reddit r/${s.name}`, platformId: s.id, title: post.title, url: `https://reddit.com${post.permalink}`, snippet: post.selftext ? post.selftext.slice(0, 200) : post.title });
              subItems++;
            }
          }
        }
      }
    } catch { }
    updateStat(s.id, subItems);
  }
  return items;
}

// 5. Algora
async function pollAlgora(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://algora.io/api/bounties?status=open&limit=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.bounties)) {
        for (const b of data.bounties) {
          items.push({ id: `algora_${b.id}`, source: "Algora", platformId: "algora", title: b.title || "Algora Bounty", url: b.issue_url || `https://algora.io/bounties/${b.id}`, budgetUsd: b.reward_amount, snippet: `Algora Bounty ($${b.reward_amount || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("algora", items.length);
  return items;
}

// 6. Bountycaster
async function pollBountycaster(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://www.bountycaster.xyz/api/bounties?limit=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.bounties)) {
        for (const b of data.bounties) {
          items.push({ id: `bountycaster_${b.id}`, source: "Bountycaster", platformId: "bountycaster", title: b.title || "Farcaster Bounty", url: b.url || `https://www.bountycaster.xyz/bounties/${b.id}`, budgetUsd: b.amount, snippet: `Bountycaster ($${b.amount || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("bountycaster", items.length);
  return items;
}

// 7. Gitcoin
async function pollGitcoin(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://gitcoin.co/api/v0.2/bounties/?is_open=true&limit=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const b of data) {
          items.push({ id: `gitcoin_${b.pk}`, source: "Gitcoin", platformId: "gitcoin", title: b.title, url: b.url, budgetUsd: b.value_in_usdt, snippet: `Gitcoin Bounty ($${b.value_in_usdt || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("gitcoin", items.length);
  return items;
}

// 8. IssueHunt
async function pollIssueHunt(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://issuehunt.io/api/issues?status=open&limit=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.issues)) {
        for (const b of data.issues) {
          items.push({ id: `issuehunt_${b.id}`, source: "IssueHunt", platformId: "issuehunt", title: b.title, url: b.url || `https://issuehunt.io/r/${b.id}`, budgetUsd: b.totalAmount, snippet: `IssueHunt ($${b.totalAmount || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("issuehunt", items.length);
  return items;
}

// 9. Opire
async function pollOpire(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://api.opire.dev/bounties?status=open", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const b of data) {
          items.push({ id: `opire_${b.id}`, source: "Opire", platformId: "opire", title: b.title || "Opire Micro-Bounty", url: b.issueUrl || `https://opire.dev/bounties/${b.id}`, budgetUsd: b.amount, snippet: `Opire ($${b.amount || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("opire", items.length);
  return items;
}

// 10. Superteam Earn
async function pollSuperteam(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://earn.superteam.fun/api/bounties", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const b of data.slice(0, 10)) {
          items.push({ id: `superteam_${b.id || Math.random()}`, source: "Superteam Earn", platformId: "superteam", title: b.title || "Superteam Bounty", url: b.url || "https://earn.superteam.fun", budgetUsd: b.rewardAmount, snippet: `Superteam Earn ($${b.rewardAmount || "Open"})` });
        }
      }
    }
  } catch { }
  updateStat("superteam", items.length);
  return items;
}

// 11. Remotive
async function pollRemotive(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://remotive.com/api/remote-jobs?category=software-dev&limit=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.jobs)) {
        for (const j of data.jobs.slice(0, 10)) {
          items.push({ id: `remotive_${j.id}`, source: "Remotive", platformId: "remotive", title: j.title, url: j.url, snippet: j.category || j.title });
        }
      }
    }
  } catch { }
  updateStat("remotive", items.length);
  return items;
}

// 12. Hacker News
async function pollHackerNews(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://hn.algolia.com/api/v1/search_by_date?tags=story&query=who+is+hiring", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.hits)) {
        for (const hit of data.hits.slice(0, 5)) {
          items.push({ id: `hn_${hit.objectID}`, source: "Hacker News", platformId: "hackernews", title: hit.title || "HN Who is Hiring", url: `https://news.ycombinator.com/item?id=${hit.objectID}`, snippet: hit.title });
        }
      }
    }
  } catch { }
  updateStat("hackernews", items.length);
  return items;
}

// 13. DEV.to
async function pollDevTo(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://dev.to/api/listings?category=collabs&per_page=10", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const l of data) {
          items.push({ id: `devto_${l.id}`, source: "DEV.to", platformId: "devto", title: l.title, url: `https://dev.to/listings/${l.slug}`, snippet: l.title });
        }
      }
    }
  } catch { }
  updateStat("devto", items.length);
  return items;
}

// 14. CryptoJobsList
async function pollCryptoJobsList(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://cryptojobslist.com/api/jobs/public", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const j of data.slice(0, 5)) {
          items.push({ id: `cryptojobs_${j.id || Math.random()}`, source: "CryptoJobsList", platformId: "cryptojobs", title: j.title || "Web3 Dev Gig", url: j.url || "https://cryptojobslist.com", snippet: j.title });
        }
      }
    }
  } catch { }
  updateStat("cryptojobs", items.length);
  return items;
}

// 15. Web3.career
async function pollWeb3Career(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://web3.career/api/v1/jobs", { headers: { "User-Agent": "AgentClaw-Engine" } });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data)) {
        for (const j of data.slice(0, 5)) {
          items.push({ id: `web3career_${j.id || Math.random()}`, source: "Web3.career", platformId: "web3career", title: j.title || "Web3 Contract Gig", url: j.url || "https://web3.career", snippet: j.title });
        }
      }
    }
  } catch { }
  updateStat("web3career", items.length);
  return items;
}

// 16. Bitcointalk Bounties
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

  // Include curated Bitcointalk bounty campaign database (78 campaigns) from src/data/bitcointalkBounties.ts
  for (const b of CURATED_BITCOINTALK_BOUNTIES) {
    if (!items.some((existing) => existing.id === b.id)) {
      items.push(b);
    }
  }

  updateStat("bitcointalk", items.length);
  return items;
}

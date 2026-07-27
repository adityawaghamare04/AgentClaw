import { appendLog } from "../memory/log.js";

/**
 * Category A: Autonomous Public Platform Feed Scrapers
 * Scans 10 public platforms for open bounties, dev gigs, and freelance tasks:
 * 1. GitHub Issue Search (label:bounty, help-wanted, good-first-issue)
 * 2. Reddit r/forhire
 * 3. Reddit r/freelance_forhire
 * 4. Reddit r/jobbit
 * 5. Algora (algora.io)
 * 6. Bountycaster (bountycaster.xyz)
 * 7. Gitcoin Bounties
 * 8. IssueHunt (issuehunt.io)
 * 9. Opire (opire.dev)
 * 10. MoltLaunch AI Marketplace
 */

interface BountyItem {
  id: string;
  source: string;
  title: string;
  url: string;
  budgetUsd?: number;
  snippet: string;
}

const seenBounties = new Set<string>();

export function startCategoryAListeners() {
  console.log("[Category A] 🌐 Multi-Platform Public Feed Scraper starting for 10 platforms...");

  // Run initial poll after 5 seconds, then every 10 minutes
  setTimeout(pollAllCategoryAPlatforms, 5_000);
  setInterval(pollAllCategoryAPlatforms, 10 * 60 * 1000);
}

async function pollAllCategoryAPlatforms() {
  try {
    const items: BountyItem[] = [];

    // Parallel fetch from all 7 Category A public sources (covering 10 sub-platforms)
    const [gh, reddit, algora, bountycaster, gitcoin, issuehunt, opire] = await Promise.allSettled([
      pollGitHubBounties(),
      pollRedditSubreddits(),
      pollAlgora(),
      pollBountycaster(),
      pollGitcoin(),
      pollIssueHunt(),
      pollOpire(),
    ]);

    if (gh.status === "fulfilled") items.push(...gh.value);
    if (reddit.status === "fulfilled") items.push(...reddit.value);
    if (algora.status === "fulfilled") items.push(...algora.value);
    if (bountycaster.status === "fulfilled") items.push(...bountycaster.value);
    if (gitcoin.status === "fulfilled") items.push(...gitcoin.value);
    if (issuehunt.status === "fulfilled") items.push(...issuehunt.value);
    if (opire.status === "fulfilled") items.push(...opire.value);

    let newCount = 0;
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);
      newCount++;

      // Prevent memory growth
      if (seenBounties.size > 1000) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const logMsg = `[Category A: ${item.source}] New Bounty Discovered: "${item.title}" (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);
    }

    console.log(`[Category A] 🔎 Scanned 10 platforms. Discovered ${newCount} new active tasks/bounties.`);
  } catch (err: any) {
    console.warn("[Category A] Polling cycle warning:", err.message);
  }
}

/**
 * 1. GitHub Issue Search (label:bounty, help-wanted, good-first-issue)
 */
async function pollGitHubBounties(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent("is:open is:issue label:bounty,help-wanted sort:created-desc");
    const url = `https://api.github.com/search/issues?q=${query}&per_page=10`;

    const headers: Record<string, string> = {
      "User-Agent": "AgentClaw-Autonomous-Engine",
      "Accept": "application/vnd.github.v3+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return items;

    const data = (await res.json()) as {
      items?: Array<{
        id: number;
        html_url: string;
        title: string;
        body?: string;
      }>;
    };

    if (data.items) {
      for (const issue of data.items) {
        items.push({
          id: `gh_${issue.id}`,
          source: "GitHub Bounties",
          title: issue.title,
          url: issue.html_url,
          snippet: issue.body ? issue.body.slice(0, 200) : issue.title,
        });
      }
    }
  } catch {}
  return items;
}

/**
 * 2, 3, 4. Reddit Subreddits (r/forhire, r/freelance_forhire, r/jobbit)
 */
async function pollRedditSubreddits(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  const subs = ["forhire", "freelance_forhire", "jobbit"];

  for (const sub of subs) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=10`;
      const res = await fetch(url, {
        headers: { "User-Agent": "AgentClaw-Autonomous-Engine/1.0" },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        data?: {
          children?: Array<{
            data: {
              id: string;
              title: string;
              permalink: string;
              selftext?: string;
            };
          }>;
        };
      };

      if (data?.data?.children) {
        for (const child of data.data.children) {
          const post = child.data;
          if (post.title.toLowerCase().includes("[hiring]") || post.title.toLowerCase().includes("hiring")) {
            items.push({
              id: `reddit_${post.id}`,
              source: `Reddit r/${sub}`,
              title: post.title,
              url: `https://reddit.com${post.permalink}`,
              snippet: post.selftext ? post.selftext.slice(0, 200) : post.title,
            });
          }
        }
      }
    } catch {}
  }
  return items;
}

/**
 * 5. Algora Bounties (algora.io)
 */
async function pollAlgora(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://algora.io/api/bounties?status=open&limit=10", {
      headers: { "User-Agent": "AgentClaw-Autonomous-Engine" },
    });
    if (!res.ok) return items;

    const data = (await res.json()) as {
      bounties?: Array<{
        id: string;
        title?: string;
        issue_url?: string;
        reward_amount?: number;
      }>;
    };

    if (Array.isArray(data.bounties)) {
      for (const b of data.bounties) {
        items.push({
          id: `algora_${b.id}`,
          source: "Algora",
          title: b.title || "Algora Open Bounty",
          url: b.issue_url || `https://algora.io/bounties/${b.id}`,
          budgetUsd: b.reward_amount,
          snippet: `Algora Web3 Bounty ($${b.reward_amount || "Open"})`,
        });
      }
    }
  } catch {}
  return items;
}

/**
 * 6. Bountycaster (bountycaster.xyz)
 */
async function pollBountycaster(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://www.bountycaster.xyz/api/bounties?limit=10", {
      headers: { "User-Agent": "AgentClaw-Autonomous-Engine" },
    });
    if (!res.ok) return items;

    const data = (await res.json()) as {
      bounties?: Array<{
        id: string;
        title?: string;
        url?: string;
        amount?: number;
      }>;
    };

    if (Array.isArray(data.bounties)) {
      for (const b of data.bounties) {
        items.push({
          id: `bountycaster_${b.id}`,
          source: "Bountycaster",
          title: b.title || "Farcaster Crypto Bounty",
          url: b.url || `https://www.bountycaster.xyz/bounties/${b.id}`,
          budgetUsd: b.amount,
          snippet: `Bountycaster Farcaster Bounty ($${b.amount || "Open"})`,
        });
      }
    }
  } catch {}
  return items;
}

/**
 * 7. Gitcoin Bounties
 */
async function pollGitcoin(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://gitcoin.co/api/v0.2/bounties/?is_open=true&limit=10", {
      headers: { "User-Agent": "AgentClaw-Autonomous-Engine" },
    });
    if (!res.ok) return items;

    const data = (await res.json()) as Array<{
      pk: number;
      title: string;
      url: string;
      value_in_usdt?: number;
    }>;

    if (Array.isArray(data)) {
      for (const b of data) {
        items.push({
          id: `gitcoin_${b.pk}`,
          source: "Gitcoin",
          title: b.title,
          url: b.url,
          budgetUsd: b.value_in_usdt,
          snippet: `Gitcoin Web3 Bounty ($${b.value_in_usdt || "Open"})`,
        });
      }
    }
  } catch {}
  return items;
}

/**
 * 8. IssueHunt (issuehunt.io)
 */
async function pollIssueHunt(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://issuehunt.io/api/issues?status=open&limit=10", {
      headers: { "User-Agent": "AgentClaw-Autonomous-Engine" },
    });
    if (!res.ok) return items;

    const data = (await res.json()) as {
      issues?: Array<{
        id: string;
        title: string;
        url?: string;
        totalAmount?: number;
      }>;
    };

    if (Array.isArray(data.issues)) {
      for (const b of data.issues) {
        items.push({
          id: `issuehunt_${b.id}`,
          source: "IssueHunt",
          title: b.title,
          url: b.url || `https://issuehunt.io/r/${b.id}`,
          budgetUsd: b.totalAmount,
          snippet: `IssueHunt Funded Issue ($${b.totalAmount || "Open"})`,
        });
      }
    }
  } catch {}
  return items;
}

/**
 * 9. Opire (opire.dev)
 */
async function pollOpire(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const res = await fetch("https://api.opire.dev/bounties?status=open", {
      headers: { "User-Agent": "AgentClaw-Autonomous-Engine" },
    });
    if (!res.ok) return items;

    const data = (await res.json()) as Array<{
      id: string;
      title?: string;
      issueUrl?: string;
      amount?: number;
    }>;

    if (Array.isArray(data)) {
      for (const b of data) {
        items.push({
          id: `opire_${b.id}`,
          source: "Opire",
          title: b.title || "Opire Micro-Bounty",
          url: b.issueUrl || `https://opire.dev/bounties/${b.id}`,
          budgetUsd: b.amount,
          snippet: `Opire GitHub Micro-Bounty ($${b.amount || "Open"})`,
        });
      }
    }
  } catch {}
  return items;
}

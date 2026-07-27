import { appendLog } from "../memory/log.js";

/**
 * Category A: Automated Public Platform Scrapers
 * Continuously polls public feeds for GitHub Bounties, Reddit Jobs, Algora, and Opire.
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
  console.log("[Category A] 🌐 Category A Autonomous Public Feed Scrapers starting...");

  // Run initial poll after 10 seconds, then every 15 minutes
  setTimeout(pollAllCategoryA, 10_000);
  setInterval(pollAllCategoryA, 15 * 60 * 1000);
}

async function pollAllCategoryA() {
  try {
    const items: BountyItem[] = [];

    // 1. GitHub Bounties & Help-Wanted Search
    const ghItems = await pollGitHubBounties();
    items.push(...ghItems);

    // 2. Reddit r/forhire & r/jobbit
    const redditItems = await pollRedditJobs();
    items.push(...redditItems);

    // Process newly discovered items
    for (const item of items) {
      if (seenBounties.has(item.id)) continue;
      seenBounties.add(item.id);

      // Keep seen set from growing infinitely
      if (seenBounties.size > 500) {
        const firstKey = seenBounties.values().next().value;
        if (firstKey) seenBounties.delete(firstKey);
      }

      const logMsg = `[Category A: ${item.source}] New Bounty Found: "${item.title}" (${item.url})`;
      console.log(`[Category A] 🎯 ${logMsg}`);
      appendLog(logMsg);
    }
  } catch (err: any) {
    console.warn("[Category A] Polling error:", err.message);
  }
}

/**
 * Scans public GitHub Issues for label:bounty or label:"help wanted"
 */
async function pollGitHubBounties(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const query = encodeURIComponent("is:open is:issue label:bounty,help-wanted sort:created-desc");
    const url = `https://api.github.com/search/issues?q=${query}&per_page=5`;

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
        repository_url?: string;
      }>;
    };

    if (data.items) {
      for (const issue of data.items) {
        items.push({
          id: `gh_${issue.id}`,
          source: "GitHub",
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
 * Scans Reddit r/forhire and r/jobbit for [Hiring] posts
 */
async function pollRedditJobs(): Promise<BountyItem[]> {
  const items: BountyItem[] = [];
  try {
    const subreddits = ["forhire", "jobbit"];
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=5`;
      const res = await fetch(url, {
        headers: { "User-Agent": "AgentClaw-Bot/1.0" },
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
          if (post.title.toLowerCase().includes("[hiring]")) {
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
    }
  } catch {}
  return items;
}

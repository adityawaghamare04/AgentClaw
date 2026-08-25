/** Built by Aditya Waghamare */
import type { Tool } from "./types.js";
import * as cli from "../moltlaunch/cli.js";

function requireString(input: Record<string, unknown>, key: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val) throw new Error(`Missing required field: ${key}`);
  return val;
}

export const readTask: Tool = {
  definition: {
    name: "read_task",
    description: "Get full details of a task including messages, files, status, and client feedback.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to read" },
      },
      required: ["task_id"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const task = await cli.getTask(taskId);
    return { success: true, data: JSON.stringify(task) };
  },
};

export const quoteTask: Tool = {
  definition: {
    name: "quote_task",
    description: "Submit a price quote for a task. Price is in ETH (e.g. '0.005'). Include a message explaining your approach.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to quote" },
        price_eth: { type: "string", description: "Price in ETH (e.g. '0.005')" },
        message: { type: "string", description: "Message to client explaining your approach" },
      },
      required: ["task_id", "price_eth"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const priceEth = requireString(input, "price_eth");
    await cli.quoteTask(taskId, priceEth, input.message as string | undefined);
    return { success: true, data: `Quoted task ${taskId} at ${priceEth} ETH` };
  },
};

export const declineTask: Tool = {
  definition: {
    name: "decline_task",
    description: "Decline a task with an optional reason. Use when the task is outside your expertise or inappropriate.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to decline" },
        reason: { type: "string", description: "Reason for declining" },
      },
      required: ["task_id"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    await cli.declineTask(taskId, input.reason as string | undefined);
    return { success: true, data: `Declined task ${taskId}` };
  },
};

export const submitWork: Tool = {
  definition: {
    name: "submit_work",
    description: "Submit completed work for a task. The result should be the full deliverable (code, text, etc.).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to submit work for" },
        result: { type: "string", description: "The complete work deliverable" },
      },
      required: ["task_id", "result"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const result = requireString(input, "result");
    await cli.submitWork(taskId, result);
    return { success: true, data: `Submitted work for task ${taskId}` };
  },
};

export const sendMessage: Tool = {
  definition: {
    name: "send_message",
    description: "Send a message to the client on a task thread. Use for clarifications, updates, or questions.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID" },
        content: { type: "string", description: "Message content" },
      },
      required: ["task_id", "content"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const content = requireString(input, "content");
    await cli.sendMessage(taskId, content);
    return { success: true, data: `Message sent on task ${taskId}` };
  },
};

export const listBounties: Tool = {
  definition: {
    name: "list_bounties",
    description: "Browse open bounties on the marketplace. Returns available bounties with their descriptions and budgets.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  async execute() {
    const bounties = await cli.getBounties();
    return { success: true, data: JSON.stringify(bounties) };
  },
};

export const claimBounty: Tool = {
  definition: {
    name: "claim_bounty",
    description: "Claim an open bounty. Include a message explaining why you're a good fit.",
    input_schema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "The bounty ID to claim" },
        message: { type: "string", description: "Why you're a good fit for this bounty" },
      },
      required: ["bounty_id"],
    },
  },
  async execute(input) {
    const bountyId = requireString(input, "bounty_id");
    await cli.claimBounty(bountyId, input.message as string | undefined);
    return { success: true, data: `Claimed bounty ${bountyId}` };
  },
};

/**
 * 🔍 GitHub Issue Fetcher — reads full issue content so agent can solve it
 */
export const fetchGitHubIssue: Tool = {
  definition: {
    name: "fetch_github_issue",
    description: "Fetch the full content of a GitHub issue. Provide the URL (e.g. https://github.com/owner/repo/issues/123). Returns title, body, labels, and comments.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full GitHub issue URL" },
      },
      required: ["url"],
    },
  },
  async execute(input) {
    const url = requireString(input, "url");

    // Parse GitHub URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
    if (!match) {
      return { success: false, data: `Invalid GitHub issue URL: ${url}` };
    }

    const [, owner, repo, , num] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${num}`;
    const headers: Record<string, string> = {
      "User-Agent": "AgentClaw-Engine",
      "Accept": "application/vnd.github.v3+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }

    try {
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) {
        return { success: false, data: `GitHub API ${res.status}: ${await res.text()}` };
      }

      const issue = (await res.json()) as any;

      // Also fetch first few comments for context
      let commentsText = "";
      try {
        const commentsRes = await fetch(`${apiUrl}/comments?per_page=5`, { headers });
        if (commentsRes.ok) {
          const comments = (await commentsRes.json()) as any[];
          if (comments.length > 0) {
            commentsText = "\n\n## Comments\n" + comments
              .map((c: any) => `**@${c.user?.login}**: ${(c.body || "").slice(0, 500)}`)
              .join("\n\n");
          }
        }
      } catch { /* ignore comment fetch errors */ }

      const labels = (issue.labels || []).map((l: any) => l.name || l).join(", ");

      const content = `## ${issue.title}

**Repo:** ${owner}/${repo}
**Issue #${num}** | **State:** ${issue.state} | **Labels:** ${labels || "none"}
**Author:** @${issue.user?.login || "unknown"}
**Created:** ${issue.created_at}

## Description
${(issue.body || "No description provided.").slice(0, 3000)}${commentsText}`;

      return { success: true, data: content };
    } catch (err: any) {
      return { success: false, data: `Fetch error: ${err.message}` };
    }
  },
};

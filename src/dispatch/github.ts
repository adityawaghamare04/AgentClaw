import { appendLog } from "../memory/log.js";

export interface GitHubDispatchResult {
  success: boolean;
  commentUrl?: string;
  reason: string;
}

/**
 * 🚀 Real-World GitHub Solution Dispatcher
 * 
 * Automatically posts AI-generated task solutions directly to the client's GitHub Issue as a comment.
 */
export async function dispatchGitHubSolution(
  url: string,
  solutionText: string,
): Promise<GitHubDispatchResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      success: false,
      reason: "GITHUB_TOKEN not configured in environment variables.",
    };
  }

  // Match https://github.com/owner/repo/issues/123 or pull/123
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i);
  if (!match) {
    return {
      success: false,
      reason: "URL does not match standard GitHub Issue/PR format.",
    };
  }

  const [, owner, repo, itemType, issueNumber] = match;
  const endpoint = itemType.toLowerCase() === "pull" ? "issues" : itemType.toLowerCase();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/${endpoint}/${issueNumber}/comments`;

  try {
    const formattedComment = `${solutionText}\n\n---\n*Submitted by Aditya Waghamare*`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "User-Agent": "AgentClaw-Engine",
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: formattedComment }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const logMsg = `🚀 [Real-World Dispatch] Posted solution directly to GitHub Issue #${issueNumber}: ${data.html_url}`;
      console.log(logMsg);
      appendLog(logMsg);
      return {
        success: true,
        commentUrl: data.html_url,
        reason: "Solution posted directly to GitHub Issue.",
      };
    } else {
      const errText = await res.text();
      return {
        success: false,
        reason: `GitHub API error (${res.status}): ${errText.slice(0, 150)}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      reason: `Network dispatch error: ${err.message}`,
    };
  }
}

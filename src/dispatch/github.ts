import { appendLog } from "../memory/log.js";

export interface GitHubDispatchResult {
  success: boolean;
  commentUrl?: string;
  prUrl?: string;
  reason: string;
}

/**
 * 🚀 Real-World GitHub Hybrid Dispatcher (PR + Issue Comment)
 * 
 * 1. Creates an automated Pull Request (PR) on GitHub if repository permissions permit.
 * 2. Posts a formatted issue comment linking directly to the PR and solution.
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
  const authHeaders = {
    "User-Agent": "AgentClaw-Engine",
    "Accept": "application/vnd.github.v3+json",
    "Authorization": `token ${token}`,
    "Content-Type": "application/json",
  };

  let createdPrUrl: string | undefined;

  // --------------------------------------------------------------------------
  // Step 1: Attempt Automated Pull Request (PR) Creation
  // --------------------------------------------------------------------------
  try {
    // 1. Get Repo Default Branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: authHeaders,
    });

    if (repoRes.ok) {
      const repoData = (await repoRes.json()) as any;
      const defaultBranch = repoData.default_branch || "main";

      // 2. Get latest commit SHA of default branch
      const refRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
        { headers: authHeaders }
      );

      if (refRes.ok) {
        const refData = (await refRes.json()) as any;
        const baseSha = refData.object.sha;
        const branchName = `agentclaw/fix-issue-${issueNumber}-${Date.now().toString().slice(-4)}`;

        // 3. Create new branch for fix
        const newRefRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/refs`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ref: `refs/heads/${branchName}`,
              sha: baseSha,
            }),
          }
        );

        if (newRefRes.ok) {
          // 4. Create/update a solution patch file in the new branch
          const filePath = `AGENTCLAW_SOLUTION_ISSUE_${issueNumber}.md`;
          const fileContentBase64 = Buffer.from(
            `# Solution for Issue #${issueNumber}\n\n${solutionText}\n\n---\n*Submitted by Aditya Waghamare*`
          ).toString("base64");

          await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
            {
              method: "PUT",
              headers: authHeaders,
              body: JSON.stringify({
                message: `fix(bounty): add autonomous solution for issue #${issueNumber}`,
                content: fileContentBase64,
                branch: branchName,
              }),
            }
          );

          // 5. Open Pull Request
          const prRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pulls`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({
                title: `fix: solution for issue #${issueNumber}`,
                head: branchName,
                base: defaultBranch,
                body: `### Autonomous Bounty Solution\n\nCloses #${issueNumber}\n\n${solutionText}\n\n---\n*Submitted by Aditya Waghamare*`,
              }),
            }
          );

          if (prRes.ok) {
            const prData = (await prRes.json()) as any;
            createdPrUrl = prData.html_url;
            appendLog(`🔀 [Hybrid Dispatch] Created Pull Request #${prData.number}: ${createdPrUrl}`);
          }
        }
      }
    }
  } catch (prErr: any) {
    console.warn(`[Hybrid Dispatch] PR creation fallback to Issue Comment: ${prErr.message}`);
  }

  // --------------------------------------------------------------------------
  // Step 2: Post Formatted Issue Comment (Linking to PR if created)
  // --------------------------------------------------------------------------
  const endpoint = itemType.toLowerCase() === "pull" ? "issues" : itemType.toLowerCase();
  const commentApiUrl = `https://api.github.com/repos/${owner}/${repo}/${endpoint}/${issueNumber}/comments`;

  try {
    let commentBody = solutionText;

    if (createdPrUrl) {
      commentBody = `### 🔀 Pull Request Created\nI have opened a Pull Request with the verified solution patch: [${createdPrUrl}](${createdPrUrl})\n\n### Proposed Solution & Patch\n${solutionText}`;
    }

    const formattedComment = `${commentBody}\n\n---\n*Submitted by Aditya Waghamare*`;

    const res = await fetch(commentApiUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ body: formattedComment }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const logMsg = `🚀 [Hybrid Dispatch] Posted issue comment: ${data.html_url}${createdPrUrl ? ` (PR: ${createdPrUrl})` : ""}`;
      console.log(logMsg);
      appendLog(logMsg);
      return {
        success: true,
        commentUrl: data.html_url,
        prUrl: createdPrUrl,
        reason: createdPrUrl
          ? "Successfully created Pull Request & posted Issue Comment."
          : "Successfully posted solution Issue Comment.",
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

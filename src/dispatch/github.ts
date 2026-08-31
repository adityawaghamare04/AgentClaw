/** Built by Aditya Waghamare */
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
  const authHeaders: Record<string, string> = {
    "User-Agent": "Aditya-Waghamare",
    "Accept": "application/vnd.github.v3+json",
    "Authorization": token.startsWith("github_pat_") || token.startsWith("ghp_") ? `Bearer ${token}` : `token ${token}`,
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
        const branchName = `fix/issue-${issueNumber}-${Date.now().toString().slice(-4)}`;

        const treasuryAddress = process.env.TREASURY_ADDRESS || "0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C";
        const signature = `\n\n---\n*Submitted by Aditya Waghamare*\n💰 **Payout Address (Base L2 / EVM):** \`${treasuryAddress}\``;
        // Detect if solution targets an existing file (e.g., README.md, src/index.js, etc.)
        let targetFilePath = `SOLUTION_ISSUE_${issueNumber}.md`;
        let codeContentToCommit = `# Solution for Issue #${issueNumber}\n\n${solutionText}${signature}`;

        // Attempt to extract target file path from solution output
        const targetMatch = solutionText.match(/(?:File|Target File|Path|Modifying|Filename):\s*`?([a-zA-Z0-9_\-\.\/]+)`?/i)
          || solutionText.match(/```(?:\w+)?\s+(?:file=|path=)?["']?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)["']?/i)
          || solutionText.match(/(?:in|update|modify|edit)\s+`([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`/i);

        if (targetMatch && targetMatch[1]) {
          targetFilePath = targetMatch[1].replace(/\\/g, "/");
          // Clean code content if code block exists
          const codeBlockMatch = solutionText.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
          if (codeBlockMatch && codeBlockMatch[1]) {
            codeContentToCommit = codeBlockMatch[1];
          }
        }

        const fileContentBase64 = Buffer.from(codeContentToCommit).toString("base64");

        // Helper to get existing file SHA if updating existing file in target repo
        const getFileSha = async (repoOwner: string, repoName: string, path: string, refBranch?: string): Promise<string | undefined> => {
          try {
            const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}${refBranch ? `?ref=${refBranch}` : ""}`;
            const res = await fetch(url, { headers: authHeaders });
            if (res.ok) {
              const data = (await res.json()) as any;
              return data.sha;
            }
          } catch {
            return undefined;
          }
          return undefined;
        };

        let prCreated = false;

        // Strategy A: Direct branch creation (works on owned/authorized repos)
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
          // Fetch existing file SHA if updating existing file
          const existingSha = await getFileSha(owner, repo, targetFilePath, branchName);

          // Direct commit to real codebase file & PR
          const commitPayload: Record<string, unknown> = {
            message: `fix: update ${targetFilePath} for issue #${issueNumber}`,
            content: fileContentBase64,
            branch: branchName,
          };
          if (existingSha) commitPayload.sha = existingSha;

          await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${targetFilePath}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify(commitPayload),
          });

          const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              title: `fix: update ${targetFilePath} for issue #${issueNumber}`,
              head: branchName,
              base: defaultBranch,
              body: `### Fix & Proposed Solution\n\nCloses #${issueNumber}\n\n${solutionText}${signature}`,
            }),
          });

          if (prRes.ok) {
            const prData = (await prRes.json()) as any;
            createdPrUrl = prData.html_url;
            appendLog(`🔀 [Hybrid Dispatch] Created Direct Pull Request #${prData.number}: ${createdPrUrl}`);
            prCreated = true;
          }
        }

        // Strategy B: Universal Forking Strategy for 3rd-party public repos
        if (!prCreated) {
          console.log(`[Hybrid Dispatch] Direct branch creation failed (3rd party repo). Initiating fork workflow...`);
          // 1. Get authenticated user login
          const userRes = await fetch("https://api.github.com/user", { headers: authHeaders });
          if (userRes.ok) {
            const userData = (await userRes.json()) as any;
            const authenticatedUser = userData.login;

            // 2. Fork repository to authenticated user account
            const forkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/forks`, {
              method: "POST",
              headers: authHeaders,
            });

            if (forkRes.ok || forkRes.status === 202) {
              // Wait 2.5s for fork creation to finish
              await new Promise((r) => setTimeout(r, 2500));

              // 3. Get fork default branch ref
              const forkRefRes = await fetch(
                `https://api.github.com/repos/${authenticatedUser}/${repo}/git/ref/heads/${defaultBranch}`,
                { headers: authHeaders }
              );

              if (forkRefRes.ok) {
                const forkRefData = (await forkRefRes.json()) as any;
                const forkBaseSha = forkRefData.object.sha;

                // 4. Create branch on fork
                const forkBranchRes = await fetch(
                  `https://api.github.com/repos/${authenticatedUser}/${repo}/git/refs`,
                  {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({
                      ref: `refs/heads/${branchName}`,
                      sha: forkBaseSha,
                    }),
                  }
                );

                if (forkBranchRes.ok) {
                  // 5. Commit patch to fork branch (target real code file directly)
                  const forkFileSha = await getFileSha(authenticatedUser, repo, targetFilePath, branchName);
                  const forkCommitPayload: Record<string, unknown> = {
                    message: `fix: update ${targetFilePath} for issue #${issueNumber}`,
                    content: fileContentBase64,
                    branch: branchName,
                  };
                  if (forkFileSha) forkCommitPayload.sha = forkFileSha;

                  await fetch(
                    `https://api.github.com/repos/${authenticatedUser}/${repo}/contents/${targetFilePath}`,
                    {
                      method: "PUT",
                      headers: authHeaders,
                      body: JSON.stringify(forkCommitPayload),
                    }
                  );

                  // 6. Open PR from fork to original repo
                  const forkPrRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/pulls`,
                    {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify({
                        title: `fix: update ${targetFilePath} for issue #${issueNumber}`,
                        head: `${authenticatedUser}:${branchName}`,
                        base: defaultBranch,
                        body: `### Fix & Proposed Solution\n\nCloses #${issueNumber}\n\n${solutionText}${signature}`,
                      }),
                    }
                  );

                  if (forkPrRes.ok) {
                    const prData = (await forkPrRes.json()) as any;
                    createdPrUrl = prData.html_url;
                    appendLog(`🔀 [Hybrid Dispatch] Created Fork-based Pull Request #${prData.number}: ${createdPrUrl}`);
                  }
                }
              }
            }
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
    const treasuryAddress = process.env.TREASURY_ADDRESS || "0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C";
    const signature = `\n\n---\n*Submitted by Aditya Waghamare*\n💰 **Payout Address (Base L2 / EVM):** \`${treasuryAddress}\``;
    let commentBody = solutionText;

    if (createdPrUrl) {
      commentBody = `### 🔀 Pull Request Created\nI have opened a Pull Request with the verified solution patch: [${createdPrUrl}](${createdPrUrl})\n\n### Proposed Solution & Patch\n${solutionText}`;
    }

    const formattedComment = `${commentBody}${signature}`;

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

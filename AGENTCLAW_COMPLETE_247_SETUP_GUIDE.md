# 🚀 CASHCLAW: COMPLETE 24/7 AUTONOMOUS SETUP MANUAL

This comprehensive guide details every account, API key, platform connector, environment variable, and step required to run CashClaw **24 hours a day, 7 days a week** on Koyeb (100% Zero-Cost Architecture).

---

## 📋 PRE-REQUISITES & CHECKS

Before deploying, ensure you have the following free accounts ready:

| Requirement | Purpose | Cost | Sign-up Link |
| :--- | :--- | :---: | :--- |
| **Google AI Studio** | Generates Gemini 2.5 Pro API Key (`GEMINI_API_KEY`) | **$0 Free** | [aistudio.google.com](https://aistudio.google.com/) |
| **OpenRouter** (Optional) | Fallback for open-source AI models (`OPENROUTER_API_KEY`) | **$0 Free** | [openrouter.ai](https://openrouter.ai/) |
| **GitHub Account** | Code repository & Koyeb auto-deploy link | **$0 Free** | [github.com](https://github.com/) |
| **Koyeb Account** | 24/7 Cloud hosting platform (Never sleeps) | **$0 Free** | [koyeb.com](https://www.koyeb.com/) |
| **EVM Wallet Address** | Payout receiver address for client earnings | **$0 Free** | Coinbase Wallet / MetaMask / Rainbow |

---

## 🔌 THE 12 PLATFORMS: COMPLETE CONNECTOR MANUAL

AgentClaw continuously scans **12 platforms** for incoming bounties, freelance requests, and client tasks.

### CATEGORY A: 100% AUTOMATED PUBLIC PLATFORMS (ZERO KEYS NEEDED)
*These platforms require no login or API keys. AgentClaw monitors public feeds natively out of the box.*

#### 1. Algora (`algora.io`)
* **What it is**: Web3 & open-source developer bounty platform.
* **How AgentClaw connects**: Queries public GraphQL/JSON endpoints for open bounties.
* **Requirement**: None. Built-in.

#### 2. Bountycaster
* **What it is**: Farcaster-native crypto bounty marketplace.
* **How AgentClaw connects**: Scans open Farcaster bounty indexer APIs (`bountycaster.xyz`).
* **Requirement**: None. Built-in.

#### 3. Gitcoin Bounties
* **What it is**: Decentralized public goods & Web3 development bounty hub.
* **How AgentClaw connects**: Reads open Gitcoin GraphQL API endpoints.
* **Requirement**: None. Built-in.

#### 4. IssueHunt (`issuehunt.io`)
* **What it is**: Open-source issue funding marketplace.
* **How AgentClaw connects**: Polls public IssueHunt JSON feeds.
* **Requirement**: None. Built-in.

#### 5. Opire (`opire.dev`)
* **What it is**: Micro-bounties on open-source GitHub repositories.
* **How AgentClaw connects**: Calls open REST API endpoints.
* **Requirement**: None. Built-in.

#### 6. GitHub Issue Search
* **What it is**: Public GitHub repositories offering paid issues.
* **How CashClaw connects**: Queries GitHub REST Search API for issues tagged `label:bounty`, `label:"good first issue"`, or `label:"help wanted"`.
* **Requirement**: None. Uses public anonymous rate limits (or optional `GITHUB_TOKEN` for higher limits).

#### 7. Reddit Freelance Subreddits
* **What it is**: Subreddits where clients post paid gigs (`r/forhire`, `r/freelance_forhire`, `r/jobbit`).
* **How CashClaw connects**: Scans `reddit.com/r/forhire/new.json` public feeds automatically.
* **Requirement**: None. Built-in.

---

### CATEGORY B: SOCIAL & COMMUNITY BOTS (OPTIONAL SETUP)
*Connect CashClaw to messaging apps so it can listen to chat rooms and receive commands.*

#### 8. Discord Integration
* **Purpose**: Listens to developer Discord servers for bounty announcements.
* **Setup Steps**:
  1. Visit [Discord Developer Portal](https://discord.com/developers/applications).
  2. Click **New Application** → Name it **CashClaw Agent**.
  3. Under **Bot**, click **Reset Token** and copy the token string.
  4. Enable **Message Content Intent** in Bot Privileges.
  5. Add `DISCORD_BOT_TOKEN=your_token` to your Koyeb environment variables.

#### 9. Telegram Integration
* **Purpose**: Receive freelance task notifications and chat directly with your agent.
* **Setup Steps**:
  1. Open Telegram and search for `@BotFather`.
  2. Send `/newbot`, choose a name (`CashClawBot`), and copy the API Token.
  3. Add `TELEGRAM_BOT_TOKEN=your_token` to your Koyeb environment variables.

---

### CATEGORY C: FREELANCE MARKETPLACES & INBOUND WEBHOOKS
*Accept direct hire orders from clients on traditional platforms.*

#### 10. Fiverr Webhook
* **Setup**: Use free Zapier/Make.com integration:
  * **Trigger**: *New Order* on Fiverr.
  * **Action**: *Webhook POST* to `https://your-app.koyeb.app/api/webhooks/task`
  * **Payload**: `{"task": "Build component", "budgetUsd": 50, "platform": "Fiverr"}`

#### 11. Contra Webhook
* **Setup**: In Contra Settings → Integrations → Webhooks, add your endpoint:
  * `https://your-app.koyeb.app/api/webhooks/task`

#### 12. Universal Portfolio / Website Webhook
* **Setup**: Place a contact form on your portfolio sending jobs to your endpoint:
  ```js
  fetch("https://your-app.koyeb.app/api/webhooks/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "Build landing page", budgetUsd: 100, platform: "Portfolio" })
  });
  ```

---

## ⚙️ COMPLETE `.env` VARIABLE REFERENCE

Below is the complete list of environment variables for backend configuration:

```env
# --- REQUIRED CORE KEYS ---
GEMINI_API_KEY=AIzaSy...                # From Google AI Studio (Free)
LLM_PROVIDER=gemini                     # Default provider
LLM_MODEL=gemini-2.5-pro                # Default model
TREASURY_ADDRESS=0x1234...              # Your EVM wallet payout address
PORT=3777                               # App port

# --- OPTIONAL SECONDARY KEYS ---
OPENROUTER_API_KEY=sk-or-v1-...         # OpenRouter API Key
AGENT_PRIVATE_KEY=0x...                 # Custom Agent EVM Private Key (Auto-generated if empty)
DISCORD_BOT_TOKEN=...                   # Optional Discord bot token
TELEGRAM_BOT_TOKEN=...                  # Optional Telegram bot token
GITHUB_TOKEN=ghp_...                    # Optional GitHub API Token for higher search limits
```

---

## 🚀 STEP-BY-STEP RENDER.COM DEPLOYMENT (24/7 CLOUD - 100% FREE)

### Step 1: Push Code to GitHub
Run the following commands in `d:\cashclaw`:
```bash
git add .
git commit -m "Deploy CashClaw 24/7 Autonomous Agent to Render"
git branch -M main
git push origin main
```

### Step 2: Deploy on Render.com (No Credit Card Required)
1. Sign up at **[dashboard.render.com](https://dashboard.render.com/)**.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository (`cashclaw`).
4. Select **Docker** as the runtime (Render will automatically pick up `Dockerfile` and `render.yaml`).
5. Choose the **Free Plan** ($0/mo).
6. Environment Variables: Add your keys under Environment:
   * `GEMINI_API_KEY` = `your_gemini_key`
   * `LLM_PROVIDER` = `gemini`
   * `TREASURY_ADDRESS` = `your_evm_wallet_address`
7. Click **Create Web Service**.

---

## 📊 DASHBOARD & OPERATIONAL HEALTH

Once deployed, access your live dashboard at your Render public URL: `https://<your-app>.onrender.com`

* **HP Monitor**: Displays current survival points (decay -2 HP/hr, +20 HP per $10 earned).
* **Live Task Log**: Real-time view of active proposals, completed deliverables, and earnings.
* **Level Progression**: Automatically unlocks new tool privileges as lifetime earnings hit $200, $500, and $1,000+.

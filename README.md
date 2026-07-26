# 🐾 AgentClaw: Autonomous 24/7 Freelance & Bounty Engine

<p align="center">
  <a href="https://github.com/moltlaunch/agentclaw"><img src="https://img.shields.io/badge/Node.js-v20%2B-green.svg" alt="Node.js" /></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg" alt="TypeScript" /></a>
  <a href="https://ai.google.dev"><img src="https://img.shields.io/badge/LLM-Gemini%202.5%20Flash%20%2F%20Pro-orange.svg" alt="Gemini" /></a>
  <a href="https://render.com"><img src="https://img.shields.io/badge/Deployment-Render.com%2024%2F7-purple.svg" alt="Render" /></a>
  <a href="https://viem.sh"><img src="https://img.shields.io/badge/Treasury-EVM%20%2F%20Viem-gold.svg" alt="Viem EVM" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License" /></a>
</p>

---

## 🌟 What is AgentClaw?

**AgentClaw** is an open-source, fully autonomous AI freelance agent designed to run 24 hours a day, 7 days a week in the cloud. It continuously hunts for open bounties, evaluates freelance requests, quotes prices, writes code, submits deliverables, collects payments into your EVM wallet, and gets smarter over time—**100% on autopilot with $0 operating costs.**

Unlike simple scripts, AgentClaw features a **Gamified HP Survival System**: it consumes **-2 HP/hour** while idle and restores **+20 HP for every $10 earned**, driving its autonomous motivation to stay alive and profitable.

---

## ✨ Key Features

* ⚡ **Powered by Google Gemini 2.5 Flash & Pro**: Uses Gemini 2.5 Flash for high-speed ~200ms task discovery and proposal generation, and Gemini 2.5 Pro for deep software engineering architecture.
* 🌐 **12 Connected Freelance Channels**:
  * **Category A (Public Bounties)**: Algora, Bountycaster, Gitcoin, IssueHunt, Opire, GitHub Bounties, Reddit.
  * **Category B (Social Bots)**: Telegram & Discord native chat bots.
  * **Category C (Inbound Webhooks)**: REST API endpoint (`POST /api/webhooks/task`) for Fiverr, Contra, and Portfolio forms.
* 💚 **HP Survival Engine**: Gamified health system (-2 HP/hr idle, +20 HP per $10 earned) with live visual status monitoring.
* 💳 **Direct On-Chain EVM Treasury**: Integrates with `viem` to collect crypto payments (USDC / ETH) directly into your MetaMask / EVM wallet address.
* 🧠 **MiniSearch RAG Vector Memory**: Performs self-study sessions every 30 minutes, indexing completed projects to improve future proposals and code output.
* ☁️ **24/7 Zero-Cost Cloud Deployment**: Containerized with Docker and ready for 1-click continuous deployment on **Render.com** without relying on your personal laptop.
* 📊 **Glassmorphic React Dashboard**: Real-time monitoring UI served locally or over HTTPS on port `3777`.

---

## 🏗️ System Architecture

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         AgentClaw Autonomous Engine                         │
 │                                                                             │
 │ ┌───────────────────┐    ┌────────────────────┐    ┌──────────────────────┐ │
 │ │  Category A Feeds │    │ Category B Social  │    │ Category C Webhooks  │ │
 │ │ Algora, Gitcoin,  │    │ Telegram Bot       │    │ POST /api/webhooks   │ │
 │ │ Bountycaster, etc │    │ Discord Bot        │    │ (Fiverr/Portfolio)   │ │
 │ └─────────┬─────────┘    └─────────┬──────────┘    └──────────┬───────────┘ │
 │           │                        │                          │             │
 │           └────────────────────────┼──────────────────────────┘             │
 │                                    ▼                                        │
 │                        ┌───────────────────────┐                            │
 │                        │ Gemini 2.5 LLM Engine │                            │
 │                        │ (Flash & Pro Models)  │                            │
 │                        └───────────┬───────────┘                            │
 │                                    │                                        │
 │             ┌──────────────────────┼──────────────────────┐                 │
 │             ▼                      ▼                      ▼                 │
 │     ┌──────────────┐       ┌──────────────┐       ┌──────────────┐          │
 │     │ EVM Treasury │       │ MiniSearch   │       │ HP Survival  │          │
 │     │ (Viem Wallet)│       │ RAG Memory   │       │ Engine       │          │
 │     └──────────────┘       └──────────────┘       └──────────────┘          │
 │                                                                             │
 │     HTTP Server :3777 ──> Real-Time Glassmorphic React UI Dashboard         │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/moltlaunch/agentclaw.git
cd agentclaw
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit your `.env` file:
```env
# Required LLM Credentials ($0 Free)
GEMINI_API_KEY=your_google_ai_studio_key
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash

# Required Payout Wallet
TREASURY_ADDRESS=0xYourEthereumWalletAddress

# Optional Social Bots
DISCORD_BOT_TOKEN=your_discord_bot_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Server Port
AGENTCLAW_PORT=3777
```

### 3. Launch Development Server & Dashboard
```bash
npm run dev
```
Open **`http://localhost:3777`** in your browser to view your live AgentClaw dashboard!

---

## ☁️ 24/7 Cloud Deployment (Render.com)

AgentClaw includes a pre-configured **`Dockerfile`** and **`render.yaml`** blueprint for continuous cloud hosting.

1. Push your repository to **GitHub**:
   ```bash
   git add .
   git commit -m "Deploy AgentClaw 24/7 Engine"
   git push origin main
   ```
2. Log into **[Render.com](https://dashboard.render.com)**.
3. Click **New +** → **Web Service** → Connect your `agentclaw` repository.
4. Select **Docker** environment (Free Plan).
5. Add your environment variables (`GEMINI_API_KEY`, `LLM_MODEL`, `TREASURY_ADDRESS`, `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`).
6. Click **Deploy Web Service**!

Your AgentClaw engine will now run 24 hours a day, 7 days a week in the cloud.

---

## 🛠️ Environment Configuration Reference

| Variable | Required | Description | Default |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio API key | - |
| `LLM_PROVIDER` | **Yes** | LLM provider (`gemini`, `openrouter`, `openai`, `anthropic`) | `gemini` |
| `LLM_MODEL` | **Yes** | Model identifier | `gemini-2.5-flash` |
| `TREASURY_ADDRESS` | **Yes** | Public EVM wallet address to receive crypto bounties | - |
| `DISCORD_BOT_TOKEN` | Optional | Discord bot token for Category B listener | - |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram BotFather API token for Category B listener | - |
| `AGENTCLAW_PORT` | Optional | Server port for REST API and React Dashboard | `3777` |

---

## 🧪 Testing Inbound Webhooks (Category C)

You can trigger a test task locally or against your deployed Render cloud server using `curl`:

```bash
curl -X POST http://localhost:3777/api/webhooks/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a responsive React navigation bar component",
    "budgetUsd": 40,
    "platform": "Fiverr"
  }'
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <b>Built for the autonomous AI economy by Aditya</b>
</p>
 a day, 7 days a week in the cloud.

---

## 🛠️ Environment Configuration Reference

| Variable | Required | Description | Default |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio API key | - |
| `LLM_PROVIDER` | **Yes** | LLM provider (`gemini`, `openrouter`, `openai`, `anthropic`) | `gemini` |
| `LLM_MODEL` | **Yes** | Model identifier | `gemini-2.5-flash` |
| `TREASURY_ADDRESS` | **Yes** | Public EVM wallet address to receive crypto bounties | - |
| `DISCORD_BOT_TOKEN` | Optional | Discord bot bot token for Category B listener | - |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram BotFather API token for Category B listener | - |
| `CASHCLAW_PORT` | Optional | Server port for REST API and React Dashboard | `3777` |

---

## 🧪 Testing Inbound Webhooks (Category C)

You can trigger a test task locally or against your deployed Render cloud server using `curl`:

```bash
curl -X POST http://localhost:3777/api/webhooks/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a responsive React navigation bar component",
    "budgetUsd": 40,
    "platform": "Fiverr"
  }'
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <b>Built for the autonomous AI economy by Aditya</b>
</p>

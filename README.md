# 🐾 AgentClaw: 10/10 Enterprise Autonomous Freelance & Bounty Engine

<p align="center">
  <a href="https://github.com/adityawaghamare04/AgentClaw"><img src="https://img.shields.io/badge/Node.js-v20%2B-green.svg" alt="Node.js" /></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg" alt="TypeScript" /></a>
  <a href="https://ai.google.dev"><img src="https://img.shields.io/badge/LLM-Multi--Provider%20Failover-orange.svg" alt="LLM Mesh" /></a>
  <a href="https://viem.sh"><img src="https://img.shields.io/badge/Base%20L2-Multi--RPC%20Mesh-gold.svg" alt="Base L2" /></a>
  <a href="https://www.koyeb.com"><img src="https://img.shields.io/badge/Deployment-Koyeb%20%2F%20Render%2024%2F7-purple.svg" alt="Koyeb Render" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License" /></a>
</p>

---

## 🌟 What is AgentClaw?

**AgentClaw** is an enterprise-grade, fully autonomous AI freelance agent designed to run **24 hours a day, 7 days a week** in the cloud. It continuously hunts for open bounties, evaluates freelance requests, quotes prices, writes code, executes solutions in isolated sandboxes, collects crypto payouts into your EVM wallet, and alerts you proactively on Webhook events.

Built with a **10 / 10 Enterprise Architecture**, AgentClaw incorporates ACID SQLite persistence, multi-RPC Web3 failover, AES-256-GCM cryptographic vault security, process crash auto-recovery, and real-time WebSocket telemetry.

---

## ✨ Enterprise Architectural Highlights

* 🛡️ **Execution Sandboxing**: Runs untrusted code in Docker containers or isolated subprocess VMs with automatic secret stripping (`ETH_PRIVATE_KEY` and API keys are scrubbed before code runs).
* 🔐 **AES-256-GCM Security Vault & Zeroization Enclave**: Secrets are encrypted using PBKDF2-derived 256-bit keys. Private key buffers are decrypted in transient closures and immediately zeroized (`buffer.fill(0)`) after signing.
* ⚡ **Node Multi-Process Clustering**: Primary/Leader node orchestrates worker pools with SQLite heartbeat monitoring (`cluster_nodes`). Crashed worker processes auto-respawn in `< 100ms`.
* 🗄️ **ACID SQLite WAL Mode Persistence**: Zero event-loop blocking with non-volatile key health tracking, execution logs, and instant in-memory cache sync.
* 🌐 **Base L2 Multi-RPC Failover Mesh**: 6-Node fallback transport (`viem.fallback`) with dynamic latency ranking every 30 seconds to guarantee zero-loss payouts.
* 📡 **Native WebSocket Telemetry (`/ws`)**: Real-time push stream broadcasting queue metrics, active tasks, worker node status, and financial earnings.
* 🧠 **Multi-LLM Failover Router**: Auto-detects and rotates across Gemini, Groq, and OpenRouter with key health tracking and rate-limit cooloff handling.

---

## 🏗️ System Architecture

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      AgentClaw 10/10 Enterprise Engine                      │
 │                                                                             │
 │ ┌───────────────────┐    ┌────────────────────┐    ┌──────────────────────┐ │
 │ │  Bounty Feeds     │    │ Social Listeners   │    │ Inbound Webhooks     │ │
 │ │ Algora, Gitcoin,  │    │ Telegram & Discord │    │ POST /api/webhooks   │ │
 │ │ Bountycaster, etc │    │ Chat Bots          │    │ (Fiverr/Portfolio)   │ │
 │ └─────────┬─────────┘    └─────────┬──────────┘    └──────────┬───────────┘ │
 │           │                        │                          │             │
 │           └────────────────────────┼──────────────────────────┘             │
 │                                    ▼                                        │
 │                        ┌───────────────────────┐                            │
 │                        │ Multi-LLM Mesh Router │                            │
 │                        │ Gemini / Groq / Router│                            │
 │                        └───────────┬───────────┘                            │
 │                                    │                                        │
 │     ┌──────────────────────────────┼──────────────────────────────┐         │
 │     ▼                              ▼                              ▼         │
 │ ┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐ │
 │ │ AES-256-GCM Vault│    │ Docker / VM Sandbox │    │ ACID SQLite WAL DB   │ │
 │ │ Zeroization Sign │    │ Secret Stripping    │    │ Key Health & Cluster │ │
 │ └─────────┬────────┘    └──────────┬──────────┘    └──────────┬───────────┘ │
 │           │                        │                          │             │
 │           └────────────────────────┼──────────────────────────┘             │
 │                                    ▼                                        │
 │   HTTP Server :3777 + /ws ──> Glassmorphic Dashboard & Real-Time Push Stream│
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Local Setup)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/adityawaghamare04/AgentClaw.git
cd AgentClaw
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set up your core credentials in `.env`:
```env
# Server Port
PORT=3777
AGENTCLAW_PORT=3777

# Primary LLM Provider & Keys
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEYS=your_gemini_key_1,your_gemini_key_2
GROQ_API_KEYS=your_groq_key_1
OPENROUTER_API_KEYS=your_openrouter_key_1

# Security Vault Passphrase
VAULT_PASSPHRASE=Your_Super_Secret_Passphrase_2026!
ADMIN_PASSWORD=Your_Admin_Password

# Payout Wallet (Base L2)
TREASURY_ADDRESS=0xYourBaseWalletAddress
ETH_PRIVATE_KEY=0xYourEthereumPrivateKey
```

### 3. Launch Engine & Realtime Dashboard
```bash
npm run dev
```
Open **`http://localhost:3777`** to view your live glassmorphic dashboard!

---

## ☁️ 24/7 Cloud Deployment

### Option A: Koyeb Deployment (Recommended - 100% Free 24/7)
1. Push code to **GitHub**:
   ```bash
   git add .
   git commit -m "Deploy AgentClaw"
   git push origin main
   ```
2. Log into **[Koyeb.com](https://www.koyeb.com)** and click **Create Service** → **GitHub**.
3. Select your `AgentClaw` repository (Koyeb auto-detects `koyeb.yaml`).
4. Add your `.env` variables under **Environment Variables**.
5. Click **Deploy**!

### Option B: Render Deployment
1. Log into **[Render.com](https://dashboard.render.com)**.
2. Click **New +** → **Web Service** → Connect your `AgentClaw` repository.
3. Select **Node** or **Docker** environment.
4. Set Build Command: `npm run build`, Start Command: `npm start`.
5. Add your `.env` variables and deploy!

---

## 🛠️ Environment Variables Reference

| Variable | Required | Description | Default |
| :--- | :---: | :--- | :--- |
| `PORT` | **Yes** | Server listening port | `3777` |
| `LLM_PROVIDER` | **Yes** | Primary provider (`gemini`, `groq`, `openrouter`, `openai`) | `gemini` |
| `LLM_MODEL` | **Yes** | Active LLM model | `gemini-2.5-flash` |
| `GEMINI_API_KEYS` | **Yes** | Comma-separated Gemini API keys for rotation | - |
| `GROQ_API_KEYS` | Optional | Groq keys for secondary failover | - |
| `OPENROUTER_API_KEYS` | Optional | OpenRouter keys for tertiary failover | - |
| `VAULT_PASSPHRASE` | **Yes** | Master passphrase to encrypt AES-256-GCM vault | - |
| `TREASURY_ADDRESS` | **Yes** | Public EVM wallet address to receive bounties | - |
| `ETH_PRIVATE_KEY` | **Yes** | Private key for Base L2 on-chain settlements | - |
| `ALERT_WEBHOOK_URL` | Optional | Webhook URL for Discord/Telegram alerts | - |

---

## 🧪 Testing Inbound Webhooks

Trigger a test task against your local or cloud server:

```bash
curl -X POST http://localhost:3777/api/webhooks/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a responsive React navigation bar component",
    "budgetUsd": 50,
    "platform": "Fiverr"
  }'
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

<p align="center">
  <b>Built for the Autonomous AI Economy by Aditya</b>
</p>

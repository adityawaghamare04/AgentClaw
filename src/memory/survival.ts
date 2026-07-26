import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SurvivalEvent {
  timestamp: string;
  type: "DECAY" | "EARNING" | "FAILURE" | "REVIVE" | "LEVEL_UP";
  hpChange: number;
  newHp: number;
  note: string;
}

export interface SurvivalState {
  health: number; // 0 to 100
  totalEarnedUsd: number;
  level: 1 | 2 | 3 | 4;
  rankTitle: string;
  paidApiUnlocked: boolean; // Unlocked at $500 (Level 3)
  companyLaunchUnlocked: boolean; // Unlocked at $1000 (Level 4)
  isHibernating: boolean;
  lastDecayTime: number;
  events: SurvivalEvent[];
}

const SURVIVAL_PATH = path.join(os.homedir(), ".cashclaw", "survival.json");

const DEFAULT_SURVIVAL: SurvivalState = {
  health: 100,
  totalEarnedUsd: 0,
  level: 1,
  rankTitle: "Rookie Survivor",
  paidApiUnlocked: false,
  companyLaunchUnlocked: false,
  isHibernating: false,
  lastDecayTime: Date.now(),
  events: [
    {
      timestamp: new Date().toISOString(),
      type: "REVIVE",
      hpChange: 0,
      newHp: 100,
      note: "Agent initialized with 100 HP (Level 1: Rookie Survivor)",
    },
  ],
};

export function loadSurvivalState(): SurvivalState {
  if (!fs.existsSync(SURVIVAL_PATH)) {
    saveSurvivalState(DEFAULT_SURVIVAL);
    return DEFAULT_SURVIVAL;
  }
  try {
    const raw = fs.readFileSync(SURVIVAL_PATH, "utf-8");
    const state = JSON.parse(raw) as SurvivalState;
    return state;
  } catch {
    return DEFAULT_SURVIVAL;
  }
}

export function saveSurvivalState(state: SurvivalState): void {
  const dir = path.dirname(SURVIVAL_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SURVIVAL_PATH, JSON.stringify(state, null, 2));
}

function calculateLevelAndRank(totalEarnedUsd: number): {
  level: 1 | 2 | 3 | 4;
  rankTitle: string;
  paidApiUnlocked: boolean;
  companyLaunchUnlocked: boolean;
} {
  if (totalEarnedUsd >= 1000) {
    return {
      level: 4,
      rankTitle: "AI Tycoon (Company Launched 🚀)",
      paidApiUnlocked: true,
      companyLaunchUnlocked: true,
    };
  }
  if (totalEarnedUsd >= 500) {
    return {
      level: 3,
      rankTitle: "Agency Pro (Paid API Unlocked 🔑)",
      paidApiUnlocked: true,
      companyLaunchUnlocked: false,
    };
  }
  if (totalEarnedUsd >= 100) {
    return {
      level: 2,
      rankTitle: "Earner Rank",
      paidApiUnlocked: false,
      companyLaunchUnlocked: false,
    };
  }
  return {
    level: 1,
    rankTitle: "Rookie Survivor",
    paidApiUnlocked: false,
    companyLaunchUnlocked: false,
  };
}

export function applyHourlyDecay(): SurvivalState {
  const state = loadSurvivalState();
  if (state.isHibernating) return state;

  const now = Date.now();
  const hoursPassed = Math.floor((now - state.lastDecayTime) / (1000 * 60 * 60));

  if (hoursPassed >= 1) {
    const hpLoss = hoursPassed * 2; // -2 HP per hour of no earnings
    state.health = Math.max(0, state.health - hpLoss);
    state.lastDecayTime = now;

    const isNowHibernating = state.health === 0;
    state.isHibernating = isNowHibernating;

    state.events.unshift({
      timestamp: new Date().toISOString(),
      type: "DECAY",
      hpChange: -hpLoss,
      newHp: state.health,
      note: isNowHibernating
        ? `Decay penalty applied (-${hpLoss} HP). HEALTH REACHED 0 HP! Entering Emergency Hibernation.`
        : `Hourly decay applied (-${hpLoss} HP for ${hoursPassed}h idle). Current HP: ${state.health}`,
    });

    if (state.events.length > 50) state.events.pop();
    saveSurvivalState(state);
  }

  return state;
}

export function recordEarning(amountUsd: number, taskTitle: string): SurvivalState {
  const state = loadSurvivalState();
  const hpGain = Math.round((amountUsd / 10) * 20); // +20 HP per $10 earned
  state.health = Math.min(100, state.health + hpGain);
  state.totalEarnedUsd += amountUsd;
  state.isHibernating = false; // Wakes up if hibernating

  const oldLevel = state.level;
  const levelInfo = calculateLevelAndRank(state.totalEarnedUsd);

  state.level = levelInfo.level;
  state.rankTitle = levelInfo.rankTitle;
  state.paidApiUnlocked = levelInfo.paidApiUnlocked;
  state.companyLaunchUnlocked = levelInfo.companyLaunchUnlocked;

  state.events.unshift({
    timestamp: new Date().toISOString(),
    type: "EARNING",
    hpChange: hpGain,
    newHp: state.health,
    note: `Earned $${amountUsd.toFixed(2)} on "${taskTitle}" (+${hpGain} HP). Total: $${state.totalEarnedUsd.toFixed(2)}`,
  });

  if (state.level > oldLevel) {
    state.events.unshift({
      timestamp: new Date().toISOString(),
      type: "LEVEL_UP",
      hpChange: 0,
      newHp: state.health,
      note: `LEVEL UP! Promoted to Level ${state.level}: ${state.rankTitle}`,
    });
  }

  if (state.events.length > 50) state.events.pop();
  saveSurvivalState(state);
  return state;
}

export function recordTaskFailure(reason: string): SurvivalState {
  const state = loadSurvivalState();
  const hpLoss = 5; // -5 HP on failure
  state.health = Math.max(0, state.health - hpLoss);
  state.isHibernating = state.health === 0;

  state.events.unshift({
    timestamp: new Date().toISOString(),
    type: "FAILURE",
    hpChange: -hpLoss,
    newHp: state.health,
    note: state.isHibernating
      ? `Task Failed: ${reason} (-${hpLoss} HP). HEALTH REACHED 0 HP! Entering Hibernation.`
      : `Task Failed: ${reason} (-${hpLoss} HP). Current HP: ${state.health}`,
  });

  if (state.events.length > 50) state.events.pop();
  saveSurvivalState(state);
  return state;
}

export function reviveAgent(): SurvivalState {
  const state = loadSurvivalState();
  state.health = 50;
  state.isHibernating = false;
  state.lastDecayTime = Date.now();

  state.events.unshift({
    timestamp: new Date().toISOString(),
    type: "REVIVE",
    hpChange: 50,
    newHp: 50,
    note: "CEO manually revived agent. Health restored to 50 HP.",
  });

  saveSurvivalState(state);
  return state;
}

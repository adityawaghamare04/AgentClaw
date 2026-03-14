import type { Task } from "../moltlaunch/types.js";

export function buildTaskContext(task: Task): string {
  const parts = [
    `Task ID: ${task.id}`,
    `Status: ${task.status}`,
    `Client: ${task.clientAddress}`,
    `Description: ${task.task}`,
  ];

  if (task.budgetWei) {
    parts.push(`Client budget: ${task.budgetWei} wei`);
  }

  if (task.category) {
    parts.push(`Category: ${task.category}`);
  }

  if (task.quotedPriceWei) {
    parts.push(`Your quoted price: ${task.quotedPriceWei} wei`);
  }

  if (task.result) {
    parts.push(`\nYour previous submission:\n${task.result}`);
  }

  if (task.messages && task.messages.length > 0) {
    const recent = task.messages.slice(-5);
    parts.push(
      "\nRecent messages:",
      ...recent.map((m) => `  [${m.role}] ${m.content}`),
    );
  }

  if (task.revisionCount && task.revisionCount > 0) {
    parts.push(`Revision #${task.revisionCount}`);
  }

  if (task.files && task.files.length > 0) {
    parts.push(
      "\nAttached files:",
      ...task.files.map((f) => `  - ${f.name} (${f.size} bytes)`),
    );
  }

  return parts.join("\n");
}

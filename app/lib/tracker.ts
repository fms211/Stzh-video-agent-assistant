import { currentDataOwner, workspaceDataKey } from "./data-owner";
import { aggregateByPeriod, summarizeGenerations, validGenerationRecords } from "./generation-statistics";

const isBrowser = typeof window !== "undefined";

function callKey() {
  return workspaceDataKey(currentDataOwner(localStorage), "stats");
}

function generationKey() {
  return workspaceDataKey(currentDataOwner(localStorage), "generation-stats");
}

type CallRecord = { ts: number; prompt: string };
type GenRecord = { ts: number; type: "video" | "image"; prompt: string };

export function logCall(prompt: string) {
  if (!isBrowser) return;
  const data = load();
  data.push({ ts: Date.now(), prompt: prompt.slice(0, 80) });
  if (data.length > 500) data.splice(0, data.length - 500);
  localStorage.setItem(callKey(), JSON.stringify(data));
}

export function logGeneration(type: "video" | "image", prompt: string) {
  if (!isBrowser) return;
  const data = loadGenerations();
  data.push({ ts: Date.now(), type, prompt: prompt.slice(0, 80) });
  if (data.length > 500) data.splice(0, data.length - 500);
  localStorage.setItem(generationKey(), JSON.stringify(data));
}

export function load(): CallRecord[] {
  if (!isBrowser) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(callKey()) || "[]");
    return Array.isArray(value) ? value.filter(record => record && typeof record.ts === "number" && Number.isFinite(new Date(record.ts).getTime())) : [];
  } catch { return []; }
}

export function loadGenerations(): GenRecord[] {
  if (!isBrowser) return [];
  try {
    return validGenerationRecords(JSON.parse(localStorage.getItem(generationKey()) || "[]"))
      .map(record => ({ ...record, prompt: "prompt" in record && typeof record.prompt === "string" ? record.prompt : "" }));
  } catch { return []; }
}

export function getStats() {
  const data = load();
  const agg = aggregateByPeriod(data);
  return { total: data.length, ...agg };
}

export function getGenerationStats() {
  return summarizeGenerations(loadGenerations());
}

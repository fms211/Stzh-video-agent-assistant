import { currentDataOwner, workspaceDataKey } from "./data-owner";

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
  try { return JSON.parse(localStorage.getItem(callKey()) || "[]"); } catch { return []; }
}

export function loadGenerations(): GenRecord[] {
  if (!isBrowser) return [];
  try { return JSON.parse(localStorage.getItem(generationKey()) || "[]"); } catch { return []; }
}

function aggregateByPeriod(data: { ts: number }[]) {
  const now = Date.now();
  const dayMs = 86400000;

  const daily: Record<string, number> = {};
  const weekly: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly: number[] = new Array(24).fill(0);

  for (const r of data) {
    const d = new Date(r.ts);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    daily[dayKey] = (daily[dayKey] || 0) + 1;

    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,"0")}-${String(weekStart.getDate()).padStart(2,"0")}`;
    weekly[weekKey] = (weekly[weekKey] || 0) + 1;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    monthly[monthKey] = (monthly[monthKey] || 0) + 1;

    hourly[d.getHours()]++;
  }

  const dayLabels: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    dayLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
  }

  const weekLabels: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now - i * 7 * dayMs);
    d.setDate(d.getDate() - d.getDay());
    weekLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
  }

  const monthLabels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    monthLabels.push(`${d.getFullYear()}/${d.getMonth()+1}`);
  }

  return { daily, weekly, monthly, hourly, dayLabels, weekLabels, monthLabels };
}

export function getStats() {
  const data = load();
  const agg = aggregateByPeriod(data);
  return { total: data.length, ...agg };
}

export function getGenerationStats() {
  const data = loadGenerations();
  const agg = aggregateByPeriod(data);
  const videoCount = data.filter((d) => d.type === "video").length;
  const imageCount = data.filter((d) => d.type === "image").length;
  return { total: data.length, videoCount, imageCount, ...agg };
}

import { normalizeMediaUrl } from "./workspace-media.ts";

export type GenerationRecord = { ts: number; type: "video" | "image" };
type StatisticsTask = {
  id: string;
  status: string;
  completedAt?: string | null;
  createdAt?: string;
  output?: Record<string, unknown> | null;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const validTimestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isFinite(new Date(value).getTime());

export function validGenerationRecords(value: unknown): GenerationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record): record is GenerationRecord => record && validTimestamp(record.ts) && ["video", "image"].includes(record.type));
}

export function aggregateByPeriod(records: { ts: number }[], now = new Date()) {
  const daily: Record<string, number> = {};
  const weekly: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly: number[] = new Array(24).fill(0);
  for (const record of records) {
    if (!validTimestamp(record.ts)) continue;
    const date = new Date(record.ts);
    const week = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
    const day = dateKey(date), weekKey = dateKey(week), month = day.slice(0, 7);
    daily[day] = (daily[day] || 0) + 1;
    weekly[weekKey] = (weekly[weekKey] || 0) + 1;
    monthly[month] = (monthly[month] || 0) + 1;
    hourly[date.getHours()]++;
  }
  // Calendar arithmetic avoids DST gaps and month-end overflow. Labels never serve as keys.
  const days = Array.from({ length: 14 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i));
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (7 - i) * 7));
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const shortLabel = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  return {
    daily, weekly, monthly, hourly,
    dayKeys: days.map(dateKey), weekKeys: weeks.map(dateKey), monthKeys: months.map(date => dateKey(date).slice(0, 7)),
    dayLabels: days.map(shortLabel), weekLabels: weeks.map(shortLabel), monthLabels: months.map(date => `${date.getFullYear()}/${date.getMonth() + 1}`),
  };
}

export function summarizeGenerations(value: unknown, now = new Date()) {
  const records = validGenerationRecords(value);
  return {
    total: records.length,
    videoCount: records.filter(record => record.type === "video").length,
    imageCount: records.filter(record => record.type === "image").length,
    ...aggregateByPeriod(records, now),
  };
}

export async function loadGenerationRecords(
  fetchPage: (cursor?: string) => Promise<{ tasks: StatisticsTask[]; nextCursor: string | null }>,
  isCurrent: () => boolean = () => true,
): Promise<GenerationRecord[]> {
  const records = new Map<string, GenerationRecord>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    if (!isCurrent()) return [];
    const page = await fetchPage(cursor);
    if (!isCurrent()) return [];
    if (!page || !Array.isArray(page.tasks) || (page.nextCursor != null && typeof page.nextCursor !== "string")) {
      throw new Error("统计响应格式不正确，请刷新重试");
    }
    for (const task of page.tasks) {
      if (!task || typeof task !== "object" || typeof task.id !== "string" || !task.id || typeof task.status !== "string") {
        throw new Error("统计任务记录格式不正确，请刷新重试");
      }
      if (task.status !== "completed" || !task.output) continue;
      const ts = Date.parse(task.completedAt || task.createdAt || "");
      if (!validTimestamp(ts)) continue;
      const video = normalizeMediaUrl(task.output.videoUrl);
      const image = Array.isArray(task.output.imageUrls) && task.output.imageUrls.some(url => normalizeMediaUrl(url));
      // Count successful tasks, not assets. A task containing video and images counts once as video.
      if (video || image) records.set(task.id, { ts, type: video ? "video" : "image" });
    }
    cursor = page.nextCursor || undefined;
    if (cursor && cursors.has(cursor)) throw new Error("统计分页游标重复，请刷新重试");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...records.values()];
}

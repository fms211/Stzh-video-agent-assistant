export type MediaItem = {
  id: string;
  type: "video" | "image";
  url: string;
  sessionTitle: string;
  sessionId: string;
  timestamp: number;
};

type MediaTask = {
  id: string;
  title?: string;
  status: string;
  completedAt?: string | null;
  createdAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
};

export function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Historical results included Markdown's closing delimiter in signed URLs.
  const cleaned = value.trim().replace(/[)\]]+$/, "");
  try {
    const url = new URL(cleaned);
    return ["http:", "https:"].includes(url.protocol) ? cleaned : null;
  } catch { return null; }
}

export function mediaFromTasks(tasks: MediaTask[]): MediaItem[] {
  return tasks.flatMap((task) => {
    if (task.status !== "completed" || !task.output) return [];
    const timestamp = Date.parse(task.completedAt || task.createdAt || "") || 0;
    const common = {sessionTitle: task.title || "生成作品", sessionId: String(task.input?.conversationId || ""), timestamp};
    const items: MediaItem[] = [];
    const video = normalizeMediaUrl(task.output.videoUrl);
    if (video) items.push({ ...common, id: `${task.id}-video`, type: "video", url: video });
    if (Array.isArray(task.output.imageUrls)) task.output.imageUrls.forEach((value, index) => {
      const url = normalizeMediaUrl(value);
      if (url) items.push({ ...common, id: `${task.id}-image-${index}`, type: "image", url });
    });
    return items;
  });
}

export function mergeMedia(...groups: MediaItem[][]): MediaItem[] {
  const unique = new Map<string, MediaItem>();
  for (const item of groups.flat()) {
    const url = normalizeMediaUrl(item.url);
    const key = `${item.type}:${url}`;
    if (url && !unique.has(key)) unique.set(key, { ...item, url });
  }
  return [...unique.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export async function loadTaskMedia(
  fetchPage: (cursor?: string) => Promise<{ tasks: MediaTask[]; nextCursor: string | null }>,
  isCurrent: () => boolean = () => true,
): Promise<MediaItem[]> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  do {
    if (!isCurrent()) return [];
    const page = await fetchPage(cursor);
    if (!isCurrent()) return [];
    items.push(...mediaFromTasks(page.tasks));
    cursor = page.nextCursor || undefined;
    if (cursor && seen.has(cursor)) throw new Error("作品分页游标重复，请刷新重试");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return mergeMedia(items);
}

// OPC 记忆系统 — 四层记忆架构
// 参考 hello-agents-fms 第八章：WorkingMemory / EpisodicMemory / SemanticMemory

// ── 记忆条目类型 ──

export interface MemoryItem {
  id: string;
  content: string;
  memoryType: "working" | "episodic" | "semantic";
  importance: number; // 0.0-1.0
  timestamp: number;
  metadata: Record<string, unknown>;
  sessionId?: string;
}

// ── 工作记忆（当前会话临时信息）──

class WorkingMemory {
  private items: MemoryItem[] = [];
  private maxCapacity = 50;
  private ttlMs = 60 * 60 * 1000; // 1 小时

  add(item: MemoryItem): void {
    this.items.push(item);
    this.cleanup();
  }

  search(query: string, limit: number = 5): MemoryItem[] {
    this.cleanup();
    const queryLower = query.toLowerCase();
    const scored = this.items
      .map((item) => ({
        item,
        score: this.calculateScore(item, queryLower),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => s.item);
  }

  private calculateScore(item: MemoryItem, query: string): number {
    const contentLower = item.content.toLowerCase();
    const keywords = query.split(/\s+/).filter((w) => w.length > 1);
    let hits = 0;
    for (const kw of keywords) {
      if (contentLower.includes(kw)) hits++;
    }
    const keywordScore = keywords.length > 0 ? hits / keywords.length : 0;
    const importanceWeight = 0.8 + item.importance * 0.4;
    return keywordScore * importanceWeight;
  }

  private cleanup(): void {
    const now = Date.now();
    this.items = this.items.filter((item) => now - item.timestamp < this.ttlMs);
    if (this.items.length > this.maxCapacity) {
      this.items.sort((a, b) => b.importance - a.importance);
      this.items = this.items.slice(0, this.maxCapacity);
    }
  }

  getAll(): MemoryItem[] {
    this.cleanup();
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}

// ── 情景记忆（具体事件和经历）──

class EpisodicMemory {
  private items: MemoryItem[] = [];
  private maxCapacity = 200;

  add(item: MemoryItem): void {
    this.items.push(item);
    if (this.items.length > this.maxCapacity) {
      // 按重要性淘汰
      this.items.sort((a, b) => b.importance - a.importance);
      this.items = this.items.slice(0, this.maxCapacity);
    }
  }

  search(query: string, limit: number = 5): MemoryItem[] {
    const queryLower = query.toLowerCase();
    const scored = this.items
      .map((item) => ({
        item,
        score: this.calculateScore(item, queryLower),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => s.item);
  }

  private calculateScore(item: MemoryItem, query: string): number {
    const contentLower = item.content.toLowerCase();
    const keywords = query.split(/\s+/).filter((w) => w.length > 1);
    let hits = 0;
    for (const kw of keywords) {
      if (contentLower.includes(kw)) hits++;
    }
    const keywordScore = keywords.length > 0 ? hits / keywords.length : 0;

    // 时间衰减（24小时内保持高分）
    const ageHours = (Date.now() - item.timestamp) / (1000 * 60 * 60);
    const recencyScore = Math.exp(-0.1 * ageHours / 24);

    const importanceWeight = 0.8 + item.importance * 0.4;
    return (keywordScore * 0.7 + recencyScore * 0.3) * importanceWeight;
  }

  getAll(): MemoryItem[] {
    return [...this.items];
  }
}

// ── 语义记忆（抽象知识和用户偏好）──

class SemanticMemory {
  private items: MemoryItem[] = [];
  private maxCapacity = 100;

  add(item: MemoryItem): void {
    this.items.push(item);
    if (this.items.length > this.maxCapacity) {
      this.items.sort((a, b) => b.importance - a.importance);
      this.items = this.items.slice(0, this.maxCapacity);
    }
  }

  search(query: string, limit: number = 5): MemoryItem[] {
    const queryLower = query.toLowerCase();
    const scored = this.items
      .map((item) => ({
        item,
        score: this.calculateScore(item, queryLower),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s) => s.item);
  }

  private calculateScore(item: MemoryItem, query: string): number {
    const contentLower = item.content.toLowerCase();
    const keywords = query.split(/\s+/).filter((w) => w.length > 1);
    let hits = 0;
    for (const kw of keywords) {
      if (contentLower.includes(kw)) hits++;
    }
    const keywordScore = keywords.length > 0 ? hits / keywords.length : 0;
    const importanceWeight = 0.8 + item.importance * 0.4;
    return keywordScore * importanceWeight;
  }

  getAll(): MemoryItem[] {
    return [...this.items];
  }
}

// ── 记忆管理器（统一调度）──

class MemoryManager {
  private workingMemory = new WorkingMemory();
  private episodicMemory = new EpisodicMemory();
  private semanticMemory = new SemanticMemory();

  /**
   * 添加记忆
   */
  add(
    content: string,
    memoryType: MemoryItem["memoryType"],
    importance: number = 0.5,
    metadata: Record<string, unknown> = {},
    sessionId?: string,
  ): string {
    const item: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      memoryType,
      importance,
      timestamp: Date.now(),
      metadata,
      sessionId,
    };

    switch (memoryType) {
      case "working":
        this.workingMemory.add(item);
        break;
      case "episodic":
        this.episodicMemory.add(item);
        break;
      case "semantic":
        this.semanticMemory.add(item);
        break;
    }

    return item.id;
  }

  /**
   * 搜索记忆（跨类型）
   */
  search(query: string, limit: number = 5): MemoryItem[] {
    const results: MemoryItem[] = [];

    // 搜索各类型记忆
    results.push(...this.workingMemory.search(query, limit));
    results.push(...this.episodicMemory.search(query, limit));
    results.push(...this.semanticMemory.search(query, limit));

    // 去重并按分数排序
    const seen = new Set<string>();
    const unique = results.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    return unique.slice(0, limit);
  }

  /**
   * 整合记忆（工作记忆 → 情景记忆）
   */
  consolidate(importanceThreshold: number = 0.7): number {
    const workingItems = this.workingMemory.getAll();
    let consolidated = 0;

    for (const item of workingItems) {
      if (item.importance >= importanceThreshold) {
        this.episodicMemory.add({ ...item, memoryType: "episodic" });
        consolidated++;
      }
    }

    return consolidated;
  }

  /**
   * 获取记忆摘要
   */
  getSummary(): { working: number; episodic: number; semantic: number } {
    return {
      working: this.workingMemory.getAll().length,
      episodic: this.episodicMemory.getAll().length,
      semantic: this.semanticMemory.getAll().length,
    };
  }
}

// 全局记忆管理器实例
const memoryManager = new MemoryManager();

// ── 导出接口 ──

export function addMemory(
  content: string,
  memoryType: MemoryItem["memoryType"],
  importance: number = 0.5,
  metadata: Record<string, unknown> = {},
  sessionId?: string,
): string {
  return memoryManager.add(content, memoryType, importance, metadata, sessionId);
}

export function searchMemory(query: string, limit: number = 5): MemoryItem[] {
  return memoryManager.search(query, limit);
}

export function consolidateMemory(importanceThreshold: number = 0.7): number {
  return memoryManager.consolidate(importanceThreshold);
}

export function getMemorySummary(): { working: number; episodic: number; semantic: number } {
  return memoryManager.getSummary();
}

/**
 * 格式化记忆为可注入 system prompt 的文本
 */
export function formatMemoryContext(memories: MemoryItem[]): string {
  if (memories.length === 0) return "";

  const lines = ["## 相关记忆（历史交互和用户偏好）", ""];
  for (const mem of memories) {
    const typeLabel = {
      working: "当前会话",
      episodic: "历史记录",
      semantic: "用户偏好",
    }[mem.memoryType];

    lines.push(`- [${typeLabel}] ${mem.content}`);
  }
  return lines.join("\n");
}

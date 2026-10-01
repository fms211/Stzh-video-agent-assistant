// 创意工坊统一工作区 — CreativeContext 纯函数（规划 §1.3）
// reduceCreativeContext：结构化同步（同值不 bump revision）；
// buildPromptFragment：规范化提示词片段（顺序：风格 → 运镜 → 参数 → 时长 → 画幅）；
// shouldInsert：revision 去重（仅 revision > lastInsertedRevision 时允许插入）。

import type { CreativeContext } from "./appearance-types.ts";
import { emptyCreativeContext } from "./appearance-types.ts";

export { emptyCreativeContext };

/** Snapshot visible parameters; this is user input, never approval authority. */
export function creativeConstraints(ctx?: CreativeContext): Record<string, string> {
  if (!ctx) return {};
  return {
    ...(ctx.styleLabel ? { style: ctx.styleLabel } : {}),
    ...(ctx.cameraMoveLabel ? { camera: ctx.cameraMoveLabel } : {}),
    ...(ctx.selectedParams.length ? { composition: ctx.selectedParams.join("；") } : {}),
    duration: String(ctx.durationSeconds),
    aspect: ctx.aspect,
  };
}

export function reduceCreativeContext(current: CreativeContext, patch: Partial<CreativeContext>): CreativeContext {
  const keys = Object.keys(patch) as Array<keyof CreativeContext>;
  const changed = keys.some((key) => {
    if (key === "revision") return false;
    return JSON.stringify((current as Record<string, unknown>)[key]) !== JSON.stringify((patch as Record<string, unknown>)[key]);
  });
  if (!changed) return current;

  const next: CreativeContext = {
    ...current,
    ...patch,
    revision: current.revision + 1,
  };
  next.promptFragment = buildPromptFragment(next);
  return next;
}

export function buildPromptFragment(ctx: CreativeContext): string {
  const parts: string[] = [];
  if (ctx.styleLabel) parts.push(ctx.styleLabel);
  if (ctx.cameraMoveLabel) parts.push(ctx.cameraMoveLabel);
  if (ctx.selectedParams.length > 0) parts.push(ctx.selectedParams.join(" + "));
  parts.push(`${ctx.durationSeconds} 秒`);
  parts.push(ctx.aspect);
  return parts.join("；");
}

export function shouldInsert(ctx: CreativeContext, lastInsertedRevision: number): boolean {
  return ctx.revision > lastInsertedRevision;
}

export function formatContextSummary(ctx: CreativeContext): string {
  const parts: string[] = [];
  if (ctx.styleLabel) parts.push(`风格·${ctx.styleLabel}`);
  if (ctx.durationSeconds !== 8) parts.push(`时长${ctx.durationSeconds}s`);
  if (ctx.selectedParams.length > 0) parts.push(`${ctx.selectedParams.length} 参数`);
  return parts.join(" ｜ ");
}

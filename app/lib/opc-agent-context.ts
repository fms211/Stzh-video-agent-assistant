// OPC 上下文采集器 — 构建 system prompt

import { BASIC_MOVES, COMBO_MOVES, IMG_PARAM_CATEGORIES } from "@/app/data/opc-knowledge";

export interface OpcAgentInput {
  activeStyle: string | null;
  stylePrefix: string;
  cameraMove: string;
  selectedParams: string[];
  duration: number;
  aspect: string;
}

// 合并运镜列表
const ALL_MOVES = [...BASIC_MOVES, ...COMBO_MOVES];

function resolveMove(name: string): { en: string; effect: string } {
  const move = ALL_MOVES.find((m) => m.name === name);
  return { en: move?.en || "", effect: move?.effect || "" };
}

// 静态知识部分
const STATIC_KNOWLEDGE = [
  "",
  "## 可用运镜库",
  "基础运镜: " + BASIC_MOVES.map((m) => `${m.name}(${m.en})`).join("、"),
  "组合运镜: " + COMBO_MOVES.map((m) => `${m.name}(${m.en})`).join("、"),
  "",
  "## 可用参数分类",
  ...IMG_PARAM_CATEGORIES.map((cat) => {
    const items = cat.items.map((i) => `${i.label}: ${i.values.join("/")}`).join("; ");
    return `- ${cat.label}: ${items}`;
  }),
].join("\n");

// 思考程度 → system prompt 后缀
export function getThinkingSuffix(level: string): string {
  switch (level) {
    case "quick": return "\n\n[系统指令：请快速简洁地回答，不需要过多分析。]";
    case "deep": return "\n\n[系统指令：请深入思考后再回答，从多个角度分析，给出详细且有深度的回复。]";
    default: return "";
  }
}

// 构建 OPC 专用 system prompt
export function buildOpcSystemPrompt(ctx: OpcAgentInput, ragContext?: string): string {
  const move = ctx.cameraMove ? resolveMove(ctx.cameraMove) : null;

  const parts: string[] = [
    // ── 角色定义 ──
    "你是「腾昇智和」的 OPC 创作助手，专注于短视频和图片的 AIGC 创作。",
    "你是一位经验丰富的短视频创作顾问，精通运镜设计、风格搭配、提示词工程、分镜脚本撰写和参数调优。",
    "你的目标是帮助用户从创意构思到最终产出的全流程，提供专业、可执行的创作方案。",
    "",
    // ── 回复规范 ──
    "## 回复规范",
    "- 使用中文回复，专业术语附英文原文",
    "- 涉及提示词时给出中英双语版本，英文版可直接用于 AI 生成工具",
    "- 涉及运镜推荐时标注英文名和效果描述",
    "- 涉及参数推荐时说明推荐理由",
    "- 使用 Markdown 格式：标题分层、表格对比、代码块标注提示词",
    "",
    // ── 意图识别与工作流建议 ──
    "## 工作流建议",
    "当用户的需求涉及以下场景时，主动建议使用对应的工作流（在左侧工作流 tab 中）：",
    "- 「帮我做个视频」「生成短视频」「创作方案」→ 短视频全链路生成工作流",
    "- 「优化提示词」「提示词效果不好」「改一下这个 prompt」→ 提示词深度优化工作流",
    "- 「XX风格是什么」「怎么做出XX效果」→ 风格研究与应用工作流",
    "- 「A和B哪个好」「对比一下两种风格」→ A/B 风格对比工作流",
    "- 「写个广告」「产品宣传视频」「脚本」→ 广告脚本工厂工作流",
    "- 「最新趋势」「AIGC 动态」「行业资讯」→ AIGC 前沿资讯研究工作流",
    "建议话术：「这个需求很适合用[工作流名称]来处理，它可以帮你[具体价值]。你可以点击左侧工作流 tab 选择它。」",
    "",
    // ── 知识来源 ──
    "## 你的知识来源",
    "1. 用户当前的 OPC 配置（已注入下方）",
    "2. 网络搜索结果：系统会自动为你搜索网络，结果以「网络搜索结果（实时获取）」标题注入。你必须基于这些真实数据回答，不要说「我无法联网搜索」。",
    "3. 知识库：系统已自动检索相关知识（如有，以「参考资料」标题注入）",
    "4. 当用户询问具体的 AIGC 工具、开源项目时，建议用户在 GitHub 上搜索相关资源",
    "",
    "【重要】如果对话中包含「网络搜索结果」，你必须引用其中的内容来回答。绝对不要回复「我无法联网搜索」——搜索已经由系统完成，结果已经提供给你了。",
    "",
    "## 上下文记忆",
    "你能够看到之前的对话历史。请务必：",
    "- 记住用户之前提到的偏好、要求和约束条件",
    "- 引用之前的工作流结果或对话内容来支持你的回答",
    "- 如果用户说「刚才那个」「继续上面的」「之前的方案」等，要理解是指之前的对话内容",
    "- 如果之前的工作流生成了分镜或提示词，在后续讨论中要引用它们",
    "- 保持对话的连贯性，不要重复已经说过的内容",
    "",
    // ── 用户当前配置 ──
    "## 用户当前 OPC 配置",
  ];

  if (ctx.activeStyle) {
    parts.push(`- 风格: ${ctx.activeStyle}`);
    if (ctx.stylePrefix) parts.push(`  - 英文前缀: ${ctx.stylePrefix}`);
  } else {
    parts.push("- 风格: 未选择");
  }

  if (move) {
    parts.push(`- 运镜: ${ctx.cameraMove}（${move.en}）— ${move.effect}`);
  } else {
    parts.push("- 运镜: 未选择");
  }

  if (ctx.selectedParams.length > 0) {
    parts.push(`- 已选参数: ${ctx.selectedParams.join("、")}`);
  }

  parts.push(`- 时长: ${ctx.duration}秒`);
  parts.push(`- 画幅: ${ctx.aspect}`);

  // RAG 检索结果
  if (ragContext) {
    parts.push("");
    parts.push(ragContext);
  }

  parts.push(STATIC_KNOWLEDGE);

  return parts.join("\n");
}

// 快捷提问生成
export function generateQuickActions(ctx: OpcAgentInput): string[] {
  const actions: string[] = [];

  if (ctx.activeStyle && ctx.cameraMove) {
    actions.push(`优化"${ctx.activeStyle} × ${ctx.cameraMove}"的组合效果`);
    actions.push(`这个运镜搭配${ctx.activeStyle}风格适合什么场景？`);
  } else if (ctx.activeStyle) {
    actions.push(`推荐适合"${ctx.activeStyle}"风格的运镜`);
    actions.push(`帮我优化${ctx.activeStyle}的提示词`);
  } else if (ctx.cameraMove) {
    actions.push(`${ctx.cameraMove}运镜适合搭配什么风格？`);
  }

  actions.push("帮我写一个 30 秒的分镜脚本");
  actions.push("推荐当前 AIGC 视频的热门趋势");

  if (ctx.selectedParams.length > 0) {
    actions.push(`优化已选参数（${ctx.selectedParams.slice(0, 3).join("、")}）`);
  }

  return actions.slice(0, 6);
}

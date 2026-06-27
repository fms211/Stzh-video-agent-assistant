// OPC 上下文采集器 — GSSC 流水线构建 system prompt
// 参考 hello-agents-fms 第九章：Gather → Select → Structure → Compress

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

// 思考程度 → system prompt 后缀
export function getThinkingSuffix(level: string): string {
  switch (level) {
    case "quick": return "\n\n[系统指令：请快速简洁地回答，不需要过多分析。]";
    case "deep": return "\n\n[系统指令：请深入思考后再回答，从多个角度分析，给出详细且有深度的回复。]";
    default: return "";
  }
}

// ── GSSC 流水线 ──

/**
 * Gather: 收集所有可用上下文
 */
function gatherContext(ctx: OpcAgentInput, ragContext?: string, searchContext?: string) {
  return {
    role: {
      name: "OPC 创作助手",
      expertise: ["运镜设计", "风格搭配", "提示词工程", "分镜脚本", "参数调优"],
      goal: "帮助用户从创意构思到最终产出的全流程",
    },
    state: {
      style: ctx.activeStyle,
      stylePrefix: ctx.stylePrefix,
      cameraMove: ctx.cameraMove ? resolveMove(ctx.cameraMove) : null,
      cameraMoveName: ctx.cameraMove,
      params: ctx.selectedParams,
      duration: ctx.duration,
      aspect: ctx.aspect,
    },
    evidence: {
      rag: ragContext || null,
      search: searchContext || null,
    },
    knowledge: {
      moves: ALL_MOVES,
      paramCategories: IMG_PARAM_CATEGORIES,
    },
  };
}

/**
 * Select: 根据上下文选择需要注入的内容
 * 避免注入不相关的知识，节省 token
 */
function selectRelevant(gathered: ReturnType<typeof gatherContext>): string[] {
  const sections: string[] = [];

  // 角色定义（始终注入）
  sections.push("role");

  // 回复规范（始终注入）
  sections.push("policies");

  // 用户配置（有配置时注入）
  if (gathered.state.style || gathered.state.cameraMove || gathered.state.params.length > 0) {
    sections.push("state");
  }

  // RAG 结果（有结果时注入）
  if (gathered.evidence.rag) {
    sections.push("evidence_rag");
  }

  // 搜索结果（有结果时注入）
  if (gathered.evidence.search) {
    sections.push("evidence_search");
  }

  // 工作流建议（始终注入）
  sections.push("workflows");

  // 知识来源说明（始终注入）
  sections.push("knowledge_source");

  // 上下文记忆（始终注入）
  sections.push("memory");

  // 静态知识（按需注入）
  if (!gathered.state.cameraMove) {
    // 未选择运镜时，注入运镜库供参考
    sections.push("static_moves");
  }
  if (gathered.state.params.length === 0) {
    // 未选择参数时，注入参数分类供参考
    sections.push("static_params");
  }

  return sections;
}

/**
 * Structure: 按优先级组织上下文
 * 参考 GSSC 流水线：Role → Task → State → Evidence → Context → Output
 */
function structureContext(
  gathered: ReturnType<typeof gatherContext>,
  selected: string[],
): string {
  const parts: string[] = [];

  // ── [Role & Policies] 角色定义（最高优先级）──
  if (selected.includes("role")) {
    parts.push(
      "你是「腾昇智和」的 OPC 创作助手，专注于短视频和图片的 AIGC 创作。",
      "你是一位经验丰富的短视频创作顾问，精通运镜设计、风格搭配、提示词工程、分镜脚本撰写和参数调优。",
      "你的目标是帮助用户从创意构思到最终产出的全流程，提供专业、可执行的创作方案。",
    );
  }

  if (selected.includes("policies")) {
    parts.push(
      "",
      "## 回复规范",
      "- 使用中文回复，专业术语附英文原文",
      "- 涉及提示词时给出中英双语版本，英文版可直接用于 AI 生成工具",
      "- 涉及运镜推荐时标注英文名和效果描述",
      "- 涉及参数推荐时说明推荐理由",
      "- 使用 Markdown 格式：标题分层、表格对比、代码块标注提示词",
    );
  }

  // ── [State] 用户当前配置 ──
  if (selected.includes("state")) {
    parts.push("", "## 用户当前 OPC 配置");

    if (gathered.state.style) {
      parts.push(`- 风格: ${gathered.state.style}`);
      if (gathered.state.stylePrefix) parts.push(`  - 英文前缀: ${gathered.state.stylePrefix}`);
    } else {
      parts.push("- 风格: 未选择");
    }

    if (gathered.state.cameraMove) {
      const move = gathered.state.cameraMove;
      parts.push(`- 运镜: ${gathered.state.cameraMoveName}（${move.en}）— ${move.effect}`);
    } else {
      parts.push("- 运镜: 未选择");
    }

    if (gathered.state.params.length > 0) {
      parts.push(`- 已选参数: ${gathered.state.params.join("、")}`);
    }

    parts.push(`- 时长: ${gathered.state.duration}秒`);
    parts.push(`- 画幅: ${gathered.state.aspect}`);
  }

  // ── [Evidence] 检索结果（按相关性排序）──
  if (selected.includes("evidence_rag") && gathered.evidence.rag) {
    parts.push("", gathered.evidence.rag);
  }

  if (selected.includes("evidence_search") && gathered.evidence.search) {
    parts.push("", gathered.evidence.search);
  }

  // ── [Workflows] 工作流建议 ──
  if (selected.includes("workflows")) {
    parts.push(
      "",
      "## 工作流建议",
      "当用户的需求涉及以下场景时，主动建议使用对应的工作流：",
      "- 「帮我做个视频」「生成短视频」→ 短视频全链路生成",
      "- 「优化提示词」「改一下 prompt」→ 提示词深度优化",
      "- 「XX风格是什么」→ 风格研究与应用",
      "- 「A和B哪个好」→ A/B 风格对比",
      "- 「写个广告」「产品宣传」→ 广告脚本工厂",
      "- 「最新趋势」「行业资讯」→ AIGC 前沿资讯研究",
    );
  }

  // ── [Knowledge Source] 知识来源 ──
  if (selected.includes("knowledge_source")) {
    parts.push(
      "",
      "## 你的知识来源",
      "1. 用户当前的 OPC 配置（已注入上方）",
      "2. 网络搜索结果（如有，以「网络搜索结果」标题注入）",
      "3. 知识库检索结果（如有，以「相关知识库参考」标题注入）",
      "",
      "【重要】如果对话中包含搜索结果，你必须引用其中的内容来回答。绝对不要回复「我无法联网搜索」。",
    );
  }

  // ── [Memory] 上下文记忆 ──
  if (selected.includes("memory")) {
    parts.push(
      "",
      "## 上下文记忆",
      "- 记住用户之前提到的偏好、要求和约束条件",
      "- 引用之前的工作流结果或对话内容来支持你的回答",
      "- 如果用户说「刚才那个」「继续上面的」，要理解是指之前的对话内容",
      "- 保持对话的连贯性，不要重复已经说过的内容",
    );
  }

  // ── [Static Knowledge] 静态知识（按需注入）──
  if (selected.includes("static_moves")) {
    parts.push(
      "",
      "## 可用运镜库",
      "基础运镜: " + BASIC_MOVES.map((m) => `${m.name}(${m.en})`).join("、"),
      "组合运镜: " + COMBO_MOVES.map((m) => `${m.name}(${m.en})`).join("、"),
    );
  }

  if (selected.includes("static_params")) {
    parts.push(
      "",
      "## 可用参数分类",
      ...IMG_PARAM_CATEGORIES.map((cat) => {
        const items = cat.items.map((i) => `${i.label}: ${i.values.join("/")}`).join("; ");
        return `- ${cat.label}: ${items}`;
      }),
    );
  }

  return parts.join("\n");
}

/**
 * buildOpcSystemPrompt — GSSC 流水线入口
 *
 * 流程：Gather → Select → Structure → (Compress 由 token 预算隐式处理)
 *
 * @param ctx 用户 OPC 配置
 * @param ragContext RAG 检索结果（可选）
 * @param searchContext 网络搜索结果（可选）
 */
export function buildOpcSystemPrompt(
  ctx: OpcAgentInput,
  ragContext?: string,
  searchContext?: string,
): string {
  // 1. Gather: 收集所有上下文
  const gathered = gatherContext(ctx, ragContext, searchContext);

  // 2. Select: 选择需要注入的内容
  const selected = selectRelevant(gathered);

  // 3. Structure: 按优先级组织
  const structured = structureContext(gathered, selected);

  return structured;
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

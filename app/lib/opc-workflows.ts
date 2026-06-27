// OPC 工作流引擎 — 链式多阶段自动执行

import type { OpcAgentInput } from "./opc-agent-context";

// ── 类型定义 ──

export type WorkflowStepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type WorkflowStepDef = {
  id: string;
  name: string;
  desc: string;
  /** 构建本步骤的 prompt，接收上一步输出和用户输入 */
  buildPrompt: (input: WorkflowInput, prevOutput: string) => string;
};

export type WorkflowDef = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: "create" | "optimize" | "research" | "script";
  /** 需要用户填写的输入字段 */
  fields: WorkflowField[];
  /** 链式步骤 */
  steps: WorkflowStepDef[];
  /** 是否启用 Reflection 自我反思优化（参考教科书 chapter4） */
  reflect?: boolean;
  /** 是否启用动态规划器（参考教科书 Plan-and-Solve） */
  dynamic?: boolean;
};

export type WorkflowField = {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea";
  required?: boolean;
};

export type WorkflowInput = Record<string, string>;

export type WorkflowStepState = {
  stepId: string;
  status: WorkflowStepStatus;
  output: string;
  error?: string;
};

export type WorkflowRunState = {
  workflowId: string;
  input: WorkflowInput;
  steps: WorkflowStepState[];
  currentStep: number;
  isRunning: boolean;
  finalOutput: string;
};

// ── 工作流定义 ──

// ── 动态规划器提示词（参考教科书 Plan-and-Solve） ──

const PLANNER_PROMPT = `你是一位顶级的 AI 规划专家。你的任务是分析用户需求，决定需要执行哪些步骤。

用户需求:
{input}

可用步骤:
{available_steps}

请分析用户需求，输出一个 JSON 数组，包含需要执行的步骤 ID。
- 只包含必要的步骤，跳过不相关的
- 步骤顺序要合理
- 如果需要，可以重复某个步骤

输出格式（必须是合法的 JSON）:
["step_id_1", "step_id_2", ...]`;

// ── Reflection 提示词模板（参考教科书 chapter4/Reflection.py） ──

const REFLECT_PROMPT = `你是一位极其严格的短视频创作评审专家。你的任务是审查以下创作方案，找出主要问题和改进空间。

# 原始需求:
{input}

# 待审查的方案:
{output}

请从以下维度严格审查：
1. **创意质量**：方案是否有新意？是否落入俗套？
2. **技术可行性**：提示词是否能被 AI 工具正确生成？
3. **完整性**：是否遗漏了重要元素（如转场、音效、节奏变化）？
4. **一致性**：风格、色调、运镜是否前后统一？
5. **用户价值**：方案是否真正解决了用户的创作需求？

如果发现明显问题，请指出并给出具体改进建议。
如果方案已经很好，回答"无需改进"。

请直接输出你的反馈，不要包含任何额外的解释。`;

const REFINE_PROMPT = `你是一位资深的短视频创作专家。你正在根据一位评审专家的反馈来优化你的方案。

# 原始需求:
{input}

# 你之前的方案:
{output}

# 评审员的反馈:
{feedback}

请根据评审员的反馈，生成一个优化后的方案。
- 修复评审中发现的所有问题
- 保持方案的核心优点
- 输出完整的优化后方案（不要只输出修改部分）

请直接输出优化后的方案，不要包含任何额外的解释。`;

export const WORKFLOW_DEFS: WorkflowDef[] = [
  {
    id: "full-video",
    name: "短视频全链路生成",
    desc: "主题确认 → 分镜脚本 → 提示词优化 → 最终方案",
    icon: "🎬",
    category: "create",
    reflect: true,
    dynamic: true,
    fields: [
      { key: "topic", label: "视频主题", placeholder: "如：产品宣传、城市航拍、美食探店", type: "text", required: true },
      { key: "goal", label: "创作目标", placeholder: "如：吸引年轻用户、展示产品功能", type: "text" },
    ],
    steps: [
      {
        id: "concept",
        name: "创意构思",
        desc: "分析主题，确定创意方向和叙事结构",
        buildPrompt: (input, _prev) =>
          `我需要为"${input.topic}"创作一个短视频。${input.goal ? `创作目标：${input.goal}。` : ""}\n\n请帮我：\n1. 分析这个主题的核心卖点和情感共鸣点\n2. 确定视频的叙事结构（线性/倒叙/蒙太奇）\n3. 提出 2-3 个创意方向，每个说明预期效果\n4. 推荐最佳方向并说明理由`,
      },
      {
        id: "storyboard",
        name: "分镜脚本",
        desc: "基于创意方向生成详细分镜",
        buildPrompt: (_input, prevOutput) =>
          `基于以下创意方向，生成一个完整的分镜脚本：\n\n${prevOutput}\n\n要求：\n1. 每个镜头标注：运镜方式、时长（秒）、画面描述、转场方式\n2. 总时长控制在 15-60 秒\n3. 开头 3 秒必须有视觉钩子\n4. 标注每个镜头的情绪节奏（紧张/舒缓/高潮）\n5. 使用表格格式输出`,
      },
      {
        id: "prompts",
        name: "提示词生成",
        desc: "将分镜转化为 AI 可用的提示词",
        buildPrompt: (_input, prevOutput) =>
          `基于以下分镜脚本，为每个镜头生成 AI 视频/图片生成的提示词：\n\n${prevOutput}\n\n要求：\n1. 每个镜头给出英文提示词\n2. 包含：风格描述、光影、色调、镜头语言、画面细节\n3. 给出推荐的负面提示词（避免什么）\n4. 标注每个镜头的优先级权重\n5. 按表格格式输出（镜头号 | 时长 | 提示词 | 负面提示词）`,
      },
      {
        id: "final",
        name: "方案整合",
        desc: "整合所有阶段输出为最终方案",
        buildPrompt: (_input, prevOutput) =>
          `请将以下提示词方案整合为一份完整的创作交付文档：\n\n${prevOutput}\n\n输出格式：\n1. **项目概览**：主题、时长、风格、目标\n2. **分镜总表**：合并为一个完整表格\n3. **技术参数**：推荐的画面比例、帧率、分辨率\n4. **后期建议**：调色方向、音效建议、转场技巧\n5. **注意事项**：常见问题和避坑指南`,
      },
    ],
  },
  {
    id: "prompt-optimizer",
    name: "提示词深度优化",
    desc: "分析 → 优化 → 变体生成 → 质量评估",
    icon: "✨",
    category: "optimize",
    reflect: true,
    fields: [
      { key: "raw_prompt", label: "原始提示词", placeholder: "粘贴你的原始提示词或自然语言描述", type: "textarea", required: true },
      { key: "target_style", label: "目标风格", placeholder: "如：赛博朋克、水墨画、电影质感", type: "text" },
    ],
    steps: [
      {
        id: "analyze",
        name: "提示词分析",
        desc: "拆解原始提示词的优缺点",
        buildPrompt: (input, _prev) =>
          `分析以下提示词的质量：\n\n"${input.raw_prompt}"\n${input.target_style ? `目标风格：${input.target_style}` : ""}\n\n请从以下维度评估：\n1. 画面完整性（是否缺少关键元素）\n2. 风格一致性（描述是否冲突）\n3. 权重合理性（重点是否突出）\n4. 负面提示词（缺少哪些排除项）\n5. 总分（1-10）和主要问题`,
      },
      {
        id: "optimize",
        name: "提示词优化",
        desc: "根据分析结果优化提示词",
        buildPrompt: (input, prevOutput) =>
          `基于以下分析结果，优化提示词：\n\n${prevOutput}\n\n原始提示词："${input.raw_prompt}"\n\n要求：\n1. 修复分析中发现的所有问题\n2. 保持核心意图不变\n3. 优化英文关键词的选择和顺序\n4. 添加权重标记（重要元素加括号强调）\n5. 给出优化后的完整提示词`,
      },
      {
        id: "variants",
        name: "变体生成",
        desc: "生成 3 个不同风格的变体",
        buildPrompt: (input, prevOutput) =>
          `基于以下优化后的提示词，生成 3 个不同风格的变体：\n\n${prevOutput}\n\n要求：\n1. 变体 A：更写实的版本\n2. 变体 B：更艺术化的版本\n3. 变体 C：更夸张/戏剧化的版本\n4. 每个变体标注与原版的差异\n5. 说明每个变体适合什么场景`,
      },
      {
        id: "assess",
        name: "质量评估",
        desc: "评估最终提示词的预期效果",
        buildPrompt: (_input, prevOutput) =>
          `对以下提示词方案进行最终质量评估：\n\n${prevOutput}\n\n请给出：\n1. 最终评分（1-10）\n2. 预期画面效果描述\n3. 可能的生成风险（如：手部变形、文字乱码等）\n4. 推荐的生成参数（CFG scale、steps、sampler）\n5. 最终推荐版本（A/B/C/原版）`,
      },
    ],
  },
  {
    id: "style-research",
    name: "风格研究与应用",
    desc: "调研 → 分析 → 提取特征 → 生成应用方案",
    icon: "🔍",
    category: "research",
    fields: [
      { key: "style_name", label: "风格名称", placeholder: "如：赛博朋克、浮世绘、新海诚", type: "text", required: true },
      { key: "use_case", label: "应用场景", placeholder: "如：产品宣传、城市风光、人物特写", type: "text" },
    ],
    steps: [
      {
        id: "research",
        name: "风格调研",
        desc: "收集该风格的视觉特征和代表作品",
        buildPrompt: (input, _prev) =>
          `请通过网络搜索深入研究"${input.style_name}"视觉风格。【重要】请联网搜索获取最新信息。\n\n1. 起源和发展历史\n2. 核心视觉特征（色彩、构图、光影、材质）\n3. 代表性作品/创作者\n4. 在 AIGC 领域的应用现状（搜索最新的 AI 生成案例）\n5. 常见的提示词关键词\n6. 在 GitHub 上搜索相关的风格迁移工具或模型（附链接）\n\n请标注信息来源 URL。`,
      },
      {
        id: "extract",
        name: "特征提取",
        desc: "提取可用于 AI 生成的结构化特征",
        buildPrompt: (input, prevOutput) =>
          `基于以下调研结果，提取可直接用于 AI 视频/图片生成的结构化特征：\n\n${prevOutput}\n\n输出格式：\n1. **色彩方案**：主色调、辅助色、禁用色\n2. **光影特征**：光源类型、明暗对比、氛围描述\n3. **构图规则**：画面比例、主体位置、留白方式\n4. **材质纹理**：表面质感、颗粒感、锐度\n5. **英文提示词模板**：可直接使用的通用模板`,
      },
      {
        id: "apply",
        name: "应用方案",
        desc: "生成具体场景的应用方案",
        buildPrompt: (input, prevOutput) =>
          `基于以下风格特征，为"${input.use_case || "短视频创作"}"生成应用方案：\n\n${prevOutput}\n\n请给出：\n1. 3 个具体的画面构思（含提示词）\n2. 运镜建议（适合该风格的镜头运动）\n3. 调色参数建议（LUT 方向、曲线调整）\n4. 常见错误和避坑指南\n5. 与该风格搭配的音乐/音效建议`,
      },
    ],
  },
  {
    id: "ab-compare",
    name: "A/B 风格对比",
    desc: "双风格分析 → 差异矩阵 → 应用推荐",
    icon: "⚖️",
    category: "research",
    fields: [
      { key: "style_a", label: "风格 A", placeholder: "如：赛博朋克", type: "text", required: true },
      { key: "style_b", label: "风格 B", placeholder: "如：蒸汽朋克", type: "text", required: true },
      { key: "content", label: "内容主题", placeholder: "如：城市风光、人物肖像", type: "text" },
    ],
    steps: [
      {
        id: "analyze-a",
        name: "分析风格 A",
        desc: "深度分析风格 A 的视觉特征",
        buildPrompt: (input, _prev) =>
          `请通过网络搜索深度分析"${input.style_a}"视觉风格。【重要】请联网搜索获取最新的应用案例和提示词。\n1. 核心色彩语言\n2. 光影和氛围特征\n3. 典型构图方式\n4. 情绪传达特点\n5. 英文提示词模板\n6. 最新的 AIGC 应用案例（附来源）`,
      },
      {
        id: "analyze-b",
        name: "分析风格 B",
        desc: "深度分析风格 B 的视觉特征",
        buildPrompt: (input, _prev) =>
          `请通过网络搜索深度分析"${input.style_b}"视觉风格。【重要】请联网搜索获取最新的应用案例和提示词。\n1. 核心色彩语言\n2. 光影和氛围特征\n3. 典型构图方式\n4. 情绪传达特点\n5. 英文提示词模板\n6. 最新的 AIGC 应用案例（附来源）`,
      },
      {
        id: "diff-matrix",
        name: "差异矩阵",
        desc: "结构化对比两种风格的差异",
        buildPrompt: (input, prevOutput) =>
          `基于以下两种风格的分析，生成结构化对比：\n\n${prevOutput}\n\n输出为表格，对比维度：\n1. 色彩（暖/冷、饱和度、对比度）\n2. 光影（光源、明暗、氛围）\n3. 构图（密度、留白、透视）\n4. 材质（光滑/粗糙、反射、纹理）\n5. 情绪（紧张/舒缓、温暖/冷峻）\n6. 适合的内容类型\n7. 在${input.content || "短视频"}中的优劣势`,
      },
      {
        id: "recommend",
        name: "应用推荐",
        desc: "给出最终推荐和融合方案",
        buildPrompt: (input, prevOutput) =>
          `基于以下对比分析，给出最终推荐：\n\n${prevOutput}\n\n请给出：\n1. 推荐选择（A 或 B）及理由\n2. 如果融合两种风格，最佳比例和方式\n3. 各自最适合的 3 个具体场景\n4. 各风格的完整提示词示例\n5. 注意事项和常见误区`,
      },
    ],
  },
  {
    id: "ad-script",
    name: "广告脚本工厂",
    desc: "策略分析 → 脚本撰写 → 分镜 → 提示词",
    icon: "📦",
    category: "script",
    reflect: true,
    fields: [
      { key: "product", label: "产品/品牌", placeholder: "如：某护肤品牌、某电子产品", type: "text", required: true },
      { key: "audience", label: "目标受众", placeholder: "如：18-25岁女性、科技爱好者", type: "text" },
      { key: "platform", label: "投放平台", placeholder: "如：抖音、B站、小红书", type: "text" },
      { key: "duration", label: "时长", placeholder: "如：15秒、30秒", type: "text" },
    ],
    steps: [
      {
        id: "strategy",
        name: "策略分析",
        desc: "分析产品卖点和受众偏好",
        buildPrompt: (input, _prev) =>
          `为"${input.product}"制定短视频广告策略：\n- 目标受众：${input.audience || "通用受众"}\n- 投放平台：${input.platform || "抖音"}\n- 时长：${input.duration || "30秒"}\n\n请分析：\n1. 产品的 3 个核心卖点（按优先级排序）\n2. 目标受众的痛点和需求\n3. 该平台的内容偏好和算法特点\n4. 竞品广告的常见套路和差异化机会\n5. 推荐的广告类型（功能展示/场景演绎/情感共鸣/对比测评）`,
      },
      {
        id: "script",
        name: "脚本撰写",
        desc: "撰写完整的广告脚本",
        buildPrompt: (input, prevOutput) =>
          `基于以下策略，撰写完整的广告脚本：\n\n${prevOutput}\n\n要求：\n1. 按秒标注每个段落的时长\n2. 开头 3 秒必须有钩子（悬念/冲突/利益点）\n3. 中间部分突出核心卖点\n4. 结尾有明确的行动号召（CTA）\n5. 标注旁白/字幕/音效的配合`,
      },
      {
        id: "storyboard",
        name: "分镜设计",
        desc: "将脚本转化为分镜",
        buildPrompt: (input, prevOutput) =>
          `将以下脚本转化为分镜：\n\n${prevOutput}\n\n每个镜头包含：\n1. 时长\n2. 画面描述\n3. 运镜方式\n4. 转场方式\n5. 字幕/旁白\n6. 情绪标签\n\n用表格格式输出`,
      },
      {
        id: "prompts",
        name: "提示词生成",
        desc: "为每个镜头生成 AI 提示词",
        buildPrompt: (_input, prevOutput) =>
          `为以下分镜的每个镜头生成 AI 视频/图片提示词：\n\n${prevOutput}\n\n每个镜头给出：\n1. 英文提示词（包含风格、光影、色调、细节）\n2. 负面提示词\n3. 推荐的生成参数\n4. 与上一镜头的衔接建议`,
      },
    ],
  },
  // ── AIGC 前沿资讯研究 ──
  {
    id: "aigc-trends",
    name: "AIGC 前沿资讯研究",
    desc: "搜索 → 分析趋势 → 提取干货 → 生成研究报告",
    icon: "📡",
    category: "research",
    fields: [
      { key: "topic", label: "研究方向", placeholder: "如：AI视频生成、图片风格迁移、3D场景生成、数字人", type: "text", required: true },
      { key: "time_range", label: "时间范围", placeholder: "如：最近一个月、2024-2025年、近两周", type: "text" },
      { key: "focus", label: "关注重点", placeholder: "如：技术突破、产品发布、创作技巧、行业趋势", type: "text" },
    ],
    steps: [
      {
        id: "search",
        name: "信息搜集",
        desc: "搜索最新的 AIGC 资讯和技术文章",
        buildPrompt: (input, _prev) =>
          `请通过网络搜索"${input.topic}"领域的最新资讯和技术进展。${input.time_range ? `时间范围：${input.time_range}。` : ""}\n${input.focus ? `关注重点：${input.focus}。` : ""}\n\n【重要】请务必联网搜索获取最新信息，不要只依赖已有知识。\n\n请搜索并整理：\n1. 最新的产品发布和重大更新（搜索各厂商官网和科技媒体）\n2. 技术突破和论文发表（搜索 arxiv、技术博客）\n3. 行业应用案例和成功故事\n4. 创作者社区的热门讨论（搜索 Reddit、Twitter、B站、小红书）\n5. 工具和平台的变化\n6. 在 GitHub 上搜索相关的开源项目和工具（标注 star 数和最近更新时间）\n\n对每条信息标注来源 URL 和时间，按重要性排序。`,
      },
      {
        id: "analyze",
        name: "趋势分析",
        desc: "分析技术趋势和行业方向",
        buildPrompt: (input, prevOutput) =>
          `基于以下搜集到的信息，分析"${input.topic}"领域的发展趋势：\n\n${prevOutput}\n\n请分析：\n1. 技术发展方向（哪些能力在快速提升）\n2. 市场格局变化（哪些产品在崛起/衰落）\n3. 创作者的机会点（哪些新能力可以利用）\n4. 潜在的风险和挑战\n5. 未来 6-12 个月的预测`,
      },
      {
        id: "extract",
        name: "干货提取",
        desc: "提取可直接应用的方法和技巧",
        buildPrompt: (input, prevOutput) =>
          `从以下趋势分析中，提取对短视频创作者有直接价值的干货：\n\n${prevOutput}\n\n【重要】如果有提到的工具或项目，请在 GitHub 上搜索确认其状态（star数、最近更新、活跃度）。\n\n请提取：\n1. 可以立即使用的新工具和功能（附 GitHub 链接或官网）\n2. 提升创作效率的技巧和工作流\n3. 值得尝试的新风格和视觉效果\n4. 避坑指南（常见的错误和陷阱）\n5. GitHub 上值得关注的开源项目（附链接、star 数、简介）\n6. 学习资源推荐（教程、社区、文档）`,
      },
      {
        id: "report",
        name: "报告生成",
        desc: "生成结构化研究报告",
        buildPrompt: (input, prevOutput) =>
          `将以下内容整合为一份完整的 AIGC 资讯研究报告：\n\n${prevOutput}\n\n报告格式：\n1. **摘要**：3-5 句话概括核心发现\n2. **热点事件**：按时间线排列的重大事件\n3. **趋势洞察**：3-5 个关键趋势\n4. **创作者行动指南**：具体可执行的建议\n5. **工具推荐**：值得关注的工具和平台\n6. **展望**：未来发展方向\n\n使用 Markdown 格式，包含表格和列表。`,
      },
    ],
  },
];

// ── 工具函数 ──

export function getWorkflowById(id: string): WorkflowDef | undefined {
  return WORKFLOW_DEFS.find((w) => w.id === id);
}

/**
 * 获取工作流的完整步骤（包括 Reflection 步骤）
 * 参考教科书 chapter4/Reflection.py 的执行→反思→优化模式
 *
 * 执行流程：
 * 1. 原始步骤（如：创意构思→分镜→提示词→方案整合）
 * 2. 反思步骤（评审员审查原始方案）
 * 3. 优化步骤（根据反思反馈优化方案）
 */
export function getWorkflowStepsWithReflection(wf: WorkflowDef, input: WorkflowInput): WorkflowStepDef[] {
  const steps = [...wf.steps];

  if (wf.reflect) {
    // 添加反思步骤（审查原始方案）
    steps.push({
      id: "reflect",
      name: "🔍 反思审查",
      desc: "评审员严格审查方案，找出问题和改进空间",
      buildPrompt: (_input, prevOutput) =>
        REFLECT_PROMPT
          .replace("{input}", JSON.stringify(input))
          .replace("{output}", prevOutput),
    });

    // 添加优化步骤（根据反思反馈优化）
    // 注意：这里需要同时访问原始方案和反思结果
    // 通过闭包捕获原始步骤的输出
    steps.push({
      id: "refine",
      name: "✨ 优化完善",
      desc: "根据反思反馈优化最终方案",
      buildPrompt: (_input, prevOutput) => {
        // prevOutput 是反思步骤的输出
        // 需要从工作流执行上下文获取原始方案
        // 这里通过特殊标记让执行器知道需要原始方案
        if (prevOutput.includes("无需改进")) {
          return `评审员认为方案已经很好，无需修改。请直接输出原始方案的最终版本。`;
        }
        // 执行器会在调用时注入原始方案
        return `【原始方案在下方】\n\n请根据评审员的反馈优化方案。

评审员反馈：
${prevOutput}

请输出完整的优化后方案（不要只输出修改部分）。`;
      },
    });
  }

  return steps;
}

/**
 * 动态规划器：根据用户输入调整工作流步骤
 * 参考教科书 Plan-and-Solve 的 Planner 分解思想
 *
 * @param wf 工作流定义
 * @param input 用户输入
 * @param planResult LLM 生成的步骤 ID 列表（JSON 数组）
 * @returns 调整后的步骤列表
 */
export function applyDynamicPlan(wf: WorkflowDef, input: WorkflowInput, planResult: string): WorkflowStepDef[] {
  try {
    // 解析 LLM 输出的步骤 ID 列表
    const planSteps: string[] = JSON.parse(planResult);

    if (!Array.isArray(planSteps) || planSteps.length === 0) {
      // 解析失败，返回原始步骤
      return wf.steps;
    }

    // 根据计划筛选步骤
    const plannedSteps: WorkflowStepDef[] = [];
    for (const stepId of planSteps) {
      const step = wf.steps.find((s) => s.id === stepId);
      if (step) {
        plannedSteps.push(step);
      }
    }

    // 如果计划中的步骤都有效，返回筛选后的步骤
    if (plannedSteps.length > 0) {
      return plannedSteps;
    }

    // 否则返回原始步骤
    return wf.steps;
  } catch {
    // JSON 解析失败，返回原始步骤
    return wf.steps;
  }
}

/**
 * 获取规划器提示词
 */
export function getPlannerPrompt(wf: WorkflowDef, input: WorkflowInput): string {
  const availableSteps = wf.steps.map((s) => `- ${s.id}: ${s.name} — ${s.desc}`).join("\n");

  return PLANNER_PROMPT
    .replace("{input}", JSON.stringify(input))
    .replace("{available_steps}", availableSteps);
}

export function getWorkflowsByCategory(): Record<string, WorkflowDef[]> {
  const groups: Record<string, WorkflowDef[]> = {};
  for (const wf of WORKFLOW_DEFS) {
    if (!groups[wf.category]) groups[wf.category] = [];
    groups[wf.category].push(wf);
  }
  return groups;
}

export const CATEGORY_LABELS: Record<string, string> = {
  create: "创作",
  optimize: "优化",
  research: "研究",
  script: "脚本",
};

export function createInitialRunState(workflowId: string, input: WorkflowInput): WorkflowRunState {
  const wf = getWorkflowById(workflowId);
  if (!wf) throw new Error(`Unknown workflow: ${workflowId}`);
  return {
    workflowId,
    input,
    steps: wf.steps.map((s) => ({ stepId: s.id, status: "pending", output: "" })),
    currentStep: 0,
    isRunning: false,
    finalOutput: "",
  };
}

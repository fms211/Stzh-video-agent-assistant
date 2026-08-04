// Tszh Remote - OPC AI 助手核心模块
// 对接桌面端 OPC 工作区的 AI 助手系统（服务端优先，离线回退本地）

import { getServerUrl, getToken } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ 类型定义 ============

export interface LLMProvider {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  searchEnabled: boolean;
  thinkingLevel: 'quick' | 'standard' | 'deep';
}

export interface OpcMessage {
  id: string;
  role: 'user' | 'assistant' | 'workflow' | 'workflow-step' | 'action-cards';
  content: string;
  metadata?: any;
  timestamp: string;
  // 工作流专用
  workflowName?: string;
  workflowIcon?: string;
  stepName?: string;
  stepIndex?: number;
  totalSteps?: number;
  isError?: boolean;
  // 动作卡片
  cards?: ActionCard[];
  // RAG 来源
  ragSources?: { name: string; score: number; kb_type: string }[];
}

export interface ActionCard {
  id: string;
  type: 'save-report' | 'continue' | 'save-template' | 'send-to-workspace';
  title: string;
  desc: string;
  icon: string;
}

export interface OpcAgentContext {
  activeStyle: string | null;
  cameraMove: string;
  selectedParams: string[];
  duration: number;
  aspect: string;
  stylePrefix: string;
}

export interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: WorkflowStep[];
  fields: WorkflowField[];
}

export interface WorkflowStep {
  name: string;
  buildPrompt: (input: string, prevOutput?: string, fields?: Record<string, string>) => string;
}

export interface WorkflowField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
  placeholder?: string;
}

// ============ 预置 LLM 厂商 ============

export const PRESET_PROVIDERS: Omit<LLMProvider, 'apiKey'>[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 65536,
    searchEnabled: true,
    thinkingLevel: 'standard',
  },
  {
    id: 'qwen',
    name: '通义千问',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 131072,
    searchEnabled: true,
    thinkingLevel: 'standard',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 128000,
    searchEnabled: false,
    thinkingLevel: 'standard',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 128000,
    searchEnabled: false,
    thinkingLevel: 'standard',
  },
  {
    id: 'kimi',
    name: '月之暗面 Kimi',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 1048576,
    searchEnabled: true,
    thinkingLevel: 'standard',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5-20250514',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 200000,
    searchEnabled: false,
    thinkingLevel: 'standard',
  },
  {
    id: 'mimo',
    name: '小米 mimo',
    protocol: 'openai',
    baseUrl: 'https://api.xiaomi.com/v1',
    model: 'mimo-v2.5-pro',
    maxTokens: 4096,
    temperature: 0.7,
    contextWindow: 128000,
    searchEnabled: false,
    thinkingLevel: 'standard',
  },
];

// ============ 预置工作流 ============

export const PRESET_WORKFLOWS: Workflow[] = [
  {
    id: 'full-video',
    name: '短视频全链路生成',
    category: '创作',
    description: '主题确认 → 分镜脚本 → 提示词优化 → 最终方案',
    steps: [
      {
        name: '创意构思',
        buildPrompt: (input, _prev, fields) => {
          const topic = fields?.topic || input;
          const goal = fields?.goal || '';
          return `我需要为"${topic}"创作一个短视频。${goal ? `创作目标：${goal}。` : ''}\n\n请帮我：\n1. 分析这个主题的核心卖点和情感共鸣点\n2. 确定视频的叙事结构（线性/倒叙/蒙太奇）\n3. 提出 2-3 个创意方向，每个说明预期效果\n4. 推荐最佳方向并说明理由`;
        },
      },
      {
        name: '分镜脚本',
        buildPrompt: (_input, prev) => `基于以下创意方向，生成一个完整的分镜脚本：\n\n${prev}\n\n要求：\n1. 每个镜头标注：运镜方式、时长（秒）、画面描述、转场方式\n2. 总时长控制在 15-60 秒\n3. 开头 3 秒必须有视觉钩子\n4. 标注每个镜头的情绪节奏（紧张/舒缓/高潮）\n5. 使用表格格式输出`,
      },
      {
        name: '提示词生成',
        buildPrompt: (_input, prev) => `基于以下分镜脚本，为每个镜头生成 AI 视频/图片生成的提示词：\n\n${prev}\n\n要求：\n1. 每个镜头给出英文提示词\n2. 包含：风格描述、光影、色调、镜头语言、画面细节\n3. 给出推荐的负面提示词（避免什么）\n4. 标注每个镜头的优先级权重\n5. 按表格格式输出（镜头号 | 时长 | 提示词 | 负面提示词）`,
      },
      {
        name: '方案整合',
        buildPrompt: (_input, prev) => `请将以下提示词方案整合为一份完整的创作交付文档：\n\n${prev}\n\n输出格式：\n1. **项目概览**：主题、时长、风格、目标\n2. **分镜总表**：合并为一个完整表格\n3. **技术参数**：推荐的画面比例、帧率、分辨率\n4. **后期建议**：调色方向、音效建议、转场技巧\n5. **注意事项**：常见问题和避坑指南`,
      },
    ],
    fields: [
      { key: 'topic', label: '视频主题', type: 'text', required: true, placeholder: '如：产品宣传、城市航拍、美食探店' },
      { key: 'goal', label: '创作目标', type: 'text', required: false, placeholder: '如：吸引年轻用户、展示产品功能' },
    ],
  },
  {
    id: 'prompt-optimizer',
    name: '提示词深度优化',
    category: '优化',
    description: '分析 → 优化 → 变体生成 → 质量评估',
    steps: [
      {
        name: '提示词分析',
        buildPrompt: (input, _prev, fields) => {
          const rawPrompt = fields?.raw_prompt || input;
          const targetStyle = fields?.target_style || '';
          return `分析以下提示词的质量：\n\n"${rawPrompt}"\n${targetStyle ? `目标风格：${targetStyle}` : ''}\n\n请从以下维度评估：\n1. 画面完整性（是否缺少关键元素）\n2. 风格一致性（描述是否冲突）\n3. 权重合理性（重点是否突出）\n4. 负面提示词（缺少哪些排除项）\n5. 总分（1-10）和主要问题`;
        },
      },
      {
        name: '提示词优化',
        buildPrompt: (input, prev, fields) => {
          const rawPrompt = fields?.raw_prompt || input;
          return `基于以下分析结果，优化提示词：\n\n${prev}\n\n原始提示词："${rawPrompt}"\n\n要求：\n1. 修复分析中发现的所有问题\n2. 保持核心意图不变\n3. 优化英文关键词的选择和顺序\n4. 添加权重标记（重要元素加括号强调）\n5. 给出优化后的完整提示词`;
        },
      },
      {
        name: '变体生成',
        buildPrompt: (_input, prev) => `基于以下优化后的提示词，生成 3 个不同风格的变体：\n\n${prev}\n\n要求：\n1. 变体 A：更写实的版本\n2. 变体 B：更艺术化的版本\n3. 变体 C：更夸张/戏剧化的版本\n4. 每个变体标注与原版的差异\n5. 说明每个变体适合什么场景`,
      },
      {
        name: '质量评估',
        buildPrompt: (_input, prev) => `对以下提示词方案进行最终质量评估：\n\n${prev}\n\n请给出：\n1. 最终评分（1-10）\n2. 预期画面效果描述\n3. 可能的生成风险（如：手部变形、文字乱码等）\n4. 推荐的生成参数（CFG scale、steps、sampler）\n5. 最终推荐版本（A/B/C/原版）`,
      },
    ],
    fields: [
      { key: 'raw_prompt', label: '原始提示词', type: 'textarea', required: true, placeholder: '粘贴你的原始提示词或自然语言描述' },
      { key: 'target_style', label: '目标风格', type: 'text', required: false, placeholder: '如：赛博朋克、水墨画、电影质感' },
    ],
  },
  {
    id: 'style-research',
    name: '风格研究与应用',
    category: '研究',
    description: '调研 → 分析 → 提取特征 → 生成应用方案',
    steps: [
      {
        name: '风格调研',
        buildPrompt: (input, _prev, fields) => {
          const styleName = fields?.style_name || input;
          return `请深入研究"${styleName}"视觉风格。\n\n1. 起源和发展历史\n2. 核心视觉特征（色彩、构图、光影、材质）\n3. 代表性作品/创作者\n4. 在 AIGC 领域的应用现状\n5. 常见的提示词关键词`;
        },
      },
      {
        name: '特征提取',
        buildPrompt: (_input, prev) => `基于以下调研结果，提取可直接用于 AI 视频/图片生成的结构化特征：\n\n${prev}\n\n输出格式：\n1. **色彩方案**：主色调、辅助色、禁用色\n2. **光影特征**：光源类型、明暗对比、氛围描述\n3. **构图规则**：画面比例、主体位置、留白方式\n4. **材质纹理**：表面质感、颗粒感、锐度\n5. **英文提示词模板**：可直接使用的通用模板`,
      },
      {
        name: '应用方案',
        buildPrompt: (input, prev, fields) => {
          const useCase = fields?.use_case || '短视频创作';
          return `基于以下风格特征，为"${useCase}"生成应用方案：\n\n${prev}\n\n请给出：\n1. 3 个具体的画面构思（含提示词）\n2. 运镜建议（适合该风格的镜头运动）\n3. 调色参数建议（LUT 方向、曲线调整）\n4. 常见错误和避坑指南\n5. 与该风格搭配的音乐/音效建议`;
        },
      },
    ],
    fields: [
      { key: 'style_name', label: '风格名称', type: 'text', required: true, placeholder: '如：赛博朋克、浮世绘、新海诚' },
      { key: 'use_case', label: '应用场景', type: 'text', required: false, placeholder: '如：产品宣传、城市风光、人物特写' },
    ],
  },
  {
    id: 'ab-compare',
    name: 'A/B 风格对比',
    category: '研究',
    description: '双风格分析 → 差异矩阵 → 应用推荐',
    steps: [
      {
        name: '分析风格 A',
        buildPrompt: (input, _prev, fields) => {
          const styleA = fields?.style_a || input;
          return `请深入分析"${styleA}"视觉风格。\n1. 核心色彩语言\n2. 光影和氛围特征\n3. 典型构图方式\n4. 情绪传达特点\n5. 英文提示词模板`;
        },
      },
      {
        name: '分析风格 B',
        buildPrompt: (input, _prev, fields) => {
          const styleB = fields?.style_b || input;
          return `请深入分析"${styleB}"视觉风格。\n1. 核心色彩语言\n2. 光影和氛围特征\n3. 典型构图方式\n4. 情绪传达特点\n5. 英文提示词模板`;
        },
      },
      {
        name: '差异矩阵',
        buildPrompt: (input, prev, fields) => {
          const content = fields?.content || '短视频';
          return `基于以下两种风格的分析，生成结构化对比：\n\n${prev}\n\n输出为表格，对比维度：\n1. 色彩（暖/冷、饱和度、对比度）\n2. 光影（光源、明暗、氛围）\n3. 构图（密度、留白、透视）\n4. 材质（光滑/粗糙、反射、纹理）\n5. 情绪（紧张/舒缓、温暖/冷峻）\n6. 适合的内容类型\n7. 在${content}中的优劣势`;
        },
      },
      {
        name: '应用推荐',
        buildPrompt: (_input, prev) => `基于以下对比分析，给出最终推荐：\n\n${prev}\n\n请给出：\n1. 推荐选择（A 或 B）及理由\n2. 如果融合两种风格，最佳比例和方式\n3. 各自最适合的 3 个具体场景\n4. 各风格的完整提示词示例\n5. 注意事项和常见误区`,
      },
    ],
    fields: [
      { key: 'style_a', label: '风格 A', type: 'text', required: true, placeholder: '如：赛博朋克' },
      { key: 'style_b', label: '风格 B', type: 'text', required: true, placeholder: '如：蒸汽朋克' },
      { key: 'content', label: '内容主题', type: 'text', required: false, placeholder: '如：城市风光、人物肖像' },
    ],
  },
  {
    id: 'ad-script',
    name: '广告脚本工厂',
    category: '脚本',
    description: '策略分析 → 脚本撰写 → 分镜 → 提示词',
    steps: [
      {
        name: '策略分析',
        buildPrompt: (input, _prev, fields) => {
          const product = fields?.product || input;
          const audience = fields?.audience || '通用受众';
          const platform = fields?.platform || '抖音';
          const duration = fields?.duration || '30秒';
          return `为"${product}"制定短视频广告策略：\n- 目标受众：${audience}\n- 投放平台：${platform}\n- 时长：${duration}\n\n请分析：\n1. 产品的 3 个核心卖点（按优先级排序）\n2. 目标受众的痛点和需求\n3. 该平台的内容偏好和算法特点\n4. 竞品广告的常见套路和差异化机会\n5. 推荐的广告类型（功能展示/场景演绎/情感共鸣/对比测评）`;
        },
      },
      {
        name: '脚本撰写',
        buildPrompt: (_input, prev) => `基于以下策略，撰写完整的广告脚本：\n\n${prev}\n\n要求：\n1. 按秒标注每个段落的时长\n2. 开头 3 秒必须有钩子（悬念/冲突/利益点）\n3. 中间部分突出核心卖点\n4. 结尾有明确的行动号召（CTA）\n5. 标注旁白/字幕/音效的配合`,
      },
      {
        name: '分镜设计',
        buildPrompt: (_input, prev) => `将以下脚本转化为分镜：\n\n${prev}\n\n每个镜头包含：\n1. 时长\n2. 画面描述\n3. 运镜方式\n4. 转场方式\n5. 字幕/旁白\n6. 情绪标签\n\n用表格格式输出`,
      },
      {
        name: '提示词生成',
        buildPrompt: (_input, prev) => `为以下分镜的每个镜头生成 AI 视频/图片提示词：\n\n${prev}\n\n每个镜头给出：\n1. 英文提示词（包含风格、光影、色调、细节）\n2. 负面提示词\n3. 推荐的生成参数\n4. 与上一镜头的衔接建议`,
      },
    ],
    fields: [
      { key: 'product', label: '产品/品牌', type: 'text', required: true, placeholder: '如：某护肤品牌、某电子产品' },
      { key: 'audience', label: '目标受众', type: 'text', required: false, placeholder: '如：18-25岁女性、科技爱好者' },
      { key: 'platform', label: '投放平台', type: 'text', required: false, placeholder: '如：抖音、B站、小红书' },
      { key: 'duration', label: '时长', type: 'text', required: false, placeholder: '如：15秒、30秒' },
    ],
  },
  {
    id: 'aigc-trends',
    name: 'AIGC 前沿资讯研究',
    category: '研究',
    description: '搜索 → 分析趋势 → 提取干货 → 生成研究报告',
    steps: [
      {
        name: '信息搜集',
        buildPrompt: (input, _prev, fields) => {
          const topic = fields?.topic || input || 'AIGC';
          const timeRange = fields?.time_range || '';
          const focus = fields?.focus || '';
          return `请搜索"${topic}"领域的最新资讯和技术进展。${timeRange ? `时间范围：${timeRange}。` : ''}${focus ? `关注重点：${focus}。` : ''}\n\n请搜索并整理：\n1. 最新的产品发布和重大更新\n2. 技术突破和论文发表\n3. 行业应用案例和成功故事\n4. 创作者社区的热门讨论\n5. 工具和平台的变化\n\n对每条信息标注来源和时间，按重要性排序。`;
        },
      },
      {
        name: '趋势分析',
        buildPrompt: (input, prev, fields) => {
          const topic = fields?.topic || input || 'AIGC';
          return `基于以下搜集到的信息，分析"${topic}"领域的发展趋势：\n\n${prev}\n\n请分析：\n1. 技术发展方向（哪些能力在快速提升）\n2. 市场格局变化（哪些产品在崛起/衰落）\n3. 创作者的机会点（哪些新能力可以利用）\n4. 潜在的风险和挑战\n5. 未来 6-12 个月的预测`;
        },
      },
      {
        name: '干货提取',
        buildPrompt: (_input, prev) => `从以下趋势分析中，提取对短视频创作者有直接价值的干货：\n\n${prev}\n\n请提取：\n1. 可以立即使用的新工具和功能\n2. 提升创作效率的技巧和工作流\n3. 值得尝试的新风格和视觉效果\n4. 避坑指南（常见的错误和陷阱）\n5. 学习资源推荐（教程、社区、文档）`,
      },
      {
        name: '报告生成',
        buildPrompt: (input, prev, fields) => {
          const topic = fields?.topic || input || 'AIGC';
          return `将以下内容整合为一份完整的 AIGC 资讯研究报告：\n\n${prev}\n\n报告格式：\n1. **摘要**：3-5 句话概括核心发现\n2. **热点事件**：按时间线排列的重大事件\n3. **趋势洞察**：3-5 个关键趋势\n4. **创作者行动指南**：具体可执行的建议\n5. **工具推荐**：值得关注的工具和平台\n6. **展望**：未来发展方向\n\n使用 Markdown 格式，包含表格和列表。`;
        },
      },
    ],
    fields: [
      { key: 'topic', label: '研究方向', type: 'text', required: true, placeholder: '如：AI视频生成、图片风格迁移、3D场景生成、数字人' },
      { key: 'time_range', label: '时间范围', type: 'text', required: false, placeholder: '如：最近一个月、2024-2025年、近两周' },
      { key: 'focus', label: '关注重点', type: 'text', required: false, placeholder: '如：技术突破、产品发布、创作技巧、行业趋势' },
    ],
  },
];

// ============ LLM 调用 ============

export async function streamChat(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<string> {
  if (provider.protocol === 'anthropic') {
    return streamChatAnthropic(provider, messages, signal, onChunk);
  }
  return streamChatOpenAI(provider, messages, signal, onChunk);
}

async function streamChatOpenAI(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<string> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: provider.maxTokens,
      temperature: provider.temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `LLM 请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk?.(fullText);
          }
        } catch {}
      }
    }
  }

  return fullText;
}

async function streamChatAnthropic(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<string> {
  // Anthropic 需要分开 system 和 messages
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch(`${provider.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: provider.maxTokens,
      system: systemMsg?.content,
      messages: chatMessages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `LLM 请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta') {
            const text = json.delta?.text;
            if (text) {
              fullText += text;
              onChunk?.(fullText);
            }
          }
        } catch {}
      }
    }
  }

  return fullText;
}

// ============ 会话管理 ============

// 数据归属分仓：有 token 归账户（user:<id>），否则归访客（guest）
// 与服务端按用户隔离对齐，避免访客/账户 OPC 会话互相串扰
async function getOwnerScope(): Promise<string> {
  try {
    const token = await getToken();
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (typeof payload.userId === 'number') return `user:${payload.userId}`;
    }
  } catch {}
  return 'guest';
}

async function opcStorageKey(kind: 'active' | 'sessions'): Promise<string> {
  const scope = await getOwnerScope();
  return `tszh:v2:opc:${scope}:${kind}`;
}

export async function getActiveSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(await opcStorageKey('active'));
}

export async function setActiveSessionId(id: string): Promise<void> {
  await AsyncStorage.setItem(await opcStorageKey('active'), id);
}

export function createSessionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `opc_${ts}_${rand}`;
}

// ============ System Prompt 构建 ============

// 思考程度 → system prompt 后缀
export function getThinkingSuffix(level?: string): string {
  switch (level) {
    case 'quick': return '\n\n[系统指令：请快速简洁地回答，不需要过多分析。]';
    case 'deep': return '\n\n[系统指令：请深入思考后再回答，从多个角度分析，给出详细且有深度的回复。]';
    default: return '';
  }
}

export function buildSystemPrompt(
  opcContext?: string,
  extraContext?: string,
  thinkingLevel?: string,
): string {
  const parts: string[] = [
    // ── 角色定义 ──
    '你是「腾昇智和」的 OPC 创作助手，专注于短视频和图片的 AIGC 创作。',
    '你是一位经验丰富的短视频创作顾问，精通运镜设计、风格搭配、提示词工程、分镜脚本撰写和参数调优。',
    '你的目标是帮助用户从创意构思到最终产出的全流程，提供专业、可执行的创作方案。',
    '',
    // ── 回复规范 ──
    '## 回复规范',
    '- 使用中文回复，专业术语附英文原文',
    '- 涉及提示词时给出中英双语版本，英文版可直接用于 AI 生成工具',
    '- 涉及运镜推荐时标注英文名和效果描述',
    '- 涉及参数推荐时说明推荐理由',
    '- 使用 Markdown 格式：标题分层、表格对比、代码块标注提示词',
    '',
    // ── 意图识别与工作流建议 ──
    '## 工作流建议',
    '当用户的需求涉及以下场景时，主动建议使用对应的工作流：',
    '- 「帮我做个视频」「生成短视频」「创作方案」→ 短视频全链路生成工作流',
    '- 「优化提示词」「提示词效果不好」「改一下这个 prompt」→ 提示词深度优化工作流',
    '- 「XX风格是什么」「怎么做出XX效果」→ 风格研究与应用工作流',
    '- 「A和B哪个好」「对比一下两种风格」→ A/B 风格对比工作流',
    '- 「写个广告」「产品宣传视频」「脚本」→ 广告脚本工厂工作流',
    '- 「最新趋势」「AIGC 动态」「行业资讯」→ AIGC 前沿资讯研究工作流',
    '',
    // ── 知识来源 ──
    '## 你的知识来源',
    '1. 网络搜索结果：系统会自动为你搜索网络，结果以「网络搜索结果（实时获取）」标题注入。你必须基于这些真实数据回答，不要说「我无法联网搜索」。',
    '2. 知识库：系统已自动检索相关知识（如有，以「相关知识库参考」标题注入）',
    '3. 当用户询问具体的 AIGC 工具、开源项目时，建议用户在 GitHub 上搜索相关资源',
    '',
    '【重要】如果对话中包含「网络搜索结果」，你必须引用其中的内容来回答。绝对不要回复「我无法联网搜索」——搜索已经由系统完成，结果已经提供给你了。',
    '',
    // ── 上下文记忆 ──
    '## 上下文记忆',
    '你能够看到之前的对话历史。请务必：',
    '- 记住用户之前提到的偏好、要求和约束条件',
    '- 引用之前的工作流结果或对话内容来支持你的回答',
    '- 如果用户说「刚才那个」「继续上面的」「之前的方案」等，要理解是指之前的对话内容',
    '- 如果之前的工作流生成了分镜或提示词，在后续讨论中要引用它们',
    '- 保持对话的连贯性，不要重复已经说过的内容',
  ];

  // 用户 OPC 配置（如有）
  if (opcContext) {
    parts.push('', '## 用户当前 OPC 配置', opcContext);
  }

  // RAG + 网络搜索结果
  if (extraContext) {
    parts.push('', extraContext);
  }

  // 思考深度指令
  const suffix = getThinkingSuffix(thinkingLevel);
  if (suffix) parts.push(suffix);

  return parts.join('\n');
}

// ============ 消息持久化（双写） ============

export async function saveMessage(sessionId: string, message: OpcMessage): Promise<void> {
  // 1. 先写本地存储
  const key = `tszh_opc_msgs_${sessionId}`;
  const existing = await AsyncStorage.getItem(key);
  const messages: OpcMessage[] = existing ? JSON.parse(existing) : [];
  messages.push(message);
  await AsyncStorage.setItem(key, JSON.stringify(messages));

  // 2. 异步写服务端（把 cards/workflowName 等字段打包到 metadata 中）
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    const metadata: Record<string, unknown> = { ...(message.metadata || {}) };
    if (message.cards) metadata.cards = message.cards;
    if (message.workflowName) metadata.workflowName = message.workflowName;
    if (message.workflowIcon) metadata.workflowIcon = message.workflowIcon;
    if (message.stepName) metadata.stepName = message.stepName;
    if (message.stepIndex !== undefined) metadata.stepIndex = message.stepIndex;
    if (message.totalSteps !== undefined) metadata.totalSteps = message.totalSteps;

    await fetch(`${serverUrl}/api/opc/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      }),
    });
  } catch {}
}

export async function loadMessages(sessionId: string): Promise<OpcMessage[]> {
  // 1. 先从服务端加载
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    const url = `${serverUrl}/api/opc/sessions/${sessionId}/messages?limit=200`;
    console.log('[OPC] 加载消息:', url);
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    console.log('[OPC] 响应状态:', response.status);
    if (response.ok) {
      const data = await response.json();
      const raw = data.messages || [];
      console.log('[OPC] 服务端返回', raw.length, '条消息');
      if (raw.length > 0) {
        console.log('[OPC] 第一条消息示例:', JSON.stringify(raw[0]).slice(0, 200));
      }
      // 转换服务端格式 → 手机端 OpcMessage 格式
      const messages = raw.map(serverMessageToOpc);
      // 同步到本地
      const key = `tszh_opc_msgs_${sessionId}`;
      await AsyncStorage.setItem(key, JSON.stringify(messages));
      return messages;
    } else {
      console.log('[OPC] 服务端返回错误:', response.status);
    }
  } catch (e: any) {
    console.log('[OPC] 连接服务端失败:', e.message);
  }

  // 2. 回退到本地存储
  const key = `tszh_opc_msgs_${sessionId}`;
  const existing = await AsyncStorage.getItem(key);
  const local = existing ? JSON.parse(existing) : [];
  console.log('[OPC] 使用本地缓存:', local.length, '条消息');
  return local;
}

// 服务端消息 → 手机端 OpcMessage 格式转换
function serverMessageToOpc(raw: any): OpcMessage {
  let metadata: any = raw.metadata;
  // metadata 可能是 JSON 字符串（服务端存储格式）
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = undefined; }
  }
  if (!metadata) metadata = {};

  // 时间戳处理：可能是 unix epoch 数字、ISO 字符串、或 SQLite datetime
  let timestamp = new Date().toISOString();
  if (raw.timestamp) {
    if (typeof raw.timestamp === 'number') {
      // unix epoch（秒或毫秒）
      timestamp = new Date(raw.timestamp > 1e12 ? raw.timestamp : raw.timestamp * 1000).toISOString();
    } else {
      timestamp = String(raw.timestamp);
    }
  } else if (raw.created_at) {
    // SQLite datetime 格式 "2026-06-11 10:30:00"
    const d = new Date(raw.created_at);
    timestamp = isNaN(d.getTime()) ? raw.created_at : d.toISOString();
  }

  // role 映射：根据 metadata 内容判断
  let role = raw.role || 'assistant';
  if (metadata.stepName) role = 'workflow-step';
  else if (metadata.cards) role = 'action-cards';
  else if (metadata.workflowName) role = 'workflow';

  return {
    id: raw.id || `msg_${Date.now()}`,
    role: role as OpcMessage['role'],
    content: raw.content || '',
    metadata,
    timestamp,
    workflowName: metadata.workflowName,
    workflowIcon: metadata.workflowIcon,
    stepName: metadata.stepName,
    stepIndex: metadata.stepIndex,
    totalSteps: metadata.totalSteps,
    isError: metadata.isError || false,
    cards: metadata.cards,
  };
}

// ============ 会话管理（服务端同步） ============

// 从服务端加载所有会话
export async function loadSessionsFromServer(): Promise<{ id: string; title: string; updated_at: number; message_count: number }[]> {
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    const url = `${serverUrl}/api/opc/sessions`;
    console.log('[OPC] 加载会话列表:', url);
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    console.log('[OPC] 会话列表响应:', res.status);
    if (res.ok) {
      const data = await res.json();
      const sessions = data.sessions || [];
      console.log('[OPC] 服务端返回', sessions.length, '个会话');
      return sessions;
    }
  } catch {}
  return [];
}

// 在服务端创建会话
export async function createSessionOnServer(id: string, title?: string): Promise<void> {
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/opc/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id, title: title || '新对话' }),
    });
  } catch {}
}

// 删除会话
export async function deleteSessionOnServer(id: string): Promise<void> {
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/opc/sessions/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
  // 本地也删
  await AsyncStorage.removeItem(`tszh_opc_msgs_${id}`);
  const activeId = await getActiveSessionId();
  if (activeId === id) await AsyncStorage.removeItem('tszh_opc_agent_active');
}

// 删除消息
export async function deleteMessage(messageId: string): Promise<void> {
  // 服务端删除
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/opc/messages/${messageId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
}

// ============ 模型配置服务端同步 ============
// 服务端优先，离线回退 AsyncStorage

const LS_PROVIDERS = 'tszh_llm_providers';
const LS_ACTIVE = 'tszh_llm_active_id';

// 从服务端加载所有 Provider
export async function loadProvidersFromServer(): Promise<LLMProvider[]> {
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    const res = await fetch(`${serverUrl}/api/llm/providers`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      const providers = (data.providers || []).map((r: any) => ({
        ...r.config,
        id: r.id,
      }));
      // 同步到本地缓存
      await AsyncStorage.setItem(LS_PROVIDERS, JSON.stringify(providers));
      return providers;
    }
  } catch {}
  // 离线回退
  return loadProvidersLocal();
}

// 从本地加载 Provider
async function loadProvidersLocal(): Promise<LLMProvider[]> {
  const data = await AsyncStorage.getItem(LS_PROVIDERS);
  return data ? JSON.parse(data) : [];
}

// 保存 Provider 到服务端 + 本地
export async function saveProviderToServer(provider: LLMProvider, isActive = false): Promise<void> {
  // 先写本地
  const local = await loadProvidersLocal();
  const idx = local.findIndex((p) => p.id === provider.id);
  if (idx >= 0) local[idx] = provider;
  else local.push(provider);
  await AsyncStorage.setItem(LS_PROVIDERS, JSON.stringify(local));

  // 再写服务端
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/llm/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id: provider.id, config: provider, isActive }),
    });
  } catch {}
}

// 删除 Provider
export async function deleteProviderFromServer(id: string): Promise<void> {
  // 本地
  const local = await loadProvidersLocal();
  await AsyncStorage.setItem(LS_PROVIDERS, JSON.stringify(local.filter((p) => p.id !== id)));

  // 服务端
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/llm/providers/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
}

// 激活 Provider
export async function activateProviderOnServer(id: string): Promise<void> {
  await AsyncStorage.setItem(LS_ACTIVE, id);
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    await fetch(`${serverUrl}/api/llm/providers/${id}/activate`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
}

// 获取当前激活的 Provider
export async function getActiveProviderFromServer(): Promise<LLMProvider | null> {
  try {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    const res = await fetch(`${serverUrl}/api/llm/active`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (data.provider) {
        const provider = { ...data.provider.config, id: data.provider.id };
        await AsyncStorage.setItem(LS_ACTIVE, provider.id);
        return provider;
      }
    }
  } catch {}
  // 离线回退
  const activeId = await AsyncStorage.getItem(LS_ACTIVE);
  if (!activeId) return null;
  const local = await loadProvidersLocal();
  return local.find((p) => p.id === activeId) || null;
}

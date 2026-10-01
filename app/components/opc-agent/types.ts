// OPC 微智能体共享类型

export type OpcAgentMessage = {
  id: string;
  role: "user" | "assistant" | "workflow" | "workflow-step" | "action-cards";
  content: string;
  timestamp: number;
  isError?: boolean;
  contextTrace?: unknown;
  // 工作流专用
  workflowId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  workflowInput?: Record<string, string>;
  workflowName?: string;
  workflowIcon?: string;
  stepName?: string;
  stepIndex?: number;
  totalSteps?: number;
  // 动作卡片
  cards?: ActionCard[];
  // 文件附件
  attachments?: MessageAttachment[];
  // RAG 来源
  ragSources?: { name: string; score: number; kb_type: string }[];
  // 检索资料缺口；随会话和工作流结果保存，不代表事实核验。
  referenceNotes?: string[];
};

export type MessageAttachment = {
  name: string;
  type: string; // mime type
  size: number;
  preview?: string; // 图片的 data URL 预览
};

export type ActionCard = {
  id: string;
  type: "save-report" | "continue" | "save-template" | "send-to-workspace";
  title: string;
  desc: string;
  icon: string;
};

export type OpcAgentContext = {
  activeStyle: string | null;
  cameraMove: string;
  selectedParams: string[];
  duration: number;
  aspect: string;
  stylePrefix: string;
};

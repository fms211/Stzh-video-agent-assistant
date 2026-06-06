// === 前后端通信协议 ===

export interface HistoryItem {
  role: "user" | "agent";
  text?: string;
  payload?: AgentPayload;
}

export interface AgentRequest {
  prompt: string;
  history?: HistoryItem[];
}

export interface AgentResponse {
  requestId: string;
  createdAt: string;
  videoUrl?: string;
  imageUrls?: string[];
}

export interface AgentPayload {
  requestId: string;
  createdAt?: string;
  videoUrl?: string;
  imageUrls?: string[];
  raw?: unknown;
}

export interface ErrorResponse {
  error: { message: string };
}

// === Coze v3 API ===

export interface CozeMessage {
  role: "user" | "assistant";
  content: string;
  content_type: "text";
}

export interface CozeChatRequest {
  bot_id: string;
  user_id: string;
  stream: boolean;
  auto_save_history?: boolean;
  additional_messages?: CozeMessage[];
}

export interface CozeChatResponse {
  code: number;
  msg: string;
  data?: {
    id: string;
    conversation_id: string;
    bot_id: string;
    user_id: string;
    status: string;
    created_at: number;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };
}

export interface CozeMessageData {
  id: string;
  conversation_id: string;
    bot_id: string;
    role: "assistant" | "user";
    type: "answer" | "question" | "function_call" | "tool_output";
    content: string;
    content_type: "text";
    status: string;
    created_at: number;
}

export interface CozeSSEEvent {
  event: string;
  data: CozeSSEData;
}

export interface CozeSSEData {
  id?: string;
  conversation_id?: string;
  bot_id?: string;
  role?: string;
  type?: string;
  content?: string;
  status?: string;
  created_at?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

// === Coze 流式解析结果 ===

export interface CozeStreamResult {
  fullText: string;
  conversationId?: string;
  chatId?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

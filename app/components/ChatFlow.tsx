"use client";

// 兼容 wrapper（规划 §5.2）：ChatFlow 职责已移交 CreativeConversationCore。
// 保留本导出以兼容既有引用与测试锚点；不再含任务链路/portal/composer 主体。

import CreativeConversationCore, { type ConversationSubmit } from "./CreativeConversationCore";
import type { AccessMode } from "@/app/lib/entry-flow";

export default function ChatFlow({ onThinkingChange, onReset, onMessageSent, onGoHome, onSubmitRef, onNewChat, showWelcome, onWelcomeStart, accessMode, onAuthRequired }: {
  onThinkingChange?: (v: boolean) => void;
  onReset?: () => void;
  onMessageSent?: () => void;
  onGoHome?: () => void;
  onSubmitRef?: React.MutableRefObject<ConversationSubmit | null>;
  onNewChat?: () => void;
  showWelcome?: boolean;
  onWelcomeStart?: (prompt?: string) => void;
  accessMode: AccessMode;
  onAuthRequired: (draft?: string) => void;
}) {
  return (
    <CreativeConversationCore
      accessMode={accessMode}
      onAuthRequired={onAuthRequired}
      onThinkingChange={onThinkingChange}
      onMessageSent={onMessageSent}
      onReset={onReset}
      onGoHome={onGoHome}
      onSubmitRef={onSubmitRef}
      onNewChat={onNewChat}
      showWelcome={showWelcome}
      onWelcomeStart={onWelcomeStart}
      draft=""
      onDraftChange={() => {}}
    />
  );
}

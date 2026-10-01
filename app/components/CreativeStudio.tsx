"use client";

// 兼容 wrapper（规划 §5.2）：创意工坊职责已移交 CreativeWorkspace（三域工作台）。
// 保留本导出以兼容既有引用与旧测试锚点；原双区状态机/视图切换由 CreativeWorkspace 承接
// （researchRun 视图、OPCPanel 单实例复用、样式已随 08-28 归档于 git 历史，不再维护双份）。

import CreativeWorkspace from "./CreativeWorkspace";
import type { ResearchRuntimeAdapter } from "@/app/lib/research-runtime/adapter";
import type { AccessMode } from "@/app/lib/entry-flow";

export default function CreativeStudio({ accessMode, onAuthRequired, researchAdapter }: { accessMode: AccessMode; onAuthRequired: () => void; researchAdapter?: ResearchRuntimeAdapter | null }) {
  return (
    <CreativeWorkspace
      accessMode={accessMode}
      onAuthRequired={onAuthRequired}
      researchAdapter={researchAdapter ?? null}
    />
  );
}

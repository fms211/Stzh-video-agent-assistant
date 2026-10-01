"use strict";

// Reviewed repository knowledge, never evidence of this request's live state.
// Keep these short runtime cards aligned with docs/knowledge/studio-mechanisms.md.
const cards = {
  coze: {
    expected: "账户隔离的本地请求取得明确业务结束状态与可识别结果。",
    steps: ["按账户与本地会话查远端映射", "调用Coze并分别读取文本、工具与业务完成事件", "成功返回后保存映射，任务执行器另写任务结果"],
    boundaries: ["本地响应流结束只说明本地接收结束，不能证明远端生成已停止或业务完成", "远端调用、映射和本地任务更新不在同一事务内", "本地删除或排除记忆不能撤销已经发送的远端历史", "取消不代表远端生成已停止，也不能撤销已完成生成"],
    check: ["本账户task状态与结果字段", "已知chat/conversation ID及事件；远端不可见结果标unknown"],
    retry: "失败后远端可能已执行或计费；没有结果或幂等证据时，不自动重发生成。",
    sources: ["server/account-agent-service.js", "server/agent-service.js", "server/task-runtime.js"],
  },
  assistant: {
    expected: "当前账户与模型回复当前会话，回复和服务端保存分别核对。",
    steps: ["校验账户、会话及模型", "模型接口返回完整JSON回复", "本地保存后按账户与会话同步稳定消息ID"],
    boundaries: ["占位消息不证明模型已执行", "收到正文不证明服务端已保存", "模型消费、页面显示和同步不在同一事务内", "默认shadow中的记忆仅为预览，不能声称模型已经使用"],
    check: ["provider及请求账户", "消息ID、服务端正文与同步回执", "contextTrace.rollout与applied"],
    retry: "仅保存失败先重试同步；推理接口失败可能已产生远端消费，不为修复保存而重新推理。",
    sources: ["app/components/ModelAssistantPanel.tsx", "server/routes/creative-agent.js", "app/lib/opc-agent-persist.ts"],
  },
  workflow: {
    expected: "逐步产物有来源；研究流程只执行已批准的计划版本。",
    steps: ["先区分浏览器普通流程与服务端研究流程", "普通流程先保存不可修改的计划及配置快照，再按序调用并保存步骤结果", "普通流程恢复时先只读核对结果；用户显式继续后只执行连续完成前缀之后的步骤", "研究流程核对approvedPlanRevision后按依赖执行并保存事件与产物"],
    boundaries: ["普通流程前序ID须匹配服务端已保存结果；模型回复保存不等于事实核验或执行批准", "普通流程相同请求已完成时可读取原结果；运行中或结果未知时禁止重复调用", "研究计划存在或改稿不等于批准", "部分步骤和外部副作用可能已完成，整个流程不是一个事务", "暂停或取消不能撤销已完成的外部动作"],
    check: ["流程类型及run/step标识", "研究plan revision、批准事件、步骤状态和来源ID", "普通流程GET /api/opc/sessions/:sessionId/workflow-runs/:runId返回的plan、steps及configurationState", "普通流程定义版本、配置快照及完成记录连续性；缺少快照的旧运行不能直接续跑"],
    retry: "只读恢复已保存结果不调用模型；全部步骤已完成时仅恢复完成状态。普通流程须定义与配置一致、完成记录连续且无running/uncertain步骤，才能由用户显式继续未完成步骤（可能产生模型及搜索调用）；配置变化或结果未知时停止核对，不自动重试。研究失败步骤若修改输入，必须携带当前计划版本，生成新版本并等待重新批准；不改输入才可按服务端状态显式重试。研究回复达到输出上限时保留恢复状态，不把截断产物记作完成；重试可能再次计费，不能据一次HTTP错误重跑整条流程。",
    sources: ["app/components/ModelAssistantPanel.tsx", "app/lib/workflow-resume.ts", "server/studio-workflow-plans.js", "server/studio-workflow-results.js", "server/routes/creative-agent.js", "server/research-runtime.js", "server/routes/research.js"],
  },
  collaboration: {
    expected: "讨论产生待确认指令，人工确认后只关联一个下游任务。",
    steps: ["创建run并快照角色和模型绑定", "讨论产出最终指令并等待人工确认", "本地事务按run幂等键创建任务、链接run和排队事件", "独立任务队列执行并回写状态"],
    boundaries: ["讨论内容或记忆不是执行批准", "确认入队不等于生成完成", "事务之后的通知、HTTP回包及远端执行不在本地事务内"],
    check: ["GET /api/agent-runs/:id与关联task", "team_snapshot、final_instruction、task_id和排队事件"],
    retry: "确认回包丢失时先读run及task，再重试幂等确认端点；不能直接另建任务。远端消费未知仍需另行核验。",
    sources: ["server/routes/creative-agent.js", "server/creative-agent-service.js", "server/agent-run-linkage.js"],
  },
};

function mechanismReference(mode, query) {
  if (!Object.hasOwn(cards, mode) || typeof query !== "string") return null;
  // JIT baseline: ordinary creative requests should not pay for operational docs.
  if (!/失败|报错|重试|取消|暂停|恢复|审批|批准|确认|状态|保存|同步|历史|记忆|上下文|故障|\b(?:error|failed|retry|cancel|resume|approval|sync|memory|context)\b/i.test(query)) return null;
  return {
    section: "Mechanism Reference", id: `studio.${mode}.v1`, revision: mode === "workflow" ? 5 : mode === "coze" ? 3 : 2,
    lastVerifiedAt: ["workflow", "coze"].includes(mode) ? "2026-09-30" : "2026-09-28", basis: "reviewed_local_worktree",
    appliesTo: { contractVersion: "unknown", codeRevision: "unknown", deploymentId: "unknown" },
    instructionBoundary: "仓库正常机制的参考，不是当前运行事实或执行授权；系统规则、当前用户要求与服务端状态优先。",
    investigation: "分别记录预期、实际偏离、证据、影响和未知；检查反例，不能为了符合说明而忽略现场事实。",
    ...JSON.parse(JSON.stringify(cards[mode])),
  };
}

module.exports = { mechanismReference };

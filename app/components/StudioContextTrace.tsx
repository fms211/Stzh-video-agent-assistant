"use client";

import "./StudioContextTrace.css";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "未知";

/** Displays the server's request snapshot, never a claim about current source validity. */
export function StudioContextTrace({ trace, label = "本次上下文" }: { trace: unknown; label?: string }) {
  const data = record(trace);
  if (typeof data.rollout !== "string") return null;
  const applied = data.applied === true;
  const selected = Array.isArray(data.selected) ? data.selected.map(record) : [];
  const dropped = Object.entries(record(data.dropped)).filter(([, count]) => typeof count === "number" && count > 0);
  const summary = record(data.summary);
  const note = record(data.projectNote);
  const workflow = record(data.workflow);
  const mechanism = record(data.mechanism);
  const creativeState = record(data.creativeState);
  const retrieval = record(data.retrieval);
  const reasonNames: Record<string, string> = {
    user_excluded: "本次手动排除", budget: "容量不足", scope: "范围不符",
    invalid_record: "记录格式无效", permission: "来源或权限不可用",
    revision_conflict: "版本记录冲突", duplicate_revision: "重复版本已去重",
    inactive: "未确认或已停用", sensitive: "敏感内容", time: "过期或时间异常",
    current_constraint: "本轮创作参数已覆盖", current_negation: "与本轮明确排除的偏好冲突",
    opposing_facet: "与本轮指定方向或主题不符", unrelated: "与本轮主题无关", limit: "超出候选数量上限",
    purpose_mismatch: "本次仅查询偏好或规范，不采用运行陈述",
  };
  const verificationNames: Record<string, string> = { unverified: "未经事实核验", verified: "已有核验证据（仍需核对适用条件）", stale: "核验证据已过期", conflicted: "存在冲突证据" };
  const sectionNames: Record<string, string> = { "Relevant Memory": "相关记忆", Evidence: "参考证据" };
  return <details className="studio-context-trace">
    <summary>{label} · {applied ? "已用于请求" : data.rollout === "shadow" ? "仅匹配预览，未用于回答" : "未启用"}</summary>
    {workflow.authority === "client_reference_only" && <p>本地运行 {text(workflow.runId)} · 步骤 {text(workflow.stepId)}。客户端提交了 {Array.isArray(workflow.previousStepIds) ? workflow.previousStepIds.length : 0} 个前序引用；这些标识不代表服务端已核验完成状态。</p>}
    {workflow.authority === "server_result_records" && <details>
      <summary>运行 {text(workflow.runId)} · 步骤 {text(workflow.stepId)} · 服务端已核对前序回复</summary>
      <p>已核对 {Array.isArray(workflow.predecessors) ? workflow.predecessors.length : 0} 条同账户、同会话、同运行的步骤结果；这不代表回复内容经过事实核验，也不代表批准了外部执行。</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(workflow.predecessors ?? [], null, 2)}</pre>
    </details>}
    {data.reason === "required_context_over_budget" && <p>必需内容超出容量；本次未应用优化方案。</p>}
    {data.inputBytes != null && <p>{applied ? "发送内容" : "拟采用内容"}容量估算 {number(data.inputBytes)} / {number(data.ceiling)}。按 UTF-8 字节保守估算，并非实际 Token 用量。</p>}
    {data.capacitySource === "unknown" && <p>模型窗口容量未配置，当前使用本地容量限制。</p>}
    {data.retrievalBasis === "adapter_task_and_role" && <p>本次记忆按运行原始任务和当前角色职责筛选；前序角色产物不会增加检索关键词。</p>}
    {data.retrievalBasis === "workflow_original_input" && <p>本次记忆按运行最初输入和创作参数筛选；前序回复、检索资料只作为参考。</p>}
    {data.retrievalBasis === "workflow_current_input" && <p>旧运行没有保存最初输入，记忆按本步骤提交内容筛选；服务端前序回复未参与筛选，提交内容中的引用仍需核对。</p>}
    {data.retrievalBasis === "research_original_input" && <p>本次记忆按研究风格和应用场景筛选；检索资料、插件回复只作为参考。</p>}
    {retrieval.recallTruncated === true && <p>长输入仅使用前 {number(retrieval.recallCharacters)} 字匹配候选；明确排除和方向冲突仍检查全部 {number(retrieval.inputCharacters)} 字，末尾限制不会被截掉。</p>}
    {creativeState.section === "Current Creative State" && <details>
      <summary>本次创作参数</summary>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(creativeState.constraints ?? {}, null, 2)}</pre>
      <p>这是本次提交的参数，不代表审批或执行状态；与正文冲突时，以本轮明确要求为准。</p>
    </details>}
    {data.clientHistoryOmitted === true && <p>{data.remoteHistoryTokens === "unknown" ? "本地发送历史省略了部分较早消息；已有 Coze 远端会话继续使用其保存的历史，本地不能核实远端保留范围。" : "页面省略了较早历史，已尝试从本账户同步记录提取相关片段；未同步的原文无法从服务端找回。"}</p>}
    {data.remoteHistoryTokens === "unknown" && <p>Coze 远端历史用量未知；本次排除不会删除已发送到远端的历史。</p>}
    {typeof data.removedHistoryMessages === "number" && data.removedHistoryMessages > 0 && <p>{applied ? "本次省略" : "拟省略"} {number(data.removedHistoryMessages)} 条较早消息，原始记录仍保留。</p>}
    {selected.length > 0 ? <ul>{selected.map((item, index) => <li key={`${text(item.id)}:${index}`}>
      <p style={{ whiteSpace: "pre-wrap" }}>{text(item.content)}</p>
      <small>记忆 {text(item.id)} · 版本 {number(item.revision)} · {sectionNames[text(item.section)] || "参考资料"}</small>
      <p>{verificationNames[text(record(item.verification).state)] || "核验状态未知"}</p>
      {Array.isArray(record(item.verification).openQuestions) && <ul>{(record(item.verification).openQuestions as unknown[]).filter(value => typeof value === "string").map((question, i) => <li key={i}>未决：{String(question)}</li>)}</ul>}
      <details><summary>请求时的来源引用</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(item.source ?? {}, null, 2)}</pre></details>
      <details><summary>适用范围与核验证据</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ scope: item.scope ?? null, claimKind: item.claimKind ?? null, verification: item.verification ?? null }, null, 2)}</pre></details>
    </li>)}</ul> : <p>本次方案没有采用记忆条目。</p>}
    {summary.id != null && <p>会话摘要 {text(summary.id)} · 版本 {number(summary.revision)} · 采用 {number(summary.includedExcerpts)} 段摘录；摘要不替代原文。</p>}
    {typeof summary.excludedConflictingTurns === "number" && summary.excludedConflictingTurns > 0 && <p>已省略 {number(summary.excludedConflictingTurns)} 轮与本次明确要求冲突的历史摘录。</p>}
    {typeof summary.skipped === "string" && <p>摘要未采用：{summary.skipped}</p>}
    {mechanism.id != null && <details>
      <summary>流程参考 {text(mechanism.id)} · 版本 {number(mechanism.revision)} · {mechanism.included === true ? (applied ? "已采用" : "拟采用") : "容量不足，整份省略"}</summary>
      <p>{text(mechanism.expected)}</p>
      <p>这是仓库流程说明，不证明当前运行状态；部署适用性仍需核对。</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(mechanism, null, 2)}</pre>
    </details>}
    {note.projectId != null && <p>项目笔记 · 版本 {number(note.revision)} · {note.included === true ? (applied ? "已采用" : "拟采用") : "容量不足，整份省略"}。笔记属于用户参考，不代表实时状态或执行批准。</p>}
    {dropped.length > 0 && <ul>{dropped.map(([reason, count]) => <li key={reason}>{reasonNames[reason] || reason}：{number(count)}</li>)}</ul>}
    <p><small>以上是请求时的记录；引用与用户确认不等于事实已核验。</small></p>
  </details>;
}

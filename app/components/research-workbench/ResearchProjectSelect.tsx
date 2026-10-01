"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/app/lib/auth";
import { StudioSelect } from "../StudioSelect";

export function ResearchProjectSelect({ value, onChange, onProjectNameChange, label = "研究项目（可选）", description = "关联后，计划会列出该项目已启用的插件工具。工具默认关闭，填写输入并启用后才会随确认执行。", id = "research-project", allowNone = true, disabled = false }: { value: string; onChange: (id: string) => void; onProjectNameChange?: (name: string) => void; label?: string; description?: string; id?: string; allowNone?: boolean; disabled?: boolean }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void authFetch<{ projects: { id: string; name: string }[] }>("/api/creative-projects", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setProjects(data.projects);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "项目读取失败");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (loading) return;
    onProjectNameChange?.(value ? projects.find(project => project.id === value)?.name || (error ? "项目名称暂不可用" : "原项目已不可用") : "");
  }, [value, projects, loading, error, onProjectNameChange]);
  return <div className="studio-wf-field studio-project-field">
    <label className="studio-wf-label" htmlFor={id}>{label}</label>
    <StudioSelect id={id} label={label} describedBy={`${id}-description`} value={value} disabled={disabled || loading || Boolean(error)} onChange={onChange}
      options={[
        { value: "", label: loading ? "正在读取项目…" : allowNone ? "不关联项目" : "请选择项目", disabled: !allowNone },
        ...(!loading && value && !projects.some(project => project.id === value) ? [{ value, label: "原项目已不可用，请重新选择", disabled: true }] : []),
        ...projects.map(project => ({ value: project.id, label: project.name })),
      ]}
    />
    <small id={`${id}-description`}>{description}</small>
    {error && <div role="alert" className="studio-wf-error">{error} <button type="button" onClick={() => { setError(""); setLoading(true); setAttempt(value => value + 1); }}>重试读取项目</button></div>}
  </div>;
}

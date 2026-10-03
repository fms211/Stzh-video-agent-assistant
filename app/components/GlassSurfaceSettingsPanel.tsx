"use client";

import { useEffect, useId, useState } from "react";
import type { GlassSettings } from "@/app/lib/appearance-types";
import { CLEAR_GLASS_SURFACE, OFFICIAL_GLASS_SURFACE, GLASS_SURFACE_CONTROLS, normalizeGlassSurface, type GlassSurfaceControl, type GlassSurfaceSettings } from "@/app/lib/glass-surface-settings";

function ParameterField({ field, value, onChange }: { field: GlassSurfaceControl; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(String(value)); return; }
    const number = Number(Math.max(field.min, Math.min(field.max, Math.round(Number(draft) / field.step) * field.step)).toFixed(3));
    setDraft(String(number));
    if (number !== value) onChange(number);
  };
  return <div className="glass-parameter-field">
    <label htmlFor={`${id}-range`}><span>{field.label}<code>{field.key}</code></span><output>{Number(value.toFixed(3))}{field.unit}</output></label>
    <div className="glass-parameter-field__inputs">
      <input id={`${id}-range`} type="range" min={field.min} max={field.max} step={field.step} value={value} aria-describedby={`${id}-hint`} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
      <input type="number" aria-label={`${field.label}数值`} aria-describedby={`${id}-hint`} min={field.min} max={field.max} step={field.step} value={draft} onChange={event => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={event => {
        if (event.key === "Enter" || (event.key === "Escape" && draft !== String(value))) {
          // Keep a pending numeric edit in the settings transaction before the
          // native dialog's Escape handler can discard it as an unchanged form.
          event.preventDefault(); event.stopPropagation(); commit();
        }
      }} />
    </div><small id={`${id}-hint`}>{field.hint}</small>
  </div>;
}

export function GlassSurfaceSettingsPanel({ settings, onChange }: { settings: GlassSettings; onChange: (next: GlassSettings) => void }) {
  const surface = normalizeGlassSurface(settings.surface);
  const advancedId = useId();
  const [advanced, setAdvanced] = useState(false);
  const update = (patch: Partial<GlassSurfaceSettings>) => onChange({ ...settings, surface: normalizeGlassSurface({ ...surface, ...patch }) });
  const load = (preset: Readonly<GlassSurfaceSettings>) => onChange({ ...settings, surface: { ...preset } });
  const matches = (preset: Readonly<GlassSurfaceSettings>) => Object.keys(preset).every(key => surface[key as keyof GlassSurfaceSettings] === preset[key as keyof GlassSurfaceSettings]);
  return <section className="glass-parameters" aria-label="液态玻璃参数">
    <header><div><h3>液态玻璃参数</h3><p>数值输入按 Enter 或离开字段预览；未提交时 Escape 先保留输入。保存后记住当前账号的设置，取消可恢复原外观。</p></div>
      <a href="https://reactbits.dev/components/glass-surface?borderWidth=0.2&backgroundOpacity=0.32&saturation=2&blur=30&redOffset=-5&distortionScale=200" target="_blank" rel="noopener noreferrer">官网参数 ↗</a>
    </header>
    <div className="glass-parameters__presets">
      <button type="button" className="cws-btn" aria-pressed={matches(CLEAR_GLASS_SURFACE)} onClick={() => load(CLEAR_GLASS_SURFACE)}>清透预设</button>
      <button type="button" className="cws-btn" aria-pressed={matches(OFFICIAL_GLASS_SURFACE)} onClick={() => load(OFFICIAL_GLASS_SURFACE)}>载入官网链接参数</button>
      <button type="button" className="cws-btn" onClick={() => load(surface.map === "official" ? OFFICIAL_GLASS_SURFACE : CLEAR_GLASS_SURFACE)}>恢复当前预设</button>
    </div>
    <p className="glass-parameters__hint">保留原有颜色：中央 100% · 工具栏 45% · 侧栏 36% · 输入外壳 50% · 浮层 70%。参数名称对应官网，采用独立曲面边缘实现；blur 平滑位移图，displace 柔化边缘背景，正文不受影响。</p>
    <div className="glass-parameters__grid">{GLASS_SURFACE_CONTROLS.filter(field => field.group === "main").map(field => <ParameterField key={field.key} field={field} value={surface[field.key]} onChange={value => update({ [field.key]: value })} />)}</div>
    <button type="button" className="cws-btn glass-parameters__advanced-trigger" aria-expanded={advanced} aria-controls={advancedId} onClick={() => setAdvanced(value => !value)}>高级参数 · 位移图与色散 <span aria-hidden="true">{advanced ? "⌃" : "⌄"}</span></button>
    {advanced && <div className="glass-parameters__grid" id={advancedId}>{GLASS_SURFACE_CONTROLS.filter(field => field.group === "advanced").map(field => <ParameterField key={field.key} field={field} value={surface[field.key]} onChange={value => update({ [field.key]: value })} />)}</div>}
  </section>;
}

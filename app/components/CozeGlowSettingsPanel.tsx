"use client";

import { useState } from "react";
import SquishSwitch from "./SquishSwitch";
import { CozeDialogueSurface } from "./CozeDialogueSurface";
import { COZE_GLOW_CONTROLS, DEFAULT_COZE_GLOW, OFFICIAL_COZE_GLOW, normalizeCozeGlow, type CozeGlowSettings } from "@/app/lib/coze-dialogue-settings";

export function CozeGlowSettingsPanel({ settings, onChange }: { settings: CozeGlowSettings; onChange: (value: CozeGlowSettings) => void }) {
  const [replay, setReplay] = useState(0);
  const update = (patch: Partial<CozeGlowSettings>) => onChange(normalizeCozeGlow({ ...settings, ...patch }));
  return <section className="coze-glow-settings" aria-label="Coze边缘辉光参数">
    <header className="galaxy-settings-panel__header">
      <div><h3>对话边缘光</h3><p>移动鼠标到预览边缘查看追光。参数立即生效，并按当前账户保存。</p></div>
      <a href="https://reactbits.dev/components/border-glow" target="_blank" rel="noopener noreferrer">官网参数 ↗</a>
    </header>
    <div className="coze-glow-settings__preview">
      <CozeDialogueSurface key={replay} active settings={settings}><div className="coze-glow-settings__sample"><span>观测窗口 · 光影预览</span><strong>让灵感拥有边界</strong><p>辉光沿指针方向移动，正文保持清晰。</p></div></CozeDialogueSurface>
    </div>
    <div className="galaxy-settings-panel__presets">
      <button type="button" className="cws-btn" onClick={() => onChange(normalizeCozeGlow(DEFAULT_COZE_GLOW))}>恢复本站推荐</button>
      <button type="button" className="cws-btn" onClick={() => onChange(normalizeCozeGlow(OFFICIAL_COZE_GLOW))}>恢复官网默认</button>
      <button type="button" className="cws-btn" disabled={!settings.animated} onClick={() => setReplay(value => value + 1)}>重播入场扫光</button>
    </div>
    <div className="galaxy-settings-panel__switches">
      <label className="cws-check"><SquishSwitch checked={settings.useThemeColors} onChange={event => update({ useThemeColors: event.target.checked })} />辉光颜色跟随主题</label>
      <label className="cws-check"><SquishSwitch checked={settings.animated} onChange={event => update({ animated: event.target.checked })} />入场扫光 <small>Animated Intro</small></label>
    </div>
    <div className="galaxy-settings-panel__grid">
      {COZE_GLOW_CONTROLS.map(field => <label key={field.key} className="galaxy-settings-panel__field">
        <span>{field.label}<output>{Number(settings[field.key].toFixed(2))}</output></span><small>{field.official}</small>
        <input type="range" aria-label={field.label} min={field.min} max={field.max} step={field.step} value={settings[field.key]} onChange={event => update({ [field.key]: event.target.valueAsNumber })} />
      </label>)}
    </div>
    <div className="coze-glow-settings__colors">
      <label>玻璃底色 <small>Background</small><input type="color" aria-label="玻璃底色" value={settings.backgroundColor} onChange={event => update({ backgroundColor: event.target.value })} /></label>
      {settings.colors.map((color, index) => <label key={index}>辉光色 {index + 1}<input type="color" aria-label={`辉光色 ${index + 1}`} disabled={settings.useThemeColors} value={color} onChange={event => { const colors = [...settings.colors] as CozeGlowSettings["colors"]; colors[index] = event.target.value; update({ colors }); }} /></label>)}
    </div>
    <p className="galaxy-settings-panel__hint">五项基础滑杆与官网 Customize 范围一致。辉光向内收拢以适应工作区裁切；内侧染色上限为0.15。官网默认按钮恢复基础数值和配色，同时保留本站的正文保护。减少动画和触屏时使用静态细边。</p>
  </section>;
}

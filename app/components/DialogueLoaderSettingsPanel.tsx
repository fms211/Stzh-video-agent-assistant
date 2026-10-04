"use client";

import SquishSwitch from "./SquishSwitch";
import { useEffect, useState } from "react";
import { DialogueLatticeLoader } from "./DialogueLatticeLoader";
import { DIALOGUE_LOADER_CONTROLS, DEFAULT_DIALOGUE_LOADER, normalizeDialogueLoader, type DialogueLoaderSettings } from "@/app/lib/dialogue-loader-settings";

export function DialogueLoaderSettingsPanel({ settings, onChange }: { settings: DialogueLoaderSettings; onChange: (settings: DialogueLoaderSettings) => void }) {
  const [colorDraft, setColorDraft] = useState(settings.color);
  const [colorError, setColorError] = useState(false);
  useEffect(() => { setColorDraft(settings.color); setColorError(false); }, [settings.color]);
  const update = (patch: Partial<DialogueLoaderSettings>) => onChange(normalizeDialogueLoader({ ...settings, ...patch }));
  return <section className="dialogue-loader-settings" aria-label="对话等待动效参数">
    <header className="galaxy-settings-panel__header"><div><h3>琉璃方块等待动效</h3><p>统一四模式的等待与思考提示。调整立即保存到当前账户的本机设置；此预览不调用模型。</p></div>
      <a href="https://www.reactbits.dev/micro/lattice-loader" target="_blank" rel="noopener noreferrer">动效参考 ↗</a></header>
    <div className="dialogue-loader-settings__preview">
      <DialogueLatticeLoader settings={settings} live={false} label="已排队，等待服务器调度 · 动效预览" />
      <DialogueLatticeLoader settings={settings} live={false} label="正在思考… · 动效预览" />
      <DialogueLatticeLoader settings={settings} live={false} animate={false} label="已暂停 · 静态预览" />
    </div>
    <div className="galaxy-settings-panel__switches">
      <label className="cws-check"><SquishSwitch checked={settings.useThemeColor} onChange={e => update({ useThemeColor:e.target.checked })} />方块颜色跟随主题</label>
      <label className="cws-check"><SquishSwitch checked={settings.glow} onChange={e => update({ glow:e.target.checked })} />柔和微光</label>
    </div>
    <div className="dialogue-loader-settings__colors"><label>自定义方块颜色<input type="color" aria-label="等待方块颜色" value={settings.color} disabled={settings.useThemeColor} onChange={e => update({ color:e.target.value })} /></label>
      <label>HEX<input type="text" aria-label="等待方块HEX颜色" aria-invalid={colorError || undefined} disabled={settings.useThemeColor} value={colorDraft} maxLength={7} spellCheck={false}
        onChange={e => { const value=e.target.value; setColorDraft(value); setColorError(false); if (/^#[0-9a-f]{6}$/i.test(value)) update({ color:value }); }}
        onBlur={() => setColorError(!/^#[0-9a-f]{6}$/i.test(colorDraft))} /></label>
      <span className="dialogue-loader-settings__hex">{settings.useThemeColor ? "跟随当前主题" : settings.color}</span></div>
    {colorError && <p role="alert">请输入完整的 #RRGGBB 颜色，例如 #2020eb。未保存的输入不会替换原颜色。</p>}
    <div className="galaxy-settings-panel__grid">{DIALOGUE_LOADER_CONTROLS.map(field => <label key={field.key} className="galaxy-settings-panel__field"><span>{field.label}<output>{Number(settings[field.key].toFixed(2))}{field.unit}</output></span>
      <input type="range" aria-label={field.label} min={field.min} max={field.max} step={field.step} value={settings[field.key]} onChange={e => update({ [field.key]:e.target.valueAsNumber })} /></label>)}</div>
    <div className="galaxy-settings-panel__presets"><button type="button" className="cws-btn" onClick={() => onChange({ ...DEFAULT_DIALOGUE_LOADER })}>恢复推荐参数</button></div>
    <p className="galaxy-settings-panel__hint">使用3×3环绕点亮，保持真实状态文字。减少动画时显示静态方块；降低透明度时使用实色。小按钮中的方块缩小，颜色与节奏保持一致。</p>
  </section>;
}

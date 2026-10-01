"use client";

import { useState } from "react";
import SquishSwitch from "./SquishSwitch";
import { DEFAULT_GALAXY_SETTINGS, OFFICIAL_GALAXY_SETTINGS, GALAXY_CONTROLS, normalizeGalaxySettings, type GalaxySettings } from "@/app/lib/galaxy-settings";

type Props = { settings: GalaxySettings; onChange: (settings: GalaxySettings) => void; themeHue: number };

export function GalaxySettingsPanel({ settings, onChange, themeHue }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const update = (patch: Partial<GalaxySettings>) => onChange(normalizeGalaxySettings({ ...settings, ...patch }));
  return (
    <section className="galaxy-settings-panel" aria-label="银河星场参数">
      <header className="galaxy-settings-panel__header">
        <div><h3>银河星场</h3><p>修改后立即生效，保存为当前账号的外观偏好。星环在「壁纸与玻璃」中独立调节。</p></div>
        <a href="https://reactbits.dev/backgrounds/galaxy" target="_blank" rel="noopener noreferrer">官网参数 ↗</a>
      </header>
      <div className="galaxy-settings-panel__presets">
        <button type="button" className="cws-btn" onClick={() => onChange(normalizeGalaxySettings(DEFAULT_GALAXY_SETTINGS))}>恢复本站推荐</button>
        <button type="button" className="cws-btn" onClick={() => onChange(normalizeGalaxySettings(OFFICIAL_GALAXY_SETTINGS))}>恢复官网默认</button>
      </div>
      <div className="galaxy-settings-panel__switches">
        <label className="cws-check"><SquishSwitch checked={settings.mouseInteraction} onChange={e => update({ mouseInteraction: e.target.checked })} />跟随鼠标</label>
        <label className="cws-check"><SquishSwitch checked={settings.mouseRepulsion} onChange={e => update({ mouseRepulsion: e.target.checked })} />鼠标排斥</label>
        <label className="cws-check"><SquishSwitch checked={settings.useThemeHue} onChange={e => update({ useThemeHue: e.target.checked })} />色相随主题</label>
      </div>
      <div className="galaxy-settings-panel__grid">
        {GALAXY_CONTROLS.map(field => {
          const value = field.key === "hueShift" && settings.useThemeHue ? Math.round(themeHue) : settings[field.key];
          return <label key={field.key} className="galaxy-settings-panel__field">
            <span>{field.label}<output>{Number(value.toFixed(2))}{field.key === "hueShift" ? "°" : ""}</output></span>
            <small>{field.official}</small>
            <input type="range" aria-label={field.label} min={field.min} max={field.max} step={Math.min(field.step, field.key === "hueShift" ? 1 : 0.01)} value={value}
              onChange={e => update({ [field.key]: e.target.valueAsNumber, ...(field.key === "hueShift" ? { useThemeHue: false } : {}) })} />
          </label>;
        })}
      </div>
      <p className="galaxy-settings-panel__hint">调节范围与官网一致，并支持更精细的数值。中心扩散大于 0 时优先使用中心扩散；窄屏及减少动画时关闭鼠标跟随。</p>
      <button type="button" className="cws-btn" aria-expanded={advanced} aria-controls="galaxy-advanced" onClick={() => setAdvanced(!advanced)}>高级星场设置 <span aria-hidden="true">{advanced ? "⌃" : "⌄"}</span></button>
      {advanced && <div id="galaxy-advanced" className="galaxy-settings-panel__advanced">
        <div className="galaxy-settings-panel__switches">
          <label className="cws-check"><SquishSwitch checked={settings.disableAnimation} onChange={e => update({ disableAnimation: e.target.checked })} />暂停银河动画</label>
          <label className="cws-check"><SquishSwitch checked={settings.transparent} onChange={e => update({ transparent: e.target.checked })} />透明背景</label>
        </div>
        <div className="galaxy-settings-panel__grid">
          {(["focal", "rotation"] as const).flatMap(key => [0, 1].map(index => {
            const label = `${key === "focal" ? "焦点" : "旋转向量"} ${index === 0 ? "X" : "Y"}`;
            return <label key={`${key}-${index}`} className="galaxy-settings-panel__field">
              <span>{label}</span><input type="number" aria-label={label} min={key === "focal" ? 0 : -1} max="1" step="0.1" value={settings[key][index]}
                onChange={e => { const pair: [number, number] = [...settings[key]]; pair[index] = e.target.valueAsNumber; update({ [key]: pair }); }} />
            </label>;
          }))}
        </div>
        <p className="galaxy-settings-panel__hint">透明背景关闭后使用黑色背景；「减少动画」仍优先保持星场静止。</p>
      </div>}
    </section>
  );
}

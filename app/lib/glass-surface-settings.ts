// Glass Surface parameter names follow React Bits; clear mode keeps our curved map.
export type GlassSurfaceSettings = {
  map: "curve" | "official";
  borderRadius: number;
  backgroundOpacity: number;
  saturation: number;
  borderWidth: number;
  brightness: number;
  opacity: number;
  blur: number;
  displace: number;
  distortionScale: number;
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
};

export const CLEAR_GLASS_SURFACE: Readonly<GlassSurfaceSettings> = {
  map: "curve", borderRadius: 28, backgroundOpacity: .34, saturation: 1.15,
  borderWidth: .2, brightness: 50, opacity: 1, blur: 0, displace: 0,
  distortionScale: -72, redOffset: -2, greenOffset: 0, blueOffset: 2,
};

// Values observed on the user's linked preview, including its unset controls.
export const OFFICIAL_GLASS_SURFACE: Readonly<GlassSurfaceSettings> = {
  map: "official", borderRadius: 50, backgroundOpacity: .32, saturation: 2,
  borderWidth: .2, brightness: 50, opacity: .93, blur: 30, displace: .5,
  distortionScale: 200, redOffset: -5, greenOffset: 10, blueOffset: 20,
};

export const GLASS_SURFACE_CONTROLS = [
  { key: "borderRadius", label: "圆角", min: 12, max: 60, step: 1, unit: "px", group: "main", hint: "胶囊控件保留完整圆角，窄屏面板最大为 24px。" },
  { key: "backgroundOpacity", label: "底色不透明度", min: 0, max: 1, step: .01, unit: "", group: "main", hint: "0 最清透，1 为实色底板。" },
  { key: "saturation", label: "饱和度", min: 0, max: 3, step: .05, unit: "", group: "main", hint: "只调节玻璃后的背景色彩。" },
  { key: "borderWidth", label: "折射边缘宽度", min: 0, max: .5, step: .01, unit: "", group: "main", hint: "系数 × 面板较短边 ÷ 2，限制在内侧 12px；0 关闭折射边缘。" },
  { key: "blur", label: "折射图平滑", min: 0, max: 50, step: 1, unit: "px", group: "main", hint: "平滑位移图，不添加表面磨砂。" },
  { key: "distortionScale", label: "折射强度", min: -300, max: 300, step: 1, unit: "", group: "main", hint: "正负值改变折射方向，0 关闭基本位移。" },
  { key: "brightness", label: "位移图亮度", min: 0, max: 100, step: 1, unit: "%", group: "advanced", hint: "50 为中性位移，偏离后会改变背景位置。" },
  { key: "opacity", label: "位移图不透明度", min: 0, max: 1, step: .01, unit: "", group: "advanced", hint: "控制中性位移区域的覆盖程度。" },
  { key: "displace", label: "背景图像柔化", min: 0, max: 5, step: .1, unit: "px", group: "advanced", hint: "大于 0 时柔化背景图像，正文不受影响。" },
  { key: "redOffset", label: "红色通道偏移", min: -100, max: 100, step: 1, unit: "", group: "advanced", hint: "叠加到折射强度上。" },
  { key: "greenOffset", label: "绿色通道偏移", min: -100, max: 100, step: 1, unit: "", group: "advanced", hint: "叠加到折射强度上。" },
  { key: "blueOffset", label: "蓝色通道偏移", min: -100, max: 100, step: 1, unit: "", group: "advanced", hint: "叠加到折射强度上。" },
] as const;

export type GlassSurfaceControl = typeof GLASS_SURFACE_CONTROLS[number];
export type GlassSurfaceNumberKey = GlassSurfaceControl["key"];

export function normalizeGlassSurface(value: unknown): GlassSurfaceSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next: GlassSurfaceSettings = { ...CLEAR_GLASS_SURFACE, map: raw.map === "official" ? "official" : "curve" };
  for (const field of GLASS_SURFACE_CONTROLS) {
    const number = raw[field.key];
    if (typeof number === "number" && Number.isFinite(number)) {
      next[field.key] = Math.max(field.min, Math.min(field.max, number));
    }
  }
  return next;
}

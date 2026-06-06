"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { BASIC_MOVES, COMBO_MOVES, IMG_PARAM_CATEGORIES } from "@/app/data/opc-knowledge";
import { useAuth } from "./AuthProvider";
import { getToken } from "@/app/lib/auth";
import { fetchServerSettings, saveServerSettings } from "@/app/lib/sync";

// ── 风格预设（知识库全量，按类别分组）──

const STYLE_CATEGORIES = [
  { label: "全部", key: "all" },
  { label: "东方美学", key: "eastern" },
  { label: "电影导演", key: "director" },
  { label: "摄影技法", key: "photo" },
  { label: "科幻未来", key: "scifi" },
  { label: "艺术画派", key: "art" },
  { label: "动画", key: "animation" },
  { label: "商业视觉", key: "commercial" },
  { label: "当代视觉", key: "contemporary" },
];

const STYLES = [
  // ── 东方美学 ──
  { cat: "eastern", label: "水墨画", prefix: "traditional Chinese ink wash，黑白灰渐变、留白、笔触感、山水意境、禅意——" },
  { cat: "eastern", label: "浮世绘", prefix: "Japanese ukiyo-e woodblock print，平面化色彩、清晰轮廓线、装饰性图案——" },
  { cat: "eastern", label: "敦煌壁画", prefix: "ancient Dunhuang mural art，矿物颜料褪色感、飞天造型、流畅线条——" },
  { cat: "eastern", label: "丝绸朋克", prefix: "Silkpunk Chinese sci-fi aesthetic，东方竹木机械装置、丝绸+科技融合——" },
  // ── 电影导演 ──
  { cat: "director", label: "王家卫", prefix: "in the style of Wong Kar-wai，霓虹灯光、朦胧柔焦、浓郁色彩、都市孤独感——" },
  { cat: "director", label: "宫崎骏", prefix: "in the style of Hayao Miyazaki，手绘感、自然环境、蓝天白云、治愈氛围——" },
  { cat: "director", label: "新海诚", prefix: "in the style of Makoto Shinkai，极致光影、天空渲染、光斑散景、青春感——" },
  { cat: "director", label: "诺兰", prefix: "in the style of Christopher Nolan，冷峻色调、几何构图、大画幅质感、时间感——" },
  { cat: "director", label: "韦斯·安德森", prefix: "in the style of Wes Anderson，对称构图、柔和粉彩色调、复古质感——" },
  { cat: "director", label: "张艺谋", prefix: "in the style of Zhang Yimou，高饱和色彩、宏大场面调度、红黄绿对撞——" },
  { cat: "director", label: "陈凯歌", prefix: "in the style of Chen Kaige，诗意构图、历史厚重感、长镜头运镜——" },
  { cat: "director", label: "昆汀", prefix: "in the style of Quentin Tarantino，非线性叙事、高对比色调、复古质感、暴力美学——" },
  { cat: "director", label: "库布里克", prefix: "in the style of Stanley Kubrick，完美对称单点透视、冷峻凝视感、极致几何构图——" },
  { cat: "director", label: "大卫·芬奇", prefix: "in the style of David Fincher，暗绿色调、低照度灯光、精密摄影机运动——" },
  { cat: "director", label: "是枝裕和", prefix: "in the style of Hirokazu Kore-eda，自然光拍摄、静态长镜头、日常生活的诗意——" },
  { cat: "director", label: "今敏", prefix: "in the style of Satoshi Kon，现实与梦境无缝转场、意识流动画、分屏剪辑——" },
  { cat: "director", label: "维伦纽瓦", prefix: "in the style of Denis Villeneuve，巨构建筑、史诗尺度的空旷感、缓慢沉浸式镜头——" },
  { cat: "director", label: "雷德利·斯科特", prefix: "in the style of Ridley Scott，烟雾与光束交织的大气透视、世界建造感——" },
  { cat: "director", label: "蒂姆·波顿", prefix: "in the style of Tim Burton，哥特式童话、黑色幽默、螺旋条纹、暗黑背景对比——" },
  // ── 摄影技法 ──
  { cat: "photo", label: "35mm胶片", prefix: "35mm film photography，颗粒感、柔和色调过渡、轻微暗角、复古怀旧——" },
  { cat: "photo", label: "宝丽来", prefix: "Polaroid instant photo，白色边框、偏色、柔焦、复古色调——" },
  { cat: "photo", label: "Kodachrome", prefix: "Kodachrome film colors，鲜艳但不刺眼的色彩、偏暖色调、经典柯达色——" },
  { cat: "photo", label: "黑白纪实", prefix: "black and white documentary photography，高对比度、粗颗粒、真实感——" },
  { cat: "photo", label: "Vogue大片", prefix: "high fashion editorial photography，精致布光、超模姿态、奢华质感——" },
  { cat: "photo", label: "蜷川实花", prefix: "in the style of Mika Ninagawa，高饱和色彩、花卉密集、梦幻艳丽——" },
  { cat: "photo", label: "杉本博司", prefix: "in the style of Hiroshi Sugimoto，黑白长曝光、极简构图、时间凝固感——" },
  { cat: "photo", label: "荒木经惟", prefix: "in the style of Nobuyoshi Araki，黑白高反差、私摄影、花卉与人体——" },
  { cat: "photo", label: "布列松", prefix: "in the style of Henri Cartier-Bresson，决定性瞬间、几何构图、黑白街拍——" },
  { cat: "photo", label: "安妮·莱博维茨", prefix: "in the style of Annie Leibovitz，戏剧化布光、电影感构图、名流肖像——" },
  { cat: "photo", label: "彼得·林德伯格", prefix: "in the style of Peter Lindbergh，黑白高对比、自然光、不加修饰的真实感——" },
  { cat: "photo", label: "蒂姆·沃克", prefix: "in the style of Tim Walker，超现实场景搭建、童话奇幻色彩、明亮梦幻——" },
  { cat: "photo", label: "陈漫", prefix: "in the style of Chen Man，中国元素与时尚融合、高饱和+柔焦——" },
  // ── 科幻未来 ──
  { cat: "scifi", label: "太阳朋克", prefix: "Solarpunk aesthetic，绿植覆盖的未来建筑、清洁能源、明亮暖色调阳光——" },
  { cat: "scifi", label: "蒸汽朋克", prefix: "Steampunk aesthetic，黄铜齿轮机械、维多利亚时代服饰、暖棕铜色调——" },
  { cat: "scifi", label: "柴油朋克", prefix: "Dieselpunk aesthetic，重型内燃机美学、铆接钢板、战时工业风——" },
  { cat: "scifi", label: "废土美学", prefix: "post-apocalyptic wasteland，生锈金属、沙尘暴、褪色枯黄、末日荒凉——" },
  { cat: "scifi", label: "磁带未来", prefix: "Cassette Futurism aesthetic，CRT球面屏幕、笨重物理按钮、70-80年代科幻UI——" },
  { cat: "scifi", label: "生化朋克", prefix: "Biopunk aesthetic，有机组织与机械融合、基因改造视觉、生物发光——" },
  { cat: "scifi", label: "霓虹黑色", prefix: "Neon Noir aesthetic，雨夜霓虹倒影、高反差剪影、冷蓝色+品红高光——" },
  { cat: "scifi", label: "合成波", prefix: "Synthwave Outrun aesthetic，网格线地平线、落日橙色渐变、80年代跑车剪影——" },
  { cat: "scifi", label: "全息美学", prefix: "holographic display aesthetic，半透明蓝光投影、扫描线、粒子网格——" },
  { cat: "scifi", label: "线框视觉", prefix: "wireframe neon geometry，发光几何线框、网格空间、Tron式光带——" },
  { cat: "scifi", label: "液态金属", prefix: "liquid metal reflective surface，流动金属反光曲面、水银质感、镜面反射——" },
  { cat: "scifi", label: "参数化设计", prefix: "parametric algorithmic geometry，算法生成的有机曲线阵列、Zaha Hadid式流体建筑——" },
  { cat: "scifi", label: "巨构建筑", prefix: "megastructure sci-fi architecture，超尺度建筑群、层级城市体块、BR2049式巨型方块——" },
  { cat: "scifi", label: "赛博贫民窟", prefix: "cyberpunk slum aesthetic，密集缠绕电线、潮湿肮脏街巷、密集霓虹招牌——" },
  { cat: "scifi", label: "极简未来", prefix: "minimalist futuristic architecture，纯白无缝曲面、隐藏式光源、禅意科技感——" },
  { cat: "scifi", label: "后人类", prefix: "posthuman transhuman aesthetic，超越传统人形、数据化意识流、赛博格改造——" },
  { cat: "scifi", label: "非洲未来", prefix: "Afrofuturism aesthetic，非洲传统织物+高科技元素、鲜艳大地色系——" },
  { cat: "scifi", label: "赛博朋克插画", prefix: "cyberpunk digital illustration，霓虹灯色板、高对比、未来城市、机械细节——" },
  { cat: "scifi", label: "玻璃科技", prefix: "glassmorphism UI aesthetic，磨砂玻璃层叠、透明面板、微光边缘——" },
  { cat: "scifi", label: "生态建筑", prefix: "arcology eco-city，自给自足的梯形生态城市、植被梯田层叠——" },
  // ── 艺术画派 ──
  { cat: "art", label: "印象派", prefix: "Impressionist painting style，捕捉瞬间光影、可见笔触、色彩并置混合——" },
  { cat: "art", label: "巴洛克", prefix: "Baroque art style，戏剧性明暗对比、动感构图、丰富的金色与深色调——" },
  { cat: "art", label: "波普艺术", prefix: "Pop art style，鲜艳平涂色块、网点印刷纹理、大众消费品符号——" },
  { cat: "art", label: "超现实主义", prefix: "Surrealist art style，梦境般的非理性组合、变形与置换、潜意识视觉化——" },
  { cat: "art", label: "极简主义", prefix: "Minimalist art style，极简几何形、大面积留白/纯色、空间呼吸感——" },
  { cat: "art", label: "表现主义", prefix: "Expressionist art style，强烈的主观情感表达、扭曲变形、狂野色彩——" },
  { cat: "art", label: "双重曝光", prefix: "double exposure，人像与风景融合、叠影、象征、情绪化表达强——" },
  // ── 动画 ──
  { cat: "animation", label: "皮克斯", prefix: "Pixar style 3D animation，圆润造型、高饱和度材质、精细光线渲染、温暖治愈——" },
  { cat: "animation", label: "迪士尼经典", prefix: "classic Disney animation style，流畅手绘线条、夸张弹性动作、童话色彩——" },
  { cat: "animation", label: "京都动画", prefix: "Kyoto Animation style，极致细腻的背景美术、柔和光影、少女感线条——" },
  { cat: "animation", label: "梦工厂", prefix: "DreamWorks animation style，夸张角色比例、卡通化弹性变形、鲜艳色彩——" },
  { cat: "animation", label: "卡通沙龙", prefix: "Cartoon Saloon art style，手绘民族艺术感、几何装饰纹样、传统民间美术——" },
  // ── 商业视觉 ──
  { cat: "commercial", label: "极简产品", prefix: "minimalist product photography，纯色背景、精确布光、干净构图、细节锐利——" },
  { cat: "commercial", label: "概念海报", prefix: "artistic movie poster design，创意合成、象征元素、留白构图、视觉冲击——" },
  { cat: "commercial", label: "Kurzgesagt", prefix: "Kurzgesagt presents，高饱和、扁平化、教育动画感、信息图友好——" },
];

type Template = { icon: string; label: string; prompt: string };

const DEFAULT_TEMPLATES: Record<string, Template[]> = {
  "产品短片": [
    { icon: "□", label: "TVC宣传", prompt: "为我们的产品生成一条15秒TVC级宣传短片，突出核心卖点和使用场景，节奏紧凑，视觉冲击力强。" },
    { icon: "□", label: "功能展示", prompt: "用动态演示方式展示产品核心功能，10秒，简洁明了，突出差异化优势。" },
  ],
  "品牌故事": [
    { icon: "◇", label: "品牌叙事", prompt: "用电影感叙事手法讲述品牌背后的故事，30秒内，情绪饱满，让观众产生情感共鸣。" },
    { icon: "◇", label: "创始人故事", prompt: "以创始人第一人称视角讲述创业初心，20秒，真实感强，建立信任连接。" },
  ],
  "社媒短视频": [
    { icon: "△", label: "抖音爆款", prompt: "生成一条适合抖音/小红书的竖版短视频，9:16，节奏快，前3秒必须有钩子抓住注意力。" },
    { icon: "△", label: "开箱体验", prompt: "模拟第一人称视角的产品开箱体验，突出细节质感和包装设计，15秒，节奏舒适。" },
  ],
  "创意实验": [
    { icon: "○", label: "视觉实验", prompt: "打破常规！用超现实视觉和非常规剪辑手法，创作一条实验性艺术短片，风格前卫。" },
    { icon: "○", label: "AI概念", prompt: "生成一条纯AI驱动的概念短片，探索人机协作的视觉边界，15秒，未来感。" },
  ],
  "教学演示": [
    { icon: "▽", label: "技能教学", prompt: "用清晰的视觉语言生成一条教学演示视频，15秒内讲清楚一个概念，配合动画辅助理解。" },
    { icon: "▽", label: "产品教程", prompt: "制作一条软件/产品使用教程短视频，分步骤演示，20秒，新手友好。" },
  ],
  "活动预告": [
    { icon: "⬡", label: "活动邀请", prompt: "生成一条活动邀请/预告短片，充满期待感，包含时间地点关键信息，引导用户报名。" },
    { icon: "⬡", label: "倒计时", prompt: "用倒计时形式制作活动预告，逐日悬念递增，15秒，最后一天揭晓重磅信息。" },
  ],
};

const CATEGORIES = Object.keys(DEFAULT_TEMPLATES) as string[];
const DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const ASPECTS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "9:21", "adaptive"];

function loadUserTemplates(): Record<string, Template[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("opc_templates") || "{}"); } catch { return {}; }
}
function saveUserTemplates(data: Record<string, Template[]>) {
  localStorage.setItem("opc_templates", JSON.stringify(data));
}

type OPCParams = { duration: number; aspect: string; cameraMove: string; selectedParams: string[] };

type Props = {
  onTemplateClick: (prompt: string) => void;
  onStyleClick: (prefix: string) => void;
  onParamsChange?: (params: OPCParams) => void;
  onOpenAgent?: () => void;
};

// ── 可折叠分类组件 ──
function CollapsibleSection({ title, icon, count, defaultOpen, children }: {
  title: string; icon?: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <details className="opc-collapse" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="opc-collapse-header">
        <span className="opc-collapse-icon">{icon || "▸"}</span>
        <span className="opc-collapse-title">{title}</span>
        {count !== undefined && <span className="opc-collapse-count">{count}</span>}
      </summary>
      <div className="opc-collapse-body">{children}</div>
    </details>
  );
}

// ── 参数标签按钮 ──
function ParamChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`opc-param-chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

export default function OPCPanel({ onTemplateClick, onStyleClick, onParamsChange, onOpenAgent }: Props) {
  const { user } = useAuth();
  const [duration, setDuration] = useState(8);
  const [aspect, setAspect] = useState("16:9");
  const [cameraMove, setCameraMove] = useState("");
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [selectedParams, setSelectedParams] = useState<Set<string>>(new Set());
  const [userTemplates, setUserTemplates] = useState<Record<string, Template[]>>({});
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 风格分类标签页
  const [styleTab, setStyleTab] = useState("all");

  // 传递框
  const [composeText, setComposeText] = useState("");
  const composeRef = useRef<HTMLTextAreaElement>(null);

  // 保存模板悬浮窗
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState(CATEGORIES[0]);

  useEffect(() => { setUserTemplates(loadUserTemplates()); }, []);

  // 登录后从服务端加载 OPC 设置
  useEffect(() => {
    if (!user) return;
    fetchServerSettings().then((s) => {
      if (s?.opcStyle) setActiveStyle(s.opcStyle);
      if (s?.opcParams?.selectedParams) setSelectedParams(new Set(s.opcParams.selectedParams));
    });
  }, [user]);

  // OPC 设置变更时同步到服务端
  const syncOpcSettings = useCallback((style: string | null, params: Set<string>) => {
    if (!user || !getToken()) return;
    saveServerSettings({
      opcStyle: style || "",
      opcParams: { selectedParams: [...params] },
    });
  }, [user]);

  const allTemplates = (cat: string) => [
    ...(DEFAULT_TEMPLATES[cat] || []),
    ...(userTemplates[cat] || []),
  ];

  const addTemplate = (cat: string) => {
    if (!newLabel.trim() || !newPrompt.trim()) return;
    const updated = { ...userTemplates, [cat]: [...(userTemplates[cat] || []), { icon: "＋", label: newLabel.trim(), prompt: newPrompt.trim() }] };
    setUserTemplates(updated); saveUserTemplates(updated); setNewLabel(""); setNewPrompt("");
  };

  const deleteTemplate = (cat: string, idx: number) => {
    const defCount = (DEFAULT_TEMPLATES[cat] || []).length;
    if (idx < defCount) return;
    const list = [...(userTemplates[cat] || [])]; list.splice(idx - defCount, 1);
    const updated = { ...userTemplates, [cat]: list }; setUserTemplates(updated); saveUserTemplates(updated);
  };

  const toggleParam = (val: string) => {
    setSelectedParams((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      syncOpcSettings(activeStyle, next);
      onParamsChange?.({ duration, aspect, cameraMove, selectedParams: [...next] });
      return next;
    });
  };

  const resetAll = () => {
    setDuration(8); setAspect("16:9"); setCameraMove(""); setActiveStyle(null); setSelectedParams(new Set());
    onStyleClick("");
    onParamsChange?.({ duration: 8, aspect: "16:9", cameraMove: "", selectedParams: [] });
  };

  const buildPrompt = (base: string) => {
    const parts = [base];
    if (activeStyle) {
      const s = STYLES.find((st) => st.label === activeStyle);
      if (s) parts.unshift(s.prefix);
    }
    if (cameraMove) {
      const m = [...BASIC_MOVES, ...COMBO_MOVES].find((mv) => mv.name === cameraMove);
      if (m) parts.push(`运镜：${m.name}（${m.en}）`);
    }
    if (selectedParams.size > 0) parts.push(`参数：${[...selectedParams].join("、")}`);
    if (duration) parts.push(`时长${duration}秒`);
    if (aspect) parts.push(`画幅${aspect}`);
    return parts.join("，");
  };

  // ── 替换式插入：先移除同类旧文本再插入 ──
  const replaceInCompose = useCallback((pattern: RegExp, replacement: string) => {
    setComposeText((prev) => {
      const cleaned = prev.replace(pattern, "");
      return cleaned + replacement;
    });
  }, []);

  // ── 传递框：在光标位置插入文本 ──
  const insertAtCursor = useCallback((text: string) => {
    const ta = composeRef.current;
    if (!ta) {
      setComposeText((prev) => prev + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = composeText.slice(0, start);
    const after = composeText.slice(end);
    const next = before + text + after;
    setComposeText(next);
    // 光标移到插入点之后
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  }, [composeText]);

  // ── 确定：传递到主工作区 ──
  const handleConfirm = () => {
    if (!composeText.trim()) return;
    onTemplateClick(composeText.trim());
  };

  // ── 保存到模板 ──
  const handleSave = () => {
    if (!composeText.trim() || !saveName.trim()) return;
    const updated = { ...userTemplates, [saveCategory]: [...(userTemplates[saveCategory] || []), { icon: "＋", label: saveName.trim(), prompt: composeText.trim() }] };
    setUserTemplates(updated); saveUserTemplates(updated);
    setShowSaveModal(false); setSaveName("");
  };

  // 过滤风格
  const filteredStyles = styleTab === "all" ? STYLES : STYLES.filter((s) => s.cat === styleTab);

  return (
    <div className="opc-panel">
      {/* ── AI 创作助手入口 ── */}
      {onOpenAgent && (
        <button type="button" className="opc-ai-trigger" onClick={onOpenAgent}>
          <span className="opc-ai-trigger-glow" />
          <span className="opc-ai-trigger-icon">✦</span>
          <span className="opc-ai-trigger-text">AI 创作助手</span>
          <span className="opc-ai-trigger-hint">点击或按 ⌘K 开启</span>
        </button>
      )}

      {/* ── 快捷模板 ── */}
      <div className="opc-section-block">
        <h3 className="opc-section-h">快捷模板</h3>
        <div className="opc-grid">
          {CATEGORIES.map((cat) => (
            <button key={cat} type="button"
              className={`opc-card edge-glow edge-glow-subtle ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}>
              <span className="opc-card-icon">{DEFAULT_TEMPLATES[cat]?.[0]?.icon || "□"}</span>
              <span className="opc-card-label">{cat}</span>
            </button>
          ))}
        </div>
        <button type="button" className="opc-manage-bar edge-glow edge-glow-subtle"
          onClick={() => setEditingCategory(activeCategory || CATEGORIES[0])}>
          <span className="opc-manage-bar-icon">＋</span>
          <span className="opc-manage-bar-text">管理自定义模板</span>
          <span className="opc-manage-bar-arrow">→</span>
        </button>
      </div>

      {/* 模板管理 */}
      {editingCategory && (
        <div className="opc-manager">
          <div className="opc-manager-top">
            <button className="opc-manager-back" onClick={() => setEditingCategory(null)}>← 返回</button>
            <span className="opc-manager-title">模板管理 · {editingCategory}</span>
          </div>
          <div className="opc-manager-list">
            {allTemplates(editingCategory).map((t, i) => (
              <div key={i} className="opc-manager-item">
                <div>
                  <span className="opc-manager-item-label">{t.icon} {t.label}</span>
                  <span className="opc-manager-item-prompt">{t.prompt}</span>
                </div>
                <div className="opc-manager-item-actions">
                  <button type="button" className="opc-manager-use-btn" onClick={() => { onTemplateClick(buildPrompt(t.prompt)); setEditingCategory(null); }}>使用</button>
                  <button type="button" className="opc-manager-del-btn" onClick={() => deleteTemplate(editingCategory, i)}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="opc-manager-add">
            <input className="opc-manager-input" placeholder="模板名称" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <div className="opc-manager-textarea-wrap">
              <textarea className="opc-manager-textarea" placeholder="提示词内容" value={newPrompt}
                onChange={(e) => { setNewPrompt(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }} rows={2} />
            </div>
            <button className="opc-manager-add-btn" onClick={() => addTemplate(editingCategory)}>添加</button>
          </div>
        </div>
      )}

      {/* ── 传递框 ── */}
      <div className="opc-section-block opc-compose-box">
        <h3 className="opc-section-h">提示词编排</h3>
        <p className="opc-compose-hint">点击下方任意参数标签，文字将插入到光标位置。可重复添加。</p>
        <textarea
          ref={composeRef}
          className="opc-compose-textarea"
          value={composeText}
          onChange={(e) => setComposeText(e.target.value)}
          placeholder="在这里编排你的提示词... 点击下方标签自动填入"
          rows={5}
        />
        <div className="opc-compose-actions">
          <button type="button" className="opc-compose-confirm" onClick={handleConfirm}>
            ▶ 确定传递
          </button>
          <button type="button" className="opc-compose-save" onClick={() => composeText.trim() && setShowSaveModal(true)}>
            ☆ 保存模板
          </button>
        </div>
      </div>

      {/* ── 风格预设 ── */}
      <div className="opc-section-block">
        <h3 className="opc-section-h">风格预设 <span className="opc-section-count">{filteredStyles.length}</span></h3>
        <div className="opc-style-tabs">
          {STYLE_CATEGORIES.map((sc) => (
            <button key={sc.key} type="button"
              className={`opc-style-tab ${styleTab === sc.key ? "active" : ""}`}
              onClick={() => setStyleTab(sc.key)}>
              {sc.label}
            </button>
          ))}
        </div>
        <div className="opc-style-grid">
          {filteredStyles.map((s) => (
            <button key={s.label} type="button"
              className={`opc-style-chip edge-glow edge-glow-subtle ${activeStyle === s.label ? "active" : ""}`}
              onClick={() => {
                const next = activeStyle === s.label ? null : s.label;
                setActiveStyle(next);
                onStyleClick(next ? s.prefix : "");
                if (next) insertAtCursor(s.prefix + "，");
                syncOpcSettings(next, selectedParams);
              }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 运镜选择 ── */}
      <div className="opc-section-block">
        <div className="opc-section-header">
          <h3 className="opc-section-h">运镜选择</h3>
          {cameraMove && <button type="button" className="opc-reset-btn" onClick={() => setCameraMove("")}>清除</button>}
        </div>
        <CollapsibleSection title="基础运镜" icon="📹" count={BASIC_MOVES.length} defaultOpen={true}>
          <div className="opc-move-grid">
            {BASIC_MOVES.map((m) => (
              <button key={m.name} type="button"
                className={`opc-move-btn ${cameraMove === m.name ? "active" : ""}`}
                onClick={() => {
                  const next = cameraMove === m.name ? "" : m.name;
                  setCameraMove(next);
                  if (next) insertAtCursor(`运镜：${m.name}（${m.en}），`);
                  onParamsChange?.({ duration, aspect, cameraMove: next, selectedParams: [...selectedParams] });
                }}>
                <span className="opc-move-name">{m.name}</span>
                <span className="opc-move-en">{m.en}</span>
                <span className="opc-move-effect">{m.effect}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="组合运镜" icon="🎬" count={COMBO_MOVES.length}>
          <div className="opc-move-grid">
            {COMBO_MOVES.map((m) => (
              <button key={m.name} type="button"
                className={`opc-move-btn ${cameraMove === m.name ? "active" : ""}`}
                onClick={() => {
                  const next = cameraMove === m.name ? "" : m.name;
                  setCameraMove(next);
                  if (next) insertAtCursor(`运镜：${m.name}（${m.en}），`);
                  onParamsChange?.({ duration, aspect, cameraMove: next, selectedParams: [...selectedParams] });
                }}>
                <span className="opc-move-name">{m.name}</span>
                <span className="opc-move-en">{m.en}</span>
                <span className="opc-move-effect">{m.effect}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      {/* ── 图像参数 ── */}
      <div className="opc-section-block">
        <div className="opc-section-header">
          <h3 className="opc-section-h">图像参数</h3>
          {selectedParams.size > 0 && (
            <button type="button" className="opc-reset-btn" onClick={() => setSelectedParams(new Set())}>
              清除 ({selectedParams.size})
            </button>
          )}
        </div>
        {IMG_PARAM_CATEGORIES.map((cat) => (
          <CollapsibleSection key={cat.label} title={cat.label} icon={cat.icon}
            count={cat.items.reduce((a, b) => a + b.values.length, 0)}>
            {cat.items.map((item) => (
              <div key={item.key} className="opc-param-sub">
                <span className="opc-param-sub-label">{item.label}</span>
                <div className="opc-param-chips">
                  {item.values.map((val) => (
                    <ParamChip key={val} label={val} active={selectedParams.has(val)}
                      onClick={() => {
                        toggleParam(val);
                        insertAtCursor(val + "、");
                      }} />
                  ))}
                </div>
              </div>
            ))}
          </CollapsibleSection>
        ))}
      </div>

      {/* ── 基础参数 ── */}
      <div className="opc-section-block">
        <div className="opc-section-header">
          <h3 className="opc-section-h">基础参数</h3>
          <button type="button" className="opc-reset-btn" onClick={resetAll}>全部重置</button>
        </div>
        <div className="opc-params">
          <div className="opc-param-group">
            <span className="opc-param-label">时长</span>
            <div className="opc-slider-wrap">
              <input type="range" min={4} max={15} step={1} value={duration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDuration(v);
                  replaceInCompose(/时长\d+秒，?/, `时长${v}秒，`);
                  onParamsChange?.({ duration: v, aspect, cameraMove, selectedParams: [...selectedParams] });
                }} className="opc-slider" />
              <div className="opc-slider-ticks">
                {DURATIONS.map((d) => (<button key={d} type="button" className={`opc-tick ${duration === d ? "active" : ""}`}
                  onClick={() => {
                    setDuration(d);
                    replaceInCompose(/时长\d+秒，?/, `时长${d}秒，`);
                    onParamsChange?.({ duration: d, aspect, cameraMove, selectedParams: [...selectedParams] });
                  }}>{d}s</button>))}
              </div>
            </div>
          </div>
          <div className="opc-param-group">
            <span className="opc-param-label">画幅</span>
            <div className="opc-chip-row">
              {ASPECTS.map((a) => (<button key={a} type="button" className={`opc-chip ${aspect === a ? "active" : ""}`}
                onClick={() => {
                  setAspect(a);
                  replaceInCompose(/画幅[\d:a-z]+，?/, `画幅${a}，`);
                  onParamsChange?.({ duration, aspect: a, cameraMove, selectedParams: [...selectedParams] });
                }}>{a}</button>))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 保存模板悬浮窗（太空舷窗风格）── */}
      {showSaveModal && (
        <div className="opc-save-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="opc-save-modal" onClick={(e) => e.stopPropagation()}>
            <div className="opc-save-porthole">
              <div className="opc-save-porthole-ring" />
              <div className="opc-save-porthole-inner">
                <h3 className="opc-save-title">保存到快捷模板</h3>
                <div className="opc-save-form">
                  <label className="opc-save-label">模板名称</label>
                  <input className="opc-save-input" placeholder="我的模板" value={saveName}
                    onChange={(e) => setSaveName(e.target.value)} autoFocus />
                  <label className="opc-save-label">保存到</label>
                  <div className="opc-save-categories">
                    {CATEGORIES.map((cat) => (
                      <button key={cat} type="button"
                        className={`opc-save-cat ${saveCategory === cat ? "active" : ""}`}
                        onClick={() => setSaveCategory(cat)}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="opc-save-preview">{composeText.slice(0, 120)}{composeText.length > 120 ? "..." : ""}</div>
                  <div className="opc-save-actions">
                    <button type="button" className="opc-save-cancel" onClick={() => setShowSaveModal(false)}>取消</button>
                    <button type="button" className="opc-save-confirm" onClick={handleSave}>保存</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .opc-panel { width: 100%; max-width: 960px; margin: 0 auto; padding: 0 0 40px; }
        .opc-section-block { margin-bottom: 40px; }
        .opc-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .opc-section-h {
          font-family: "GeistPixel-Line", var(--font-display), var(--font-sans);
          font-size: 18px; font-weight: 400; letter-spacing: 0.06em; margin: 0;
          color: var(--glow-warm-soft);
          text-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }
        .opc-section-count { font-size: 12px; color: var(--foreground-muted); margin-left: 6px; }
        .opc-reset-btn {
          padding: 5px 14px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--foreground-muted); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px; transition: all 0.15s;
        }
        .opc-reset-btn:hover { border-color: var(--glow-warm); color: var(--glow-warm); }

        /* 折叠面板 */
        .opc-collapse { margin-bottom: 8px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border-subtle); }
        .opc-collapse-header {
          display: flex; align-items: center; gap: 8px; padding: 10px 14px;
          cursor: pointer; list-style: none; user-select: none;
          background: var(--space-panel); transition: background 0.15s;
        }
        .opc-collapse-header:hover { background: color-mix(in srgb, var(--space-panel) 80%, var(--glow-warm) 5%); }
        .opc-collapse-header::-webkit-details-marker { display: none; }
        .opc-collapse-icon { font-size: 12px; color: var(--glow-warm); transition: transform 0.2s; }
        .opc-collapse[open] .opc-collapse-icon { transform: rotate(90deg); }
        .opc-collapse-title {
          flex: 1; font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px;
          color: var(--foreground); letter-spacing: 0.04em;
        }
        .opc-collapse-count {
          font-size: 11px; color: var(--foreground-muted); background: var(--space-surface);
          padding: 2px 8px; border-radius: 10px;
        }
        .opc-collapse-body { padding: 10px 14px 14px; }

        /* 运镜网格 */
        .opc-move-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
        .opc-move-btn {
          display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
          padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-subtle);
          background: var(--space-surface); cursor: pointer; transition: all 0.15s; text-align: left;
        }
        .opc-move-btn:hover { border-color: var(--glow-warm); background: color-mix(in srgb, var(--space-surface) 80%, var(--glow-warm) 5%); }
        .opc-move-btn.active { border-color: var(--glow-warm); background: color-mix(in srgb, var(--glow-warm) 10%, var(--space-surface)); }
        .opc-move-name { font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; color: var(--foreground); }
        .opc-move-en { font-size: 10px; color: var(--foreground-muted); font-family: "Geist Mono", monospace; }
        .opc-move-effect { font-size: 10px; color: var(--glow-cool); }

        /* 参数子分类 */
        .opc-param-sub { margin-bottom: 12px; }
        .opc-param-sub:last-child { margin-bottom: 0; }
        .opc-param-sub-label {
          font-size: 12px; color: var(--foreground-muted); margin-bottom: 6px; display: block;
          font-family: "GeistPixel-Line", var(--font-sans); letter-spacing: 0.04em;
        }
        .opc-param-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .opc-param-chip {
          padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--space-surface); color: var(--foreground-muted); font-size: 12px;
          cursor: pointer; font-family: "GeistPixel-Line", var(--font-sans); transition: all 0.15s;
        }
        .opc-param-chip:hover { border-color: var(--glow-cool); color: var(--foreground); }
        .opc-param-chip.active { background: var(--glow-cool); color: #0a0812; border-color: var(--glow-cool); }

        /* 模板卡片 */
        .opc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
        .opc-card {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 18px 12px; border-radius: 16px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          cursor: pointer; transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3); position: relative; z-index: 1;
        }
        .opc-card:hover { border-color: var(--glow-warm); transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 20px color-mix(in srgb, var(--glow-warm) 15%, transparent); }
        .opc-card.active { border-color: var(--glow-warm); background: color-mix(in srgb, var(--glow-warm) 10%, var(--space-panel)); }
        .opc-card-icon { font-size: 22px; color: var(--glow-warm); position: relative; z-index: 2; }
        .opc-card-label {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          color: var(--foreground-muted); text-align: center; letter-spacing: 0.04em;
          position: relative; z-index: 2;
        }

        .opc-manage-bar {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 14px 20px; border-radius: 14px;
          background: var(--space-panel); border: 1px dashed var(--border-subtle);
          cursor: pointer; transition: all 0.2s ease-out; position: relative; z-index: 1;
        }
        .opc-manage-bar:hover { border-color: var(--glow-warm); border-style: solid; }
        .opc-manage-bar-icon { font-size: 18px; color: var(--glow-warm); flex-shrink: 0; transition: transform 0.2s ease-out; }
        .opc-manage-bar:hover .opc-manage-bar-icon { transform: rotate(90deg); }
        .opc-manage-bar-text { flex: 1; font-size: 13px; color: var(--foreground-muted); font-family: "GeistPixel-Line", var(--font-sans); letter-spacing: 0.04em; text-align: left; }
        .opc-manage-bar-arrow { font-size: 16px; color: var(--glow-warm); flex-shrink: 0; transition: transform 0.2s ease-out; }
        .opc-manage-bar:hover .opc-manage-bar-arrow { transform: translateX(4px); }

        .opc-manager { animation: manager-in 0.3s cubic-bezier(0.16,1,0.3,1); }
        @keyframes manager-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .opc-manager-top { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .opc-manager-back { padding: 8px 16px; border-radius: 10px; border: 1px solid var(--border-subtle); background: transparent; color: var(--foreground-muted); cursor: pointer; font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; transition: all 0.15s; }
        .opc-manager-back:hover { border-color: var(--glow-warm); color: var(--glow-warm); }
        .opc-manager-title { font-family: "GeistPixel-Line", var(--font-sans); font-size: 16px; color: var(--glow-warm-soft); }
        .opc-manager-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .opc-manager-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 14px; background: var(--space-surface); border: 1px solid var(--border-subtle); gap: 12px; }
        .opc-manager-item-label { font-size: 13px; color: var(--foreground); display: block; font-weight: 500; }
        .opc-manager-item-prompt { font-size: 11px; color: var(--foreground-muted); display: block; margin-top: 2px; line-height: 1.4; }
        .opc-manager-item-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .opc-manager-use-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--glow-warm); background: transparent; color: var(--glow-warm); cursor: pointer; font-size: 12px; transition: all 0.15s; }
        .opc-manager-use-btn:hover { background: var(--glow-warm); color: #0a0812; }
        .opc-manager-del-btn { width: 24px; height: 24px; border-radius: 50%; border: none; background: transparent; color: var(--foreground-muted); cursor: pointer; font-size: 14px; }
        .opc-manager-del-btn:hover { color: var(--error); }
        .opc-manager-add { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
        .opc-manager-input { flex: 1; min-width: 140px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--space-surface); color: var(--foreground); font-family: var(--font-sans); font-size: 13px; outline: none; }
        .opc-manager-input:focus { border-color: var(--glow-warm); }
        .opc-manager-input::placeholder { color: var(--foreground-muted); }
        .opc-manager-textarea-wrap { flex: 2; min-width: 200px; }
        .opc-manager-textarea { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--space-surface); color: var(--foreground); font-family: var(--font-sans); font-size: 13px; outline: none; resize: vertical; min-height: 44px; max-height: 200px; transition: border-color 0.15s; line-height: 1.5; }
        .opc-manager-textarea:focus { border-color: var(--glow-warm); }
        .opc-manager-textarea::placeholder { color: var(--foreground-muted); }
        .opc-manager-add-btn { padding: 10px 18px; border-radius: 10px; border: none; background: var(--glow-warm); color: #0a0812; cursor: pointer; font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; transition: all 0.15s; }
        .opc-manager-add-btn:hover { background: var(--glow-warm-soft); }

        /* ── 传递框 ── */
        .opc-compose-box { border: 1px solid var(--border-subtle); border-radius: 16px; padding: 20px; background: var(--space-panel); }
        .opc-compose-hint { font-size: 12px; color: var(--foreground-muted); margin: 0 0 12px; font-family: "GeistPixel-Line", var(--font-sans); }
        .opc-compose-textarea {
          width: 100%; min-height: 120px; padding: 14px 16px; border-radius: 12px;
          border: 1px solid var(--border-subtle); background: var(--space-surface);
          color: var(--foreground); font-family: "Geist Sans", var(--font-sans);
          font-size: 14px; line-height: 1.6; outline: none; resize: vertical;
          transition: border-color 0.2s;
        }
        .opc-compose-textarea:focus { border-color: var(--glow-warm); box-shadow: 0 0 16px color-mix(in srgb, var(--glow-warm) 10%, transparent); }
        .opc-compose-textarea::placeholder { color: var(--foreground-muted); }
        .opc-compose-actions {
          display: flex; gap: 12px; margin-top: 14px; justify-content: flex-end;
        }
        .opc-compose-confirm {
          padding: 10px 28px; border-radius: 10px; border: none;
          background: var(--glow-warm); color: #0a0812;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 14px; font-weight: 500;
          cursor: pointer; transition: all 0.2s; letter-spacing: 0.04em;
        }
        .opc-compose-confirm:hover { background: var(--glow-warm-soft); transform: translateY(-1px); box-shadow: 0 4px 16px color-mix(in srgb, var(--glow-warm) 30%, transparent); }
        .opc-compose-save {
          padding: 10px 20px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: transparent;
          color: var(--foreground-muted); font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 13px; cursor: pointer; transition: all 0.15s;
        }
        .opc-compose-save:hover { border-color: var(--glow-aurora); color: var(--glow-aurora); }
        .opc-ai-trigger {
          position: relative;
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 12px 18px;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--glow-warm) 18%, transparent);
          background: linear-gradient(135deg,
            color-mix(in srgb, var(--glow-warm) 6%, var(--space-panel)) 0%,
            color-mix(in srgb, var(--glow-cool) 4%, var(--space-panel)) 100%
          );
          cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          margin-bottom: 16px; overflow: hidden;
          outline: none;
        }
        .opc-ai-trigger:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent);
          transform: translateY(-1px);
          box-shadow:
            0 4px 20px color-mix(in srgb, var(--glow-warm) 12%, transparent),
            0 0 40px color-mix(in srgb, var(--glow-warm) 6%, transparent);
        }
        .opc-ai-trigger:active {
          transform: translateY(0);
          transition-duration: 0.1s;
        }
        .opc-ai-trigger:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }

        .opc-ai-trigger-glow {
          position: absolute; inset: -1px;
          border-radius: 12px;
          background: conic-gradient(
            from var(--glow-angle, 0deg),
            color-mix(in srgb, var(--glow-warm) 15%, transparent),
            color-mix(in srgb, var(--glow-cool) 10%, transparent),
            color-mix(in srgb, var(--glow-aurora) 10%, transparent),
            color-mix(in srgb, var(--glow-warm) 15%, transparent)
          );
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
          animation: opc-ai-glow-rotate 6s linear infinite;
        }
        .opc-ai-trigger:hover .opc-ai-trigger-glow { opacity: 1; }

        @keyframes opc-ai-glow-rotate { to { --glow-angle: 360deg; } }

        .opc-ai-trigger-icon {
          font-size: 18px; z-index: 1;
          color: var(--glow-warm);
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--glow-warm) 60%, transparent));
          animation: opc-ai-icon-pulse 3s ease-in-out infinite;
        }
        @keyframes opc-ai-icon-pulse {
          0%, 100% { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--glow-warm) 60%, transparent)); }
          50% { filter: drop-shadow(0 0 10px color-mix(in srgb, var(--glow-warm) 80%, transparent)); }
        }

        .opc-ai-trigger-text {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 14px; color: var(--foreground);
          letter-spacing: 0.04em; z-index: 1;
        }

        .opc-ai-trigger-hint {
          margin-left: auto; z-index: 1;
          font-size: 10px; color: var(--foreground-muted);
          padding: 2px 8px; border-radius: 4px;
          background: color-mix(in srgb, var(--foreground-muted) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--foreground-muted) 12%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .opc-ai-trigger { transition: none !important; }
          .opc-ai-trigger:hover { transform: none !important; }
          .opc-ai-trigger-glow { animation: none !important; }
          .opc-ai-trigger-icon { animation: none !important; }
        }

        /* ── 风格标签页 ── */
        .opc-style-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .opc-style-tab {
          padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px; cursor: pointer;
          transition: all 0.15s; letter-spacing: 0.04em;
        }
        .opc-style-tab:hover { border-color: var(--glow-cool); color: var(--foreground); }
        .opc-style-tab.active { background: var(--glow-cool); color: #0a0812; border-color: var(--glow-cool); }

        .opc-style-grid { display: flex; flex-wrap: wrap; gap: 10px; }
        .opc-style-chip {
          padding: 10px 18px; border-radius: 999px; border: 1px solid var(--border-subtle);
          background: var(--space-panel); color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 14px; cursor: pointer;
          letter-spacing: 0.04em; transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          position: relative; z-index: 1;
        }
        .opc-style-chip:hover { border-color: var(--glow-warm); color: var(--foreground); box-shadow: 0 0 16px color-mix(in srgb, var(--glow-warm) 10%, transparent); }
        .opc-style-chip.active { background: var(--glow-warm); color: #0a0812; border-color: var(--glow-warm); box-shadow: 0 0 20px color-mix(in srgb, var(--glow-warm) 30%, transparent); }

        .opc-params { display: flex; flex-direction: column; gap: 24px; }
        .opc-param-group { display: flex; flex-direction: column; gap: 10px; }
        .opc-param-label { font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; color: var(--foreground-muted); letter-spacing: 0.06em; }
        .opc-slider-wrap { display: flex; flex-direction: column; gap: 8px; }
        .opc-slider { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 3px; background: var(--space-surface); outline: none; cursor: pointer; }
        .opc-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--glow-warm); border: 2px solid var(--space-panel); cursor: pointer; box-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 40%, transparent); }
        .opc-slider-ticks { display: flex; justify-content: space-between; }
        .opc-tick { padding: 3px 8px; border-radius: 8px; border: none; background: transparent; color: var(--foreground-muted); font-size: 11px; cursor: pointer; font-family: var(--font-sans); }
        .opc-tick.active { color: var(--glow-warm); font-weight: 600; }
        .opc-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .opc-chip { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--space-panel); color: var(--foreground-muted); font-size: 13px; cursor: pointer; font-family: "GeistPixel-Line", var(--font-sans); letter-spacing: 0.04em; transition: all 0.2s ease-out; }
        .opc-chip:hover { border-color: var(--glow-warm); color: var(--foreground); }
        .opc-chip.active { background: var(--glow-warm); color: #0a0812; border-color: var(--glow-warm); }

        /* ── 保存悬浮窗（太空舷窗）── */
        .opc-save-overlay {
          position: fixed; inset: 0; z-index: var(--z-max);
          display: flex; align-items: center; justify-content: center;
          background: rgba(2, 4, 12, 0.85); backdrop-filter: blur(8px);
          animation: save-fade-in 0.25s ease-out;
        }
        @keyframes save-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .opc-save-modal {
          animation: save-modal-in 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes save-modal-in { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .opc-save-porthole {
          position: relative; width: 440px; max-width: 90vw;
          background: var(--space-deep, #050a14);
          border-radius: 24px; padding: 3px;
          box-shadow: 0 0 60px color-mix(in srgb, var(--glow-warm) 15%, transparent),
                      0 0 120px color-mix(in srgb, var(--glow-cool) 8%, transparent),
                      inset 0 0 40px rgba(0,0,0,0.5);
        }
        .opc-save-porthole-ring {
          position: absolute; inset: 0; border-radius: 24px; padding: 2px;
          background: conic-gradient(
            from 0deg,
            color-mix(in srgb, var(--glow-warm) 40%, transparent),
            color-mix(in srgb, var(--glow-cool) 40%, transparent),
            color-mix(in srgb, var(--glow-aurora) 40%, transparent),
            color-mix(in srgb, var(--glow-warm) 40%, transparent)
          );
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: porthole-spin 8s linear infinite;
          pointer-events: none;
        }
        @keyframes porthole-spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        .opc-save-porthole-inner {
          border-radius: 22px; padding: 28px 24px;
          background: var(--space-panel, #0a1228);
          position: relative; z-index: 1;
        }
        .opc-save-title {
          font-family: "GeistPixel-Line", var(--font-display), var(--font-sans);
          font-size: 16px; font-weight: 400; margin: 0 0 18px;
          color: var(--glow-warm-soft);
          text-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 30%, transparent);
          text-align: center; letter-spacing: 0.06em;
        }
        .opc-save-form { display: flex; flex-direction: column; gap: 12px; }
        .opc-save-label {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          color: var(--foreground-muted); letter-spacing: 0.04em;
        }
        .opc-save-input {
          width: 100%; padding: 10px 14px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--space-surface);
          color: var(--foreground); font-family: var(--font-sans); font-size: 13px; outline: none;
        }
        .opc-save-input:focus { border-color: var(--glow-warm); }
        .opc-save-categories { display: flex; flex-wrap: wrap; gap: 6px; }
        .opc-save-cat {
          padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .opc-save-cat:hover { border-color: var(--glow-cool); color: var(--foreground); }
        .opc-save-cat.active { background: var(--glow-cool); color: #0a0812; border-color: var(--glow-cool); }
        .opc-save-preview {
          padding: 10px 14px; border-radius: 8px; background: var(--space-surface);
          font-size: 11px; color: var(--foreground-muted); line-height: 1.5;
          max-height: 60px; overflow: auto;
        }
        .opc-save-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
        .opc-save-cancel {
          padding: 8px 18px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--foreground-muted); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; transition: all 0.15s;
        }
        .opc-save-cancel:hover { border-color: var(--foreground-muted); color: var(--foreground); }
        .opc-save-confirm {
          padding: 8px 22px; border-radius: 8px; border: none;
          background: var(--glow-warm); color: #0a0812; cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; transition: all 0.15s;
        }
        .opc-save-confirm:hover { background: var(--glow-warm-soft); }
      `}</style>
    </div>
  );
}

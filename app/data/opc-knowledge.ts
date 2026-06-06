// OPC 知识库数据 - 从 OPCPanel.tsx 提取

export const BASIC_MOVES = [
  { name: "定机", en: "Locked Down", effect: "稳定构图" },
  { name: "摇镜", en: "Pan", effect: "水平扫视" },
  { name: "俯仰", en: "Tilt", effect: "垂直揭示" },
  { name: "变焦", en: "Zoom", effect: "焦点拉伸" },
  { name: "升降", en: "Pedestal", effect: "垂直位移" },
  { name: "推拉", en: "Dolly", effect: "空间推进" },
  { name: "横移", en: "Truck", effect: "平行移动" },
  { name: "跟拍", en: "Follow", effect: "持续跟随" },
  { name: "环绕", en: "Arc", effect: "弧线包围" },
  { name: "摇臂", en: "Crane/Jib", effect: "大范围调度" },
  { name: "手持", en: "Handheld", effect: "纪实临场" },
  { name: "稳定器", en: "Stabilized", effect: "丝滑平滑" },
  { name: "焦点转移", en: "Rack Focus", effect: "焦点切换" },
  { name: "眩晕变焦", en: "Dolly Zoom", effect: "空间扭曲" },
  { name: "航拍", en: "Aerial/Drone", effect: "宏观俯瞰" },
];

export const COMBO_MOVES = [
  { name: "联合摇移", en: "Pan+Tilt", effect: "水平垂直复合" },
  { name: "摇镜变焦", en: "Pan+Zoom", effect: "扫视拉伸" },
  { name: "俯仰变焦", en: "Tilt+Zoom", effect: "垂直拉伸" },
  { name: "摇镜转焦", en: "Pan+Rack Focus", effect: "扫视聚焦" },
  { name: "俯仰转焦", en: "Tilt+Rack Focus", effect: "垂直聚焦" },
  { name: "推拉摇镜", en: "Dolly+Pan", effect: "推进扫视" },
  { name: "推拉俯仰", en: "Dolly+Tilt", effect: "立体推进" },
  { name: "推拉转焦", en: "Dolly+Rack Focus", effect: "推进聚焦" },
  { name: "横移摇镜", en: "Truck+Pan", effect: "广域扫视" },
  { name: "横移俯仰", en: "Truck+Tilt", effect: "广域立体" },
  { name: "横移转焦", en: "Truck+Rack Focus", effect: "移动聚焦" },
  { name: "手持跟拍", en: "Follow+Handheld", effect: "纪实跟随" },
  { name: "稳定跟拍", en: "Follow+Stabilized", effect: "丝滑跟随" },
  { name: "跟随摇镜", en: "Follow+Pan", effect: "跟踪扫视" },
  { name: "平行跟拍", en: "Follow+Truck", effect: "平行跟随" },
  { name: "跟拍转焦", en: "Follow+Rack Focus", effect: "跟随聚焦" },
  { name: "环绕跟拍", en: "Arc+Follow", effect: "弧线跟随" },
  { name: "环绕转焦", en: "Arc+Rack Focus", effect: "包围聚焦" },
  { name: "环绕变焦", en: "Arc+Zoom", effect: "包围拉伸" },
  { name: "摇臂摇镜", en: "Crane+Pan", effect: "升降扫视" },
  { name: "摇臂俯仰", en: "Crane+Tilt", effect: "升降垂直" },
  { name: "摇臂跟随", en: "Crane+Follow", effect: "升降跟随" },
  { name: "摇臂变焦", en: "Crane+Zoom", effect: "升降拉伸" },
  { name: "摇臂环绕", en: "Crane+Arc", effect: "升降弧线" },
  { name: "升降俯仰", en: "Pedestal+Tilt", effect: "垂直复合" },
  { name: "升降转焦", en: "Pedestal+Rack Focus", effect: "垂直聚焦" },
  { name: "定机转焦", en: "Locked Down+Rack Focus", effect: "固定聚焦" },
  { name: "定机变焦", en: "Locked Down+Zoom", effect: "固定拉伸" },
  { name: "手持推进", en: "Handheld Push In", effect: "纪实推进" },
];

export const IMG_PARAM_CATEGORIES = [
  {
    label: "主体", icon: "👤",
    items: [
      { key: "subject_pos", label: "位置与占比", values: ["小占比15%", "适中占比35%", "大占比60%", "超特写", "全身", "半身", "头肩", "环境人像", "剪影"] },
      { key: "subject_type", label: "主体类型", values: ["人物", "产品", "场景", "食物", "动物", "建筑", "交通工具", "抽象概念"] },
    ],
  },
  {
    label: "人物", icon: "🧑",
    items: [
      { key: "person_face", label: "面部特征", values: ["精致五官", "高颧骨", "深邃眼窝", "雀斑", "光洁皮肤", "纹理皮肤", "棱角分明", "柔和轮廓"] },
      { key: "person_hair", label: "发型", values: ["直发", "卷发", "短发", "长发", "马尾", "盘发", "湿发", "凌乱发"] },
      { key: "person_body", label: "体型体态", values: ["纤细", "健壮", "丰腴", "修长", "矮小", "高挑", "肌肉线条", "柔软身姿"] },
      { key: "person_age", label: "年龄特征", values: ["婴儿", "儿童", "少年", "青年", "中年", "老年", "皱纹", "胶原蛋白感"] },
      { key: "person_race", label: "种族面孔", values: ["东亚面孔", "欧美面孔", "南亚面孔", "非洲面孔", "混血面孔"] },
      { key: "person_emoji", label: "情绪表情", values: ["微笑", "大笑", "沉思", "惊讶", "悲伤", "愤怒", "平静", "神秘"] },
      { key: "person_style", label: "穿搭风格", values: ["极简", "街头", "正装", "复古", "运动", "民族", "暗黑", "未来"] },
      { key: "person_acce", label: "配饰细节", values: ["眼镜", "帽子", "耳环", "项链", "手表", "围巾", "墨镜", "手套"] },
    ],
  },
  {
    label: "环境", icon: "🌍",
    items: [
      { key: "scene_space", label: "场景空间", values: ["室内", "室外", "半开放", "水下", "空中", "地下", "虚拟空间", "微观"] },
      { key: "scene_time", label: "时间天气", values: ["黎明", "正午", "黄昏", "夜晚", "阴天", "雨天", "雪天", "雾天"] },
      { key: "scene_place", label: "具体场景", values: ["城市街道", "自然风光", "工业废墟", "豪华别墅", "咖啡厅", "海滩", "沙漠", "森林"] },
    ],
  },
  {
    label: "气氛", icon: "🎭",
    items: [
      { key: "mood_feel", label: "情绪氛围", values: ["温暖", "冷峻", "神秘", "紧张", "梦幻", "孤独", "欢快", "压抑", "浪漫", "庄严"] },
      { key: "mood_story", label: "叙事基调", values: ["治愈", "悬疑", "史诗", "日常", "诡异", "冒险", "怀旧", "未来感"] },
    ],
  },
  {
    label: "灯光", icon: "💡",
    items: [
      { key: "light_src", label: "光源类型", values: ["自然光", "人造光", "混合光", "霓虹灯", "烛光", "月光", "屏幕光", "火光"] },
      { key: "light_dir", label: "光位方向", values: ["顺光", "侧光", "逆光", "顶光", "底光", "环形光", "蝴蝶光", "伦勃朗光"] },
      { key: "light_ctrl", label: "光影控制", values: ["硬光", "柔光", "漫射光", "聚光", "散射", "轮廓光", "眼神光", "边缘光"] },
    ],
  },
  {
    label: "镜头", icon: "📷",
    items: [
      { key: "lens_fl", label: "焦段", values: ["超广角14mm", "广角24mm", "标准35mm", "人像50mm", "中长焦85mm", "长焦135mm", "超长焦200mm"] },
      { key: "lens_aperture", label: "光圈景深", values: ["f/1.4浅景深", "f/2.8柔和", "f/5.6平衡", "f/8清晰", "f/16全景深"] },
      { key: "lens_style", label: "镜头风格", values: ["变形宽银幕", "复古柔焦", "锐利现代", "旋焦散景", "微距特写", "鱼眼畸变"] },
    ],
  },
  {
    label: "色彩", icon: "🎨",
    items: [
      { key: "color_palette", label: "色调", values: ["暖调", "冷调", "高饱和", "低饱和", "单色", "互补色", "类比色", "分裂互补"] },
      { key: "color_grade", label: "调色风格", values: ["电影胶片", "赛博朋克", "日系清新", "复古怀旧", "黑白经典", "橙蓝对比", "青橙色调"] },
    ],
  },
  {
    label: "画质", icon: "✨",
    items: [
      { key: "quality_res", label: "分辨率", values: ["720p", "1080p", "2K", "4K", "8K"] },
      { key: "quality_style", label: "画面风格", values: ["超写实", "半写实", "插画风", "3D渲染", "概念艺术", "漫画风", "水彩风"] },
    ],
  },
];

export const STYLES = [
  { id: "cinematic", name: "电影质感", desc: "胶片色调 + 宽银幕构图", prefix: "Cinematic film look, " },
  { id: "anime", name: "动漫风格", desc: "日式动画 + 鲜艳色彩", prefix: "Anime style, " },
  { id: "realistic", name: "超写实", desc: "照片级细节 + 自然光影", prefix: "Photorealistic, ultra detailed, " },
  { id: "cyberpunk", name: "赛博朋克", desc: "霓虹灯 + 未来都市", prefix: "Cyberpunk aesthetic, neon lights, " },
  { id: "watercolor", name: "水彩风", desc: "柔和笔触 + 透明层次", prefix: "Watercolor painting style, soft brushstrokes, " },
  { id: "oil-painting", name: "油画风", desc: "厚涂质感 + 古典构图", prefix: "Oil painting style, rich textures, " },
  { id: "minimalist", name: "极简主义", desc: "简洁线条 + 大量留白", prefix: "Minimalist design, clean lines, " },
  { id: "vintage", name: "复古怀旧", desc: "胶片颗粒 + 褪色调", prefix: "Vintage aesthetic, film grain, faded colors, " },
];

export const DEFAULT_TEMPLATES = [
  {
    id: "t1",
    name: "产品展示",
    desc: "产品特写 + 环境光",
    prompt: "产品特写镜头，柔和的环境光，简约背景，高端质感",
  },
  {
    id: "t2",
    name: "人物访谈",
    desc: "中景 + 柔光",
    prompt: "人物中景访谈，柔和的侧光，浅景深，温暖色调",
  },
  {
    id: "t3",
    name: "城市航拍",
    desc: "俯瞰 + 黄金时段",
    prompt: "城市航拍俯瞰，黄金时段光线，建筑轮廓清晰",
  },
  {
    id: "t4",
    name: "美食特写",
    desc: "微距 + 暖调",
    prompt: "美食微距特写，暖色调，蒸汽升腾，食材质感",
  },
];

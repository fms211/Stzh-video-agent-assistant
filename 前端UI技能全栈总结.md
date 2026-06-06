# 前端 UI 技能全栈总结

> 整理于 2026-05-16，涵盖 Claude Code 前端/UI 技能生态及配套工具。

---

## 一、已安装技能清单

### 1.1 四大 UI 设计核心（全局）

| 技能 | 角色 | 核心能力 | 调用 |
|------|------|----------|------|
| **UI/UX Pro Max** | 军师 | 67 种风格 + 161 套配色 + 57 组字体，BM25 推理引擎自动匹配 | `/ui-ux-pro-max` |
| **Impeccable** | 质检员 | 23 个斜杠命令（/critique /audit /polish /overdrive），UI 质量 +59% | `/impeccable` |
| **Taste Skill** | 调音台 | 三旋钮：设计方差 / 动效强度 / 视觉密度 (1-10) | `/design-taste-frontend` |
| **Design Principles** | 模板库 | Stripe / Linear / Apple 等顶级公司设计约束 | 自动引用 |

### 1.2 附带的子技能

**UI/UX Pro Max 附带 (7 个)**：`ckm-banner-design` `ckm-brand` `ckm-design` `ckm-design-system` `ckm-slides` `ckm-ui-styling`

**Taste Skill 附带 (12 个)**：`brandkit` `industrial-brutalist-ui` `gpt-taste` `image-to-code` `imagegen-frontend-mobile` `imagegen-frontend-web` `minimalist-ui` `full-output-enforcement` `redesign-existing-projects` `high-end-visual-design` `stitch-design-taste` `design-taste-frontend`

### 1.3 其他前端/设计相关（已全局安装）

| 技能 | 用途 |
|------|------|
| `frontend-design` | Anthropic 官方，创造独特审美的前端界面 |
| `web-design-guidelines` | Vercel 出品，可访问性审计 |
| `figma` | Figma MCP 设计稿转代码 |
| `canvas-design` | 海报/静态艺术品 |
| `algorithmic-art` | p5.js 生成艺术 |
| `slides` | PPT 生成 |
| `theme-factory` | 10 套预设主题配色 |
| `chart-visualization` | 26 种图表智能选型 |
| `karpathy-guidelines` | Andrej Karpathy 编码行为准则 |

### 1.4 SkillUI（CLI 工具，非技能）

```bash
# 安装
npm install -g skillui

# 位置: C:\Users\fms\AppData\Roaming\npm\node_modules\skillui\  (95 MB)

# 基础用法
skillui --url https://linear.app          # 扒站设计
skillui --url https://site.com --mode ultra  # 深度模式（截屏+动效）
skillui --dir ./my-app                    # 扒本地项目
```

---

## 二、推荐工作流

### 流程一：从零创造

```
① UI/UX Pro Max     → 定风格 ("做个 SaaS 医疗仪表盘深色模式")
② frontend-design   → 生成首版 HTML/CSS/JS 或 React 代码
③ Impeccable        → /critique 设计评审 → /polish 打磨
④ web-design-guidelines → 可访问性审查
```

### 流程二：扒站复制

```
① SkillUI           → skillui --url https://stripe.com
② 产物放入 ~/.claude/skills/
③ frontend-design   → "按 Stripe 风格做一个支付页"
④ Taste Skill       → 调 motion_intensity=7 visual_density=3
⑤ Impeccable        → /polish 终审
```

### 流程三：优化已有 UI

```
① Impeccable        → /critique 设计评审
② Taste Skill       → 调整旋钮参数
③ Impeccable        → /audit 质量检查
```

---

## 三、前端技术参考

### 3.1 基础三件套

| 语言 | 用途 |
|------|------|
| HTML | 结构 |
| CSS | 视觉（动画/渐变/布局） |
| JavaScript | 交互 |

### 3.2 推荐框架

| 框架 | 场景 |
|------|------|
| React | 中大型应用，生态最强 |
| Next.js | React + SSR，SEO 友好 |
| Vue | 上手快，中小型 |

### 3.3 部署方案

| 方案 | 成本 | 适合 |
|------|------|------|
| Vercel / Netlify | 免费 | 首选推荐 |
| 云服务器 + Nginx | ¥50-100/月 | 需完全控制 |
| OSS + CDN | ¥几毛/月 | 纯静态最快 |

### 3.4 高端视觉 JS 库

| 类别 | 库 | 场景 |
|------|------|------|
| **3D 引擎** | Three.js | 通用 3D |
| | Babylon.js | 游戏级 3D |
| | React Three Fiber (R3F) | React 项目 |
| **动效之王** | GSAP + ScrollTrigger | 滚动动画标配 |
| | Framer Motion | React 动效 |
| | Lottie | AE 动画导出 |
| **丝滑滚动** | Lenis | 取代原生滚轮 |
| **粒子/特效** | Pixi.js | 2D 高性能 |
| | Vanta.js | 即插即用背景 |
| | ogl | 极轻 WebGL |
| **着色器** | ShaderPark | 写着色器的 JS 方言 |

**高端网站三件套标配：GSAP + Lenis + Three.js**

---

## 四、技能安装命令速查

```bash
# 核心四件套
npx skills add nextlevelbuilder/ui-ux-pro-max-skill
npx skills add pbakaus/impeccable
npx skills add https://github.com/Leonxlnx/taste-skill
npx skills add ihlamury/design-skills

# SkillUI 工具
npm install -g skillui
```

---

## 五、常见问题

**Q: 技能太多不知道怎么选？**

> 没灵感 → UI/UX Pro Max；有 UI 要打磨 → Impeccable；精确操控 → Taste Skill；
> 要特定品牌风格 → Design Principles；有喜欢的网站想复制 → SkillUI

**Q: 技能生成的是什么代码？**

> 纯 HTML/CSS/JS 或 React + Tailwind，直接可用，不依赖专有库

**Q: 云服务器能跑吗？**

> 可以。产物是静态文件，Vercel/Netlify 免费方案最省心

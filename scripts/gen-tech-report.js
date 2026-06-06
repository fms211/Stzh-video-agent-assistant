const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageBreak, PageNumber, LevelFormat,
  TableOfContents } = require("docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const tbl = (width, cols, rows) => new Table({
  width: { size: width, type: WidthType.DXA },
  columnWidths: cols,
  rows: rows.map(r => new TableRow({
    children: r.map((cell, i) => new TableCell({
      borders, width: { size: cols[i], type: WidthType.DXA },
      margins: cellMargins,
      shading: r[0].shading ? (i === 0 ? { fill: "1A1A2E", type: ShadingType.CLEAR } : {}) : {},
      children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: typeof cell === "string" ? [new TextRun({ text: cell, size: 20, color: i === 0 ? "C8A850" : "D0D0D0" })] : cell })]
    }))
  }))
});

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, size: 32, bold: true, color: "C8A850", font: "Arial" })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 }, children: [new TextRun({ text, size: 26, bold: true, color: "E0C878", font: "Arial" })] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, size: 22, bold: true, color: "B0A0D0", font: "Arial" })] });
const p = (text) => new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text, size: 21, color: "D0D0D0", font: "Arial" })] });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { before: 40, after: 40 }, children: [new TextRun({ text, size: 20, color: "D0D0D0" })] });

const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }, {
      reference: "numbers",
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "C8A850" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "E0C878" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "B0A0D0" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [
    // ===== COVER PAGE =====
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [
        new Paragraph({ spacing: { before: 3600 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "⬡", size: 72, color: "C8A850", font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "腾昇智和", size: 56, bold: true, color: "C8A850", font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
          children: [new TextRun({ text: "短视频智能体技术报告", size: 44, bold: true, color: "E0C878", font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
          children: [new TextRun({ text: "前端架构与后端配置方案", size: 28, color: "A0A0C0", font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "2026-05-26", size: 24, color: "8080A0", font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 },
          children: [new TextRun({ text: "Next.js 16 + React 19 + Three.js + GSAP", size: 20, color: "6060A0", font: "Arial" })] }),
      ]
    },

    // ===== MAIN CONTENT =====
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT, spacing: { after: 0 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "333355", space: 4 } },
            children: [new TextRun({ text: "腾昇智和 · 技术报告", size: 16, color: "6060A0", font: "Arial" })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { before: 0 },
            border: { top: { style: BorderStyle.SINGLE, size: 1, color: "333355", space: 4 } },
            children: [
              new TextRun({ text: "— ", size: 16, color: "6060A0" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "6060A0" }),
              new TextRun({ text: " —", size: 16, color: "6060A0" }),
            ]
          })]
        })
      },
      children: [
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ===== 1. PROJECT OVERVIEW =====
        h1("一、项目概述"),
        p("腾昇智和·短视频智能体是一个基于 Coze 平台的 AI 短视频全链路自动生成智能体前端交互系统。项目采用 Next.js 16 App Router 架构，以“深空原子朋克”为核心设计语言，提供从首页入场到对话流、OPC 工作模式、工作统计的完整用户体验。"),
        p("项目采用双页架构：首页（恒星坍缩入场动画） + 工作区（对话流 + OPC 工作模式 + 工作统计），工作区内通过顶部 Tab 栏在三个页面间切换。"),

        // ===== 2. FRONTEND =====
        h1("二、前端技术架构"),

        h2("2.1 核心框架"),
        tbl(9360, [3000, 6360], [
          ["Next.js", "16.2.4 (App Router + force-dynamic)"],
          ["React", "19.2.4 (全客户端组件)"],
          ["TypeScript", "5.x (strict mode)"],
          ["Tailwind CSS", "4.x (@theme inline + CSS variables)"],
          ["包管理", "npm + Webpack (Windows 兼容)"],
        ]),

        h2("2.2 动画与视觉效果库"),
        tbl(9360, [3200, 6160], [
          ["Three.js", "深空粒子系统（680粒子+星座连线+生命周期）"],
          ["@react-three/fiber", "React 集成 Three.js 渲染"],
          ["GSAP", "ScrollTrigger 翻页过渡、首页坍缩爆炸动画、星环脉冲扩散"],
          ["anime.js", "点击涟漪微交互"],
          ["GeistPixel-Line/Square", "像素字体（来自 officialskills.sh）"],
          ["@react-three/drei", "R3F 工具库"],
        ]),

        h2("2.3 组件架构"),
        p("以下为项目完整文件树："),
        tbl(9360, [3600, 5760], [
          ["app/api/agent/route.ts", "API 代理 + Mock 模式"],
          ["app/lib/needsUnoptimized.ts", "图片优化判断"],
          ["app/lib/notify.ts", "浏览器通知 + Web Audio 音效"],
          ["app/lib/tracker.ts", "API 调用追踪统计"],
          ["app/globals.css", "全局样式系统 (10主题 + edge-glow)"],
          ["app/layout.tsx", "根布局 (字体 + PWA)"],
          ["app/page.tsx", "动态入口 (force-dynamic)"],
          ["app/manifest.ts", "PWA Web App Manifest"],
          ["components/SplashScreen.tsx", "首页: Canvas粒子+星云+恒星+GSAP动画"],
          ["components/HomeClient.tsx", "工作区根组件: 页面路由+状态管理"],
          ["components/PageSwitch.tsx", "页面切换过渡组件"],
          ["components/StarfieldBackground.tsx", "Three.js深空粒子系统"],
          ["components/OrbitRings.tsx", "CSS轨道环系统(5层+恒星+随机参数)"],
          ["components/CursorTrail.tsx", "鼠标像素拖尾+点击涟漪"],
          ["components/PixelTitle.tsx", "可拖拽像素标题"],
          ["components/ChatFlow.tsx", "对话流主组件(消息/API/持久化)"],
          ["components/ChatInput.tsx", "悬浮胶囊输入框(文件上传+模板填充)"],
          ["components/ResultCard.tsx", "视频/图片结果卡片+Lightbox"],
          ["components/SettingsDrawer.tsx", "右侧设置抽屉(10主题+参数)"],
          ["components/LeftSidebar.tsx", "左侧栏: 历史对话+文件暂存+返回首页"],
          ["components/StatsDashboard.tsx", "Canvas甘特图统计仪表"],
          ["components/OPCPanel.tsx", "OPC工作区(模板管理/风格预设/参数调试)"],
          ["components/LayerStack.tsx", "Z轴背景层编排"],
          ["components/ServiceWorkerRegister.tsx", "PWA ServiceWorker 注册"],
          ["components/ui/useRippleGlow.tsx", "波纹辉光 Hook"],
        ]),

        h2("2.4 视觉设计系统"),
        p("项目以“深空原子朋克”为核心设计语言，采用以下设计系统："),
        bullet("主题配色: 10套主题（深空观测者/原子实验室/量子花园/星云漂流/太阳熔炉/水晶洞穴/虚空信号/锈蚀密室/光子场/深海虚空）"),
        bullet("主色调: 暖琥珀 #e89840、冷靛 #6088d8、极光紫 #9880d0"),
        bullet("edge-glow: CSS @property 旋转锥形渐变边缘辉光系统"),
        bullet("字体: GeistPixel-Line/Square（像素风） + ZCOOL QingKe HuangYou（艺术汉字） + Geist Sans/Mono"),
        bullet("Three.js粒子: 3层深度视差 + 星座连线 + 鼠标引力/斥力 + 生命周期"),
        bullet("GSAP首页过渡: 恒星坍缩 + 冲击波 + 碎片爆炸"),
        bullet("Canvas甘特图: API调用统计可视化"),

        h2("2.5 功能清单"),
        tbl(9360, [3200, 6160], [
          ["对话流", "多轮上下文 + 文件上传 + 思考阶段轮播 + 历史持久化 + 导出 Markdown"],
          ["通知系统", "浏览器 Notification API + Web Audio 三音阶提示音"],
          ["OPC工作模式", "捷指令模板库(6分类+自定义) + 风格预设(10种) + 参数调试台"],
          ["工作统计", "每日/每周/每月甘特图 + 高峰时段/日均/周最高"],
          ["左侧栏", "历史对话管理 + 文件暂存 + 返回首页"],
          ["右侧设置", "10套主题切换 + 画幅/适配方式"],
          ["PWA", "ServiceWorker + Web App Manifest + 可安装"],
        ]),

        // ===== 3. BACKEND =====
        h1("三、后端架构（简述）"),
        p("后端采用 Next.js API Route 实现，提供 POST /api/agent 接口。"),
        bullet("转发模式: AGENT_BACKEND_URL 环境变量配置后端地址，请求体透传至后端 Coze 代理"),
        bullet("Mock模式: 未配置后端时返回模拟图片/视频数据"),
        bullet("支持 FormData 文件上传与多轮对话历史上下文"),
        p("待补充: Coze API 对接配置（COZE_API_KEY、COZE_BOT_ID、COZE_BASE_URL），生产环境鉴权、速率限制、日志追踪。"),

        // ===== 4. DEPENDENCIES =====
        h1("四、依赖清单"),
        h2("4.1 生产依赖 (dependencies)"),
        tbl(9360, [3000, 6360], [
          ["next", "16.2.4"],
          ["react", "19.2.4"],
          ["react-dom", "19.2.4"],
          ["three", "0.x (最新版)"],
          ["@react-three/fiber", "React Three.js 集成"],
          ["@react-three/drei", "R3F 工具库"],
          ["gsap", "GreenSock Animation Platform"],
          ["animejs", "轻量级动画库"],
        ]),
        h2("4.2 开发依赖 (devDependencies)"),
        tbl(9360, [3000, 6360], [
          ["typescript", "5.x"],
          ["@types/react", "19.x"],
          ["@types/react-dom", "19.x"],
          ["@types/three", "Three.js 类型定义"],
          ["tailwindcss", "4.x"],
          ["@tailwindcss/postcss", "Tailwind PostCSS 插件"],
          ["eslint", "9.x"],
          ["eslint-config-next", "Next.js ESLint 配置"],
        ]),

        // ===== 5. DEPLOYMENT =====
        h1("五、部署与运维"),
        p("项目采用以下持久化与部署策略："),
        bullet("sessionStorage: 进入状态、当前会话ID、API调用统计"),
        bullet("localStorage: 对话历史、自定义模板数据、主题偏好"),
        bullet("PWA: ServiceWorker + manifest.webmanifest + SVG图标"),
        bullet("生产部署: Vercel/Netlify 推荐，也可使用云服务器 + Nginx"),
        bullet("待补充: Coze API Key 配置、后端鉴权、速率限制、日志追踪、HTTPS部署"),

        // ===== 6. FUTURE ROADMAP =====
        h1("六、后续改进与优化方向"),
        p("以下为项目当前未完成或待优化的功能模块，需要在后续迭代中推进："),

        h2("6.1 后端对接 Coze API"),
        bullet("接入 Coze 真实 API（COZE_API_KEY / COZE_BOT_ID / COZE_BASE_URL 配置）"),
        bullet("实现 API 调用鉴权与速率限制，防止额度超用"),
        bullet("添加请求日志与 requestId 追踪链路"),
        bullet("支持流式响应（SSE），优化长耗时生成场景的用户体验"),
        bullet("后端响应校验与错误分级处理（区分模型故障 / 网络超时 / 参数错误）"),

        h2("6.2 功能完善"),
        bullet("创作灵感画廊：基于真实生成数据，展示历史作品缩略图网格，支持预览/复用/删除"),
        bullet("团队共享空间：多用户协作，共享模板库与素材库"),
        bullet("素材管理区增强：拖拽复用 + 缩略图预览 + 分类标签"),
        bullet("对话上下文增强：支持图片/视频作为输入参考（多模态 prompt）"),
        bullet("导出功能增强：支持 PDF 导出对话记录与生成结果"),

        h2("6.3 性能与工程优化"),
        bullet("StarfieldBackground: 粒子系统改用 InstancedMesh 批量渲染，减少 Draw Call"),
        bullet("CursorTrail: Canvas 每帧重绘优化为脏矩形局部更新"),
        bullet("OPC Panel: 模板数据改用 IndexedDB 替代 localStorage，支持更大容量"),
        bullet("图片懒加载与 WebP/AVIF 格式优化，减少首屏加载时间"),
        bullet("Code Splitting: 路由级和组件级懒加载，减少主 Bundle 体积"),
        bullet("添加 React Error Boundary，防止 Canvas/WebGL 崩溃导致白屏"),

        h2("6.4 UI/UX 精细打磨"),
        bullet("OPC 组件动效: GSAP ScrollTrigger 翻页感 + anime.js 涟漪牵动效果（已规划，待调试完成）"),
        bullet("移动端适配: 响应式布局 + 触摸手势支持 + 移动端输入优化"),
        bullet("无障碍访问: WCAG 2.1 AA 级别合规，键盘导航 + 屏幕阅读器支持"),
        bullet("国际化: 中英文双语切换，适配海外用户与比赛评审场景"),
        bullet("加载骨架屏: 各组件首次加载添加 Shimmer/Skeleton 占位"),
        bullet("微交互打磨: 所有按钮添加触觉反馈（:active scale + ripple），统一缓动曲线"),

        h2("6.5 运维与监控"),
        bullet("前端错误监控: 接入 Sentry 或类似工具，捕获生产环境 JS 异常"),
        bullet("API 调用分析: 接入数据统计平台，可视化调用趋势与异常波动"),
        bullet("CI/CD 流水线: GitHub Actions / Vercel 自动部署 + 自动化测试"),
        bullet("性能监控: Lighthouse CI + Web Vitals 持续跟踪"),
        bullet("安全加固: CSP 策略、HTTPS 强制、输入消毒、XSS 防护"),

        new Paragraph({ children: [new PageBreak()] }),
        p("以上各模块按优先级排序。建议先完成 Coze API 对接（解除 Mock 依赖），再进行功能完善和性能优化，最后进行 UI/UX 精细打磨与运维监控部署。"),

      ]
    }
  ]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("D:/fms688_stzh-Agent/腾昇智和_技术报告.docx", buf);
  console.log("OK: 文档已生成");
});

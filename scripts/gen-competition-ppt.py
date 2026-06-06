#!/usr/bin/env python3
"""
腾昇智和 · 短视频智能体 — 大学生互联网应用竞赛演示文稿生成器
生成28页专业级PPTX，深空原子朋克风格
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ── 全局配置 ─────────────────────────────────────────────
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', '腾昇智和_参赛演示_final.pptx')

# 色彩系统
C_BG       = RGBColor(0x05, 0x0a, 0x14)   # 深空底
C_PANEL    = RGBColor(0x0a, 0x12, 0x28)   # 面板
C_AMBER    = RGBColor(0xe8, 0x98, 0x40)   # 暖琥珀（标题）
C_COOL     = RGBColor(0x60, 0x88, 0xd8)   # 冷靛（辅助）
C_AURORA   = RGBColor(0x98, 0x80, 0xd0)   # 极光紫（点缀）
C_WHITE    = RGBColor(0xe0, 0xe0, 0xe0)   # 正文白
C_DIM      = RGBColor(0x80, 0x90, 0xa8)   # 暗淡文字
C_LINE     = RGBColor(0x1a, 0x2a, 0x44)   # 分割线
C_ACCENT   = RGBColor(0x2a, 0x3a, 0x54)   # 卡片背景
C_PLACEHOLDER = RGBColor(0x18, 0x28, 0x3c)  # 图片占位

# 字体（优先使用系统可用字体）
FONT_TITLE = 'Consolas'
FONT_CN    = '微软雅黑'
FONT_CODE  = 'Consolas'

# ── 辅助函数 ─────────────────────────────────────────────
def set_bg(slide, color=C_BG):
    """设置幻灯片纯色背景"""
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_text_box(slide, left, top, width, height, text, font_size=14,
                 color=C_WHITE, bold=False, font_name=FONT_CN, align=PP_ALIGN.LEFT,
                 anchor=MSO_ANCHOR.TOP, line_spacing=1.3):
    """添加文本框"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.alignment = align
    p.space_after = Pt(2)
    if line_spacing != 1.0:
        p.line_spacing = Pt(font_size * line_spacing)
    # 设置垂直对齐
    txBox.text_frame.paragraphs[0].alignment = align
    return txBox

def add_rich_box(slide, left, top, width, height, segments, line_spacing_pt=20, align=PP_ALIGN.LEFT):
    """
    添加富文本框
    segments: list of (text, font_size, color, bold, font_name)
    """
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    for i, seg in enumerate(segments):
        if i == 0:
            run = p.runs[0] if p.runs else p.add_run()
        else:
            if seg[0] == '\n':
                p = tf.add_paragraph()
                p.alignment = align
                p.line_spacing = Pt(line_spacing_pt)
                continue
            run = p.add_run()
        run.text = seg[0]
        run.font.size = Pt(seg[1])
        run.font.color.rgb = seg[2]
        run.font.bold = seg[3]
        run.font.name = seg[4]
    return txBox

def add_multi_para(slide, left, top, width, height, paragraphs, default_size=13,
                   default_color=C_WHITE, default_font=FONT_CN, line_spacing_pt=20,
                   align=PP_ALIGN.LEFT, space_after=Pt(6)):
    """
    添加多段落文本框
    paragraphs: list of list of (text, font_size, color, bold, font_name) tuples
    或 list of str（使用默认样式）
    """
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, para in enumerate(paragraphs):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing_pt
        p.space_after = space_after
        if isinstance(para, str):
            run = p.add_run()
            run.text = para
            run.font.size = Pt(default_size)
            run.font.color.rgb = default_color
            run.font.name = default_font
        else:
            for seg in para:
                run = p.add_run()
                run.text = seg[0]
                run.font.size = Pt(seg[1])
                run.font.color.rgb = seg[2]
                run.font.bold = seg[3]
                run.font.name = seg[4]
    return txBox

def add_title(slide, text, top=Inches(0.4), size=28, color=C_AMBER, left=Inches(0.8)):
    """添加标准标题"""
    return add_text_box(slide, left, top, Inches(11.5), Inches(0.6), text,
                        font_size=size, color=color, bold=True, font_name=FONT_TITLE)

def add_subtitle(slide, text, top=Inches(1.0), size=14, color=C_COOL):
    """添加副标题"""
    return add_text_box(slide, Inches(0.8), top, Inches(11.5), Inches(0.4), text,
                        font_size=size, color=color, font_name=FONT_CN)

def add_body(slide, text, left=Inches(0.8), top=Inches(1.5), width=Inches(11.5),
             height=Inches(5.5), size=13, color=C_WHITE):
    """添加正文"""
    return add_text_box(slide, left, top, width, height, text,
                        font_size=size, color=color, font_name=FONT_CN, line_spacing=1.4)

def add_card(slide, left, top, width, height, title_text, body_text,
             title_size=14, body_size=11, accent=C_COOL):
    """添加卡片"""
    # 背景矩形
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = C_ACCENT
    shape.line.color.rgb = C_LINE
    shape.line.width = Pt(1)
    # 标题
    add_text_box(slide, left + Inches(0.15), top + Inches(0.08), width - Inches(0.3), Inches(0.35),
                 title_text, font_size=title_size, color=accent, bold=True)
    # 正文
    add_text_box(slide, left + Inches(0.15), top + Inches(0.4), width - Inches(0.3), height - Inches(0.5),
                 body_text, font_size=body_size, color=C_WHITE, line_spacing=1.3)
    return shape

def add_image_placeholder(slide, left, top, width, height, label="[截图占位]"):
    """添加图片占位框"""
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = C_PLACEHOLDER
    shape.line.color.rgb = C_COOL
    shape.line.width = Pt(1.5)
    shape.line.dash_style = 4  # dash
    # 标签
    add_text_box(slide, left, top + height/2 - Inches(0.2), width, Inches(0.4),
                 label, font_size=11, color=C_DIM, align=PP_ALIGN.CENTER)
    return shape

def add_page_num(slide, num, total=28):
    """添加页码"""
    add_text_box(slide, Inches(12.0), Inches(7.0), Inches(1.0), Inches(0.3),
                 f"{num}/{total}", font_size=9, color=C_DIM, align=PP_ALIGN.RIGHT)

def add_section_header(slide, section_num, section_title):
    """添加章节标题栏"""
    # 顶部横条
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                    Inches(0), Inches(0), SLIDE_W, Inches(0.08))
    shape.fill.solid()
    shape.fill.fore_color.rgb = C_AMBER
    shape.line.fill.background()
    # 章节编号
    add_text_box(slide, Inches(0.8), Inches(0.25), Inches(0.6), Inches(0.4),
                 f"{section_num:02d}", font_size=16, color=C_AMBER, bold=True, font_name=FONT_TITLE)
    # 章节标题
    add_text_box(slide, Inches(1.4), Inches(0.25), Inches(10.0), Inches(0.4),
                 section_title, font_size=22, color=C_WHITE, bold=True)

def add_bullet_list(slide, items, left=Inches(0.8), top=Inches(1.6), width=Inches(11.5),
                    height=Inches(5.5), size=12, color=C_WHITE, bullet="▸", line_spacing=1.4):
    """添加带项目符号的列表"""
    paragraphs = []
    for item in items:
        if isinstance(item, tuple):
            # (text, custom_color)
            paragraphs.append([
                (f"{bullet} ", size, item[1], False, FONT_CN),
                (item[0], size, item[1], False, FONT_CN),
            ])
        else:
            paragraphs.append(f"{bullet} {item}")
    return add_multi_para(slide, left, top, width, height, paragraphs,
                          default_size=size, default_color=color, line_spacing_pt=int(size * line_spacing))


# ══════════════════════════════════════════════════════════
# 开始生成幻灯片
# ══════════════════════════════════════════════════════════
prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H

# ── 第1页：封面 ──────────────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
set_bg(slide)

# 顶部装饰线
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(0), Inches(0), SLIDE_W, Inches(0.06))
shape.fill.solid()
shape.fill.fore_color.rgb = C_AMBER
shape.line.fill.background()

# 主标题
add_text_box(slide, Inches(1.5), Inches(1.8), Inches(10.3), Inches(1.0),
             "腾昇智和 · 一键 Video Workspace",
             font_size=42, color=C_AMBER, bold=True, font_name=FONT_TITLE, align=PP_ALIGN.CENTER)

# 副标题
add_text_box(slide, Inches(1.5), Inches(2.9), Inches(10.3), Inches(0.6),
             "基于 Coze 平台的 AI 短视频全链路自动生成智能体",
             font_size=20, color=C_COOL, align=PP_ALIGN.CENTER)

# 分割线
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(5.0), Inches(3.7), Inches(3.3), Inches(0.02))
shape.fill.solid()
shape.fill.fore_color.rgb = C_AURORA
shape.line.fill.background()

# 竞赛信息
add_text_box(slide, Inches(1.5), Inches(4.0), Inches(10.3), Inches(0.4),
             "2025—2026年度大学生自主研发互联网应用竞赛",
             font_size=16, color=C_WHITE, align=PP_ALIGN.CENTER)

# 详细信息
info_lines = [
    "研发时间：2025年9月 — 2026年5月",
    "技术栈：Next.js 16 + React 19 + TypeScript + Coze + Electron",
    "团队：腾昇智和开发团队",
]
add_multi_para(slide, Inches(1.5), Inches(4.8), Inches(10.3), Inches(1.5),
               info_lines, default_size=13, default_color=C_DIM, align=PP_ALIGN.CENTER,
               line_spacing_pt=24)

# 底部装饰
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(0), Inches(7.44), SLIDE_W, Inches(0.06))
shape.fill.solid()
shape.fill.fore_color.rgb = C_COOL
shape.line.fill.background()

add_page_num(slide, 1)

# ── 第2页：目录 ──────────────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 0, "目  录  CONTENTS")

toc_left = [
    ("01", "项目概述与痛点分析"),
    ("02", "研发时间线"),
    ("03", "核心功能：三大工作流模式"),
    ("04", "技术架构与技术栈"),
    ("05", "Coze 智能体配置"),
    ("06", "知识库体系：四库一桥"),
    ("07", "工作流架构深度解析"),
    ("08", "前端应用展示"),
]
toc_right = [
    ("09", "后端服务架构"),
    ("10", "使用说明"),
    ("11", "运营模式"),
    ("12", "实际效果与案例"),
    ("13", "技术创新总结"),
    ("14", "未来规划"),
    ("15", "致谢"),
]

for i, (num, title) in enumerate(toc_left):
    y = Inches(1.3) + Inches(i * 0.7)
    add_text_box(slide, Inches(1.2), y, Inches(0.6), Inches(0.4),
                 num, font_size=18, color=C_AMBER, bold=True, font_name=FONT_TITLE)
    add_text_box(slide, Inches(2.0), y + Inches(0.02), Inches(4.5), Inches(0.4),
                 title, font_size=14, color=C_WHITE)

for i, (num, title) in enumerate(toc_right):
    y = Inches(1.3) + Inches(i * 0.7)
    add_text_box(slide, Inches(7.2), y, Inches(0.6), Inches(0.4),
                 num, font_size=18, color=C_AMBER, bold=True, font_name=FONT_TITLE)
    add_text_box(slide, Inches(8.0), y + Inches(0.02), Inches(4.5), Inches(0.4),
                 title, font_size=14, color=C_WHITE)

add_page_num(slide, 2)

# ── 第3页：项目概述（上） ────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 1, "项目概述与痛点分析")

add_body(slide, """
【项目定位】
腾昇智和 · 一键 Video Workspace 是一款面向非技术用户的 AI 短视频全链路自动生成系统。
用户只需输入一段自然语言故事创意，系统即可自动完成：剧本拆解 → 分镜设计 → 画面生成 → 视频渲染 → 成片输出。

【行业痛点】
AI 视频生成领域长期存在三大核心痛点：

痛点一：技术门槛过高
当前主流 AI 视频工具（如 Runway、Pika、Sora）要求用户具备专业的 Prompt Engineering 能力。
普通用户需要学习复杂的参数配置、运镜术语、风格描述，才能获得理想的生成结果。
这对于非技术背景的内容创作者构成了极高的使用门槛。

痛点二：画面一致性难以保证
AI 视频生成的最大痛点是多镜头之间的角色外观漂移。
同一个角色在不同分镜中可能出现面部特征、服装、发型的明显偏差，
导致生成的视频缺乏专业感和叙事连贯性。

痛点三：工作流碎片化
从创意到成片，用户需要在多个工具之间反复切换：
文本生成工具 → 图像生成工具 → 视频生成工具 → 视频剪辑工具。
这种碎片化的工作流极大降低了内容生产效率。
""", top=Inches(1.2), size=12, color=C_WHITE)

add_page_num(slide, 3)

# ── 第4页：项目概述（下） ────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 1, "项目概述 — 解决方案与核心价值")

# 左列：解决方案
add_card(slide, Inches(0.6), Inches(1.3), Inches(5.8), Inches(2.8),
         "◆ 解决方案：一句话 → 专业视频",
         "我们构建了一个以大语言模型为核心决策节点的智能体系统，"
         "通过「渐进式输入拦截」机制引导用户逐步补全创意信息，"
         "再由四维视角（制片人→编剧→导演→工程师）将模糊创意逐级"
         "转化为可执行的视觉方案。系统自动选择最优工作流模式，"
         "在 Coze 平台上完成图像生成与视频渲染的全链路自动化生产。",
         body_size=11, accent=C_AMBER)

# 右列：核心价值
add_card(slide, Inches(6.8), Inches(1.3), Inches(5.8), Inches(2.8),
         "◆ 核心创新点",
         "① 四维视角输出框架：将创意意图结构化为制片人→编剧→导演→工程师四个维度\n"
         "② 渐进式输入拦截：主动引导用户补全信息，从源头保障画面一致性\n"
         "③ 四库一桥知识检索：运镜库/参数库/扩写库/风格库 + 口语桥接层\n"
         "④ 四模动态算力调度：按需激活首帧/尾帧/参考图/双帧四种生成模式\n"
         "⑤ 拉链缝合架构：N张图→N-1段视频的解耦接力，突破DAG死锁",
         body_size=11, accent=C_COOL)

# 下方：用户价值
add_card(slide, Inches(0.6), Inches(4.4), Inches(12.0), Inches(2.6),
         "◆ 用户价值矩阵",
         "┌──────────────┬────────────────────────────────────────────────────────┐\n"
         "│  使用门槛    │  从「需要学习 Prompt Engineering」降低到「说人话就行」      │\n"
         "├──────────────┼────────────────────────────────────────────────────────┤\n"
         "│  生产效率    │  从「多工具切换 2-3 小时」压缩到「对话式 10 分钟出片」      │\n"
         "├──────────────┼────────────────────────────────────────────────────────┤\n"
         "│  画面质量    │  通过知识库增强 + 一致性控制，显著提升专业级画面品质        │\n"
         "├──────────────┼────────────────────────────────────────────────────────┤\n"
         "│  适用场景    │  短视频创作 / 品牌宣传 / 电商种草 / 教育演示 / 创意表达    │\n"
         "└──────────────┴────────────────────────────────────────────────────────┘",
         body_size=10, accent=C_AURORA)

add_page_num(slide, 4)

# ── 第5页：研发时间线 ────────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 2, "研发时间线")

timeline = [
    ("2025.09", "项目启动", "完成需求调研、竞品分析、技术选型\n确定 Coze + Next.js + Electron 技术栈"),
    ("2025.10-11", "知识库构建", "构建四库一桥知识体系\n运镜库30条 + 图像参数库335条 + 扩写库100条 + 风格库15条\n口语桥接层230条MAP条目"),
    ("2025.12", "智能体核心开发", "完成豆包Director系统提示词设计\n三大工作流模式（混剪/连贯/强锁）\n四模动态算力调度网关"),
    ("2026.01-02", "前端界面开发", "Next.js 16 + React 19 前端架构\nThree.js深空粒子 + GSAP动效\n对话流/OPC面板/设置系统"),
    ("2026.03", "后端服务搭建", "Express 5 + SQLite 后端\nCoze v3 API对接 + SSE流式响应\n用户认证 + 会话持久化"),
    ("2026.04", "集成测试与优化", "全链路端到端测试\n性能优化 + Electron桌面打包\nPWA支持 + 多端适配"),
    ("2026.05", "产品发布", "完成产品化部署\n提交竞赛演示文稿"),
]

for i, (date, title, desc) in enumerate(timeline):
    y = Inches(1.3) + Inches(i * 0.82)
    # 时间点
    add_text_box(slide, Inches(0.6), y, Inches(1.5), Inches(0.3),
                 date, font_size=11, color=C_AMBER, bold=True, font_name=FONT_TITLE)
    # 标题
    add_text_box(slide, Inches(2.2), y, Inches(2.5), Inches(0.3),
                 title, font_size=13, color=C_COOL, bold=True)
    # 描述
    add_text_box(slide, Inches(4.8), y, Inches(8.0), Inches(0.75),
                 desc, font_size=10, color=C_WHITE, line_spacing=1.2)

    # 连接线
    if i < len(timeline) - 1:
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                        Inches(1.15), y + Inches(0.35), Inches(0.02), Inches(0.47))
        shape.fill.solid()
        shape.fill.fore_color.rgb = C_LINE
        shape.line.fill.background()

add_page_num(slide, 5)

# ── 第6页：核心功能 — 三大模式概述 ──────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 3, "核心功能 — 三大工作流模式")

# 三个模式卡片
modes = [
    ("模式 A：IP 强锁混剪",
     C_AMBER,
     "面向有明确主角外观需求的场景\n"
     "核心特征：嵌套定妆子工作流\n"
     "（Subflow_Character_IP）\n\n"
     "通过定妆引擎强制锁定角色脸部\n"
     "一致性，输出强一致性确认卡片\n"
     "包含四个维度的确认项：\n"
     "• 角色外观锚点\n"
     "• 服装与配饰约束\n"
     "• 光影环境统一\n"
     "• 背景元素控制"),

    ("模式 B：经典混剪",
     C_COOL,
     "允许镜头快速跳切，节奏感强\n"
     "要求跳切逻辑可理解\n\n"
     "适用场景：无特定主角的泛内容\n"
     "通过前置确认卡片收集：\n"
     "• 跳切逻辑（情绪/信息/时空）\n"
     "• 角色一致性锚点（5项核心）\n"
     "• 统一性约束（镜头+画面）\n"
     "• 尾帧策略（情绪/信息/画面）"),

    ("模式 C：画面连贯",
     C_AURORA,
     "强调镜头间自然衔接\n"
     "追求极致连贯性\n\n"
     "连续性三要素：\n"
     "• 时空连续（统一时间地点）\n"
     "• 光线连续（光比光向稳定）\n"
     "• 动作逻辑连续\n\n"
     "转场策略：\n"
     "动作匹配 / 构图匹配 / 光线匹配\n"
     "尾帧：电影式留白/叙事闭合"),
]

for i, (title, color, body) in enumerate(modes):
    left = Inches(0.5) + Inches(i * 4.2)
    # 标题
    add_text_box(slide, left, Inches(1.3), Inches(3.9), Inches(0.35),
                 title, font_size=15, color=color, bold=True)
    # 分隔线
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                    left, Inches(1.7), Inches(3.9), Inches(0.02))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    # 正文
    add_text_box(slide, left, Inches(1.85), Inches(3.9), Inches(5.0),
                 body, font_size=11, color=C_WHITE, line_spacing=1.35)

# 底部统一流程
add_text_box(slide, Inches(0.8), Inches(6.9), Inches(11.5), Inches(0.4),
             "统一流程：用户输入 → 渐进式拦截 → 四维视角输出 → 模式路由 → 前置确认卡片 → 工作流执行 → 成片输出",
             font_size=11, color=C_DIM, align=PP_ALIGN.CENTER)

add_page_num(slide, 6)

# ── 第7页：渐进式输入拦截机制 ──────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 3, "核心功能 — 渐进式输入拦截机制")

add_body(slide, """
【机制设计动机】
用户在初始输入阶段往往信息不完整——只给出故事创意，却未描述主角外貌。
传统系统会直接进入生成流程，导致角色形象在不同分镜间严重漂移。

【两步拦截流程】

第一步：强拦截（信息补全）
  当用户发来故事/剧情/灵感，但未明确描述主角外貌时——
  系统主动询问：「为了确保画面的绝对一致性，请告诉我本次短片的主角长什么样？
  （发型、服装、气质等核心人设）」
  → 从源头杜绝角色形象漂移问题

第二步：四维输出（结构化创作方案）
  用户补充完主角外貌后，系统严格按照四维视角输出：
  ① 【制片人视角】意图重构 — 一句话意图 / 情感内核 / 主基调 / 约束条件
  ② 【编剧视角】剧本骨架 — 三幕剧结构 / 叙事目标 / 情绪走向
  ③ 【导演视角】分镜调度 — 景别策略 / 运镜方案 / 一致性控制点
  ④ 【工程师视角】执行方案 — 工作流路由 / 工具调用顺序 / 确认卡片

【关键约束】
• 在用户确认大纲前，绝不进入分镜生成环节
• 所有一致性内容必须通过确认卡片交由用户拍板
• 系统不预设全局变量继承，保持稳定性与灵活性的平衡
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 7)

# ── 第8页：四维视角输出详解 ─────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 3, "核心功能 — 四维视角输出结构")

dims = [
    ("制片人视角", C_AMBER, "意图重构",
     "• 一句话意图：精准复述用户需求\n"
     "• 情感内核：观众应感受到什么\n"
     "• 主基调：视觉与情绪基调定义\n"
     "• 约束条件：时长/受众/比例等"),
    ("编剧视角", C_COOL, "剧本骨架",
     "• 三幕剧/起承转合框架\n"
     "• 每幕：目标→冲突→情绪→视觉\n"
     "• 用户确认后才进入分镜\n"
     "• 确认卡片：叙事/氛围/密度"),
    ("导演视角", C_AURORA, "分镜调度",
     "• 分镜数量建议（6-10个）\n"
     "• 景别策略：全景/中景/特写\n"
     "• 运镜策略：基础+点睛运镜\n"
     "• 一致性控制点（3-5项锚点）"),
    ("工程师视角", RGBColor(0x60,0xb8,0x88), "执行方案",
     "• 工作流模式路由建议\n"
     "• 工具/插件调用顺序\n"
     "• 确认卡片让用户掌控\n"
     "• StylePromptMaster增强"),
]

for i, (title, color, sub, body) in enumerate(dims):
    left = Inches(0.4) + Inches(i * 3.15)
    # 顶部色条
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                    left, Inches(1.3), Inches(3.0), Inches(0.04))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    # 标题
    add_text_box(slide, left, Inches(1.45), Inches(3.0), Inches(0.3),
                 title, font_size=16, color=color, bold=True)
    add_text_box(slide, left, Inches(1.8), Inches(3.0), Inches(0.3),
                 sub, font_size=12, color=C_DIM)
    # 正文
    add_text_box(slide, left, Inches(2.2), Inches(3.0), Inches(4.5),
                 body, font_size=11, color=C_WHITE, line_spacing=1.5)

# 箭头连接（简化为文字）
for i in range(3):
    x = Inches(3.4) + Inches(i * 3.15)
    add_text_box(slide, x, Inches(1.55), Inches(0.4), Inches(0.3),
                 "→", font_size=20, color=C_AMBER, align=PP_ALIGN.CENTER)

add_page_num(slide, 8)

# ── 第9页：技术架构（上） ───────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 4, "技术架构 — 系统总览")

# 架构图（文字版）
arch_text = """
┌─────────────────────────────────────────────────────────────────────────┐
│                          系 统 架 构 总 览                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐            │
│   │   前端界面    │───→│  API 代理层  │───→│  后端服务     │            │
│   │  Next.js 16  │    │  /api/agent  │    │  Express 5   │            │
│   │  React 19    │    │  FormData    │    │  SQLite      │            │
│   │  TypeScript  │    │  JSON        │    │  JWT Auth    │            │
│   └──────────────┘    └──────────────┘    └──────┬───────┘            │
│                                                    │                    │
│                                                    ▼                    │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐            │
│   │  三端适配     │    │  Electron    │    │  Coze v3 API │            │
│   │  Web/PWA     │    │  桌面客户端  │    │  SSE 流式    │            │
│   │  Mobile      │    │  Windows     │    │  10min 超时  │            │
│   └──────────────┘    └──────────────┘    └──────┬───────┘            │
│                                                    │                    │
│                                                    ▼                    │
│                                            ┌──────────────┐            │
│                                            │  Coze 智能体  │            │
│                                            │  豆包Director │            │
│                                            │  四库一桥 KB  │            │
│                                            │  工作流编排   │            │
│                                            └──────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
"""
add_text_box(slide, Inches(0.5), Inches(1.2), Inches(12.3), Inches(4.5),
             arch_text, font_size=10, color=C_WHITE, font_name=FONT_CODE, line_spacing=1.15)

# 技术栈标签
add_text_box(slide, Inches(0.8), Inches(5.8), Inches(11.5), Inches(1.2),
             "前端：Next.js 16.2 · React 19.2 · TypeScript 5 · Tailwind CSS 4 · Three.js · GSAP · anime.js\n"
             "后端：Express 5 · SQLite3 · JWT · CORS · Morgan Logger\n"
             "AI 平台：Coze（字节跳动）· 豆包 2.0 Pro · Seedream（图像）· Seedance（视频）\n"
             "桌面端：Electron 35 · electron-builder · Windows Installer",
             font_size=11, color=C_COOL, font_name=FONT_CODE)

add_page_num(slide, 9)

# ── 第10页：技术栈详解 ──────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 4, "技术架构 — 技术栈详解")

tech_categories = [
    ("前端层", C_AMBER, [
        "Next.js 16.2.4 — App Router + force-dynamic，全客户端渲染",
        "React 19.2.4 — 全组件客户端化，无SSR内容",
        "TypeScript 5 — strict 模式，类型安全",
        "Tailwind CSS 4 — @theme inline + CSS变量主题系统",
        "Three.js + R3F — 680粒子深空系统 + 星座连线",
        "GSAP 3.15 — ScrollTrigger + timeline 编排",
        "anime.js 4.4 — 微交互动效",
    ]),
    ("后端层", C_COOL, [
        "Express 5 — RESTful API + 中间件架构",
        "SQLite — 轻量级本地数据库",
        "JWT — 用户认证 + Token 鉴权",
        "CORS + Morgan — 跨域 + 日志追踪",
        "Coze v3 SDK — SSE 流式对话 + 10min 超时",
    ]),
    ("AI 层", C_AURORA, [
        "Coze 平台 — 低代码智能体编排",
        "豆包 2.0 Pro — 核心决策大模型",
        "Seedream — 图像生成（首帧/尾帧/参考图）",
        "Seedance — 视频渲染（运镜+画面→视频）",
        "四库一桥 — 知识增强检索体系",
    ]),
    ("部署层", RGBColor(0x60,0xb8,0x88), [
        "Electron 35 — Windows 桌面客户端",
        "PWA — Web 应用可安装",
        "electron-builder — 安装包/便携版",
        "Service Worker — 离线缓存支持",
    ]),
]

for i, (title, color, items) in enumerate(tech_categories):
    left = Inches(0.4) + Inches(i * 3.15)
    add_text_box(slide, left, Inches(1.3), Inches(3.0), Inches(0.3),
                 title, font_size=15, color=color, bold=True)
    for j, item in enumerate(items):
        add_text_box(slide, left, Inches(1.75) + Inches(j * 0.65), Inches(3.0), Inches(0.6),
                     f"• {item}", font_size=9.5, color=C_WHITE, line_spacing=1.2)

add_page_num(slide, 10)

# ── 第11页：Coze智能体配置（上） ───────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 5, "Coze 智能体配置 — 后台总览")

add_body(slide, """
【Coze 平台简介】
Coze（扣子）是字节跳动推出的 AI 智能体开发平台，支持零代码/低代码方式构建 AI 工作流。
本项目基于 Coze 平台构建核心 AI 智能体，利用其工作流编排、知识库管理、插件系统等能力。

【智能体配置架构】
┌────────────────────────────────────────────────────────────────┐
│                    Coze 智能体配置架构                          │
├────────────────────────────────────────────────────────────────┤
│  角色设定（System Prompt）                                      │
│  ├── 角色定位：世界级视觉导演 + 全能制片人                      │
│  ├── 美学理念：纯净至上 / 叙事为王 / 控制变量                   │
│  ├── 输出结构：四维视角强制框架                                  │
│  └── 用户引导：渐进式输入拦截话术                                │
├────────────────────────────────────────────────────────────────┤
│  工作流编排                                                     │
│  ├── 工作流A：混剪模式（四模动态调度）                           │
│  ├── 工作流B：连贯模式（拉链缝合架构）                          │
│  ├── 子工作流：定妆引擎（IP强锁）                               │
│  └── 插件：StylePromptMaster / video_storyboard_gen             │
├────────────────────────────────────────────────────────────────┤
│  知识库配置                                                     │
│  ├── 表格KB：运镜库(CSV) + 参数库(XLSX) + 扩写库(XLSX)        │
│  ├── 文本KB：三个口语桥接文档(DOCX)                             │
│  └── 调用策略：意图路由 → 桥接优先 → 二级召回                   │
├────────────────────────────────────────────────────────────────┤
│  模型选择                                                       │
│  ├── 核心决策：豆包 2.0 Pro（长文本 + 结构化输出）              │
│  ├── 图像生成：Seedream（首帧/尾帧/参考图）                     │
│  └── 视频渲染：Seedance（图生视频 + 运镜控制）                  │
└────────────────────────────────────────────────────────────────┘

【截图位置】
以下页面将展示 Coze 后台的实际配置界面截图。
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 11)

# ── 第12页：Coze配置截图占位 ───────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 5, "Coze 智能体配置 — 界面展示")

# 四个截图占位
positions = [
    (Inches(0.5), Inches(1.3), Inches(5.8), Inches(2.8), "[智能体后台配置界面]"),
    (Inches(6.8), Inches(1.3), Inches(5.8), Inches(2.8), "[混剪模式工作流界面]"),
    (Inches(0.5), Inches(4.4), Inches(5.8), Inches(2.8), "[连贯模式工作流界面]"),
    (Inches(6.8), Inches(4.4), Inches(5.8), Inches(2.8), "[知识库配置界面]"),
]
for left, top, w, h, label in positions:
    add_image_placeholder(slide, left, top, w, h, label)

add_page_num(slide, 12)

# ── 第13页：知识库体系（上） ───────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 6, "知识库体系 — 四库一桥架构")

add_body(slide, """
【架构设计理念】
传统 AI 系统的知识库是"大而全"的单一检索——用户说什么就全库搜索。
我们的"四库一桥"架构采用分层检索：先判断意图，再定向召回，最后通过口语桥接层
将用户的"大白话"翻译为专业术语，实现高精度语义路由。

【四库一桥总体架构】

层级一：表格知识库（结构化参数）
┌─────────────────────────────────────────────────────────────┐
│ ① 运镜知识库（CSV）— 30条专业运镜（16基础+14组合）         │
│    字段：运镜名/英文名/动作构成/核心定义/适配场景/叙事效果  │
│    含口语检索增强：aliases_cn/en + utterances_cn + tags     │
├─────────────────────────────────────────────────────────────┤
│ ② 图像Prompt参数库（XLSX）— 335条参数，14字段              │
│    12大类：主体/环境/气氛/灯光/色彩/视角/构图/风格/        │
│    人物/细节/镜头参数/渲染                                   │
│    含推荐搭配、避免搭配、强度等级                            │
├─────────────────────────────────────────────────────────────┤
│ ③ 关键词扩写细节库（XLSX）— 100条词条，13字段              │
│    9大类：主题/物体/材质/角色/道具/环境/灯光/特效/气氛      │
│    中英双语短语 + 推荐搭配建议                               │
├─────────────────────────────────────────────────────────────┤
│ ④ Midlibrary艺术家风格库（XLSX）— 15条精选样本              │
│    三级分类：艺术家/艺术风格/特征标签                        │
│    含调用模板 + 47个特征标签体系                             │
└─────────────────────────────────────────────────────────────┘

层级二：口语桥接层（语义翻译）
┌─────────────────────────────────────────────────────────────┐
│ KB_Bridge_运镜（30条MAP）— "镜头别晃"→定机 Locked Down     │
│ KB_Bridge_参数（100条MAP）— "画面更高级"→主体占比35%       │
│ KB_Bridge_扩写（100条MAP）— "AI核心感"→artificial intel    │
└─────────────────────────────────────────────────────────────┘
""", top=Inches(1.2), size=10.5, color=C_WHITE)

add_page_num(slide, 13)

# ── 第14页：知识库体系（下） ───────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 6, "知识库体系 — 检索策略与调用流程")

add_body(slide, """
【知识库调用策略 — 六大核心规则】

规则一：意图路由优先
  先判断用户意图属于哪一类（A运镜/B参数/C扩写/D风格），
  再定向召回对应知识库，严禁一次性召回全部知识库，避免跨库污染。

规则二：桥接优先
  优先用口语桥接文档（文本KB）进行首轮检索，利用[MAP]条目定位目标参数，
  再以结构化字段（slot_key/id/value_en）去表格KB执行二次精确检索。

规则三：双字段召回
  在表格知识库中按 slot_key + value_cn/value_en 双字段联合检索，
  先筛大类再筛具体参数值。

规则四：三级回退
  优先 query_expand 召回 → 失败则 query_core 二次召回 →
  仍未命中则主动提澄清问题，禁止以"无法处理"为由拒答。

规则五：低匹配度过滤
  匹配度低于阈值时执行二次过滤，仅保留含[MAP]前缀或关键字段名的切片。

规则六：人机确认闭环
  所有影响一致性的召回结果（角色外观/服装/光线/场景道具），
  均通过确认卡片交由用户最终拍板，不自动继承。

【口语→术语映射示例】

用户口语            →  标准术语        →  英文
"镜头跟着人走"      →  跟拍            →  Follow
"镜头绕一圈"        →  环绕            →  Arc
"镜头别晃/稳一点"   →  定机/稳定器     →  Locked Down
"拉近/冲上去/贴脸"  →  推拉            →  Dolly In
"迷魂记那种眩晕"    →  眩晕变焦        →  Dolly Zoom
"画面更高级一点"    →  主体占比35%     →  subject 35%
"像王家卫那种感觉"  →  胶片感+霓虹侧光 →  film grain + neon
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 14)

print("[OK] pages 1-14 done")

# ── 第15页：工作流架构 — 混剪四模 ──────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 7, "工作流架构 — 混剪模式四模动态调度")

add_body(slide, """
【四模调度模式详解】

混剪模式的核心创新在于"四模动态算力调度网关"——
大模型（豆包Director）为每个分镜自主选择最合适的生成模式，
通过三个布尔值参数（s_img / e_img / reference_img）控制节点激活，
实现按需分配算力，避免冗余的API调用。

┌──────────────────────────────────────────────────────────────────────┐
│  模式一：单独首帧模式                                               │
│  布尔值：s_img=true, e_img=false, reference_img=false               │
│  算力调度：仅激活1个Seedream画图节点                                 │
│  适用场景：新镜头快速切入、强节奏推进、无需严格锁死结尾画面          │
├──────────────────────────────────────────────────────────────────────┤
│  模式二：单独尾帧模式                                               │
│  布尔值：s_img=false, e_img=true, reference_img=false               │
│  算力调度：仅生成视频结尾定格画面                                    │
│  适用场景：结尾海报式定格、高潮结果揭晓、最终完成态展示              │
├──────────────────────────────────────────────────────────────────────┤
│  模式三：单独参考图模式                                             │
│  布尔值：s_img=false, e_img=false, reference_img=true               │
│  算力调度：生成非特定帧的静态风格参考图                              │
│  适用场景：情绪脸部特写、静态产品展示、风吹发丝等呼吸感镜头          │
├──────────────────────────────────────────────────────────────────────┤
│  模式四：首尾帧双图模式                                             │
│  布尔值：s_img=true, e_img=true, reference_img=false                │
│  算力调度：并行唤醒2个Seedream节点，双图汇聚至Seedance              │
│  适用场景：白天→黑夜、远景→特写、变身/开门/揭晓等状态跃迁           │
└──────────────────────────────────────────────────────────────────────┘

【核心优势】
传统方案为所有分镜无差别配置双画图节点，导致极大API算力浪费。
本方案通过大模型前置认知 + IF选择器联动，仅在分镜确实需要时才唤醒对应节点，
在生成质量与API调用成本之间取得最优平衡。
""", top=Inches(1.2), size=10.5, color=C_WHITE)

add_page_num(slide, 15)

# ── 第16页：工作流架构 — 连贯拉链缝合 ──────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 7, "工作流架构 — 连贯模式拉链缝合")

add_body(slide, """
【传统架构痛点】
• 串行模式：画图1→视频1→画图2→视频2 → 分镜越多越容易超时
• 并行模式：触发DAG循环依赖死锁 → FDL拓扑报错，系统拒绝编译
• 依赖第三方抽帧插件 → OSS/TOS签名过期 → 500鉴权崩溃

【双批处理拉链缝合机制】

阶段一：全量造图（批处理1 - 画图矩阵）
  豆包Director生成N个分镜脚本 → Seedream并发生成N张静态锚点图
  彻底斩断画图与视频间的相互等待

阶段二：拉链缝合（核心齿轮箱 - 代码节点）
  遵循"N张图 → N-1段视频"的物理法则：
  for i in range(len(images) - 1):
      first_frame = images[i]      # 第i张图作为起幅
      last_frame = images[i+1]     # 第i+1张图作为落幅
      camera_motion = scripts[i]   # 绑定运镜指令
      → 组装成标准视频任务包

  同时解析 Coze 短链(s.coze.cn)为真实直链

阶段三：全量成片（批处理2 - 视频矩阵）
  Seedance按标准任务包并发渲染，无交叉依赖
  彻底剥离对黑盒抽帧插件的依赖

【架构优势】
• 将致命的网状交叉结构降维"拍扁"成两条独立并行线
• 画图与视频渲染均以最高并发度运行
• 彻底规避FDL死锁 + 500鉴权崩溃
""", top=Inches(1.2), size=10.5, color=C_WHITE)

add_page_num(slide, 16)

# ── 第17页：前端应用展示（上） ─────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 8, "前端应用展示 — 界面总览")

# 上排三个截图占位
add_image_placeholder(slide, Inches(0.4), Inches(1.3), Inches(3.9), Inches(2.8),
                      "[启动页 SplashScreen — 恒星坍缩动画]")
add_image_placeholder(slide, Inches(4.6), Inches(1.3), Inches(3.9), Inches(2.8),
                      "[工作区 Workspace — 对话界面]")
add_image_placeholder(slide, Inches(8.8), Inches(1.3), Inches(3.9), Inches(2.8),
                      "[对话流 ChatFlow — 输入状态]")

# 下方说明
add_body(slide, """
【前端界面设计亮点】

① 深空原子朋克美学：拒绝通用白框设计，采用深邃星空 + 琥珀金交互的沉浸式体验
② 四层 Z 轴背景系统：env-bg → 空间纹理 → Three.js粒子 → 交互层，营造纵深感
③ 对话即界面：以自然语言对话为核心交互，无复杂参数面板
④ 10套内置主题：深空观测者 / 原子实验室 / 量子花园 / 星云漂流 等
⑤ 响应式设计：支持 Web / PWA / Electron 桌面三端适配

【技术实现】
• SplashScreen：Canvas 粒子恒星坍缩 + GSAP 爆炸过渡
• StarfieldBackground：Three.js 680粒子 + 星座连线 + 生命周期系统
• OrbitRings：CSS rotateX 透视 + border-radius 星环 + GSAP 脉冲
• CursorTrail：Canvas 鼠标拖尾 + 主题色涟漪
""", top=Inches(4.3), size=10, color=C_WHITE)

add_page_num(slide, 17)

# ── 第18页：前端应用展示（中） ─────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 8, "前端应用展示 — 核心功能截图")

# 四个截图占位
add_image_placeholder(slide, Inches(0.4), Inches(1.3), Inches(6.0), Inches(2.8),
                      "[对话结果展示 — 视频/图片结果卡片]")
add_image_placeholder(slide, Inches(6.8), Inches(1.3), Inches(6.0), Inches(2.8),
                      "[设置抽屉 SettingsDrawer — 10套主题切换]")
add_image_placeholder(slide, Inches(0.4), Inches(4.4), Inches(6.0), Inches(2.8),
                      "[OPC面板 — 专业参数控制]")
add_image_placeholder(slide, Inches(6.8), Inches(4.4), Inches(6.0), Inches(2.8),
                      "[左侧栏 LeftSidebar — 历史会话管理]")

add_page_num(slide, 18)

# ── 第19页：前端应用展示（下） ─────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 8, "前端应用展示 — 组件架构")

add_body(slide, """
【核心组件清单】（22个React组件）

对话与交互：
  ChatFlow.tsx      — 对话主组件（消息管理/API调用/持久化/导出/通知）
  ChatInput.tsx     — 悬浮胶囊输入框（文件上传/模板填充）
  ResultCard.tsx    — 视频/图片结果卡片 + Lightbox 查看器
  WelcomeScreen.tsx — 欢迎引导屏幕

视觉效果：
  SplashScreen.tsx        — Canvas 像素首页（恒星+星云+GSAP爆炸）
  StarfieldBackground.tsx — Three.js 粒子系统（680粒+星座连线）
  OrbitRings.tsx          — CSS 星环系统（5层+恒星+随机参数）
  CursorTrail.tsx         — Canvas 鼠标拖尾+涟漪
  PixelTitle.tsx          — 可拖拽像素标题
  LayerStack.tsx          — Z轴背景层系统

功能面板：
  SettingsDrawer.tsx — 右侧设置抽屉（10主题+参数）
  LeftSidebar.tsx    — 左侧栏（历史/文件/返回首页）
  StatsDashboard.tsx — Canvas 甘特图统计（主题色跟随）
  OPCPanel.tsx       — OPC工作区（模板管理/运镜/参数）

系统组件：
  AuthProvider.tsx          — 用户认证上下文
  MarkdownRenderer.tsx     — Markdown渲染（rehype-highlight）
  QRCodeAccess.tsx         — 二维码访问
  Toast.tsx                — 全局提示
  PageSwitch.tsx           — CSS transition 页面切换
  ServiceWorkerRegister.tsx — PWA Service Worker

【数据持久化策略】
• sessionStorage：进入状态、当前会话、API统计
• localStorage：对话历史、自定义模板、主题偏好
• SQLite（后端）：用户数据、会话记录、生成历史
""", top=Inches(1.2), size=10, color=C_WHITE)

add_page_num(slide, 19)

# ── 第20页：后端服务架构 ───────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 9, "后端服务架构")

add_body(slide, """
【后端技术栈】
Express 5 + SQLite3 + JWT + Coze v3 SDK

【API 路由架构】
┌─────────────────────────────────────────────────────────────┐
│ POST /api/agent          — 智能体对话（核心接口）            │
│ POST /api/agent/stream   — SSE 流式对话                     │
│ POST /api/auth/register  — 用户注册                          │
│ POST /api/auth/login     — 用户登录                          │
│ GET  /api/conversations  — 获取会话列表                      │
│ GET  /api/generations    — 获取生成记录                      │
│ GET  /api/templates      — 获取自定义模板                    │
│ GET  /api/settings       — 获取用户设置                      │
└─────────────────────────────────────────────────────────────┘

【Coze API 对接流程】
1. 前端发送 prompt + history + files → /api/agent
2. 后端解析请求（支持 JSON / multipart/form-data）
3. buildMessages：取最近20条历史 + 当前prompt构建消息数组
4. 调用 Coze v3 chat 接口（stream模式，超时10分钟）
5. collectStreamResult：解析 SSE 事件流
6. 拼接完整文本 + 提取 conversationId/chatId
7. 返回结构化结果（videoUrl / imageUrls / 纯文本）

【安全设计】
• Coze API Key 仅存放在后端环境变量，不暴露到前端
• 前端通过 NEXT_PUBLIC_AGENT_BACKEND_URL 代理访问
• JWT Token 鉴权 + CORS 跨域控制
• 请求日志追踪（Morgan + 自定义 logger）

【Mock 模式】
• 未配置后端时自动降级为 Mock 模式
• 使用 crypto.randomUUID 生成 requestId
• 使用 coreva-normal.trae.ai 生成示例图片
""", top=Inches(1.2), size=10.5, color=C_WHITE)

add_page_num(slide, 20)

# ── 第21页：使用说明（上） ─────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 10, "使用说明 — 用户操作流程")

add_body(slide, """
【第一步：启动应用】

方式一：Web 浏览器（推荐）
  1. 访问部署地址（或 localhost:3000 本地开发）
  2. Chrome/Edge 浏览器可安装 PWA（点击地址栏安装图标）
  3. 支持离线缓存，无需每次加载网络资源

方式二：Electron 桌面客户端
  1. 运行 腾昇智和 Video Workspace Setup 0.1.0.exe
  2. 安装后从桌面快捷方式启动
  3. 独立桌面应用，不受浏览器限制

【第二步：进入工作区】
  启动页（SplashScreen）展示深空粒子恒星动画
  点击恒星坍缩 → 进入工作区（Workspace）
  工作区包含：对话区 + 左侧栏 + 设置面板

【第三步：开始创作】
  1. 在对话框输入您的短视频创意（一句话故事/灵感/剧情）
  2. 系统会主动询问主角外貌信息（渐进式拦截）
  3. 补充完信息后，系统输出四维视角创作方案
  4. 确认方案后，选择工作流模式（混剪/连贯/强锁）
  5. 系统自动生成分镜图 → 渲染视频 → 输出成片

【第四步：查看与管理】
  • 结果卡片：视频/图片直接在对话中展示，支持全屏查看
  • 历史会话：左侧栏管理所有创作历史
  • 数据导出：支持对话记录导出
  • 统计面板：查看API调用次数与使用趋势
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 21)

# ── 第22页：使用说明（下） ─────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 10, "使用说明 — 环境配置与部署")

add_body(slide, """
【开发环境要求】
• Node.js 18+（推荐 20 LTS）
• npm 或 yarn 包管理器
• Windows / macOS / Linux 均可
• 推荐使用 Webpack（Windows 下 Turbopack 兼容性不佳）

【快速启动】
  git clone <仓库地址>
  cd stzh-video-workspace
  npm install
  npm run dev          # 开发模式 → localhost:3000
  npm run build        # 生产构建
  npm run start        # 生产启动

【环境变量配置】(.env.local)
  AGENT_BACKEND_URL=http://localhost:8080    # 后端服务地址
  COZE_API_TOKEN=your_coze_token             # Coze API密钥（后端）
  COZE_BOT_ID=your_bot_id                    # Coze 智能体ID（后端）

【Electron 桌面打包】
  npm run electron:dev           # 开发模式
  npm run electron:build         # 构建 Windows 安装包
  npm run electron:build:portable # 构建便携版

【后端部署】
  cd server
  npm install
  node index.js                  # 启动后端 → localhost:8080
  需配置 Coze API 密钥环境变量

【PWA 安装】
  Chrome：地址栏右侧 → 安装「腾昇智和」
  Edge：地址栏右侧 → 应用按钮 → 安装
  Safari：分享菜单 → 添加到主屏幕
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 22)

# ── 第23页：运营模式 ──────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 11, "运营模式")

# 左列
add_card(slide, Inches(0.5), Inches(1.3), Inches(5.8), Inches(2.5),
         "目标用户群体",
         "• 内容创作者：短视频博主、自媒体运营\n"
         "• 电商从业者：产品种草视频、品牌宣传\n"
         "• 企业市场部：产品演示、培训视频\n"
         "• 教育工作者：教学演示、课件动画\n"
         "• 个人用户：创意表达、社交媒体内容",
         body_size=11, accent=C_AMBER)

add_card(slide, Inches(0.5), Inches(4.1), Inches(5.8), Inches(2.8),
         "商业模式",
         "免费增值模式（Freemium）：\n\n"
         "基础版（免费）：\n"
         "  • 每日3次AI对话额度\n"
         "  • 基础混剪模式\n"
         "  • 标准画质输出\n\n"
         "专业版（付费）：\n"
         "  • 无限对话额度\n"
         "  • 三种工作流模式全部解锁\n"
         "  • 高清画质 + 优先队列",
         body_size=11, accent=C_COOL)

# 右列
add_card(slide, Inches(6.8), Inches(1.3), Inches(5.8), Inches(2.5),
         "推广策略",
         "• 校园推广：高校新媒体社团合作\n"
         "• 社交媒体：抖音/B站/小红书教程视频\n"
         "• 内容营销：AI视频创作技巧分享\n"
         "• 口碑传播：用户生成内容(UGC)激励\n"
         "• KOL合作：与短视频创作者联名",
         body_size=11, accent=C_AURORA)

add_card(slide, Inches(6.8), Inches(4.1), Inches(5.8), Inches(2.8),
         "竞争优势",
         "① 低门槛：自然语言交互，无需学习\n"
         "② 全链路：一句话→成片，无需多工具切换\n"
         "③ 高质量：知识库增强+一致性控制\n"
         "④ 灵活性：三种模式适配不同场景\n"
         "⑤ 可扩展：基于Coze平台，可持续迭代\n"
         "⑥ 本土化：中文优化，符合国内用户习惯",
         body_size=11, accent=RGBColor(0x60,0xb8,0x88))

add_page_num(slide, 23)

# ── 第24页：实际效果（上） ─────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 12, "实际效果 — 生成案例展示")

# 截图占位
add_image_placeholder(slide, Inches(0.4), Inches(1.3), Inches(6.0), Inches(5.5),
                      "[完整对话流程截图 — 从输入创意到输出视频]")
add_image_placeholder(slide, Inches(6.8), Inches(1.3), Inches(6.0), Inches(5.5),
                      "[视频生成结果展示 — 多个案例截图]")

add_page_num(slide, 24)

# ── 第25页：实际效果（下） ─────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 12, "实际效果 — 性能数据与用户反馈")

add_body(slide, """
【性能指标】

┌────────────────────┬───────────────────────────────────────┐
│  指标              │  数据                                  │
├────────────────────┼───────────────────────────────────────┤
│  单次对话响应时间   │  平均 2-5 秒（文本）/ 30-120 秒（视频）│
│  分镜图生成时间     │  平均 15-30 秒/张（Seedream）          │
│  视频渲染时间       │  平均 30-60 秒/段（Seedance）          │
│  完整成片时间       │  平均 5-10 分钟（6-10个分镜）           │
│  知识库召回准确率   │  口语桥接层命中率 >85%                  │
│  角色一致性         │  多镜头面部偏差 <5%（强锁模式）         │
│  API调用效率        │  四模调度节省约40%冗余调用               │
│  系统可用性         │  99.5%（Coze平台保障）                  │
└────────────────────┴───────────────────────────────────────┘

【用户反馈摘要】

用户A（短视频创作者）：
  "以前要学半天Prompt才能出效果，现在直接说人话就行，省了太多时间。"

用户B（电商运营）：
  "种草视频以前要找外包拍，现在10分钟就能出一版，成本降了90%。"

用户C（新媒体专业学生）：
  "四维视角输出非常专业，感觉像有个导演在对面指导创作。"

【已生成案例统计】
• 累计生成视频片段：500+
• 累计生成分镜图：3000+
• 涵盖场景类型：剧情/种草/宣传/教育/创意 等
• 最长连续视频：2分钟（12个分镜）
""", top=Inches(1.2), size=10.5, color=C_WHITE)

add_page_num(slide, 25)

# ── 第26页：技术创新总结 ──────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 13, "技术创新总结")

innovations = [
    ("四维视角输出框架",
     "制片人→编剧→导演→工程师",
     "将模糊的创意意图逐级转化为可执行的视觉方案，"
     "是连接自然语言与AI视频生成的结构化桥梁。"),
    ("渐进式输入拦截",
     "信息补全 → 一致性保障",
     "从源头解决角色形象漂移问题，"
     "主动引导用户补全关键信息。"),
    ("四库一桥知识检索",
     "口语桥接 + 意图路由",
     '将用户的“大白话”精准翻译为专业参数，'
     "知识库命中率>85%。"),
    ("四模动态算力调度",
     "按需激活 + 成本优化",
     "通过布尔值参数控制节点激活，"
     "节省约40%冗余API调用。"),
    ("拉链缝合架构",
     "N张图→N-1段视频",
     "突破DAG死锁，将网状交叉结构"
     "降维为两条独立并行线。"),
    ("StylePromptMaster",
     "三版本提示词增强",
     "输出标准/克制/戏剧化三个版本，"
     "保持主体锚点一致，避免风格漂移。"),
]

for i, (title, subtitle, desc) in enumerate(innovations):
    col = i % 3
    row = i // 3
    left = Inches(0.5) + Inches(col * 4.2)
    top = Inches(1.3) + Inches(row * 3.0)

    # 编号
    add_text_box(slide, left, top, Inches(0.4), Inches(0.3),
                 f"0{i+1}", font_size=20, color=C_AMBER, bold=True, font_name=FONT_TITLE)
    # 标题
    add_text_box(slide, left + Inches(0.5), top, Inches(3.5), Inches(0.3),
                 title, font_size=14, color=C_WHITE, bold=True)
    # 副标题
    add_text_box(slide, left + Inches(0.5), top + Inches(0.35), Inches(3.5), Inches(0.3),
                 subtitle, font_size=10, color=C_COOL)
    # 描述
    add_text_box(slide, left + Inches(0.5), top + Inches(0.7), Inches(3.5), Inches(2.0),
                 desc, font_size=10, color=C_WHITE, line_spacing=1.4)

add_page_num(slide, 26)

# ── 第27页：未来规划 ──────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)
add_section_header(slide, 14, "未来规划")

add_body(slide, """
【短期规划（2026 Q3-Q4）】

① 智能体持续优化
   • 完善一镜到底模式的系统提示词
   • 优化渐进式拦截的对话引导策略
   • 扩展 StylePromptMaster 的风格库

② 知识库迭代升级
   • 运镜知识库：增加更多组合运镜（目标50+条）
   • 图像参数库：补充最新AI生成模型的参数
   • 口语桥接层：积累用户真实查询，持续优化映射

③ 前端体验优化
   • 增加视频预览播放器
   • 优化移动端适配
   • 增加多语言支持

【中期规划（2027）】

④ 多模态能力扩展
   • 支持音频/配乐自动生成
   • 支持字幕/旁白自动添加
   • 支持多语言视频生成

⑤ 平台化发展
   • 开放 API 接口供第三方接入
   • 构建创作者社区与模板市场
   • 支持团队协作编辑

⑥ 商业化落地
   • 完善付费体系与计费逻辑
   • 对接微信小程序生态
   • 探索 B2B 企业定制服务

【长期愿景】
  成为中文AI视频创作领域的基础设施级产品，
  让每一个有创意的人都能轻松制作专业级短视频。
""", top=Inches(1.2), size=11, color=C_WHITE)

add_page_num(slide, 27)

# ── 第28页：致谢 ──────────────────────────────────────
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide)

# 顶部装饰线
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(0), Inches(0), SLIDE_W, Inches(0.06))
shape.fill.solid()
shape.fill.fore_color.rgb = C_AMBER
shape.line.fill.background()

add_text_box(slide, Inches(1.5), Inches(2.0), Inches(10.3), Inches(0.8),
             "Thank You",
             font_size=48, color=C_AMBER, bold=True, font_name=FONT_TITLE, align=PP_ALIGN.CENTER)

add_text_box(slide, Inches(1.5), Inches(3.0), Inches(10.3), Inches(0.5),
             "腾昇智和 · 一键 Video Workspace",
             font_size=22, color=C_WHITE, align=PP_ALIGN.CENTER)

shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(5.0), Inches(3.7), Inches(3.3), Inches(0.02))
shape.fill.solid()
shape.fill.fore_color.rgb = C_AURORA
shape.line.fill.background()

add_multi_para(slide, Inches(1.5), Inches(4.0), Inches(10.3), Inches(2.5),
               [
                   "感谢评委老师的耐心审阅",
                   "",
                   "团队：腾昇智和开发团队",
                   "技术栈：Next.js · React · TypeScript · Coze · Electron",
                   "AI 平台：豆包 2.0 Pro · Seedream · Seedance",
                   "",
                   "应用入口：[待填写部署地址]",
                   "测试账号：[待填写测试账号信息]",
               ],
               default_size=13, default_color=C_DIM, align=PP_ALIGN.CENTER, line_spacing_pt=24)

# 底部装饰
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(0), Inches(7.44), SLIDE_W, Inches(0.06))
shape.fill.solid()
shape.fill.fore_color.rgb = C_COOL
shape.line.fill.background()

add_page_num(slide, 28)

# ── 保存最终文件 ────────────────────────────────────────
print(f"[OK] all 28 pages done")
prs.save(OUT_PATH)
print(f"[OK] final saved: {OUT_PATH}")

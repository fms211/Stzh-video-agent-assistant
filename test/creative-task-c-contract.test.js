"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `缺少起始标记：${start}`);
  assert.notEqual(endIndex, -1, `缺少结束标记：${end}`);
  return source.slice(startIndex, endIndex);
}

describe("Task C 图像参数抽屉", () => {
  test("顶部参数条只保留受控触发按钮和可恢复焦点的 ref", () => {
    const bar = read("app/components/CreativeParameterBar.tsx");

    assert.doesNotMatch(bar, /<details\b|<summary\b/);
    assert.doesNotMatch(bar, /IMG_PARAM_CATEGORIES|cws-parameter-menu__popover/);
    assert.match(bar, /imageParametersOpen:\s*boolean/);
    assert.match(bar, /onImageParametersOpenChange:\s*\(open:\s*boolean\)\s*=>\s*void/);
    assert.match(bar, /imageParametersTriggerRef/);
    assert.match(bar, /aria-controls="creative-image-parameter-drawer"/);
    assert.match(bar, /aria-expanded=\{imageParametersOpen\}/);
  });

  test("新抽屉复用既有目录、默认全折叠并只渲染展开分类", () => {
    const drawerPath = path.join(root, "app/components/CreativeImageParameterDrawer.tsx");
    assert.ok(fs.existsSync(drawerPath), "需要新增 CreativeImageParameterDrawer.tsx");
    const drawer = read("app/components/CreativeImageParameterDrawer.tsx");

    assert.match(drawer, /IMG_PARAM_CATEGORIES/);
    assert.match(drawer, /new Set<[^>]+>\(\)/, "默认展开集合必须为空");
    assert.match(drawer, /expandedCategories\.has\(/);
    assert.match(drawer, /expandedCategories\.has\([^)]*\)\s*&&[\s\S]*category\.items\.map/);
    assert.match(drawer, /category\.items\.flatMap\([\s\S]*?values/);
    assert.match(drawer, /selectedParams\.length/);
    assert.match(drawer, /onSelectedParamsChange\(\[\]\)/);
    assert.match(drawer, /aria-pressed=\{selectedParams\.includes\(value\)\}/);
  });

  test("工作区在 inspector 与 image-parameters 间切换并恢复 rail", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(workspace, /CreativeImageParameterDrawer/);
    assert.match(workspace, /"inspector"\s*\|\s*"image-parameters"/);
    assert.match(workspace, /imageParameterReturnModeRef/);
    assert.match(workspace, /layout\.rightMode\s*===\s*"rail"[\s\S]*setRightMode\("docked"\)/);
    assert.match(workspace, /imageParameterReturnModeRef\.current\s*===\s*"rail"[\s\S]*setRightMode\("rail"\)/);
    assert.match(workspace, /layout\.leftMode\s*===\s*"overlay"[\s\S]*setLeftMode\("rail"\)/);
  });

  test("drawer overlay 的 Escape、scrim、焦点进入与触发器恢复都可追踪", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(workspace, /imageParameterCloseRef\.current\?\.focus\(\)/);
    assert.match(workspace, /imageParametersTriggerRef\.current\?\.focus\(\)/);
    assert.match(workspace, /event\.key\s*!==\s*"Escape"/);
    assert.match(workspace, /onClick=\{closeActiveOverlay\}/);
    assert.match(workspace, /activeOverlay\s*===\s*"right"[\s\S]*inert/);
    assert.match(workspace, /activeOverlay\s*===\s*"left"[\s\S]*inert/);
  });

  test("抽屉视觉为深空透明玻璃、短淡入与长列表 content-visibility，并保留 40px 触达面积", () => {
    const css = read("app/globals.css");
    const drawerCss = between(css, "/* Task C: image parameter drawer */", "/* Task C: image parameter drawer end */");

    assert.doesNotMatch(css, /\.cws-parameter-menu__popover/);
    assert.doesNotMatch(drawerCss, /linear-gradient|radial-gradient|#fff(?:fff)?\b|white\b/i);
    assert.match(drawerCss, /backdrop-filter:\s*blur/);
    assert.match(drawerCss, /content-visibility:\s*auto/);
    assert.match(drawerCss, /animation-duration:\s*(?:[1-9]\d?|1\d\d)ms/);
    assert.match(drawerCss, /cws-image-parameter-drawer__clear,[\s\S]*min-height:\s*40px/);
    assert.match(drawerCss, /cws-image-parameter-drawer__close\s*\{[\s\S]*width:\s*40px[\s\S]*height:\s*40px/);
  });
});

describe("Task C 拖拽与 reduced-motion", () => {
  test("左坞 pointermove 仅通过 rAF 调用 width helper，结束时取消帧并只提交一次 store", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    const helper = between(dock, "const applyInlineWidth", "const startResize");
    const move = between(dock, "const moveResize", "const stopResize");
    const stop = between(dock, "const stopResize", "const resizeWithKeyboard");

    assert.match(helper, /style\.width/);
    assert.match(helper, /style\.minWidth/);
    assert.match(move, /requestAnimationFrame/);
    assert.match(move, /applyInlineWidth\(dragState\.current\.latestWidth\)/);
    assert.doesNotMatch(move, /onWidthChange/);
    assert.match(stop, /cancelAnimationFrame\(resizeFrameRef\.current\)/);
    assert.equal((stop.match(/onWidthChange\(/g) || []).length, 1);
    assert.match(stop, /Math\.max\([^)]*LEFT_MIN[\s\S]*Math\.min\([^)]*maxWidth/);
    assert.match(dock, /useEffect\(\(\) => \(\) => \{[\s\S]*cancelAnimationFrame\(resizeFrameRef\.current\)/);
  });

  test("右栏 pointermove 仅通过 rAF 调用 width helper，结束时取消帧并只提交一次 store", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    const helper = between(workspace, "const applyRightInlineWidth", "const startRightResize");
    const move = between(workspace, "const moveRightResize", "const stopRightResize");
    const stop = between(workspace, "const stopRightResize", "const resizeRightWithKeyboard");

    assert.match(helper, /style\.width/);
    assert.match(helper, /style\.minWidth/);
    assert.match(move, /requestAnimationFrame/);
    assert.match(move, /applyRightInlineWidth\(rightDragState\.current\.latestWidth\)/);
    assert.doesNotMatch(move, /layoutStore\.setRightWidth/);
    assert.match(stop, /cancelAnimationFrame\(rightResizeFrameRef\.current\)/);
    assert.equal((stop.match(/layoutStore\.setRightWidth\(/g) || []).length, 1);
    assert.match(workspace, /useEffect\(\(\) => \(\) => \{[\s\S]*cancelAnimationFrame\(rightResizeFrameRef\.current\)/);
  });

  test("拖拽禁用 layout animation，layout transition 不使用 spring", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(dock, /layout=\{resizing\s*\?\s*false\s*:\s*"size"\}/);
    assert.match(workspace, /layout=\{rightResizing\s*\?\s*false\s*:\s*"size"\}/);
    assert.doesNotMatch(dock, /transition=\{\{\s*layout:[^}]*panelSpring/);
    assert.doesNotMatch(workspace, /transition=\{\{\s*layout:[^}]*panelSpring/);
  });

  test("reduced-motion 的左右 dock 变体仅改变不超过 80ms 的 opacity", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(dock, /reducedMotion\s*\?\s*\{\s*opacity:/);
    assert.match(workspace, /reducedMotion\s*\?\s*\{\s*opacity:/);
    assert.match(dock, /reducedMotionDuration/);
    assert.match(workspace, /reducedMotionDuration/);
    assert.doesNotMatch(dock, /reducedMotion\s*\?\s*\{[^}]*\b(?:x|scale):/);
    assert.doesNotMatch(workspace, /reducedMotion\s*\?\s*\{[^}]*\b(?:x|scale):/);
  });

  test("左右 overlay 打开后聚焦操作面板，关闭后恢复各自触发按钮", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(dock, /layoutMode\s*===\s*"overlay"[\s\S]*panelFocusRef\.current\?\.focus\(\)/);
    assert.match(dock, /returnFocusRef\?\.current\s*\?\?\s*railTriggerRef\.current/);
    assert.match(dock, /\)\?\.focus\(\)/);
    assert.match(workspace, /rightPanelRef\.current\?\.querySelector/);
    assert.match(workspace, /rightTriggerRef\.current\?\.focus\(\)/);
  });
});

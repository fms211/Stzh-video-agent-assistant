"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("web exposes the three-part creative workflow without replacing Coze chat", () => {
  const home = read("app/components/HomeClient.tsx");
  const chat = read("app/components/ChatFlow.tsx");
  const core = read("app/components/CreativeConversationCore.tsx");
  const workspace = read("app/components/CreativeWorkspace.tsx");
  const nav = read("app/components/NavigationBar.tsx");
  const transition = read("app/components/PageTransition.tsx");

  // 协作面板经 collabPanel prop 注入（核心不再直接渲染；UnifiedCreativeComposer 组装）
  assert.match(core, /collabPanel/);
  assert.match(chat, /CreativeConversationCore/);
  assert.match(home, /CreativeWorkspace/);
  assert.match(home, /ModelRoleCenter/);
  assert.match(workspace, /CreativeParameterBar/);
  assert.match(workspace, /UnifiedCreativeComposer/);
  assert.match(workspace, /CreativeContextInspector/);
  assert.match(home, /<ModelRoleCenter\s+accessMode=\{workspaceMode\}/);
  assert.match(home, /submitPromptRef\.current/);
  // 对话核心经 CreativeWorkspace 渲染（ChatFlow 兼容 wrapper 已不直接挂载，08-29 Task 13）
  assert.doesNotMatch(home, /<ChatFlow/);
  assert.match(chat, /CreativeConversationCore/);
  const collaborative = read("app/components/CollaborativeRunPanel.tsx");
  assert.match(collaborative, /运行事件/);
  assert.match(collaborative, /agent-runs\/\$\{target\.id\}/);
  assert.match(collaborative, /finalInstruction:\s*instruction/);
  assert.match(collaborative, /confirmed\.task\.id/);
  assert.match(collaborative, /creative-projects\/\$\{encodeURIComponent\(projectId\)\}\/team/);
  assert.match(collaborative, /teamRoleIds/);
  assert.doesNotMatch(chat, /onDispatch=\{\(instruction\) => requestPrompt/);
  assert.match(nav, /key:\s*"studio"/);
  assert.match(nav, /key:\s*"modelCenter"/);
  assert.match(transition, /"studio"/);
  assert.match(transition, /"modelCenter"/);
  // 任务链路断言迁到 ConversationCore（ChatFlow 已 wrapper 化，08-29 Task 9）
  assert.match(core, /uploadAttachments/);
  assert.match(core, /createTask/);
  assert.match(core, /getTask/);
  assert.doesNotMatch(core, /检索知识库…|构建分镜脚本…|thinkingStages/);
  assert.doesNotMatch(core, /\/api\/agent/);
  assert.match(read("app/lib/auth.ts"), /\/api\/attachments/);
});

test("creative studio keeps prompt composition and the model-backed assistant in one resizable page", () => {
  const wrapper = read("app/components/CreativeStudio.tsx");
  const workspace = read("app/components/CreativeWorkspace.tsx");
  const assistant = read("app/components/ModelAssistantPanel.tsx");
  // CreativeStudio 已转为 wrapper（08-29 Task 13）：双区组合职责移交 CreativeWorkspace
  assert.match(wrapper, /CreativeWorkspace/);
  assert.match(workspace, /CreativeParameterBar/);
  assert.match(workspace, /WorkspaceSessionDock|UnifiedCreativeComposer/);
  assert.match(workspace, /CreativeContextInspector/);
  assert.match(assistant, /OPC 参数上下文/);
  assert.match(assistant, /remoteEnabled/);
});

test("model and role center treats keys as write-only and generates a reviewable role card", () => {
  const center = read("app/components/ModelRoleCenter.tsx");
  const providerForm = read("app/components/ModelProviderForm.tsx");
  const css = read("app/globals.css");
  assert.match(center, /ModelProviderForm/);
  assert.match(providerForm, /type="password"/);
  assert.match(center, /AI 生成角色卡/);
  assert.match(center, /确认保存角色/);
  assert.match(center, /hasSecret/);
  assert.match(css, /\.model-center\s*\{/);
  assert.match(css, /\.model-center__tabs\s*\{/);
  assert.match(css, /\.model-center__plugin-tab\s+\.center-card--plugins\s*\{/);
  assert.match(css, /\.model-center__plugin-tab\s+\.plugin-warning\s*\{/);
});

test("unified workspace reserves navigation space and exposes real dock controls", () => {
  const workspace = read("app/components/CreativeWorkspace.tsx");
  const dock = read("app/components/WorkspaceSessionDock.tsx");
  const css = read("app/globals.css");

  assert.match(css, /--workspace-nav-clearance/);
  assert.match(css, /\.cws-workspace[\s\S]*padding-top:\s*var\(--workspace-nav-clearance\)/);
  assert.match(css, /\.cws-center[\s\S]*overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width:\s*959px\)[\s\S]*\.cws-parameter-bar__grow\s*\{\s*display:\s*none/);
  assert.match(dock, /onOpenSettings/);
  assert.match(dock, /settingsTriggerRef/);
  assert.match(dock, /aria-label="打开个性化设置"/);
  assert.match(workspace, /rightOverlayOpen/);
  assert.match(workspace, /aria-label="打开上下文检查器"/);
  assert.match(workspace, /onClose=/);
  assert.equal((workspace.match(/<CreativeContextInspector/g) || []).length, 1, "检查器必须保持单实例常驻");
  assert.match(workspace, /cws-right__rail-layer/);
  assert.match(workspace, /cws-right__inspector-layer/);
  assert.match(workspace, /cws-side-scrim/);
  assert.match(css, /\.cws-side-scrim\s*\{/);

  const welcomeGlass = css.match(/\.cws-center\s+\.chat-welcome\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(welcomeGlass, /linear-gradient/);
  assert.match(welcomeGlass, /backdrop-filter:\s*blur/);
  assert.match(welcomeGlass, /background:\s*color-mix\([^;]*transparent/);
});

test("parameter bar exposes style, camera move and image parameter controls from the existing OPC knowledge", () => {
  const bar = read("app/components/CreativeParameterBar.tsx");
  const drawer = read("app/components/CreativeImageParameterDrawer.tsx");
  assert.match(bar, /STYLES/);
  assert.match(bar, /BASIC_MOVES/);
  assert.match(bar, /COMBO_MOVES/);
  assert.doesNotMatch(bar, /IMG_PARAM_CATEGORIES/);
  assert.match(drawer, /IMG_PARAM_CATEGORIES/);
  assert.match(bar, /aria-label="创作风格"/);
  assert.match(bar, /aria-label="镜头运动"/);
  assert.match(bar, /图像参数/);
});

"use strict";

// 08-28 Hermes 插件中心 — B-Task 11–15: UI 契约静态测试
// 运行: node --test test/plugin-center-ui-contract.test.js
// 模式: fs.readFileSync + regex 断言（与既有 ui-contract 测试同模式）

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("三主标签与 PluginCenter 骨架（B-Task 11）", () => {
  test("ModelRoleCenter 拆出 models|roles|plugins 三主标签且 URL query 刷新恢复", () => {
    const center = read("app/components/ModelRoleCenter.tsx");
    assert.match(center, /"models"/);
    assert.match(center, /"roles"/);
    assert.match(center, /"plugins"/);
    assert.match(center, /center=|searchParams|URLSearchParams/);
    // 模型和角色表单、write-only key、角色默认模型仍在
    assert.match(center, /ModelProviderForm/);
    const providerForm = read("app/components/ModelProviderForm.tsx");
    assert.match(providerForm, /加密保存连接/);
    assert.match(providerForm, /type="password"/);
    assert.match(providerForm, /获取模型/);
    assert.match(center, /角色默认模型/);
    // 旧"全局受信插件"卡迁入插件标签（不再与两张表单挤三列）
    assert.match(center, /系统受信|全局受信/);
  });

  test("HomeClient 挂载 owner-scoped HTTP PluginCenterAdapter", () => {
    const home = read("app/components/HomeClient.tsx");
    assert.match(home, /createHttpPluginCenterAdapter/);
    assert.doesNotMatch(home, /createMockPluginCenterAdapter/);
    assert.match(home, /dispose/);
    assert.match(home, /pluginCenterAdapter|pluginAdapter/);
  });

  test("PluginCenter 四段 subnav 骨架", () => {
    const pc = read("app/components/plugin-center/PluginCenter.tsx");
    assert.match(pc, /发现/);
    assert.match(pc, /账户插件库/);
    assert.match(pc, /项目插件/);
    assert.match(pc, /恢复与诊断/);
    assert.match(pc, /pluginView|discover|library|project|recovery/);
  });
});

describe("发现、安装向导与账户库（B-Task 12）", () => {
  test("发现页：搜索/筛选/详情抽屉", () => {
    const discover = read("app/components/plugin-center/PluginDiscover.tsx");
    assert.match(discover, /searchCatalog/);
    assert.match(discover, /详情/);
    assert.match(discover, /requestedPermissionTier|权限/);
    assert.match(discover, /签名/);
  });

  test("安装向导：四步 stepper + 独立风险行", () => {
    const flow = read("app/components/plugin-center/PluginInstallFlow.tsx");
    assert.match(flow, /来源/);
    assert.match(flow, /manifest|依赖/);
    assert.match(flow, /权限/);
    assert.match(flow, /沙箱/);
    assert.match(flow, /最终确认|确认安装/);
    // 独立风险行（不能折叠成一条泛化警告）
    assert.match(flow, /未签名/);
    assert.match(flow, /开放互联网/);
    assert.match(flow, /无强沙箱|弱沙箱/);
    // npm/Git/本地来源
    assert.match(flow, /"npm"/);
    assert.match(flow, /"git"/);
    assert.match(flow, /"local"/);
  });

  test("账户库：按 pluginId 分组、引用项目数、被引用卸载禁用", () => {
    const lib = read("app/components/plugin-center/PluginLibrary.tsx");
    assert.match(lib, /listAccountPackages/);
    assert.match(lib, /referencedProjectIds|引用项目/);
    assert.match(lib, /uninstallVersion/);
    assert.match(lib, /SHA-256|contentHash/);
  });
});

describe("项目插件、Generation 与恢复（B-Task 13/14）", () => {
  test("项目插件：选择器、权限档、待重建状态", () => {
    const pp = read("app/components/plugin-center/ProjectPlugins.tsx");
    assert.match(pp, /listProjectBindings/);
    assert.match(pp, /changeProjectVersion/);
    assert.match(pp, /等待重建|待重建/);
    assert.match(pp, /PluginPermissionPicker/);
  });

  test("权限选择器：三档且不得低于最低档", () => {
    const picker = read("app/components/plugin-center/PluginPermissionPicker.tsx");
    assert.match(picker, /"safe"/);
    assert.match(picker, /"standard"/);
    assert.match(picker, /"full"/);
    assert.match(picker, /PERMISSION_TIER_TOO_LOW|requestedPermissionTier/);
  });

  test("Generation 状态：stopping→starting→health-check→healthy/failed 链路文案", () => {
    const status = read("app/components/plugin-center/PluginGenerationStatus.tsx");
    assert.match(status, /starting|重建中/);
    assert.match(status, /healthy|健康/);
    assert.match(status, /failed|失败/);
    assert.match(status, /suspectedPluginIds|疑似插件/);
  });

  test("恢复页四区块 + 隔离数据操作", () => {
    const recovery = read("app/components/plugin-center/PluginRecovery.tsx");
    assert.match(recovery, /当前故障|故障/);
    assert.match(recovery, /疑似插件/);
    assert.match(recovery, /健康快照|last-known-good|lastKnownGoodId/);
    assert.match(recovery, /诊断日志|日志/);
    assert.match(recovery, /enterSafeMode/);
    assert.match(recovery, /rollbackGeneration/);
    assert.match(recovery, /listQuarantined/);
    assert.match(recovery, /restoreQuarantined/);
    assert.match(recovery, /purgeQuarantined/);
    assert.match(recovery, /剩余天数|expiresAt/);
  });

  test("PluginFrame sandbox 无 allow-same-origin + MessageChannel bridge", () => {
    const frame = read("app/components/plugin-center/PluginFrame.tsx");
    assert.match(frame, /sandbox/);
    assert.doesNotMatch(frame, /allow-same-origin/);
    assert.match(frame, /MessageChannel/);
    assert.match(frame, /validateBridgeMessage|bridge/);
  });
});

describe("全站 additive slots（B-Task 15）", () => {
  test("slot registry：12 固定 slot、只追加、拒绝未知", () => {
    const registry = read("app/lib/plugin-center/slot-registry.ts");
    for (const slot of [
      "home.quickActions",
      "chat.composer.actions",
      "chat.message.after",
      "studio.workflowCatalog",
      "studio.promptRail",
      "studio.workbench.toolbar",
      "studio.workbench.inspector",
      "modelCenter.actions",
      "taskCenter.detailActions",
      "gallery.itemActions",
      "stats.cards",
      "settings.sections",
    ]) {
      assert.ok(registry.includes(slot), `registry 缺少 slot: ${slot}`);
    }
    assert.match(registry, /PluginSlotName/);
    assert.match(registry, /order/);
  });

  test("PluginSlot 只渲染 effective contributions，错误 iframe 隔离为错误卡", () => {
    const slot = read("app/components/plugin-slots/PluginSlot.tsx");
    assert.match(slot, /PluginSlotName|slot/);
    assert.match(slot, /effectiveContributions|contributions/);
    assert.match(slot, /错误|error/i);
  });

  test("业务页面声明 additive slot（至少 6 类）", () => {
    const hosts = [
      "app/components/WelcomeScreen.tsx",
      "app/components/CreativeConversationCore.tsx",
      "app/components/ModelRoleCenter.tsx",
      "app/components/TaskCenter.tsx",
      "app/components/GalleryPanel.tsx",
      "app/components/StatsDashboard.tsx",
    ];
    let declared = 0;
    for (const host of hosts) {
      try {
        if (read(host).includes("PluginSlot")) declared += 1;
      } catch {
        // 文件不存在则跳过
      }
    }
    assert.ok(declared >= 6, `至少 6 个业务页挂 PluginSlot，实际 ${declared}`);
  });
});

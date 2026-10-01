// 插件中心 — Mock fixture 目录
// 规划 Task 10 Step 3：至少包含已签名市场工具、未签名 npm 工作流、Git UI 插件、
// 本地 .stzhplugin、请求 full 权限的插件、含新权限的升级版、导致 Generation failed 的包。

import type { PluginManifestV1, PluginSource } from "./types";

type Fixture = {
  manifest: PluginManifestV1;
  source: PluginSource;
  publisher: string;
  signatureStatus: "verified" | "unsigned";
  strongSandboxAvailable: boolean;
  dependencies: Array<{ name: string; version: string }>;
  buildScripts: Array<{ name: string; command: string }>;
  /** Generation 启动时是否触发失败（crash 包）*/
  crashesGeneration?: boolean;
};

const baseManifest = {
  schemaVersion: 1 as const,
  engine: { stzh: ">=2.5.0" },
  contributes: {},
};

export const FIXTURES: Fixture[] = [
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.style-kit",
      name: "风格套件工具箱",
      version: "1.0.0",
      description: "提供风格特征包生成与提示词组装的市场工具（已签名演示插件）",
      entrypoints: { host: "host.js", ui: "ui/index.html" },
      contributes: {
        tools: [
          {
            name: "style_kit.compose",
            description: "组装风格特征包为可执行提示词",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 8000,
          },
        ],
        slots: [{ slot: "studio.workflowCatalog", uiSurfaceId: "style-kit/catalog", order: 1 }],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "catalog", catalogId: "com.stzh.style-kit", version: "1.0.0" },
    publisher: "腾昇智和官方",
    signatureStatus: "verified",
    strongSandboxAvailable: true,
    dependencies: [{ name: "lodash-es", version: "^4.17.21" }],
    buildScripts: [{ name: "postinstall", command: "node ./scripts/verify.js" }],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.style-kit",
      name: "风格套件工具箱",
      version: "2.0.0",
      description: "风格套件第二版：新增批量风格对比与历史包管理",
      entrypoints: { host: "host.js", ui: "ui/index.html" },
      contributes: {
        tools: [
          {
            name: "style_kit.compose",
            description: "组装风格特征包为可执行提示词",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 8000,
          },
          {
            name: "style_kit.compare",
            description: "批量对比多套风格特征包",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 12000,
          },
        ],
        slots: [{ slot: "studio.workflowCatalog", uiSurfaceId: "style-kit/catalog", order: 1 }],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "catalog", catalogId: "com.stzh.style-kit", version: "2.0.0" },
    publisher: "腾昇智和官方",
    signatureStatus: "verified",
    strongSandboxAvailable: true,
    dependencies: [{ name: "lodash-es", version: "^4.17.21" }],
    buildScripts: [{ name: "postinstall", command: "node ./scripts/verify.js" }],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.narrative-flow",
      name: "叙事链工作流（社区）",
      version: "0.3.1",
      description: "社区贡献的未签名 npm 工作流插件：三段式叙事分镜编排",
      entrypoints: { host: "dist/host.js" },
      contributes: {
        workflows: [
          {
            id: "narrative-three-act",
            title: "三幕式叙事短片",
            description: "起承转合自动分镜",
            entryTool: null,
            uiSurfaceId: null,
          },
        ],
        slots: [{ slot: "chat.composer.actions", uiSurfaceId: "narrative/composer-action", order: 2 }],
      },
      requestedPermissionTier: "standard",
      runtimeNetwork: { publicInternet: false },
    },
    source: { type: "npm", spec: "@community/narrative-flow@0.3.1" },
    publisher: "社区开发者 · 星尘",
    signatureStatus: "unsigned",
    strongSandboxAvailable: false,
    dependencies: [],
    buildScripts: [{ name: "prepare", command: "tsc -p ." }],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.git.example.gallery-pro",
      name: "画廊增强 Pro",
      version: "1.2.0",
      description: "来自 Git 仓库的 UI 插件：画廊批量操作与灯箱增强",
      entrypoints: { ui: "panel/index.html" },
      contributes: {
        slots: [
          { slot: "gallery.itemActions", uiSurfaceId: "gallery-pro/actions", order: 1 },
          { slot: "stats.cards", uiSurfaceId: "gallery-pro/stats", order: 3 },
        ],
        pages: [{ id: "gallery-pro.main", title: "画廊增强主页", uiSurfaceId: "gallery-pro/page" }],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "git", url: "https://github.com/example/gallery-pro.git", ref: "v1.2.0" },
    publisher: "Example Works",
    signatureStatus: "unsigned",
    strongSandboxAvailable: false,
    dependencies: [{ name: "picomatch", version: "^4.0.2" }],
    buildScripts: [],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.local-packer",
      name: "本地打包助手",
      version: "0.9.0",
      description: "由 .stzhplugin 包安装的本地演示插件：任务附件快速打包",
      entrypoints: { host: "host.js" },
      contributes: {
        tools: [
          {
            name: "local_packer.zip",
            description: "把当前任务产物打包",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "write",
            timeoutMs: 20000,
          },
        ],
        slots: [{ slot: "taskCenter.detailActions", uiSurfaceId: "local-packer/actions", order: 1 }],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "local", uploadToken: "demo-upload-token", fileName: "local-packer.stzhplugin", contentHash: "" },
    publisher: "本地",
    signatureStatus: "unsigned",
    strongSandboxAvailable: false,
    dependencies: [],
    buildScripts: [],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.risk-runner",
      name: "全权执行器",
      version: "1.0.0",
      description: "请求 full 权限档的演示插件：受控任务创建与 subprocess 请求",
      entrypoints: { host: "host.js" },
      contributes: {
        tools: [
          {
            name: "risk_runner.spawn",
            description: "请求创建受控任务",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "external",
            timeoutMs: 30000,
          },
        ],
      },
      requestedPermissionTier: "full",
      runtimeNetwork: { publicInternet: true, allowedDomains: ["api.example.com"] },
    },
    source: { type: "catalog", catalogId: "com.stzh.risk-runner", version: "1.0.0" },
    publisher: "第三方实验室",
    signatureStatus: "unsigned",
    strongSandboxAvailable: false,
    dependencies: [],
    buildScripts: [{ name: "postinstall", command: "node ./scripts/fetch-binaries.js" }],
  },
  {
    // 权限升级演示：1.0.0 standard → 2.0.0 full
    manifest: {
      ...baseManifest,
      id: "com.stzh.upgrade-demo",
      name: "升级演示插件",
      version: "1.0.0",
      description: "初始仅请求 standard 权限的演示插件",
      entrypoints: { host: "host.js" },
      contributes: {
        tools: [
          {
            name: "upgrade_demo.ping",
            description: "健康检查",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 4000,
          },
        ],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "catalog", catalogId: "com.stzh.upgrade-demo", version: "1.0.0" },
    publisher: "腾昇智和官方",
    signatureStatus: "verified",
    strongSandboxAvailable: true,
    dependencies: [],
    buildScripts: [],
  },
  {
    manifest: {
      ...baseManifest,
      id: "com.stzh.upgrade-demo",
      name: "升级演示插件",
      version: "2.0.0",
      description: "2.0.0 新增公开互联网访问，权限升级为 full——需重新确认",
      entrypoints: { host: "host.js" },
      contributes: {
        tools: [
          {
            name: "upgrade_demo.ping",
            description: "健康检查",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 4000,
          },
          {
            name: "upgrade_demo.fetch",
            description: "公开互联网数据拉取",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "external",
            timeoutMs: 15000,
          },
        ],
      },
      requestedPermissionTier: "full",
      runtimeNetwork: { publicInternet: true, allowedDomains: ["data.example.com"] },
    },
    source: { type: "catalog", catalogId: "com.stzh.upgrade-demo", version: "2.0.0" },
    publisher: "腾昇智和官方",
    signatureStatus: "verified",
    strongSandboxAvailable: true,
    dependencies: [],
    buildScripts: [],
  },
  {
    // Generation failed 演示包
    manifest: {
      ...baseManifest,
      id: "com.stzh.crashy-tool",
      name: "演示故障插件",
      version: "1.0.0",
      description: "启动即崩溃的演示插件——用于验证 Generation 失败与 Safe Mode 恢复链路",
      entrypoints: { host: "host.js" },
      contributes: {
        tools: [
          {
            name: "crashy.explode",
            description: "必然失败",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            risk: "read",
            timeoutMs: 1000,
          },
        ],
      },
      requestedPermissionTier: "standard",
    },
    source: { type: "catalog", catalogId: "com.stzh.crashy-tool", version: "1.0.0" },
    publisher: "腾昇智和官方",
    signatureStatus: "verified",
    strongSandboxAvailable: true,
    dependencies: [],
    buildScripts: [],
    crashesGeneration: true,
  },
];

export function findFixture(catalogId: string, version: string): Fixture | null {
  return FIXTURES.find((f) => f.manifest.id === catalogId && f.manifest.version === version) ?? null;
}

export function sha256Hex(input: string): string {
  // 确定性演示哈希（非加密用途）：FNV-1a 64bit × 4 组合展开为 64 hex
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x7f4a7c15;
  let h4 = 0x2545f491;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = (h1 ^ ch) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + ch * (i + 1)) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h3 = (h3 ^ (ch << (i % 13))) >>> 0;
    h3 = Math.imul(h3, 0xc2b2ae35) >>> 0;
    h4 = (h4 + Math.imul(ch, 0x27d4eb2f)) >>> 0;
  }
  const parts = [h1, h2, h3, h4];
  return parts.map((h) => h.toString(16).padStart(8, "0")).join("").repeat(2).slice(0, 64);
}

"use strict";

// 08-29 — Task 13: 页面导航锁步契约（R1 关键保证）
// 侧重点：PAGES（PageTransition）与 NavigationBar PAGE_TABS 必须一致；
// chat 已移除；studio 为首个页面。HomeClient children 顺序由 Task 13 的合并 commit 保证
// （源码结构断言脆弱且无行为价值——此处专注可验证的事实契约）。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

function extractPages(source) {
  const match = source.match(/const PAGES[\s\S]*?= \[([\s\S]*?)\]/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([a-zA-Z]+)"/g), (m) => m[1]).filter((v) => v.length > 1);
}

describe("页面导航锁步（R1）", () => {
  test("PAGES 恰为 5 项且无 chat/libtv，首个为 studio", () => {
    const transition = read("app/components/PageTransition.tsx");
    const pages = extractPages(transition);
    assert.deepEqual(pages, ["studio", "modelCenter", "tasks", "stats", "gallery"]);
  });

  test("NavigationBar PAGE_TABS 与 PAGES 集合一致", () => {
    const nav = read("app/components/NavigationBar.tsx");
    const transition = read("app/components/PageTransition.tsx");
    assert.match(nav, /export type Page = "studio"/, "Page 类型首项为 studio");
    assert.match(nav, /key:\s*"studio"/);
    assert.doesNotMatch(nav, /key:\s*"chat"/);
    // PAGE_TABS key 集合 == PAGES 集合
    const tabKeys = Array.from(nav.matchAll(/key:\s*"([a-zA-Z]+)"/g), (m) => m[1]);
    const pages = extractPages(transition);
    assert.deepEqual([...tabKeys].sort(), [...pages].sort());
  });

  test("HomeClient 渲染 CreativeWorkspace 且仍传 ModelRoleCenter/TaskCenter", () => {
    const home = read("app/components/HomeClient.tsx");
    assert.match(home, /<CreativeWorkspace/);
    assert.match(home, /<ModelRoleCenter\s+accessMode=\{workspaceMode\}/);
    assert.match(home, /<TaskCenter\s+accessMode=\{workspaceMode\}/);
    assert.doesNotMatch(home, /<ChatFlow/);
    assert.doesNotMatch(home, /<CreativeStudio\s+accessMode=\{workspaceMode\}/);
  });

  test("导航 tab 按钮补 aria-label（Task 13 无障碍要求）", () => {
    const nav = read("app/components/NavigationBar.tsx");
    assert.match(nav, /aria-label=\{tab\.label\}/);
  });
});

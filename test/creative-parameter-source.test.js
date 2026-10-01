"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test, describe, beforeEach } = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

async function load(relativePath) {
  const url = pathToFileURL(path.join(root, relativePath));
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

const semanticHash = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

describe("创意工坊参数真源", () => {
  let knowledge;

  beforeEach(async () => {
    knowledge = await load("app/data/opc-knowledge.ts");
  });

  test("保留 OPC 的 9 个风格分类、67 项风格及原始语义", () => {
    assert.ok(Array.isArray(knowledge.STYLE_CATEGORIES), "知识库应导出 STYLE_CATEGORIES");
    assert.ok(Array.isArray(knowledge.STYLES), "知识库应导出 STYLES");
    assert.equal(knowledge.STYLE_CATEGORIES.length, 9);
    assert.equal(knowledge.STYLES.length, 67);
    assert.equal(
      semanticHash(knowledge.STYLES.map(({ cat, label, prefix }) => ({ cat, label, prefix }))),
      "8ebf836f613fb33aac2f32dde1cecc2a841fb727ef36a7351d75a0927849c226",
    );
  });

  test("图像参数目录保持 8 类、25 行、189 个值的既有语义", () => {
    const categories = knowledge.IMG_PARAM_CATEGORIES;
    assert.equal(categories.length, 8);
    assert.equal(categories.flatMap((category) => category.items).length, 25);
    assert.equal(categories.flatMap((category) => category.items).flatMap((item) => item.values).length, 189);
    assert.equal(semanticHash(categories), "979f37b492f03c275377853e3aeca0ff587cb3441949dd525b52620b5001d063");
  });

  test("运镜、时长和画幅目录保持完整", () => {
    assert.equal(knowledge.BASIC_MOVES.length, 15);
    assert.equal(knowledge.COMBO_MOVES.length, 29);
    assert.ok(Array.isArray(knowledge.DURATIONS), "知识库应导出 DURATIONS");
    assert.deepEqual(knowledge.DURATIONS, Array.from({ length: 12 }, (_, index) => index + 4));
    assert.equal(knowledge.ASPECTS.length, 8);
  });
});

test("OPCPanel 与参数条均从参数真源取参数，参数条以自定义 aria Select 替换原生 select", () => {
  const opc = read("app/components/OPCPanel.tsx");
  const bar = read("app/components/CreativeParameterBar.tsx");
  const selectPath = path.join(root, "app/components/CreativeSelect.tsx");
  const select = read("app/components/CreativeSelect.tsx");
  const css = read("app/globals.css");

  assert.match(opc, /STYLE_CATEGORIES,\s*STYLES/);
  assert.doesNotMatch(opc, /const STYLE_CATEGORIES\s*=/);
  assert.doesNotMatch(opc, /const STYLES\s*=/);
  assert.match(opc, /DURATIONS/);
  assert.match(opc, /ASPECTS/);
  assert.doesNotMatch(opc, /const DURATIONS\s*=/);
  assert.doesNotMatch(opc, /const ASPECTS\s*=/);
  assert.match(bar, /CreativeSelect/);
  assert.doesNotMatch(bar, /<select\b/i);
  assert.match(bar, /value=\{context\.styleId\}/);
  assert.match(bar, /value=\{context\.cameraMoveId\}/);
  assert.doesNotMatch(bar, /context\.styleId\s*\?\?\s*["']{2}/);
  assert.doesNotMatch(bar, /context\.cameraMoveId\s*\?\?\s*["']{2}/);
  assert.ok(fs.existsSync(selectPath), "需要可复用的 CreativeSelect.tsx");
  assert.match(select, /selectedKey=\{value \?\? null\}/);
  assert.match(select, /Select/);
  assert.match(select, /ListBox/);
  assert.match(select, /Popover/);
  assert.doesNotMatch(css, /\.cws-parameter-bar__select/);
});

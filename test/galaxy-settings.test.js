"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const load = () => import(pathToFileURL(path.resolve(__dirname, "../app/lib/galaxy-settings.ts")).href);

test("old, partial and malformed settings produce usable finite configuration", async () => {
  const { normalizeGalaxySettings, DEFAULT_GALAXY_SETTINGS } = await load();
  for (const input of [null, undefined, [], "bad"]) assert.deepEqual(normalizeGalaxySettings(input), DEFAULT_GALAXY_SETTINGS);
  const bounded = normalizeGalaxySettings({ density: 0, speed: Infinity, glowIntensity: NaN, hueShift: 500,
    focal: [-1, 2], rotation: [5, NaN], mouseInteraction: "false" });
  assert.equal(bounded.density, 0.1); assert.equal(bounded.speed, DEFAULT_GALAXY_SETTINGS.speed);
  assert.equal(bounded.glowIntensity, DEFAULT_GALAXY_SETTINGS.glowIntensity); assert.equal(bounded.hueShift, 360);
  assert.deepEqual(bounded.focal, [0, 1]); assert.deepEqual(bounded.rotation, [1, 0]); assert.equal(bounded.mouseInteraction, true);
});

test("configuration instances do not share mutable focal or rotation arrays", async () => {
  const { normalizeGalaxySettings } = await load();
  const first = normalizeGalaxySettings({}); first.focal[0] = 0;
  assert.equal(normalizeGalaxySettings({}).focal[0], 0.5);
});

test("changing a single control preserves the other configured effects across JSON persistence", async () => {
  const { normalizeGalaxySettings } = await load();
  const configured = normalizeGalaxySettings({ density: 2, repulsionStrength: 7, mouseRepulsion: true, transparent: false });
  const restored = normalizeGalaxySettings(JSON.parse(JSON.stringify({ ...configured, speed: 2.3 })));
  assert.equal(restored.speed, 2.3); assert.equal(restored.density, 2);
  assert.equal(restored.repulsionStrength, 7); assert.equal(restored.mouseRepulsion, true); assert.equal(restored.transparent, false);
});

"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeScalarPreferences: normalize, DEFAULT_SCALAR_PREFERENCES: defaults } = require("../app/lib/preference-values.ts");

// Prepared only; execution remains paused until user authorization.
test("corrupted records cannot break export labels or navigation", () => {
  for (const value of [null, undefined, [], "txt", 3, { exportFormat: null, startPage: {} }, { exportFormat: 7, startPage: "removed-page" }]) {
    const result = normalize(value);
    assert.equal(result.exportFormat.toUpperCase(), "MARKDOWN");
    assert.equal(result.startPage, "studio");
  }
  for (const page of ["chat", "opc", "libtv"]) assert.equal(normalize({ startPage: page }).startPage, "studio");
});

test("valid explicit false and permanent retention survive normalization", () => {
  const stored = { notificationSound: false, desktopNotification: false, autoSave: false, particleEffects: false,
    reducedMotion: true, includeTimestamp: false, maxMessages: 1000, historyDays: 0, exportFormat: "txt", startPage: "gallery", cursorTrail: true };
  assert.deepEqual(normalize(stored), { ...stored, cursorTrail: false });
  assert.equal(stored.cursorTrail, true, "reading must not mutate the stored object");
  assert.equal(normalize({ historyDays: 365 }).historyDays, 365, "valid older retention preferences are not silently shortened");
});

test("unsafe message limits do not trim all history or cause invalid slicing", () => {
  for (const maxMessages of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "500", null]) {
    assert.equal(normalize({ maxMessages }).maxMessages, defaults.maxMessages);
  }
  for (const historyDays of [-1, 0.5, Infinity, "0", null]) {
    assert.equal(normalize({ historyDays }).historyDays, 0);
  }
  assert.equal(normalize({ maxMessages: 1 }).maxMessages, 1);
});

test("wrong boolean types and unknown fields are excluded without sharing defaults", () => {
  const result = normalize({ autoSave: "false", includeTimestamp: 0, injected: "ignore" });
  assert.equal(result.autoSave, true);
  assert.equal(result.includeTimestamp, true);
  assert.equal(Object.hasOwn(result, "injected"), false);
  result.autoSave = false;
  assert.equal(normalize(null).autoSave, true);
  assert.deepEqual(normalize(normalize({ startPage: "stats", exportFormat: "json", maxMessages: 300 })),
    normalize({ startPage: "stats", exportFormat: "json", maxMessages: 300 }));
});

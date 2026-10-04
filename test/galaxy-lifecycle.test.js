"use strict";

// Runs the actual component effects against deterministic browser/WebGL mocks.
// Shader compilation, pixels and UI interaction are covered separately in the browser.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const settingsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../app/lib/galaxy-settings.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: settingsModule.exports });
const { normalizeGalaxySettings } = settingsModule.exports;

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    count(type) { return listeners.get(type)?.size || 0; },
  };
}

function harness({ narrow = false, reduced = false, fine = true, failRenderer = false, failShader = false } = {}) {
  const windowMock = Object.assign(target(), { devicePixelRatio: 2 });
  const documentMock = Object.assign(target(), { hidden: false, hasFocus: () => true, activeElement: null, documentElement: {} });
  const scope = target();
  const host = { clientWidth: narrow ? 390 : 1440, clientHeight: 900, closest: () => scope, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const canvases = [];
  host.children = [];
  host.appendChild = canvas => { host.children.push(canvas); };
  documentMock.createElement = tag => {
    assert.equal(tag, "canvas");
    const canvas = Object.assign(target(), { width: 1, height: 1, lost: false, hidden: false,
      remove() { host.children = host.children.filter(child => child !== canvas); } });
    canvases.push(canvas); return canvas;
  };
  const queries = new Map([
    ["(prefers-reduced-motion: reduce)", Object.assign(target(), { matches: reduced })],
    ["(max-width: 720px)", Object.assign(target(), { matches: narrow })],
    ["(pointer: fine)", Object.assign(target(), { matches: fine })],
  ]);
  windowMock.matchMedia = query => queries.get(query);
  let hue = "#5888d8";
  let clock = 0;
  let frameId = 0;
  const frames = new Map();
  const slots = [];
  const effects = new Map();
  let cursor = 0;
  let pending = [];
  const metrics = { renderers: 0, draws: [], removedGeometry: 0, removedProgram: 0, deletedShaders: 0, releasedContexts: 0, layoutReads: 0 };
  host.getBoundingClientRect = () => { metrics.layoutReads++; return { left: 0, top: 0 }; };
  const observers = [];
  class Observer {
    constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  let uniforms;
  class Renderer {
    constructor({ canvas }) {
      if (failRenderer || canvas.lost) throw new Error("WebGL unavailable");
      metrics.renderers++;
      this.dpr = 1;
      this.gl = { canvas, LINK_STATUS: 1, clearColor() {}, getProgramParameter: () => !failShader,
        deleteShader() { metrics.deletedShaders++; }, getExtension: () => ({ loseContext() { metrics.releasedContexts++; canvas.lost = true; } }) };
    }
    setSize(width, height) { this.gl.canvas.width = Math.floor(width * this.dpr); this.gl.canvas.height = Math.floor(height * this.dpr); }
    render() { metrics.draws.push({ time: clock, elapsed: uniforms.uTime.value, mouse: [...uniforms.uMouse.value], active: uniforms.uMouseActiveFactor.value }); }
  }
  class Program {
    constructor(_gl, options) { this.uniforms = uniforms = options.uniforms; this.program = {}; this.vertexShader = {}; this.fragmentShader = {}; }
    remove() { metrics.removedProgram++; }
  }
  class Triangle { remove() { metrics.removedGeometry++; } }
  class Mesh { constructor(_gl, options) { Object.assign(this, options); } }
  const react = {
    useRef(value) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: value }; return slots[slot]; },
    useState(value) { const slot = cursor++; if (!(slot in slots)) slots[slot] = value; return [slots[slot], next => { slots[slot] = next; }]; },
    useEffect(fn, deps) { pending.push({ slot: cursor++, fn, deps }); },
  };
  const jsx = (type, props) => {
    if (props.ref && props["data-background"] === "galaxy") props.ref.current = host;
    return { type, props };
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/components/GalaxyBackground.tsx"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleMock = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: moduleMock.exports,
    module: moduleMock,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "ogl") return { Renderer, Program, Triangle, Mesh };
      if (name.endsWith("galaxy-shaders")) return { GALAXY_VERTEX_SHADER: "vertex", GALAXY_FRAGMENT_SHADER: "fragment" };
      if (name.endsWith("galaxy-settings")) return settingsModule.exports;
      throw new Error(`Unexpected dependency: ${name}`);
    },
    window: windowMock, document: documentMock, ResizeObserver: Observer, MutationObserver: Observer,
    getComputedStyle: () => ({ getPropertyValue: () => hue }),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return {
    metrics, frames, scope, get canvas() { return canvases.at(-1); }, get canvasCount() { return host.children.length; }, window: windowMock, document: documentMock, queries, observers,
    get uniforms() { return uniforms; }, get mode() { return slots[3]; }, get pointerEnabled() { return slots[5]; },
    render(props = {}) {
      cursor = 0;
      pending = [];
      const tree = moduleMock.exports.default(props);
      for (const { slot, fn, deps } of pending) {
        const prior = effects.get(slot);
        if (prior && deps.every((value, index) => Object.is(value, prior.deps[index]))) continue;
        prior?.cleanup?.();
        effects.set(slot, { deps, setup: fn, cleanup: fn() });
      }
      return tree;
    },
    at(time) { clock = time; const scheduled = [...frames.values()]; frames.clear(); for (const fn of scheduled) fn(time); },
    setTheme(color) { hue = color; observers[1].fn(); },
    replayEffects() { for (const effect of effects.values()) effect.cleanup?.(); for (const effect of effects.values()) effect.cleanup = effect.setup(); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
}

test("normal workspace creates one renderer and schedules one animation loop", () => {
  const h = harness(); h.render();
  assert.equal(h.mode, "running"); assert.equal(h.metrics.renderers, 1); assert.equal(h.frames.size, 1);
  assert.equal(h.canvas.width, 1800); assert.equal(h.pointerEnabled, true);
  h.unmount();
});

test("desktop and narrow render rates and DPR stay within their configured budgets", () => {
  for (const narrow of [false, true]) {
    const h = harness({ narrow }); h.render();
    h.metrics.draws.length = 0;
    for (let index = 0; index < 60; index++) h.at(index * 1000 / 60);
    assert.ok(h.metrics.draws.length <= (narrow ? 24 : 30));
    assert.equal(h.canvas.width, narrow ? 390 : 1800);
    h.unmount();
  }
});

test("mouse parallax eases toward the bounded target and performs no layout reads per move", () => {
  const h = harness(); h.render(); const reads = h.metrics.layoutReads;
  h.scope.fire("pointermove", { clientX: 1440, clientY: 0, pointerType: "mouse" });
  for (let index = 0; index < 50; index++) h.at(index * 16);
  assert.ok(h.uniforms.uMouse.value[0] > 0.59 && h.uniforms.uMouse.value[0] <= 0.601);
  assert.ok(h.uniforms.uMouse.value[1] > 0.59 && h.uniforms.uMouse.value[1] <= 0.601);
  assert.equal(h.metrics.layoutReads, reads);
  assert.equal(h.scope.count("click"), 0); assert.equal(h.scope.count("pointerdown"), 0);
  h.unmount();
});

test("leaving the workspace or focusing text input returns parallax toward the center", () => {
  const h = harness(); h.render();
  h.scope.fire("pointermove", { clientX: 1440, clientY: 0, pointerType: "mouse" });
  for (let index = 0; index < 50; index++) h.at(index * 16);
  h.document.activeElement = { matches: () => true };
  h.document.fire("focusin");
  for (let index = 50; index < 160; index++) h.at(index * 16);
  assert.ok(Math.abs(h.uniforms.uMouse.value[0] - 0.5) < 0.001);
  assert.ok(h.uniforms.uMouseActiveFactor.value < 0.001);
  h.unmount();
});

test("coarse pointer, narrow viewport and static preview never attach pointer effects", () => {
  for (const [environment, props] of [[{ fine: false }, {}], [{ narrow: true }, {}], [{}, { staticPreview: true }]]) {
    const h = harness(environment); h.render(props);
    assert.equal(h.scope.count("pointermove"), 0); assert.equal(h.pointerEnabled, false);
    h.unmount();
  }
});

test("system or app reduced motion paints a static frame and does not schedule RAF", () => {
  for (const [environment, props] of [[{ reduced: true }, {}], [{}, { reducedMotion: true }], [{}, { staticPreview: true }]]) {
    const h = harness(environment); h.render(props);
    assert.equal(h.mode, "static"); assert.equal(h.frames.size, 0); assert.equal(h.metrics.draws.length, 1);
    assert.equal(h.uniforms.uTwinkleIntensity.value, 0); assert.equal(h.uniforms.uRotationSpeed.value, 0);
    h.unmount();
  }
});

test("runtime reduced-motion changes cancel and resume the same renderer", () => {
  const h = harness(); h.render();
  const query = h.queries.get("(prefers-reduced-motion: reduce)");
  query.matches = true; query.fire("change");
  assert.equal(h.mode, "static"); assert.equal(h.frames.size, 0); assert.equal(h.scope.count("pointermove"), 0);
  query.matches = false; query.fire("change");
  assert.equal(h.mode, "running"); assert.equal(h.frames.size, 1); assert.equal(h.metrics.renderers, 1);
  h.unmount();
});

test("hide/show and blur/focus stop rendering without jumping over the paused time", () => {
  const h = harness(); h.render(); h.at(0); h.at(16); const elapsed = h.uniforms.uTime.value;
  h.document.hidden = true; h.document.fire("visibilitychange");
  assert.equal(h.frames.size, 0); assert.equal(h.mode, "paused");
  h.document.hidden = false; h.document.fire("visibilitychange"); h.at(50000);
  assert.ok(h.uniforms.uTime.value - elapsed < 0.1);
  h.window.fire("blur"); assert.equal(h.frames.size, 0); assert.equal(h.scope.count("pointermove"), 0);
  h.window.fire("focus"); assert.equal(h.frames.size, 1);
  h.unmount();
});

test("theme and prop changes update uniforms without rebuilding the scene", () => {
  const h = harness(); h.render(); const previousHue = h.uniforms.uHueShift.value;
  h.setTheme("#f0b830"); assert.notEqual(h.uniforms.uHueShift.value, previousHue);
  h.render({ visible: false }); assert.equal(h.mode, "disabled"); assert.equal(h.frames.size, 0);
  h.render({ visible: true }); assert.equal(h.mode, "running");
  assert.equal(h.metrics.renderers, 1);
  h.unmount();
});

test("unsupported WebGL or shader failure reaches static fallback without an animation loop", () => {
  for (const environment of [{ failRenderer: true }, { failShader: true }]) {
    const h = harness(environment); h.render();
    assert.equal(h.mode, "fallback"); assert.equal(h.frames.size, 0); assert.equal(h.scope.count("pointermove"), 0);
    h.unmount();
  }
});

test("context loss stops the loop and selects fallback", () => {
  const h = harness(); h.render(); let prevented = false;
  h.canvas.fire("webglcontextlost", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.mode, "fallback"); assert.equal(h.frames.size, 0);
  assert.equal(h.scope.count("pointermove"), 0);
  h.unmount();
});

test("unmount releases observers, input listeners, RAF and GPU resources", () => {
  const h = harness(); h.render(); h.unmount();
  assert.equal(h.frames.size, 0); assert.equal(h.scope.count("pointermove"), 0);
  assert.equal(h.window.count("focus"), 0); assert.equal(h.document.count("visibilitychange"), 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
  assert.equal(h.metrics.removedGeometry, 1); assert.equal(h.metrics.removedProgram, 1);
  assert.equal(h.metrics.deletedShaders, 2); assert.equal(h.metrics.releasedContexts, 1);
});

test("all public configuration changes update GPU uniforms without a second renderer", () => {
  const h = harness(); h.render();
  const settings = normalizeGalaxySettings({ density: 2, speed: 1.7, glowIntensity: 0.6, saturation: 0.8,
    hueShift: 240, useThemeHue: false, twinkleIntensity: 0.7, rotationSpeed: 0.3,
    mouseRepulsion: true, repulsionStrength: 5, autoCenterRepulsion: 6, transparent: false,
    focal: [0.2, 0.7], rotation: [0.5, -0.2], starSpeed: 1.2 });
  h.render({ settings });
  for (const [field, uniform] of Object.entries({ density: "uDensity", speed: "uSpeed", glowIntensity: "uGlowIntensity",
    saturation: "uSaturation", hueShift: "uHueShift", twinkleIntensity: "uTwinkleIntensity", rotationSpeed: "uRotationSpeed",
    mouseRepulsion: "uMouseRepulsion", repulsionStrength: "uRepulsionStrength", autoCenterRepulsion: "uAutoCenterRepulsion", transparent: "uTransparent" })) {
    assert.equal(h.uniforms[uniform].value, settings[field]);
  }
  assert.ok(Math.abs(h.uniforms.uFocal.value[0] - 0.2) < 0.0001);
  assert.ok(Math.abs(h.uniforms.uRotation.value[1] + 0.2) < 0.0001);
  h.at(0); assert.ok(Math.abs(h.uniforms.uStarSpeed.value - h.uniforms.uTime.value * 1.2 / 10) < 0.0001);
  const hue = h.uniforms.uHueShift.value; h.setTheme("#f0b830"); assert.equal(h.uniforms.uHueShift.value, hue);
  assert.equal(h.metrics.renderers, 1);
  h.unmount();
});

test("official mouse interaction switch and animation pause take effect independently", () => {
  const h = harness(); h.render({ settings: normalizeGalaxySettings({ mouseInteraction: false }) });
  assert.equal(h.mode, "running"); assert.equal(h.scope.count("pointermove"), 0);
  h.render({ settings: normalizeGalaxySettings({ disableAnimation: true }) });
  assert.equal(h.mode, "static"); assert.equal(h.frames.size, 0); assert.equal(h.scope.count("pointermove"), 0);
  h.render({ settings: normalizeGalaxySettings({ disableAnimation: false }) });
  assert.equal(h.mode, "running"); assert.equal(h.metrics.renderers, 1);
  h.unmount();
});

// Reproduce React Strict Mode's setup -> cleanup -> setup on the SAME component.
test("Strict Mode replay owns a fresh context and leaves exactly one visible galaxy canvas", () => {
  const h = harness(); h.render(); const first = h.canvas;
  h.replayEffects();
  assert.equal(first.lost, true); assert.notEqual(h.canvas, first);
  assert.equal(h.mode, "running"); assert.equal(h.canvas.hidden, false);
  assert.equal(h.canvasCount, 1); assert.equal(h.frames.size, 1);
  assert.equal(h.scope.count("pointermove"), 1); assert.equal(h.metrics.renderers, 2);
  h.unmount(); assert.equal(h.canvasCount, 0); assert.equal(h.frames.size, 0);
});

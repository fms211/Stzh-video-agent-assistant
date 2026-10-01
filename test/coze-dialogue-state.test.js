const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCozeGlow, cozeIdleFrame, cozeDialoguePhase, DEFAULT_COZE_GLOW } = require('../app/lib/coze-dialogue-settings.ts');

test('glow preferences migrate missing fields and reject non-finite numbers / CSS injection', () => {
  const settings = normalizeCozeGlow({ glowIntensity: Infinity, coneSpread: -5, edgeSensitivity: 200, backgroundColor: 'url(https://invalid.test)', colors: ['#123456', 'var(--bad)', null] });
  assert.equal(settings.glowIntensity, DEFAULT_COZE_GLOW.glowIntensity);
  assert.equal(settings.coneSpread, 5);
  assert.equal(settings.edgeSensitivity, 80);
  assert.equal(settings.backgroundColor, DEFAULT_COZE_GLOW.backgroundColor);
  assert.deepEqual(settings.colors, ['#123456', DEFAULT_COZE_GLOW.colors[1], DEFAULT_COZE_GLOW.colors[2]]);
  assert.deepEqual(normalizeCozeGlow(null), DEFAULT_COZE_GLOW);
});
test('idle frame targets the real star but stays within asymmetric sidebars and short screens', () => {
  for (const area of [{ left: 360, top: 180, width: 960, height: 520 }, { left: 72, top: 200, width: 284, height: 180 }, { left: 20, top: 80, width: 360, height: 420 }]) {
    const box = cozeIdleFrame(area, { x: 700, y: 450 }, 180);
    assert.ok(box.x >= 0 && box.y >= 0);
    assert.ok(box.x + box.width <= area.width && box.y + box.height <= area.height);
  }
  const centered = cozeIdleFrame({ left: 100, top: 200, width: 1000, height: 600 }, { x: 650, y: 500 });
  assert.equal(centered.x + centered.width / 2 + 100, 650);
  assert.equal(centered.y + centered.height / 2 + 200, 500);
});
test('a transition belongs only to its accepted submission; history and switching never reopen', () => {
  const state = { scope: 'account:session-a', ready: true, hasMessages: false, firstSubmission: 0, panelOpen: false };
  assert.equal(cozeDialoguePhase(state, null), 'idle');
  assert.equal(cozeDialoguePhase({ ...state, ready: false }, null), 'loading');
  const sent = { ...state, hasMessages: true, firstSubmission: 2 };
  assert.equal(cozeDialoguePhase(sent, 'account:session-a:2'), 'opening');
  assert.equal(cozeDialoguePhase({ ...sent, scope: 'account:session-b' }, 'account:session-a:2'), 'active');
  assert.equal(cozeDialoguePhase({ ...sent, firstSubmission: 0 }, 'account:session-a:0'), 'active');
  assert.equal(cozeDialoguePhase(sent, null), 'active');
});

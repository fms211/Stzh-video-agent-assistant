/*!
 * Adapted from React Bits Galaxy by David Haz (DavidHDev).
 * Copyright (c) 2026 David Haz. Full notice also shipped at /licenses/react-bits-galaxy.txt.
 * MIT + Commons Clause. Full copyright and license: docs/third-party-notices/react-bits-galaxy.md.
 * Adapted lifecycle, bounded pointer input and transparent/opaque background settings.
 */
export const GALAXY_VERTEX_SHADER = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
vUv = uv;
gl_Position = vec4(position, 0, 1);
}
`;

export const GALAXY_FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uMouseActiveFactor;
uniform bool uMouseRepulsion;
uniform float uRepulsionStrength;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
varying vec2 vUv;
#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0
float Hash21(vec2 p) {
p = fract(p * vec2(123.34, 456.21));
p += dot(p, p + 45.32);
return fract(p.x * p.y);
}
float tri(float x) {
return abs(fract(x) * 2.0 - 1.0);
}
float tris(float x) {
float t = fract(x);
return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}
float trisn(float x) {
float t = fract(x);
return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}
vec3 hsv2rgb(vec3 c) {
vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float Star(vec2 uv, float flare) {
float d = length(uv);
float m = (0.05 * uGlowIntensity) / max(d, 0.001);
float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
m += rays * flare * uGlowIntensity;
uv *= MAT45;
rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
m += rays * 0.3 * flare * uGlowIntensity;
m *= smoothstep(1.0, 0.2, d);
return m;
}
vec3 StarLayer(vec2 uv) {
vec3 col = vec3(0.0);
vec2 gv = fract(uv) - 0.5;
vec2 id = floor(uv);
for (int y = -1; y <= 1; y++) {
for (int x = -1; x <= 1; x++) {
vec2 offset = vec2(float(x), float(y));
vec2 si = id + vec2(float(x), float(y));
float seed = Hash21(si);
float size = fract(seed * 345.32);
float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;
float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
float grn = min(red, blu) * seed;
vec3 base = vec3(red, grn, blu);
float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
hue = fract(hue + uHueShift / 360.0);
float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
float val = max(max(base.r, base.g), base.b);
base = hsv2rgb(vec3(hue, sat, val));
vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
float star = Star(gv - offset - pad, flareSize);
vec3 color = base;
float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
twinkle = mix(1.0, twinkle, uTwinkleIntensity);
star *= twinkle;
col += star * size * color;
}
}
return col;
}
void main() {
vec2 focalPx = uFocal * uResolution.xy;
vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
if (uAutoCenterRepulsion > 0.0) {
float centerDist = length(uv);
vec2 repulsion = uv / max(centerDist, 0.001) * (uAutoCenterRepulsion / (centerDist + 0.1));
uv += repulsion * 0.05;
} else if (uMouseRepulsion) {
vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
vec2 fromMouse = uv - mousePosUV;
float mouseDist = length(fromMouse);
vec2 repulsion = fromMouse / max(mouseDist, 0.001) * (uRepulsionStrength / (mouseDist + 0.1));
uv += repulsion * 0.05 * uMouseActiveFactor;
} else {
uv += (uMouse - vec2(0.5)) * 0.1 * uMouseActiveFactor;
}
float autoRotAngle = uTime * uRotationSpeed;
mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
uv = autoRot * uv;
uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;
vec3 col = vec3(0.0);
for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
float depth = fract(i + uStarSpeed * uSpeed);
float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
float fade = depth * smoothstep(1.0, 0.9, depth);
col += StarLayer(uv * scale + i * 453.32) * fade;
}
float alpha = uTransparent ? min(smoothstep(0.0, 0.3, length(col)), 1.0) : 1.0;
gl_FragColor = vec4(col, alpha);
}
`;

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const ROOT = process.cwd();
const FINAL_DIR = path.join(ROOT, 'design-assets', 'app-icon', 'final');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const MOBILE_ASSETS_DIR = path.join(ROOT, 'Tszh-App', 'assets');
const BUILD_DIR = path.join(ROOT, 'build');
const APP_DIR = path.join(ROOT, 'app');

const paths = {
  icon: path.join(FINAL_DIR, 'master-icon.svg'),
  desktop: path.join(FINAL_DIR, 'master-desktop.svg'),
  mark: path.join(FINAL_DIR, 'master-mark.svg'),
  flat: path.join(FINAL_DIR, 'master-mark-flat.svg'),
  mono: path.join(FINAL_DIR, 'master-mark-monochrome.svg'),
};

const palette = {
  space: '#050A14',
  spaceRaised: '#0D1830',
  light: '#EEF3FB',
  lightEdge: '#D6E1F2',
  amber: '#E89840',
  amberLight: '#FFB870',
  indigo: '#5888D8',
  indigoLight: '#AEC6FF',
  tintedInk: '#17243B',
};

await Promise.all([
  fs.mkdir(FINAL_DIR, { recursive: true }),
  fs.mkdir(PUBLIC_ICONS_DIR, { recursive: true }),
  fs.mkdir(MOBILE_ASSETS_DIR, { recursive: true }),
  fs.mkdir(BUILD_DIR, { recursive: true }),
]);

const [iconSvg, desktopSvg, markSvg, flatSvg, monoSvg] = await Promise.all(
  Object.values(paths).map((file) => fs.readFile(file))
);

function svgBuffer(source) {
  return Buffer.isBuffer(source) ? source : Buffer.from(source);
}

async function renderSvg(source, size, output, options = {}) {
  const image = sharp(svgBuffer(source), { density: 384 }).resize(size, size, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });
  if (options.flatten) {
    image.flatten({ background: options.flatten });
  }
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
}

function frameSvg({
  backgroundStart = palette.spaceRaised,
  backgroundEnd = palette.space,
  markScale = 1,
  markData,
  rounded = 0,
  inset = 0,
  border = null,
}) {
  const markHref = `data:image/svg+xml;base64,${markData.toString('base64')}`;
  const size = 1024 - inset * 2;
  const radius = rounded ? rounded : 0;
  const transform = `translate(${512 - 512 * markScale} ${512 - 512 * markScale}) scale(${markScale})`;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="bg" x1="88" y1="42" x2="936" y2="982" gradientUnits="userSpaceOnUse">
          <stop stop-color="${backgroundStart}"/>
          <stop offset="1" stop-color="${backgroundEnd}"/>
        </linearGradient>
        <radialGradient id="halo" cx="0" cy="0" r="1" gradientTransform="translate(512 406) rotate(90) scale(526)">
          <stop stop-color="${palette.indigo}" stop-opacity=".18"/>
          <stop offset="1" stop-color="${palette.space}" stop-opacity="0"/>
        </radialGradient>
        ${rounded ? `<clipPath id="clip"><rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}"/></clipPath>` : ''}
      </defs>
      <g ${rounded ? 'clip-path="url(#clip)"' : ''}>
        <rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
        <rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="url(#halo)"/>
      </g>
      ${border ? `<rect x="${inset + 2}" y="${inset + 2}" width="${size - 4}" height="${size - 4}" rx="${Math.max(0, radius - 2)}" fill="none" stroke="${border}" stroke-width="4"/>` : ''}
      <g transform="${transform}">
        <image width="1024" height="1024" href="${markHref}"/>
      </g>
    </svg>`;
}

function monochromeFrameSvg({ background, foreground, markScale = 0.76 }) {
  const monoText = monoSvg.toString('utf8').replaceAll('#FFFFFF', foreground);
  return frameSvg({
    backgroundStart: background,
    backgroundEnd: background,
    markScale,
    markData: Buffer.from(monoText),
  });
}

async function pngBuffer(source, size) {
  return sharp(svgBuffer(source), { density: 384 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function createIco(frames) {
  const headerSize = 6;
  const entrySize = 16;
  const tableSize = headerSize + entrySize * frames.length;
  const header = Buffer.alloc(tableSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = tableSize;
  frames.forEach(({ size, buffer }, index) => {
    const entry = headerSize + entrySize * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...frames.map((frame) => frame.buffer)]);
}

async function writeIco(source, output) {
  const sizes = [16, 20, 24, 32, 48, 64, 128, 256];
  const frames = [];
  for (const size of sizes) {
    frames.push({ size, buffer: await pngBuffer(source, size) });
  }
  await fs.writeFile(output, createIco(frames));
}

async function maskPng(input, output, kind) {
  const mask =
    kind === 'circle'
      ? `<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>`
      : `<svg width="512" height="512"><rect width="512" height="512" rx="142" fill="white"/></svg>`;
  await sharp(input)
    .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

function labelSvg(text, width, height, size = 28, color = '#DCE5F5') {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="${size}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="700">${text}</text>
    </svg>`
  );
}

async function buildValidationBoard(files) {
  const width = 1800;
  const height = 1220;
  const board = sharp({
    create: { width, height, channels: 4, background: '#060B15' },
  });

  const card = (x, y, w, h, color = '#0D172A') => ({
    input: Buffer.from(
      `<svg width="${w}" height="${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="28" fill="${color}" stroke="#29436B" stroke-width="2"/></svg>`
    ),
    left: x,
    top: y,
  });

  const composites = [
    {
      input: labelSvg('TENGSHENG ZHIHE · FINAL ICON SYSTEM', 900, 60, 36),
      left: 72,
      top: 46,
    },
    {
      input: labelSvg('01 Orbital Intelligence Core · 03 edge-glow treatment', 1000, 42, 22, '#8FA5C8'),
      left: 72,
      top: 94,
    },
    card(60, 150, 520, 520),
    card(610, 150, 350, 520),
    card(990, 150, 350, 520, '#E9EEF7'),
    card(1370, 150, 370, 520, '#15233C'),
    card(60, 710, 1680, 430),
    { input: files.primary, left: 112, top: 202 },
    { input: files.androidCircle, left: 660, top: 200 },
    { input: files.iosLight, left: 1040, top: 200 },
    { input: files.themed, left: 1428, top: 200 },
    { input: labelSvg('PRIMARY', 180, 40, 24), left: 112, top: 628 },
    { input: labelSvg('ANDROID CIRCLE', 260, 40, 24), left: 660, top: 530 },
    { input: labelSvg('iOS LIGHT', 220, 40, 24, '#20304A'), left: 1040, top: 530 },
    { input: labelSvg('THEMED', 180, 40, 24), left: 1428, top: 530 },
    { input: labelSvg('ACTUAL PIXEL RENDERS', 360, 44, 26), left: 100, top: 756 },
  ];

  const tinySizes = [16, 20, 24, 32, 48, 256];
  let x = 112;
  for (const size of tinySizes) {
    const tiny = await sharp(files.smallSource)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const display = size <= 48 ? size * 5 : 256;
    const enlarged = await sharp(tiny)
      .resize(display, display, { kernel: size <= 48 ? sharp.kernel.nearest : sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    composites.push({ input: enlarged, left: x, top: 850 });
    composites.push({
      input: labelSvg(`${size}px`, 100, 34, 20, '#8FA5C8'),
      left: x,
      top: 850 + display + 20,
    });
    x += display + 78;
  }

  await board.composite(composites).png({ compressionLevel: 9 }).toFile(path.join(FINAL_DIR, 'validation-board.png'));
}

const smallIconSvg = frameSvg({
  backgroundStart: '#101E3A',
  backgroundEnd: '#03070E',
  markScale: 0.9,
  markData: flatSvg,
  rounded: 190,
  inset: 44,
  border: '#334E78',
});
const iosLightSvg = frameSvg({
  backgroundStart: palette.light,
  backgroundEnd: palette.lightEdge,
  markScale: 0.86,
  markData: flatSvg,
});
const iosTintedSvg = monochromeFrameSvg({
  background: '#D7DFEC',
  foreground: palette.tintedInk,
  markScale: 0.8,
});
const adaptiveForegroundSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <g transform="translate(87.04 87.04) scale(.83)">
      <image width="1024" height="1024" href="data:image/svg+xml;base64,${markSvg.toString('base64')}"/>
    </g>
  </svg>`;
const adaptiveMonoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <g transform="translate(61.44 61.44) scale(.88)">
      <image width="1024" height="1024" href="data:image/svg+xml;base64,${monoSvg.toString('base64')}"/>
    </g>
  </svg>`;
const adaptiveBackgroundSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="80" y1="60" x2="944" y2="966" gradientUnits="userSpaceOnUse">
        <stop stop-color="#122342"/>
        <stop offset=".5" stop-color="#07111F"/>
        <stop offset="1" stop-color="#03070E"/>
      </linearGradient>
      <radialGradient id="halo" cx="0" cy="0" r="1" gradientTransform="translate(512 420) rotate(90) scale(500)">
        <stop stop-color="#5888D8" stop-opacity=".18"/>
        <stop offset="1" stop-color="#050A14" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <rect width="1024" height="1024" fill="url(#halo)"/>
  </svg>`;
const splashSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <g transform="translate(256 256) scale(.5)">
      <image width="1024" height="1024" href="data:image/svg+xml;base64,${markSvg.toString('base64')}"/>
    </g>
  </svg>`;
const logoMonoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <g transform="translate(-128 -128) scale(1.25)">
      <image width="1024" height="1024" href="data:image/svg+xml;base64,${monoSvg.toString('base64')}"/>
    </g>
  </svg>`;

await Promise.all([
  fs.copyFile(paths.desktop, path.join(BUILD_DIR, 'icon.svg')),
  fs.copyFile(paths.icon, path.join(PUBLIC_ICONS_DIR, 'icon.svg')),
  renderSvg(desktopSvg, 1024, path.join(PUBLIC_DIR, 'icon.png')),
  renderSvg(iconSvg, 192, path.join(PUBLIC_ICONS_DIR, 'icon-192.png'), { flatten: palette.space }),
  renderSvg(iconSvg, 512, path.join(PUBLIC_ICONS_DIR, 'icon-512.png'), { flatten: palette.space }),
  renderSvg(iconSvg, 512, path.join(PUBLIC_ICONS_DIR, 'icon-maskable-512.png'), { flatten: palette.space }),
  renderSvg(iconSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'icon.png'), { flatten: palette.space }),
  renderSvg(iconSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'ios-icon-dark.png'), { flatten: palette.space }),
  renderSvg(iosLightSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'ios-icon-light.png'), { flatten: palette.light }),
  renderSvg(iosTintedSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'ios-icon-tinted.png'), { flatten: '#D7DFEC' }),
  renderSvg(adaptiveForegroundSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'android-icon-foreground.png')),
  renderSvg(adaptiveBackgroundSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'android-icon-background.png'), { flatten: palette.space }),
  renderSvg(adaptiveMonoSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'android-icon-monochrome.png')),
  renderSvg(splashSvg, 1024, path.join(MOBILE_ASSETS_DIR, 'splash-icon.png')),
  renderSvg(smallIconSvg, 48, path.join(MOBILE_ASSETS_DIR, 'favicon.png'), { flatten: palette.space }),
  renderSvg(logoMonoSvg, 512, path.join(MOBILE_ASSETS_DIR, 'logo-mark-monochrome.png')),
  renderSvg(smallIconSvg, 180, path.join(PUBLIC_ICONS_DIR, 'apple-touch-icon.png'), { flatten: palette.space }),
]);

await Promise.all([
  writeIco(smallIconSvg, path.join(BUILD_DIR, 'icon.ico')),
  writeIco(smallIconSvg, path.join(APP_DIR, 'favicon.ico')),
]);

const previewComposite = await sharp(Buffer.from(adaptiveBackgroundSvg), { density: 384 })
  .resize(512, 512)
  .composite([{ input: await pngBuffer(adaptiveForegroundSvg, 512) }])
  .png()
  .toBuffer();
const previewPath = path.join(FINAL_DIR, 'android-adaptive-preview.png');
await fs.writeFile(previewPath, previewComposite);
const circlePath = path.join(FINAL_DIR, 'android-circle-preview.png');
const squirclePath = path.join(FINAL_DIR, 'android-squircle-preview.png');
await Promise.all([
  maskPng(previewPath, circlePath, 'circle'),
  maskPng(previewPath, squirclePath, 'squircle'),
]);

const [primary, androidCircle, iosLight, themed, smallSource] = await Promise.all([
  pngBuffer(iconSvg, 416),
  sharp(circlePath).resize(300, 300).png().toBuffer(),
  pngBuffer(iosLightSvg, 300),
  pngBuffer(monochromeFrameSvg({ background: '#243B66', foreground: '#D8E5FF', markScale: 0.8 }), 300),
  pngBuffer(smallIconSvg, 512),
]);
await buildValidationBoard({ primary, androidCircle, iosLight, themed, smallSource });

console.log('Generated application icon assets for Electron, Next/PWA, iOS, Android, and Expo.');

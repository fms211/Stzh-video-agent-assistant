import type { GlassSurfaceSettings } from "./glass-surface-settings";

/** Continuous rounded-edge normals plus a feathered mask; never filters content. */
export function glassDisplacementMap(width: number, height: number, radius: number, settings: GlassSurfaceSettings) {
  const band = Math.min(12, Math.min(width, height) * settings.borderWidth * .5);
  const ratio = Math.min(1, 720 / width, 480 / height);
  const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
  const r = radius * ratio, b = band * ratio;
  const canvas = document.createElement("canvas"), mask = document.createElement("canvas");
  canvas.width = mask.width = w; canvas.height = mask.height = h;
  const ctx = canvas.getContext("2d"), maskCtx = mask.getContext("2d");
  if (!ctx || !maskCtx) throw new Error("Glass canvas unavailable");
  const pixels = ctx.createImageData(w, h), alpha = maskCtx.createImageData(w, h);
  const neutral = 255 * settings.brightness / 100;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px=x+.5-w/2, py=y+.5-h/2, qx=Math.abs(px)-(w/2-r), qy=Math.abs(py)-(h/2-r);
    const ox=Math.max(qx,0), oy=Math.max(qy,0), length=Math.hypot(ox,oy);
    const distance=-(length+Math.min(Math.max(qx,qy),0)-r);
    let nx=0, ny=0;
    if(length>0){ nx=ox/length*Math.sign(px); ny=oy/length*Math.sign(py); }
    else if(qx>qy) nx=Math.sign(px); else ny=Math.sign(py);
    const t=b>0?Math.max(0,Math.min(1,1-distance/b)):0, bend=t*t*(3-2*t)*.55, i=(y*w+x)*4;
    pixels.data[i]=Math.round(128+(neutral-128+nx*bend*115)*settings.opacity);
    pixels.data[i+1]=128;
    pixels.data[i+2]=Math.round(128+(neutral-128+ny*bend*115)*settings.opacity);
    pixels.data[i+3]=255;
    alpha.data[i]=alpha.data[i+1]=alpha.data[i+2]=255;
    alpha.data[i+3]=distance>0&&distance<b?Math.round(255*Math.sin(Math.PI*distance/b)**2):0;
  }
  ctx.putImageData(pixels,0,0); maskCtx.putImageData(alpha,0,0);
  return { image: canvas.toDataURL(), mask: mask.toDataURL(), width, height };
}

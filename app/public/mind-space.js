// A quiet inner universe: violet haze, memories and branching thought trails.
// Paint once at viewport resolution; the station keeps its existing animation loop.
function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

function glow(ctx, x, y, radius, color, opacity) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color},${opacity})`);
  gradient.addColorStop(.35, `rgba(${color},${opacity * .5})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function paintMindSpace(ctx, width, height) {
  const rng = random(796), size = Math.min(width, height);
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#26162e');
  base.addColorStop(.42, '#21123b');
  base.addColorStop(1, '#0d1027');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // An asymmetric ribbon of color, inspired by the supplied Ultra reference.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  glow(ctx, width * .04, height * .34, size * .82, '185,78,113', .42);
  glow(ctx, width * .38, height * .09, size * .78, '151,91,240', .62);
  glow(ctx, width * .62, height * .25, size * .65, '112,67,219', .35);
  glow(ctx, width * .94, height * .64, size * .72, '86,79,188', .35);
  glow(ctx, width * .28, height * .96, size * .54, '111,57,167', .25);

  // Small overlapping clouds keep the light from reading as a flat gradient.
  for (let i = 0; i < 28; i++) {
    const x = rng() * width, y = height * (.12 + .22 * Math.sin(x / width * 5) + rng() * .25);
    glow(ctx, x, y, size * (.1 + rng() * .19), '175,124,238', .025 + rng() * .045);
  }
  ctx.restore();

  // Organic branches at the edges suggest synapses, leaving the room in focus.
  const clusters = [
    [[.08,.32],[.17,.19],[.28,.23],[.22,.08],[.04,.08],[.015,.51],[.2,.47],[.29,.39]],
    [[.87,.6],[.95,.42],[.81,.31],[.98,.21],[.74,.48],[.76,.73],[.94,.82],[.99,.98]],
    [[.24,.88],[.1,.77],[.03,.91],[.16,.99],[.36,.96]],
  ];
  const links = [[0,1],[1,2],[1,3],[0,4],[0,5],[0,6],[6,7]];
  for (const points of clusters) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#c49aff';
    ctx.shadowBlur = 9;
    for (const [from, to] of links) {
      if (!points[from] || !points[to]) continue;
      const [x1,y1] = points[from], [x2,y2] = points[to];
      ctx.beginPath();
      ctx.moveTo(x1 * width, y1 * height);
      ctx.bezierCurveTo((x1 + (x2-x1) * .6) * width, y1 * height,
        (x2 - (x2-x1) * .55) * width, y2 * height, x2 * width, y2 * height);
      ctx.strokeStyle = 'rgba(196,158,245,.17)';
      ctx.lineWidth = .8;
      ctx.stroke();
    }
    ctx.restore();
    for (const [x,y] of points) {
      glow(ctx, x * width, y * height, 22, '206,162,255', .15);
      ctx.beginPath();
      ctx.arc(x * width, y * height, 1.25, 0, Math.PI * 2);
      ctx.fillStyle = '#d8b8ef99';
      ctx.fill();
    }
  }

  // Fine stars with a handful of soft, bright memory sparks.
  const stars = Math.min(440, Math.max(110, Math.round(width * height / 4300)));
  for (let i = 0; i < stars; i++) {
    const x = rng() * width, y = rng() * height;
    const bright = i % 19 === 0, radius = bright ? 1.1 + rng() * .5 : .35 + rng() * .6;
    if (bright) glow(ctx, x, y, 11, '225,202,255', .26);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239,222,255,${bright ? .85 : .14 + rng() * .36})`;
    ctx.fill();
  }

  // A darker central pocket separates the solid station from the airy backdrop.
  glow(ctx, width * .5, height * .57, size * .64, '10,8,25', .45);
}

export class MindSpace {
  draw(ctx, width, height) {
    // Cap the cache size independently of device DPR to keep mobile memory modest.
    const ratio = Math.min(1, 1600 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = w;
      this.canvas.height = h;
      paintMindSpace(this.canvas.getContext('2d'), w, h);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, width, height);
    ctx.restore();
  }

  destroy() { this.canvas = null; }
}

import { ROOM_EDGE, WALL_HEIGHT, project, stationHash } from './room-layout.js';
import { stationColor } from './station-materials.js';

export function rearWallSegments(layout) {
  const result=[];
  for(const cell of layout.cells)for(const [side,exposed] of [['left',!cell.west],['right',!cell.north]]) {
    if(!exposed)continue;
    for(let index=0;index<12;index++)result.push({cell,side,t0:index/12,t1:(index+1)/12,
      depth:(cell.row+cell.column+(index+.5)/12)*ROOM_EDGE});
  }
  return result;
}
export function wallSegmentPolygon(segment) {
  const {cell,side,t0,t1}=segment,E=ROOM_EDGE;
  const foot=(t)=>side==='left'?project(cell.column*E,(cell.row+t)*E):project((cell.column+t)*E,cell.row*E);
  const a=foot(t0),b=foot(t1);
  return [[a.x,a.y+1],[b.x,b.y+1],[b.x,b.y-WALL_HEIGHT-6],[a.x,a.y-WALL_HEIGHT-6]];
}

export function containsPoint(points,p) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [x,y]=points[i],[px,py]=points[j];
    if((y>p.y)!==(py>p.y)&&p.x<(px-x)*(p.y-y)/(py-y)+x)inside=!inside;
  }
  return inside;
}

// One stable variation per address, so adding another theme never rerolls its neighbors.
export function stationWallProfile(room) {
  const seed = stationHash(room.wallSeed || `${room.address}:${room.title}`);
  return {
    seed,
    frontShape: seed % 3 === 0 ? 'rect' : 'hex',
    windowShape: seed % 2 ? 'hex' : 'rect',
    equipmentSide: seed % 2 ? 'left' : 'right',
    fan: seed % 3 !== 1,
    duct: seed % 3 !== 2,
    message: (room.roomStyle==='disco'?'VINYL CLUB':['SECTOR', 'AIR LOCK', 'STAND BY'][seed % 3]) + ` ${room.address || '796'}`,
  };
}

// Exterior glass belongs between the room and the common front walkway.
// The central opening is always kept clear; internal shared boundaries get no facade.
export function frontWallSegments(layout) {
  const E = ROOM_EDGE, result = [];
  for (const cell of layout.cells) {
    if (!cell.room || cell.room.empty) continue;
    const u = cell.column * E, v = cell.row * E, profile = stationWallProfile(cell.room);
    if (!cell.south) for (const [a, b] of [[.015, .39], [.65, .985]]) {
      result.push({ room: cell.room, shape: profile.frontShape, u0: u + a * E, v0: v + E, u1: u + b * E, v1: v + E });
    }
    if (!cell.east) for (const [a, b] of [[.015, .5], [.5, .985]]) {
      result.push({ room: cell.room, shape: 'rect', u0: u + E, v0: v + a * E, u1: u + E, v1: v + b * E });
    }
  }
  return result;
}

function poly(ctx, points, fill, stroke = null, width = 1) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (const p of points.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  if (fill) { ctx.fillStyle = stationColor(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stationColor(stroke); ctx.lineWidth = width; ctx.stroke(); }
}

export function drawFrontGlass(ctx, segment) {
  const p0 = project(segment.u0, segment.v0), p1 = project(segment.u1, segment.v1);
  const width = Math.abs(segment.u1 - segment.u0) + Math.abs(segment.v1 - segment.v0), H = 76;
  ctx.save();
  ctx.transform((p1.x - p0.x) / width, (p1.y - p0.y) / width, 0, 1, p0.x, p0.y);
  const hole = segment.shape === 'hex'
    ? [[7, -43], [18, -H + 6], [width - 18, -H + 6], [width - 7, -43], [width - 18, -20], [18, -20]]
    : [[5, -H + 6], [width - 5, -H + 6], [width - 5, -20], [5, -20]];
  poly(ctx, hole, 'rgba(162,216,234,.075)', '#99b9c8', 1);
  // A frame with a true transparent opening; no opaque plane under the glass.
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(width, 0); ctx.lineTo(width, -H); ctx.lineTo(0, -H); ctx.closePath();
  ctx.moveTo(...hole[0]); for (const p of hole.slice(1)) ctx.lineTo(...p); ctx.closePath();
  ctx.fillStyle = stationColor('#eef3f4'); ctx.fill('evenodd');
  poly(ctx, [[0, -H], [width, -H], [width, -H + 3], [0, -H + 3]], '#ffffff', '#9cb2bf', .8);
  poly(ctx, [[0, -14], [width, -14], [width, 0], [0, 0]], '#e0eaee', '#aabec9', .7);
  poly(ctx, hole, null, '#c8dce4', 2.2);
  for (const x of [2, width - 4]) {
    ctx.fillStyle = stationColor('#c4d7df'); ctx.fillRect(x, -H + 3, 2, H - 5);
    ctx.fillStyle = stationColor('#e8ffff'); ctx.fillRect(x, -H + 10, 1, 9);
  }
  // Sparse reflections leave the animation readable through the pane.
  ctx.strokeStyle = 'rgba(241,253,255,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(width * .34, -H + 10); ctx.lineTo(width * .47, -H + 27); ctx.stroke();
  ctx.restore();
}

const DOTS = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'],
  D:['110','101','101','101','110'], E:['111','100','110','100','111'], F:['111','100','110','100','100'],
  G:['011','100','101','101','011'], H:['101','101','111','101','101'], I:['111','010','010','010','111'],
  K:['101','101','110','101','101'], L:['100','100','100','100','111'], N:['101','111','111','111','101'],
  M:['101','111','111','101','101'], U:['101','101','101','101','111'], V:['101','101','101','101','010'],
  O:['010','101','101','101','010'], R:['110','101','110','101','101'], S:['011','100','010','001','110'],
  T:['111','010','010','010','010'], Y:['101','101','010','010','010'],
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'], '2':['110','001','010','100','111'],
  '3':['110','001','010','001','110'], '4':['101','101','111','001','001'], '5':['111','100','110','001','110'],
  '6':['011','100','111','101','111'], '7':['111','001','010','010','010'], '8':['111','101','111','101','111'],
  '9':['111','101','111','001','110'],
};

export function drawDotDisplay(ctx, message, x, y, width, elapsed) {
  const step = 1.45, height = 13, text = `${message}   `, run = text.length * 4 * step;
  ctx.fillStyle = stationColor('#20313c'); ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
  ctx.fillStyle = stationColor('#0b141e'); ctx.fillRect(x, y, width, height);
  // Filter dots at the display edge instead of clipping the shared scene.
  const offset = run > width - 6 ? (elapsed / 65) % run : 0;
  for (const start of run > width - 6 ? [-offset, run - offset] : [3]) {
    for (let i = 0; i < text.length; i++) {
      const glyph = DOTS[text[i]]; if (!glyph) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        const px = start + (i * 4 + c) * step;
        if (glyph[r][c] === '1' && px >= 2 && px < width - 2) {
          ctx.fillStyle = stationColor('#f4bf6b'); ctx.fillRect(x + px, y + 3 + r * step, .95, .95);
        }
      }
    }
  }
}

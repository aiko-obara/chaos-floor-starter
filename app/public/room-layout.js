import { normaliseMusic } from './music-room.js';
import { normaliseReferences } from './references.js';

export const ROOM_EDGE = 240;
export const ROOM_GAP = 0;
export const CORRIDOR_WIDTH = 72;
export const WALL_HEIGHT = 128;
export const MAX_ROOMS = 64;
export const MAX_ACTORS = 64;

export function parseAddress(value) {
  const address = String(value || '').toUpperCase().replace(/^F796-/, '');
  const match = /^([A-H])(0[1-8])$/.exec(address);
  return match ? { address, row: match[1].charCodeAt(0) - 65, column: Number(match[2]) - 1 } : null;
}
export function addresses() {
  return Array.from({ length: MAX_ROOMS }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 8))}${String(i % 8 + 1).padStart(2, '0')}`);
}
export const STATION_CENTER = 'D04';
function occupiedCells(rooms) {
  if (!Array.isArray(rooms) || rooms.length > MAX_ROOMS) throw new Error('並べる部屋の数を確認してください。');
  const used = new Set();
  return rooms.map((room) => {
    const cell = parseAddress(room.address);
    if (!cell || used.has(cell.address)) throw new Error('部屋の番地が重複しているか、範囲外です。');
    used.add(cell.address);
    return cell;
  });
}
// Grow around a central room in all four directions, then fill the corners.
export function compactRoomPlan(rooms) {
  const cells = occupiedCells(rooms), center = parseAddress(STATION_CENTER);
  const order = addresses().map(parseAddress).sort((a, b) => {
    const distance = (cell) => (cell.row-center.row)**2 + (cell.column-center.column)**2;
    const angle = (cell) => (Math.atan2(cell.column-center.column, center.row-cell.row)+Math.PI*2)%(Math.PI*2);
    return distance(a)-distance(b) || angle(a)-angle(b);
  });
  return cells.map((cell, index) => ({ from: cell.address, to: order[index].address }));
}
export function nextRoomAddress(rooms) {
  const cells = occupiedCells(rooms);
  if (!cells.length) return STATION_CENTER;
  const used = new Set(cells.map((cell) => cell.address));
  const center = {row:cells.reduce((sum,cell)=>sum+cell.row,0)/cells.length,column:cells.reduce((sum,cell)=>sum+cell.column,0)/cells.length};
  const candidates = addresses().map(parseAddress).filter((cell)=>!used.has(cell.address) && cells.some((other)=>Math.abs(other.row-cell.row)+Math.abs(other.column-cell.column)===1));
  const score = (cell) => {
    const rows = [...cells,cell].map((item)=>item.row), columns = [...cells,cell].map((item)=>item.column);
    const height = Math.max(...rows)-Math.min(...rows)+1, width = Math.max(...columns)-Math.min(...columns)+1;
    const neighbors = cells.filter((other)=>Math.abs(other.row-cell.row)+Math.abs(other.column-cell.column)===1).length;
    return [Math.max(height,width),Math.abs(height-width),height*width,-neighbors,(cell.row-center.row)**2+(cell.column-center.column)**2,cell.row,cell.column];
  };
  return candidates.sort((a,b)=>{
    const x=score(a),y=score(b);
    for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];
    return 0;
  })[0]?.address || null;
}
export function project(u, v) { return { x: u - v, y: (u + v) / 2 }; }
export function unproject(x, y) { return { u: y + x / 2, v: y - x / 2 }; }
export function roomOrigin(address) {
  const parsed = parseAddress(address);
  if (!parsed) return null;
  return project(parsed.column * (ROOM_EDGE + ROOM_GAP), parsed.row * (ROOM_EDGE + ROOM_GAP));
}
const DEFAULT_POSITIONS = [
  [.45, .60], [.74, .39], [.25, .26], [.78, .78], [.28, .83], [.72, .18],
];
export function arrangeActors(actors) {
  return actors.map((actor, index) => {
    const fallback = DEFAULT_POSITIONS[index] || [.14 + (index % 5) * .17, .16 + (Math.floor(index / 5) % 5) * .17];
    const u = Number.isFinite(actor.u) ? actor.u : fallback[0];
    const v = Number.isFinite(actor.v) ? actor.v : fallback[1];
    const { address, ...material } = actor;
    return { ...material, u: Math.max(.08, Math.min(.92, u)), v: Math.max(.08, Math.min(.92, v)) };
  });
}
export function roomFromScene(scene, address) {
  const parsed = parseAddress(address || scene?.address);
  if (!parsed || !scene || !Array.isArray(scene.actors) || !scene.actors.length || scene.actors.length > MAX_ACTORS) throw new Error('番地に置く生成物一式を確認してください。');
  const music=normaliseMusic(scene.music);
  if(music===null || (scene.roomStyle==='disco' && !music))throw new Error('保存したレコードの内容を確認してください。');
  const references=normaliseReferences(scene.references);
  return {
    id: String(scene.id || `room-${parsed.address}`),
    title: String(scene.title || scene.name || '新しいテーマ'),
    prompt: String(scene.prompt || ''), source: scene.source || 'generated',
    accent: /^#[0-9a-f]{6}$/i.test(scene.accent || '') ? scene.accent : '#b8cbd2',
    address: parsed.address,
    actors: arrangeActors(scene.actors),
    ...(references.length?{references}:{}),
    ...(scene.roomStyle==='disco'?{roomStyle:'disco',music}:{}),
  };
}
// Back-to-front order uses the room's position and each material's local depth.
export function actorDepth(actor) { return actor.u + actor.v; }

export function stationHash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function characterFacing(address, actor) {
  if (actor.kind !== 'character') return null;
  if (actor.facing === 'left' || actor.facing === 'right') return actor.facing;
  // At the lateral room edge, keep the face turned into the room.
  const lateral = actor.u - actor.v;
  if (Math.abs(lateral) > .6) return lateral < 0 ? 'right' : 'left';
  return stationHash(`${address}:${actor.id}:facing`) % 2 ? 'right' : 'left';
}

// Connect all occupied addresses with deterministic Manhattan service corridors.
// Adjacent addresses share an edge; transit cells are infrastructure, not new themes.
export function stationLayout(rooms) {
  const targets = rooms.map((room) => {
    const parsed=parseAddress(room.address);
    if(!parsed) throw new Error('接続する番地を確認してください。');
    return { ...parsed, room };
  }).sort((a,b) => a.row-b.row || a.column-b.column);
  const key = (r,c) => `${r},${c}`;
  const filled = new Map();
  const add = (r,c) => filled.set(key(r,c), { row:r, column:c });
  if (targets.length) add(targets[0].row,targets[0].column);
  for (const target of targets.slice(1)) {
    const nearest = [...filled.values()].sort((a,b) => (Math.abs(a.row-target.row)+Math.abs(a.column-target.column))-(Math.abs(b.row-target.row)+Math.abs(b.column-target.column)) || a.row-b.row || a.column-b.column)[0];
    let r=nearest.row,c=nearest.column;
    while(r!==target.row || c!==target.column) {
      const across = stationHash(`${target.address}:${r},${c}`)%2===0;
      if ((across && c!==target.column) || r===target.row) c+=Math.sign(target.column-c);
      else r+=Math.sign(target.row-r);
      add(r,c);
    }
  }
  const known = new Map(targets.map((target) => [key(target.row,target.column),target.room]));
  const cells = [...filled.values()].sort((a,b) => a.row-b.row || a.column-b.column).map((cell) => ({
    ...cell, room:known.get(key(cell.row,cell.column)) || null,
    west:filled.has(key(cell.row,cell.column-1)), east:filled.has(key(cell.row,cell.column+1)),
    north:filled.has(key(cell.row-1,cell.column)), south:filled.has(key(cell.row+1,cell.column)),
  }));
  const corridors = cells.filter((cell) => !cell.south).map((cell) => ({
    row:cell.row, column:cell.column, u0:cell.column*ROOM_EDGE, u1:(cell.column+1)*ROOM_EDGE,
    v0:(cell.row+1)*ROOM_EDGE, v1:(cell.row+1)*ROOM_EDGE+CORRIDOR_WIDTH,
    east:filled.has(key(cell.row,cell.column+1)) && !filled.has(key(cell.row+1,cell.column+1)),
  }));
  const portals = [];
  for (const cell of cells) {
    if(cell.east) portals.push({row:cell.row,column:cell.column,direction:'u'});
    if(cell.south) portals.push({row:cell.row,column:cell.column,direction:'v'});
  }
  const surfaces=[...cells.map((cell)=>({u0:cell.column*ROOM_EDGE,u1:(cell.column+1)*ROOM_EDGE,v0:cell.row*ROOM_EDGE,v1:(cell.row+1)*ROOM_EDGE})),...corridors];
  // Extrude only exposed edges of the complete floor union. A corridor can cover
  // part of a neighboring cell edge, so a simple neighbor flag is insufficient.
  const hull=surfaceHull(surfaces);
  return {cells,corridors,portals,surfaces,hull};
}

export function surfaceHull(surfaces) {
  const hull=[];
  for(const surface of surfaces) for(const axis of ['u','v']) {
    const boundary=surface[axis+'1'],along=axis==='u'?'v':'u';
    let segments=[[surface[along+'0'],surface[along+'1']]];
    for(const other of surfaces) {
      if(other[axis+'0']>boundary || other[axis+'1']<=boundary) continue;
      const low=other[along+'0'],high=other[along+'1'];
      segments=segments.flatMap(([start,end])=>high<=start||low>=end?[[start,end]]:[[start,Math.min(end,low)],[Math.max(start,high),end]].filter(([a,b])=>b>a));
    }
    for(const [start,end] of segments) hull.push(axis==='u'?{u0:boundary,v0:start,u1:boundary,v1:end}:{u0:start,v0:boundary,u1:end,v1:boundary});
  }
  return hull;
}

export const STATION_PROPS = ['console','vending','plant','crates','pump','cabinet'];
export function stationDressings(room) {
  const seed=stationHash(`${room.address}:${room.title}`);
  const slots=room.actors.some((actor)=>actor.id?.startsWith('clutter-'))
    ? [['plant',.08,.10,60]]
    : room.actors.length<=2
    ? [['console',.18,.16,106],['vending',.83,.15,102],['plant',.13,.79,86],['crates',.84,.83,84],['pump',.14,.42,86]]
    : [['plant',.88,.13,82],['cabinet',.13,.20,88],['crates',.13,.85,78]];
  return slots.map(([type,u,v,width],index) => ({
    id:`station-${room.address}-${index}`,type,worldWidth:width,
    u:u+(((seed>>index)&3)-1.5)*.008, v:v+(((seed>>(index+4))&3)-1.5)*.008,
  }));
}

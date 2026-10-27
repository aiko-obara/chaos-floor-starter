import { ROOM_EDGE, WALL_HEIGHT, MAX_ROOMS, parseAddress, addresses, project, unproject, roomOrigin, roomFromScene, actorDepth, CORRIDOR_WIDTH, STATION_PROPS, stationLayout, stationDressings, stationHash, characterFacing } from './room-layout.js';
import { stationWallProfile, frontWallSegments, rearWallSegments, wallSegmentPolygon, containsPoint, drawFrontGlass, drawDotDisplay } from './station-walls.js';
import { addRecordToRoom, createMusicRoom } from './music-room.js';
import { musicEntries, drawDiscoFloor } from './music-renderer.js';
import { normaliseStationStage, stationStructurePlan, stageSurfaceLayout, fixtureBounds, drawStageGround, drawStageFixture } from './station-structures.js';
import { STATION_PALETTE, stationColor } from './station-materials.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof url !== 'string' || !/^\/(assets|generated)\//.test(url) || url.includes('..')) { reject(new Error('素材のURLを確認してください。')); return; }
    const image = new Image();
    const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('素材の読み込みに時間がかかっています。')); }, 30000);
    image.onload = () => { clearTimeout(timer); image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('素材を読み込めませんでした。')); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('素材を読み込めませんでした。')); };
    image.src = url;
  });
}
function polygon(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = stationColor(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stationColor(stroke); ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function serialRoom(room) {
  return { ...room, actors: room.actors.map(({ image, ...actor }) => ({ ...actor })),
    ...(room.music?{music:{...room.music,records:room.music.records.map(({image,...record})=>record)}}:{}) };
}
function orderedRooms(rooms) {
  return [...rooms].sort((a, b) => {
    const aa = parseAddress(a.address), bb = parseAddress(b.address);
    return (aa.row + aa.column) - (bb.row + bb.column) || aa.row - bb.row;
  });
}

export function animationFrame(actor, elapsed) {
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const durations = actor.frameDurations;
  if (Array.isArray(durations) && durations.length === actor.frames && durations.every((value) => Number.isFinite(value) && value >= 40 && value <= 4000)) {
    const total = durations.reduce((sum, value) => sum + value, 0);
    let position = time % total;
    for (let index = 0; index < durations.length; index++) {
      if (position < durations[index]) return index;
      position -= durations[index];
    }
  }
  return Math.floor(time / 1000 * actor.fps) % actor.frames;
}

export class WorldRenderer {
  constructor(canvas, onZoom, onSelection, onActivate) {
    this.canvas = canvas; this.context = canvas.getContext('2d');
    this.onZoom = onZoom; this.onSelection = onSelection;
    this.onActivate=onActivate;
    this.playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.rooms = []; this.selectedAddress = 'A02'; this.hoverAddress = null;
    this.stage={id:'space-station',seed:796};this.structures=[];
    this.wallSurfaces=new Map();this.wallFrame=0;
    this.zoom = 1; this.pan = { x: 0, y: 0 }; this.elapsed = 0; this.lastTime = 0; this.frameId = 0;
    this.loadVersion = 0; this.imageCache = new Map(); this.infrastructure = new Map(); this.pointers = new Map(); this.drag = null;
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    for (const [type, handler] of Object.entries({ pointerdown: (e) => this.pointerDown(e), pointermove: (e) => this.pointerMove(e), pointerup: (e) => this.pointerUp(e), pointercancel: (e) => this.pointerUp(e, true), lostpointercapture: (e) => this.pointerUp(e, true) })) canvas.addEventListener(type, handler, options);
    canvas.addEventListener('pointerleave', () => { if (!this.drag) { this.hoverAddress = null; this.draw(); } }, options);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(this.zoom * (e.deltaY > 0 ? .9 : 1.1), e.clientX, e.clientY); }, { passive: false, signal: this.listeners.signal });
    document.addEventListener('visibilitychange', () => { this.lastTime = 0; if (document.hidden) this.stopLoop(); else this.startLoop(); }, options);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas); this.resize();
  }
  getAddresses() { return addresses(); }
  addresses() { return addresses(); }
  async actorImage(url) {
    if (!this.imageCache.has(url)) this.imageCache.set(url, loadImage(url).catch((error) => { this.imageCache.delete(url); throw error; }));
    return this.imageCache.get(url);
  }
  async prepareInfrastructure() {
    const entries=await Promise.all([...STATION_PROPS,'planet','botanical','signal','cargo','wall-fan/atlas'].map(async (name) => [name, await this.actorImage(`/assets/station/${name}.png`)]));
    entries.push(['music-rack',await this.actorImage('/assets/music/record-rack/rack.png')]);
    return new Map(entries);
  }
  async prepareRoom(scene, address) {
    const room = roomFromScene(scene, address);
    room.actors = await Promise.all(room.actors.map(async (actor, index) => {
      const columns = Math.max(1, Math.min(16, Math.floor(Number(actor.columns) || 1)));
      const rows = Math.max(1, Math.min(16, Math.floor(Number(actor.rows) || 1)));
      return { ...actor, id: String(actor.id || `actor-${index}`), columns, rows,
        frames: Math.min(columns * rows, Math.max(1, Math.floor(Number(actor.frames) || 1))),
        fps: Math.max(.1, Math.min(30, Number(actor.fps) || 5)),
        facing: characterFacing(room.address, { ...actor, id: String(actor.id || `actor-${index}`) }), image: await this.actorImage(actor.atlas) };
    }));
    if(room.music)room.music.records=await Promise.all(room.music.records.map(async(record)=>({...record,image:await this.actorImage(record.atlas)})));
    return room;
  }
  async load(world) {
    const version = ++this.loadVersion;
    if (!Array.isArray(world?.rooms) || world.rooms.length > MAX_ROOMS) throw new Error('番地ごとの部屋を確認してください。');
    const used = new Set();
    for (const room of world.rooms) {
      const address = parseAddress(room.address)?.address;
      if (!address || used.has(address)) throw new Error('同じ番地に二つの部屋は置けません。');
      used.add(address);
    }
    const stage=normaliseStationStage(world.stage)||{id:'space-station',seed:796};
    const structures=stationStructurePlan(world.rooms,stage);
    const [prepared, infrastructure] = await Promise.all([Promise.all(world.rooms.map((scene) => this.prepareRoom(scene, scene.address))), this.prepareInfrastructure()]);
    if (version !== this.loadVersion) return false;
    this.rooms = prepared; this.infrastructure = infrastructure; this.elapsed = 0; this.lastTime = 0;
    this.stage=stage;this.structures=structures;this.wallSurfaces.clear();
    if (parseAddress(world.selectedAddress)) this.selectedAddress = parseAddress(world.selectedAddress).address;
    else if (!this.rooms.some((r) => r.address === this.selectedAddress)) this.selectedAddress = this.rooms[0]?.address || 'A01';
    this.resetView(); this.emitSelection(); this.startLoop(); return true;
  }
  async appendScene(scene, { address = this.selectedAddress } = {}) {
    const version = ++this.loadVersion;
    const structures=stationStructurePlan([...this.rooms.filter((room)=>room.address!==address),{address}],this.stage);
    const room = await this.prepareRoom(scene, address);
    if (version !== this.loadVersion) return false;
    this.rooms = [...this.rooms.filter((r) => r.address !== room.address), room];
    this.structures=structures;this.wallSurfaces.clear();
    this.selectedAddress = room.address; this.emitSelection(); this.resetView(); this.startLoop(); return true;
  }
  readdressRooms(plan, {selectedAddress} = {}) {
    if (!Array.isArray(plan) || plan.length !== this.rooms.length) throw new Error('すべての部屋の移動先を確認してください。');
    const destinations = new Map(), used = new Set(), occupied = new Set(this.rooms.map((room)=>room.address));
    for (const entry of plan) {
      const from = parseAddress(entry?.from)?.address, to = parseAddress(entry?.to)?.address;
      if (!occupied.has(from) || !to || destinations.has(from) || used.has(to)) throw new Error('部屋の移動先が重複しているか、範囲外です。');
      destinations.set(from,to); used.add(to);
    }
    if (selectedAddress !== undefined && !parseAddress(selectedAddress)) throw new Error('選択する番地を確認してください。');
    const nextSelection = selectedAddress || destinations.get(this.selectedAddress) || plan[0]?.to || 'D04';
    // Reuse prepared images, character facing and the live animation clock.
    this.loadVersion += 1;
    this.rooms = this.rooms.map((room)=>({...room,address:destinations.get(room.address)}));
    this.updateStructures();
    this.selectedAddress = parseAddress(nextSelection).address;
    this.resetView(); this.emitSelection(); return true;
  }
  async placeRecord(record, {address=this.selectedAddress}={}) {
    const existing=this.rooms.find((room)=>room.address===address);
    if(existing && existing.roomStyle!=='disco')throw new Error('この番地には別のテーマがあります。空き番地かMusic部屋を選んでください。');
    const result=addRecordToRoom(existing?serialRoom(existing):createMusicRoom(address),record);
    const placed=await this.appendScene(result.room,{address});
    if(placed)this.focusAddress(address);
    return {...result,placed};
  }
  focusAddress(address) {
    const room=this.rooms.find((item)=>item.address===address);if(!room)return false;
    this.selectedAddress=address;this.zoom=1;
    const baseScale=this.camera().scale;
    const fit=Math.min(this.canvas.width/(ROOM_EDGE*2+64),this.canvas.height/(ROOM_EDGE+WALL_HEIGHT+CORRIDOR_WIDTH/2+64));
    this.zoom=Math.max(.65,Math.min(4,fit/baseScale));
    const b=this.bounds(),origin=roomOrigin(address),c=this.camera();
    this.pan={x:((b.minX+b.maxX)/2-origin.x)*c.scale/this.canvas.width,
      y:((b.minY+b.maxY)/2-(origin.y+(ROOM_EDGE-WALL_HEIGHT)/2+CORRIDOR_WIDTH*.25))*c.scale/this.canvas.height};
    this.clampPan();this.onZoom?.(this.zoom);this.emitSelection();this.draw();return true;
  }
  getPlacements() { return this.rooms.map(serialRoom); }
  getSelection() {
    const room = this.rooms.find((r) => r.address === this.selectedAddress);
    return { address: this.selectedAddress, occupied: Boolean(room), room: room ? serialRoom(room) : null, scene: room ? serialRoom(room) : null };
  }
  emitSelection() { this.onSelection?.(this.getSelection()); }
  selectAddress(value) {
    const address = parseAddress(value)?.address; if (!address) return false;
    const wasVisible = this.visibleRooms().some((r) => r.address === address);
    this.selectedAddress = address; this.emitSelection();
    if (!wasVisible) this.resetView(); else this.draw();
    return true;
  }
  visibleRooms() {
    return this.rooms.some((r) => r.address === this.selectedAddress) ? this.rooms : [...this.rooms, { address: this.selectedAddress, title: '次のテーマ', actors: [], accent: '#a3c8ca', empty: true }];
  }
  topology() { return stationLayout(this.visibleRooms()); }
  updateStructures() { this.structures=stationStructurePlan(this.rooms,this.stage);this.wallSurfaces.clear(); }
  bounds() {
    const layout = this.topology();
    const result = { minX:Infinity, minY:Infinity, maxX:-Infinity, maxY:-Infinity };
    const include = (u,v,up=0,down=28) => {
      const p=project(u,v);
      result.minX=Math.min(result.minX,p.x-14); result.maxX=Math.max(result.maxX,p.x+14);
      result.minY=Math.min(result.minY,p.y-up-12); result.maxY=Math.max(result.maxY,p.y+down);
    };
    for(const cell of layout.cells) {
      const u=cell.column*ROOM_EDGE,v=cell.row*ROOM_EDGE;
      for(const [a,b] of [[u,v],[u+ROOM_EDGE,v],[u,v+ROOM_EDGE],[u+ROOM_EDGE,v+ROOM_EDGE]]) include(a,b,(!cell.west||!cell.north)?WALL_HEIGHT:0);
    }
    for(const hall of layout.corridors) for(const [u,v] of [[hall.u0,hall.v0],[hall.u1,hall.v0],[hall.u0,hall.v1],[hall.u1,hall.v1]]) include(u,v,0,34);
    for(const spec of this.structures) {
      const rect=fixtureBounds(spec);
      result.minX=Math.min(result.minX,rect.minX);result.maxX=Math.max(result.maxX,rect.maxX);
      result.minY=Math.min(result.minY,rect.minY);result.maxY=Math.max(result.maxY,rect.maxY);
    }
    return result;
  }
  camera() {
    const b = this.bounds(), width = this.canvas.width, height = this.canvas.height;
    const scale = Math.min(width / (b.maxX - b.minX + 80), height / (b.maxY - b.minY + 64)) * this.zoom;
    return { x: width/2 + this.pan.x*width - (b.minX+b.maxX)/2*scale,
      y: height/2 + this.pan.y*height - (b.minY+b.maxY)/2*scale, scale };
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(bounds.width*dpr)); this.canvas.height = Math.max(1, Math.round(bounds.height*dpr)); this.draw();
  }
  drawSpace() {
    const ctx = this.context, {width,height} = this.canvas;
    ctx.fillStyle = stationColor('#080d18'); ctx.fillRect(0,0,width,height);
    for (let i=0;i<120;i++) {
      const x = (i*7919+313)%10007/10007*width, y=(i*3571+719)%10009/10009*height;
      ctx.fillStyle = i%9===0?'#8ba2b8':i%3===0?'#344a65':'#1d2b40';
      ctx.fillRect(Math.floor(x),Math.floor(y),i%17===0?2:1,i%17===0?2:1);
    }
  }
  wallPanel(side, t0, t1, z0, z1, fill, stroke='#bdcbd3', width=1) {
    const endpoint = side==='left'?[-ROOM_EDGE,ROOM_EDGE/2]:[ROOM_EDGE,ROOM_EDGE/2];
    const point = (t,z) => [endpoint[0]*t, endpoint[1]*t-z];
    polygon(this.context,[point(t0,z0),point(t1,z0),point(t1,z1),point(t0,z1)],fill,stroke,width);
  }
  drawWalls(room, edges = {left:true,right:true}) {
    const ctx=this.context,H=WALL_HEIGHT,E=ROOM_EDGE;
    const profile=stationWallProfile(room),seed=profile.seed;
    const variant=(seed+(parseAddress(room.address)?.column || 0))%3;
    const sides=['left','right'].filter((side)=>edges[side]);
    for(const side of sides) {
      const end=side==='left'?[-E,E/2]:[E,E/2];
      polygon(ctx,[[0,0],end,[end[0],end[1]-H],[0,-H]],side==='left'?'#f3f6f6':'#e6edef','#9db2bd',1.5);
      for(let i=0;i<6;i++) {
        const t0=i/6+.01,t1=(i+1)/6-.01;
        this.wallPanel(side,t0,t1,9,H-12,side==='left'?'#fafbfb':'#eef4f4','#c6d3d9',.7);
        this.wallPanel(side,t0,t1,7,11,'#bccdd4',null);
        this.wallPanel(side,t0,t1,H-7,H-3,'#ffffff','#d1e0e4',.5);
        if((i+variant)%2===0) {
          for(let n=0;n<4;n++) this.wallPanel(side,t0+.014+n*.023,t0+.025+n*.023,17,30,'#aabdc7',null);
        }
        if((i+variant)%3===0) {
          this.wallPanel(side,t0+.02,t1-.02,44,73,'#cbd8df','#a0b4be',1);
          this.wallPanel(side,t0+.03,t1-.035,50,67,variant===1?'#afc9d4':'#c1dad6',null);
          for(let n=0;n<3;n++) this.wallPanel(side,t0+.03+n*.026,t0+.042+n*.026,37,40,n===variant?'#d4a36b':'#83bebc',null);
        }
      }
      // Paired conduits, ceiling rail and varied wall paneling belong to the shared shell.
      this.wallPanel(side,.01,.99,H-24,H-20,'#a0b9c4','#edf8fa',.6);
      this.wallPanel(side,.01,.99,H-29,H-27,'#d6e3e7','#a7bdc8',.5);
      this.wallPanel(side,.01,.99,H-3,H+3,'#ffffff','#8fa8b7',1.2);
      this.wallPanel(side,.015,.99,H-11,H-9,room.accent || '#acd7dc',null);
      for(const t of [.01,.165,.331,.498,.665,.831,.985]) this.wallPanel(side,t,Math.min(1,t+.013),0,H,'#d2e0e5','#fbfefe',.7);
    }
    if(edges.right) {
      if(variant!==2) {
        if(profile.windowShape==='hex') {
          const frame=[[.46,65],[.52,94],[.83,94],[.89,65],[.83,43],[.52,43]];
          const pane=[[.48,65],[.535,89],[.815,89],[.87,65],[.815,48],[.535,48]];
          polygon(ctx,frame.map(([t,z])=>[E*t,E*t/2-z]),'#d4e1e7','#819aa9',2);
          polygon(ctx,pane.map(([t,z])=>[E*t,E*t/2-z]),'#0c192c','#ffffff',1);
        } else {
          this.wallPanel('right',.46,.89,43,94,'#9baeb9','#819aa9',3);
          this.wallPanel('right',.475,.875,48,89,'#0c192c','#ffffff',2);
        }
        for(let i=0;i<12;i++) {
          const t=.49+(i*13%36)/100,z=52+(i*17%32),point=[E*t,E/2*t-z];
          ctx.fillStyle=i%3?'#9dc8e0':'#fff8dd';ctx.fillRect(point[0],point[1],1.2,1.2);
        }
        for(const t of [.60,.73]) this.wallPanel('right',t,t+.008,46,91,'#d1e0e7','#869ca9',.6);
      } else {
        this.wallPanel('right',.45,.9,39,95,'#cfdbdf','#92aab8',1.5);
        for(let n=0;n<5;n++) {
          this.wallPanel('right',.49+n*.077,.525+n*.077,45,85,n%2?'#809fab':'#9eb9c2','#f2fafb',.5);
          this.wallPanel('right',.5+n*.077,.511+n*.077,55,66,n%2?'#a8dcba':'#e8b47a',null);
        }
      }
    }
    if(edges.left) {
      this.wallPanel('left',.53,.82,5,105,'#afc5d0','#829eaf',2);
      this.wallPanel('left',.55,.80,10,101,'#e7eff1','#ffffff',1);
      this.wallPanel('left',.674,.68,12,99,'#9cb4c1',null);
      this.wallPanel('left',.60,.63,43,49,'#72b8c4','#e2ffff',1);
      this.wallPanel('left',.85,.92,43,69,'#b9cdd6','#8aa4b4',1);
      this.wallPanel('left',.863,.906,52,63,'#86cdc6',null);
    }
    for(const side of sides) {
      if(side!==profile.equipmentSide)this.drawWallPoster(side,seed+(side==='left'?1:0));
      this.drawWallEquipment(room,side,profile);
    }
    if(sides.length) {
      ctx.fillStyle=stationColor('#a6bfcb');ctx.fillRect(-4,-H,8,H);ctx.fillStyle=stationColor('#ffffff');ctx.fillRect(-2,-H,4,H);
    }
    if(room.address && sides.length) this.drawAddressSign(room,edges.right?'right':'left');
  }
  drawWallEquipment(room,side,profile) {
    const ctx=this.context,E=ROOM_EDGE,H=WALL_HEIGHT;
    if(side===profile.equipmentSide && profile.duct) {
      this.wallPanel(side,.12,.44,28,45,'#d3dfe4','#8fa7b5',1.5);
      this.wallPanel(side,.135,.425,31,42,'#7e94a3','#f8ffff',1);
      for(let i=0;i<7;i++)this.wallPanel(side,.15+i*.038,.165+i*.038,32,41,'#cfdee5','#5e7b8c',.5);
      this.wallPanel(side,.14,.42,46,51,'#eef3f5','#a6bbc6',.7);
    }
    const image=this.infrastructure.get('wall-fan/atlas');
    if(image && side===profile.equipmentSide && profile.fan) {
      const t=side==='left'?.22:.29,x=(side==='left'?-1:1)*E*t;
      const size=48,frame=animationFrame({frames:4,fps:6},this.elapsed),cw=image.naturalWidth/2,ch=image.naturalHeight/2;
      ctx.save();ctx.translate(x,E*t/2-99);ctx.transform(1,side==='left'?-.5:.5,0,1,0,0);
      ctx.drawImage(image,frame%2*cw,Math.floor(frame/2)*ch,cw,ch,-size/2,0,size,size);ctx.restore();
    }
    if(side==='right') {
      // A distinct dot display on each rear wall; animation follows the world clock.
      ctx.save();ctx.translate(E*.49,E*.49/2-(H-19));ctx.transform(1,.5,0,1,0,0);
      drawDotDisplay(ctx,profile.message,0,0,97,this.elapsed);ctx.restore();
    }
  }
  drawWallPoster(side,seed) {
    const name=['planet','botanical','signal','cargo'][seed%4],image=this.infrastructure.get(name);
    if(!image)return;
    const E=ROOM_EDGE,t=side==='left'?.42:.16,z=84,size=82;
    this.context.save();
    this.context.translate((side==='left'?-1:1)*E*t,E*t/2-z);
    this.context.transform(1,side==='left'?-.5:.5,0,1,0,0);
    this.context.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,size,size);
    this.context.restore();
  }
  drawAddressSign(room,side) {
    const ctx=this.context,E=ROOM_EDGE,selected=room.address===this.selectedAddress;
    if(side==='right') {
      this.wallPanel(side,.015,.45,91,119,selected?'#bcd9b4':'#cedce2','#8ea7b5',1);
      ctx.save();ctx.translate(E*.035,E*.035/2-110);ctx.transform(1,.5,0,1,0,0);
    } else {
      this.wallPanel(side,.015,.45,91,119,selected?'#bcd9b4':'#cedce2','#8ea7b5',1);
      ctx.save();ctx.translate(-E*.43,E*.43/2-110);ctx.transform(1,-.5,0,1,0,0);
    }
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=stationColor('#3d5869');ctx.font='bold 10px ui-monospace,monospace';ctx.fillText(`F796-${room.address}`,0,0);
    ctx.font='8px -apple-system,sans-serif';ctx.fillText(room.title.slice(0,13),0,12);ctx.restore();
  }
  uvRect(u0,v0,u1,v1,fill,stroke=null,lineWidth=1) {
    const pts=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>{const p=project(u,v);return[p.x,p.y];});
    polygon(this.context,pts,fill,stroke,lineWidth);
  }
  wallSurface(cell) {
    if(!document.createElement)return null;
    const key=`${cell.row}:${cell.column}`;
    let surface=this.wallSurfaces.get(key);
    if(!surface) {
      const canvas=document.createElement('canvas');canvas.width=ROOM_EDGE*2+16;canvas.height=WALL_HEIGHT+ROOM_EDGE/2+28;
      const context=canvas.getContext?.('2d');if(!context)return null;
      surface={canvas,context,frame:-1};this.wallSurfaces.set(key,surface);
    }
    if(surface.frame!==this.wallFrame) {
      const original=this.context,ctx=surface.context;
      ctx.clearRect(0,0,surface.canvas.width,surface.canvas.height);ctx.save();
      ctx.imageSmoothingEnabled=false;ctx.translate(ROOM_EDGE+8,WALL_HEIGHT+12);
      this.context=ctx;
      try {
        if(cell.room?.empty)ctx.globalAlpha=.5;
        this.drawWalls(cell.room||{title:'共用通路',accent:'#b6d7dd',wallSeed:`transit:${key}`},{left:!cell.west,right:!cell.north});
      } finally {this.context=original;ctx.restore();}
      surface.frame=this.wallFrame;
    }
    return surface;
  }
  wallEntries(layout) {
    return rearWallSegments(layout).map((segment)=>({kind:'wall',segment,address:segment.cell.room?.address||null,depth:segment.depth,
      render:()=>{
        const ctx=this.context,cell=segment.cell,origin=project(cell.column*ROOM_EDGE,cell.row*ROOM_EDGE);
        const surface=this.wallSurface(cell);
        ctx.save();polygon(ctx,wallSegmentPolygon(segment),null,null);ctx.clip();
        if(surface)ctx.drawImage(surface.canvas,origin.x-ROOM_EDGE-8,origin.y-WALL_HEIGHT-12);
        else {
          ctx.translate(origin.x,origin.y);if(cell.room?.empty)ctx.globalAlpha=.5;
          this.drawWalls(cell.room||{title:'共用通路',accent:'#b6d7dd',wallSeed:`transit:${cell.row},${cell.column}`},{left:!cell.west,right:!cell.north});
        }
        ctx.restore();
      }}));
  }
  hullFace(u0,v0,u1,v1) {
    const a=project(u0,v0),b=project(u1,v1),depth=20;
    polygon(this.context,[[a.x,a.y],[b.x,b.y],[b.x,b.y+depth],[a.x,a.y+depth]],'#b3c6d0','#829eae',1);
    for(let t=.08;t<1;t+=.16){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;this.context.fillStyle=stationColor('#7898aa');this.context.fillRect(x,y+7,4,7);this.context.fillStyle=stationColor('#c4f0ef');this.context.fillRect(x+1,y+8,2,2);}
  }
  drawStationFloor(layout) {
    const ctx=this.context,E=ROOM_EDGE;
    for(const cell of layout.cells) {
      const u=cell.column*E,v=cell.row*E,room=cell.room;
      const variant=stationHash(room?.address || `${cell.row},${cell.column}`)%3;
      const disco=room?.roomStyle==='disco';
      this.uvRect(u,v,u+E,v+E,disco?'#26314b':STATION_PALETTE.floor,STATION_PALETTE.edge,.6);
      for(let row=0;row<6;row++)for(let col=0;col<6;col++) {
        const size=E/6,shade=disco?((row+col)%2?'#27334c':'#323c56'):((row+col+variant)%2?STATION_PALETTE.floorAlt:STATION_PALETTE.floor);
        this.uvRect(u+col*size+1,v+row*size+1,u+(col+1)*size-1,v+(row+1)*size-1,shade,'#c9d6dd',.4);
        const p=project(u+col*size+5,v+row*size+5);ctx.fillStyle=stationColor('#9eb7c5');ctx.fillRect(p.x,p.y,1.5,1.5);
      }
      if(disco)drawDiscoFloor(ctx,u,v,this.elapsed);
      if(room?.address===this.selectedAddress) this.uvRect(u+3,v+3,u+E-3,v+E-3,null,'#b5cda5',2);
      if(room && cell.west && cell.north) {
        this.uvRect(u+E*.1,v+E*.05,u+E*.7,v+E*.18,'#d3e0e5','#9fb6c4',.7);
        const p=project(u+E*.14,v+E*.11);ctx.save();ctx.translate(p.x,p.y);ctx.transform(1,.5,-1,.5,0,0);
        ctx.fillStyle=stationColor('#536e7e');ctx.font='bold 10px ui-monospace,monospace';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(`F796-${room.address}`,0,0);ctx.restore();
      }
      if(!room) {
        this.uvRect(u+E*.45,v,u+E*.55,v+E,'#9ab6c4',null);
        this.uvRect(u,v+E*.45,u+E,v+E*.55,'#9ab6c4',null);
      }
    }
    for(const hall of layout.corridors) {
      this.uvRect(hall.u0,hall.v0,hall.u1,hall.v1,STATION_PALETTE.corridor,STATION_PALETTE.edge,.8);
      for(let i=0;i<8;i++) {
        const u=hall.u0+i*E/8;
        this.uvRect(u+1,hall.v0+3,u+E/8-1,hall.v1-3,i%2?STATION_PALETTE.corridorAlt:STATION_PALETTE.corridor,STATION_PALETTE.edge,.5);
        this.uvRect(u+4,hall.v0+5,u+E/8-4,hall.v0+7,'#e0cb8b',null);
        this.uvRect(u+4,hall.v1-7,u+E/8-4,hall.v1-5,'#b7edeb',null);
      }
    }
    drawStageGround(ctx,layout,this.structures);
    for(const edge of stageSurfaceLayout(layout,this.structures).hull)this.hullFace(edge.u0,edge.v0,edge.u1,edge.v1);
  }
  portalEntry(portal) {
    const E=ROOM_EDGE;
    return {depth:(portal.row+portal.column+1.55)*E,render:()=>{
      const u=(portal.column+1)*E,v=portal.row*E;
      const point=(t,z)=>{const p=portal.direction==='u'?project(u,v+t*E):project(portal.column*E+t*E,(portal.row+1)*E);return[p.x,p.y-z];};
      for(const [a,b] of [[.02,.14],[.85,.98]])polygon(this.context,[point(a,0),point(b,0),point(b,22),point(a,22)],'#d4e0e5','#9bb5c4',1);
      for(const t of [.28,.76])polygon(this.context,[point(t,0),point(t+.018,0),point(t+.018,80),point(t,80)],'#d0dfe6','#93adbd',1);
      polygon(this.context,[point(.28,76),point(.78,76),point(.78,84),point(.28,84)],'#dfe9ed','#8eabba',1);
      polygon(this.context,[point(.32,79),point(.73,79),point(.73,81),point(.32,81)],'#a3dfdc',null);
    }};
  }
  infrastructureActor(spec) {
    const image=this.infrastructure.get(spec.type);if(!image)return null;
    return {...spec,image,columns:1,rows:1,frames:1,fps:1,footAnchor:236/256};
  }
  stationEntries(layout) {
    const E=ROOM_EDGE,entries=this.wallEntries(layout);
    const add=(actor,origin,baseDepth,address=null)=>entries.push({kind:'actor',actor,origin,address,depth:baseDepth+actorDepth(actor)*E,render:()=>{this.context.save();this.context.translate(origin.x,origin.y);this.drawActor(actor);this.context.restore();}});
    for(const spec of this.structures)entries.push({kind:'fixture',spec,depth:spec.depth,render:()=>drawStageFixture(this.context,spec,this.elapsed)});
    for(const cell of layout.cells) {
      const room=cell.room,origin=project(cell.column*E,cell.row*E),depth=(cell.row+cell.column)*E;
      if(room&&!room.empty) {
        for(const actor of room.actors)add(actor,origin,depth,room.address);
        if(room.roomStyle==='disco')entries.push(...musicEntries(this,room,origin,depth));
        else for(const spec of stationDressings(room)){const actor=this.infrastructureActor(spec);if(actor)add(actor,origin,depth);}
      } else if(!room) {
        for(const [type,u,v,width] of [['cabinet',.15,.15,100],['pump',.82,.2,96],['plant',.18,.8,88]]){const actor=this.infrastructureActor({type,u,v,worldWidth:width});if(actor)add(actor,origin,depth);}
      }
    }
    entries.push(...layout.portals.map((portal)=>this.portalEntry(portal)));
    for(const segment of frontWallSegments(layout)) entries.push({
      depth:(segment.u0+segment.u1+segment.v0+segment.v1)/2,
      render:()=>drawFrontGlass(this.context,segment),
    });
    return entries.sort((a,b)=>a.depth-b.depth);
  }
  actorRect(actor) {
    const p=project(actor.u*ROOM_EDGE,actor.v*ROOM_EDGE);
    const width=Math.max(32,Math.min(230,Number(actor.worldWidth)||140));
    const height=width*(actor.image.naturalHeight/actor.rows)/(actor.image.naturalWidth/actor.columns);
    const foot=Number.isFinite(actor.footAnchor)?actor.footAnchor:.9;
    const elevation=Math.max(0,Math.min(96,Number(actor.elevation)||0));
    return {x:p.x-width/2,y:p.y-height*foot-elevation,width,height,foot:{x:p.x,y:p.y-elevation}};
  }
  drawActor(actor) {
    const ctx=this.context,r=this.actorRect(actor),frame=animationFrame(actor,this.elapsed+(Number.isFinite(actor.phase)?actor.phase:0));
    const cw=actor.image.naturalWidth/actor.columns,ch=actor.image.naturalHeight/actor.rows;
    ctx.beginPath();ctx.fillStyle='rgba(0,4,9,.34)';ctx.ellipse(r.foot.x,r.foot.y+2,r.width*.18,r.width*.055,0,0,Math.PI*2);ctx.fill();
    ctx.save();
    const mirrored=actor.kind==='character' && actor.facing==='right';
    if(mirrored){ctx.translate(r.foot.x,0);ctx.scale(-1,1);}
    ctx.drawImage(actor.image,frame%actor.columns*cw,Math.floor(frame/actor.columns)*ch,cw,ch,mirrored?-r.width/2:r.x,r.y,r.width,r.height);
    ctx.restore();
  }
  draw() {
    const ctx=this.context;if(!ctx)return;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.imageSmoothingEnabled=false;this.drawSpace();
    this.wallFrame+=1;
    const camera=this.camera(),layout=this.topology();ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
    this.drawStationFloor(layout);
    for(const entry of this.stationEntries(layout))entry.render();
    ctx.restore();
  }
  setPlaying(value) { this.playing=Boolean(value);this.lastTime=0;if(this.playing)this.startLoop();else this.stopLoop();this.draw(); }
  startLoop() { if(!this.rooms.length||!this.playing||document.hidden||this.frameId)return;this.frameId=requestAnimationFrame((t)=>this.tick(t)); }
  stopLoop() { cancelAnimationFrame(this.frameId);this.frameId=0; }
  tick(time) { this.frameId=0;if(this.lastTime)this.elapsed+=Math.min(time-this.lastTime,100);this.lastTime=time;this.draw();this.startLoop(); }
  setZoom(value) { this.zoom=Math.max(.65,Math.min(4,Number(value)||1));this.clampPan();this.onZoom?.(this.zoom);this.draw(); }
  resetView() { this.zoom=1;this.pan={x:0,y:0};this.onZoom?.(1);this.draw(); }
  fillView() {
    const b=this.bounds(),x=this.canvas.width/(b.maxX-b.minX+80),y=this.canvas.height/(b.maxY-b.minY+64);
    this.pan={x:0,y:0};this.setZoom(Math.max(1.12,Math.min(3,Math.max(x,y)/Math.min(x,y))));
  }
  clampPan() { const limit=Math.max(.35,this.zoom*.45);this.pan.x=Math.max(-limit,Math.min(limit,this.pan.x));this.pan.y=Math.max(-limit,Math.min(limit,this.pan.y)); }
  worldPoint(clientX,clientY) {
    const b=this.canvas.getBoundingClientRect(),c=this.camera();
    return{x:((clientX-b.left)/b.width*this.canvas.width-c.x)/c.scale,y:((clientY-b.top)/b.height*this.canvas.height-c.y)/c.scale};
  }
  zoomAt(value,x,y) { const before=this.worldPoint(x,y);this.setZoom(value);const after=this.worldPoint(x,y),c=this.camera();this.pan.x+=(after.x-before.x)*c.scale/this.canvas.width;this.pan.y+=(after.y-before.y)*c.scale/this.canvas.height;this.clampPan();this.draw(); }
  addressFromPointer(x,y) {
    const p=this.worldPoint(x,y);
    // Use the actual paint order: an opaque near wall hides an item behind it.
    for(const entry of this.stationEntries(this.topology()).reverse()) {
      if(entry.kind==='wall'&&containsPoint(wallSegmentPolygon(entry.segment),p))return entry.address;
      if(entry.kind!=='actor'||!entry.address)continue;
      const local={x:p.x-entry.origin.x,y:p.y-entry.origin.y},r=this.actorRect(entry.actor);
      if(local.x>=r.x+r.width*.16&&local.x<=r.x+r.width*.84&&local.y>=r.y+r.height*.08&&local.y<=r.y+r.height*.92)return entry.address;
    }
    for(const room of orderedRooms(this.visibleRooms()).reverse()) {
      const origin=roomOrigin(room.address),local={x:p.x-origin.x,y:p.y-origin.y};
      const uv=unproject(local.x,local.y);
      if(uv.u>=0&&uv.u<=ROOM_EDGE&&uv.v>=0&&uv.v<=ROOM_EDGE)return room.address;
    }
    return null;
  }
  pointerDown(e) {
    if(e.button!==0)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.canvas.setPointerCapture(e.pointerId);
    if(this.pointers.size===2){const[a,b]=[...this.pointers.values()];this.drag={pinch:true,distance:Math.hypot(b.x-a.x,b.y-a.y),zoom:this.zoom,x:(a.x+b.x)/2,y:(a.y+b.y)/2,panX:this.pan.x,panY:this.pan.y,moved:true};}
    else if(this.pointers.size===1)this.drag={x:e.clientX,y:e.clientY,panX:this.pan.x,panY:this.pan.y,moved:false};
    this.canvas.dataset.dragging='true';
  }
  pointerMove(e) {
    if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!this.drag){const a=this.addressFromPointer(e.clientX,e.clientY);if(a!==this.hoverAddress){this.hoverAddress=a;this.draw();}return;}
    const b=this.canvas.getBoundingClientRect();
    if(this.drag.pinch&&this.pointers.size===2){const[a,c]=[...this.pointers.values()];this.zoom=Math.max(.65,Math.min(4,this.drag.zoom*Math.hypot(c.x-a.x,c.y-a.y)/Math.max(1,this.drag.distance)));this.pan.x=this.drag.panX+((a.x+c.x)/2-this.drag.x)/b.width;this.pan.y=this.drag.panY+((a.y+c.y)/2-this.drag.y)/b.height;this.onZoom?.(this.zoom);}
    else if(!this.drag.pinch){const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;this.pan.x=this.drag.panX+dx/b.width;this.pan.y=this.drag.panY+dy/b.height;}
    this.clampPan();this.draw();
  }
  pointerUp(e,cancelled=false) {
    if(!this.pointers.has(e.pointerId))return;
    const tap=this.drag&&!this.drag.moved&&!this.drag.pinch&&!cancelled;this.pointers.delete(e.pointerId);
    if(tap){const address=this.addressFromPointer(e.clientX,e.clientY);if(address)this.selectAddress(address);this.onActivate?.(address?this.getSelection():null);}
    this.drag=null;this.canvas.dataset.dragging='false';
  }
  destroy() { ++this.loadVersion;this.stopLoop();this.listeners.abort();this.resizeObserver.disconnect();this.imageCache.clear();this.wallSurfaces.clear();this.pointers.clear(); }
}

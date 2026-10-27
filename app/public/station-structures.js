import { ROOM_EDGE, project, stationHash, stationLayout, surfaceHull } from './room-layout.js';
import { STATION_PALETTE as P, stationColor } from './station-materials.js';

// Attached architectural parts use the existing station's material and scale.
export const STATION_MATERIALS={top:P.panel,side:P.wallRight,base:P.side,edge:P.edge,recess:P.recess,dark:P.dark,light:P.light};
export const STATION_FIXTURES=['service-bank','vent-bed','conduit-bed'];

export function normaliseStationStage(value) {
  return value?.id==='space-station'&&Number.isInteger(value.seed)&&value.seed>=0&&value.seed<=0xffffffff
    ?{id:'space-station',seed:value.seed}:null;
}
export function createStationStage() {
  const values=new Uint32Array(1);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(values);
  else values[0]=Math.floor(Math.random()*0x100000000);
  return {id:'space-station',seed:values[0]};
}
export function stationStructurePlan(rooms, stage) {
  const seed=normaliseStationStage(stage)?.seed??796;
  // Prepare the stage from addresses before placing any themed items.
  const actual=rooms.filter((room)=>!room.empty).map(({address})=>({address}));
  if(!actual.length)return [];
  const layout=stationLayout(actual),offset=stationHash(`${seed}:fixtures`)%3;
  return layout.corridors.map((hall,index)=>{
    const hash=stationHash(`${seed}:hull:${hall.row}:${hall.column}`),right=hash%2;
    const u0=hall.u0+ROOM_EDGE*(right?.65:.02),u1=u0+ROOM_EDGE*.33;
    const type=STATION_FIXTURES[(index+offset)%3];
    const height=type==='service-bank'?28:type==='vent-bed'?20:12;
    return {id:`hull-service-${hall.row}:${hall.column}`,type,mount:'corridor-hull',
      platform:{u0,u1,v0:hall.v1-8,v1:hall.v1+28},
      body:{u0:u0+4,u1:u1-4,v0:hall.v1+3,v1:hall.v1+24},
      dock:{u0,u1,v:hall.v1},height,phase:hash%5000,
      depth:(u0+u1)/2+hall.v1+13.5};
  });
}
export function stageSurfaceLayout(layout, fixtures) {
  const surfaces=[...layout.surfaces,...fixtures.map((fixture)=>fixture.platform)];
  return {...layout,surfaces,hull:surfaceHull(surfaces)};
}
export function fixtureBounds(fixture) {
  const r=fixture.platform,points=[[r.u0,r.v0],[r.u1,r.v0],[r.u0,r.v1],[r.u1,r.v1]].map(([u,v])=>project(u,v));
  return {minX:Math.min(...points.map((p)=>p.x))-2,maxX:Math.max(...points.map((p)=>p.x))+2,
    minY:Math.min(...points.map((p)=>p.y))-fixture.height-4,maxY:Math.max(...points.map((p)=>p.y))+22};
}
function poly(ctx,points,fill,stroke=STATION_MATERIALS.edge,width=.7) {
  ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();
  if(fill){ctx.fillStyle=stationColor(fill);ctx.fill();}if(stroke){ctx.strokeStyle=stationColor(stroke);ctx.lineWidth=width;ctx.stroke();}
}
function point(u,v,z=0){const p=project(u,v);return[p.x,p.y-z];}
function top(ctx,r,z,fill,stroke) {poly(ctx,[[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]].map(([u,v])=>point(u,v,z)),fill,stroke);}
function frontPanel(ctx,r,u0,u1,z0,z1,fill,stroke) {poly(ctx,[point(u0,r.v1,z0),point(u1,r.v1,z0),point(u1,r.v1,z1),point(u0,r.v1,z1)],fill,stroke);}
export function drawStageGround(ctx,layout,fixtures) {
  const m=STATION_MATERIALS;
  for(const {platform:r} of fixtures) {
    top(ctx,r,0,'#c5d2d8',m.edge);
    top(ctx,{u0:r.u0+2,u1:r.u1-2,v0:r.v0+2,v1:r.v1-2},0,'#d9e4e8',m.edge);
  }
  for(const hall of layout.corridors) {
    const r={u0:hall.u0+ROOM_EDGE*.42,u1:hall.u0+ROOM_EDGE*.58,v0:hall.v0+19,v1:hall.v1-19};
    top(ctx,r,.2,'#b2c6cf','#7f9eae');
    top(ctx,{u0:r.u0+3,u1:r.u1-3,v0:r.v0+3,v1:r.v1-3},.3,'#d7e2e7','#f2f7f7');
    for(let i=0;i<4;i++)top(ctx,{u0:r.u0+6+i*7,u1:r.u0+8+i*7,v0:r.v0+7,v1:r.v1-7},.4,'#91abb9',null);
  }
}
export function drawStageFixture(ctx,fixture,elapsed) {
  const r=fixture.body,h=fixture.height,m=STATION_MATERIALS;
  ctx.save();
  // Vertical faces meet the integrated platform, with no floating sprite anchor.
  poly(ctx,[point(r.u1,r.v0),point(r.u1,r.v1),point(r.u1,r.v1,h),point(r.u1,r.v0,h)],m.side);
  poly(ctx,[point(r.u0,r.v1),point(r.u1,r.v1),point(r.u1,r.v1,h),point(r.u0,r.v1,h)],m.base);
  top(ctx,r,h,m.top,'#ffffff');
  const length=r.u1-r.u0;
  if(fixture.type==='service-bank') {
    for(let i=0;i<3;i++) {
      const a=r.u0+3+i*length/3,b=r.u0+(i+1)*length/3-2;
      frontPanel(ctx,r,a,b,3,h-3,'#e1eaee',m.edge);
      frontPanel(ctx,r,a+2,b-2,8,11,m.recess,null);
      frontPanel(ctx,r,a+2,a+5,16,18,i%2?'#e0cb8b':m.light,null);
    }
  } else if(fixture.type==='vent-bed') {
    top(ctx,{u0:r.u0+5,u1:r.u1-5,v0:r.v0+3,v1:r.v1-3},h+.2,m.dark,m.edge);
    for(let i=0;i<9;i++)top(ctx,{u0:r.u0+7+i*7,u1:r.u0+9+i*7,v0:r.v0+4,v1:r.v1-4},h+.3,'#c1d3dc',null);
    frontPanel(ctx,r,r.u0+4,r.u1-4,3,7,m.recess,null);
  } else {
    top(ctx,{u0:r.u0+4,u1:r.u1-4,v0:r.v0+3,v1:r.v1-3},h+.2,'#8faab9',m.edge);
    for(const v of [r.v0+6,r.v1-6])top(ctx,{u0:r.u0+3,u1:r.u1-3,v0:v,v1:v+3},h+2,'#dce9ec','#ffffff');
  }
  const lamp=Math.sin((elapsed+fixture.phase)/1100)>0?m.light:'#8cb9c0';
  frontPanel(ctx,r,r.u1-9,r.u1-5,2,4,lamp,null);
  ctx.restore();
}

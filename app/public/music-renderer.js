import { MUSIC_RACKS } from './music-room.js';
import { ROOM_EDGE, project } from './room-layout.js';

// Measured empty pockets in the generated rack.png (471 x 257), keeping its lip visible.
const POCKETS = [
  [43,40,70],[148,40,70],[250,40,70],[355,40,70],
  [43,137,70],[148,137,70],[250,137,70],[355,137,70],
];
function jacket(ctx, record, elapsed, x, y, size) {
  if(!record?.image)return;
  const frame=Math.floor(elapsed/1000*record.fps)%record.frames;
  const cw=record.image.naturalWidth/record.columns,ch=record.image.naturalHeight/record.rows;
  ctx.drawImage(record.image,frame%record.columns*cw,Math.floor(frame/record.columns)*ch,cw,ch,x,y,size,size);
}
function rack(renderer,room,index,spec,origin) {
  const ctx=renderer.context,image=renderer.infrastructure.get('music-rack');if(!image)return;
  const p=project(spec.u*ROOM_EDGE,spec.v*ROOM_EDGE),width=100,height=width*257/471;
  ctx.save();ctx.translate(origin.x+p.x,origin.y+p.y);ctx.transform(1,spec.side==='left'?-.5:.5,0,1,0,0);
  ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,-width/2,-height,width,height);
  ctx.fillStyle=`rgba(123,231,248,${.45+(Math.sin(renderer.elapsed/950+index)+1)*.25})`;
  ctx.fillRect(-width/2+421/471*width,-height+18/257*height,14/471*width,5/257*height);
  for(let slot=0;slot<8;slot++) {
    const [x,y,size]=POCKETS[slot],record=room.music.records[index*8+slot];
    jacket(ctx,record,renderer.elapsed,-width/2+x/471*width,-height+y/257*height,size/471*width);
  }
  ctx.restore();
}
function featured(renderer,room,origin) {
  const ctx=renderer.context,record=room.music.records.at(-1);if(!record)return;
  const p=project(.74*ROOM_EDGE,.74*ROOM_EDGE),size=64;
  ctx.save();ctx.translate(origin.x+p.x,origin.y+p.y);ctx.transform(1,-.5,0,1,0,0);
  ctx.fillStyle='#b7cbd4';ctx.fillRect(-3,-32,6,32);ctx.fillRect(-18,-2,36,4);
  ctx.fillStyle='#ecf3f4';ctx.fillRect(-size/2-3,-size-32,size+6,size+6);
  ctx.fillStyle='#1b263c';ctx.fillRect(-size/2,-size-29,size,size);
  jacket(ctx,record,renderer.elapsed,-size/2,-size-29,size);
  ctx.fillStyle='#c7adf3';ctx.fillRect(-size/2-3,-27,size+6,2);
  ctx.restore();
}
export function musicEntries(renderer,room,origin,baseDepth) {
  const entries=MUSIC_RACKS.map((spec,index)=>({depth:baseDepth+(spec.u+spec.v)*ROOM_EDGE,
    render:()=>rack(renderer,room,index,spec,origin)}));
  entries.push({depth:baseDepth+1.48*ROOM_EDGE,render:()=>featured(renderer,room,origin)});
  return entries;
}
export function drawDiscoFloor(ctx,u,v,elapsed) {
  const E=ROOM_EDGE,step=E/6,colors=['#9a6dc1','#4a98ac','#5c6cae','#ad6b9b'];
  for(let row=2;row<5;row++)for(let col=2;col<5;col++) {
    const phase=(Math.sin(elapsed/1600+(row+col)*.9)+1)/2;
    const pts=[[col*step+3,row*step+3],[(col+1)*step-3,row*step+3],[(col+1)*step-3,(row+1)*step-3],[col*step+3,(row+1)*step-3]].map(([a,b])=>project(u+a,v+b));
    ctx.save();ctx.globalAlpha=.3+phase*.38;ctx.fillStyle=colors[(row*3+col)%colors.length];
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.restore();
  }
  // Soft rotating reflections are drawn on the floor, below every object.
  for(let i=0;i<8;i++) {
    const angle=elapsed/3800+i*Math.PI/4,radius=53+(i%2)*18;
    const p=project(u+E*.56+Math.cos(angle)*radius,v+E*.56+Math.sin(angle)*radius);
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle=colors[i%4];ctx.beginPath();ctx.ellipse(p.x,p.y,5,2.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

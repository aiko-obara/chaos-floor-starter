import { normaliseReferences } from './references.js';
import { clutterActors } from './room-clutter.js';

export const MUSIC_CAPACITY = 48;
export const MUSIC_RACKS = [
  {u:.08,v:.28,side:'left'}, {u:.08,v:.72,side:'left'},
  {u:.28,v:.08,side:'right'}, {u:.72,v:.08,side:'right'},
  {u:.40,v:.86,side:'left'}, {u:.86,v:.40,side:'right'},
];

const text = (value, maximum=200) => typeof value==='string' ? value.trim().slice(0,maximum) : '';
export function musicKey(value) { return text(value,1000).normalize('NFKC').toLowerCase().replace(/[\s。・.!！?？]/g,''); }
export function safeMusicAtlas(value) { return typeof value==='string' && /^\/(assets|generated)\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..'); }
function sourceUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function normaliseRecord(value) {
  if (!value || typeof value!=='object' || !safeMusicAtlas(value.atlas)) return null;
  const id=text(value.id),track=text(value.track),artist=text(value.artist),album=text(value.album);
  const columns=value.columns,rows=value.rows,frames=value.frames;
  if(!id || !track || !artist || !album || !Number.isInteger(columns) || columns<1 || columns>16 || !Number.isInteger(rows) || rows<1 || rows>16 || !Number.isInteger(frames) || frames<1 || frames>columns*rows) return null;
  const tracks=Array.isArray(value.tracks) ? value.tracks.filter((v)=>typeof v==='string' && v.trim()).map((v)=>text(v)).slice(0,64) : [];
  return {id,track,artist,album,atlas:value.atlas,columns,rows,frames,
    fps:Math.max(.1,Math.min(30,Number(value.fps)||4)),
    sourceUrl:sourceUrl(value.sourceUrl),tracks:[...new Set([track,...tracks])],
    source:value.source==='sample'?'sample':'generated',
    ...(normaliseReferences(value.references).length?{references:normaliseReferences(value.references)}:{})};
}
export function normaliseMusic(value) {
  if(value===undefined) return undefined;
  if(!value || !Array.isArray(value.records) || value.records.length>MUSIC_CAPACITY) return null;
  const records=value.records.map(normaliseRecord),ids=new Set(),albums=new Set();
  for(const record of records) {
    if(!record) return null;
    const key=musicKey(record.artist+':'+record.album);
    if(ids.has(record.id)||albums.has(key))return null;
    ids.add(record.id);albums.add(key);
  }
  return {capacity:MUSIC_CAPACITY,records};
}
export function createMusicRoom(address) {
  return {id:`music-room-${address}`,title:'Music Room',name:'Music Room',assetType:'collection',
    address,accent:'#b499ed',roomStyle:'disco',source:'generated',
    prompt:'ディスコ風の宇宙ステーション。6台のレコードラックに好きな曲のアルバムジャケットを飾る。',
    music:{capacity:MUSIC_CAPACITY,records:[]},actors:[
      {id:'music-turntables',name:'ターンテーブル',kind:'object',atlas:'/assets/music/dj-deck/atlas.png',columns:2,rows:2,frames:4,fps:4,worldWidth:152,footAnchor:.92,u:.56,v:.58,motion:'レコードが回り、メーターが動く'},
      {id:'music-mirrorball',name:'ミラーボール',kind:'object',atlas:'/assets/music/disco-ball/atlas.png',columns:2,rows:2,frames:4,fps:4,worldWidth:86,footAnchor:.92,elevation:70,u:.46,v:.46,motion:'鏡の反射が回る'},
      ...clutterActors('music-clutter'),
    ]};
}
export function addRecordToRoom(room, value) {
  const record=normaliseRecord(value),music=normaliseMusic(room.music);
  if(room.roomStyle!=='disco' || !music || !record)throw new Error('Music部屋とジャケットの内容を確認してください。');
  const key=musicKey(record.artist+':'+record.album);
  const existing=music.records.findIndex((item)=>item.id===record.id || musicKey(item.artist+':'+item.album)===key);
  if(existing>=0) {
    const current=music.records[existing],tracks=[...new Set([...current.tracks,...record.tracks])].slice(0,64);
    return {room:{...room,music:{...music,records:music.records.map((item,index)=>index===existing?{...item,tracks}:item)}},duplicate:true};
  }
  if(music.records.length>=MUSIC_CAPACITY)throw new Error('この部屋の48枚の展示枠がいっぱいです。空き番地を選ぶと別のMusic部屋に飾れます。');
  return {room:{...room,music:{...music,records:[...music.records,record]}},duplicate:false};
}
export function recordFromScene(scene, info) {
  const actor=scene?.actors?.[0];
  return actor ? normaliseRecord({...info,...actor,id:`record-${scene.id}`,track:info.track,artist:info.artist,album:info.album,sourceUrl:info.sourceUrl,source:'generated',references:scene.references||info.references}) : null;
}
export function recordCatalog(assets) {
  const known=new Map();
  for(const asset of assets) for(const candidate of [asset.recordInfo,...(asset.music?.records||[])]) {
    const record=normaliseRecord(candidate);if(!record)continue;
    const key=musicKey(record.artist+':'+record.album),previous=known.get(key);
    known.set(key,previous?{...previous,tracks:[...new Set([...previous.tracks,...record.tracks])].slice(0,64)}:record);
  }
  return [...known.values()];
}
export function findRecord(catalog, query) { const key=musicKey(query);return catalog.find((record)=>record.tracks.some((track)=>[track,record.artist+track,track+record.artist].some((label)=>musicKey(label)===key))); }

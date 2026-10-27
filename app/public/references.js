const builtin = {};
function sourceUrl(value) {
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.href.length<=2048?url.href:''; }
  catch {return '';}
}
export function normaliseReferences(value) {
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.slice(0,12).flatMap((ref)=>{
    if(!ref||typeof ref.image!=='string'||!/^\/(assets|generated)\/[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(ref.image)||ref.image.includes('..')||seen.has(ref.image))return [];
    seen.add(ref.image);
    return [{image:ref.image,title:typeof ref.title==='string'?ref.title.trim().slice(0,200):'参考画像',sourceUrl:sourceUrl(ref.sourceUrl)}];
  });
}
export function roomReferences(room) {
  if(!room)return [];
  const own=normaliseReferences(room.references);
  if(own.length)return own;
  if(room.music)return normaliseReferences(room.music.records.flatMap((record)=>{
    const refs=normaliseReferences(record.references);
    return refs.length?refs:builtin[record.id]||[];
  }));
  return normaliseReferences(builtin[room.id]);
}

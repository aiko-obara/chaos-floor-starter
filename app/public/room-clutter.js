const names = {
  'music-clutter':{speaker:'モニタースピーカー',records:'レコードの運搬箱',sleeves:'空のレコードスリーブ',headphones:'ヘッドホン',equalizer:'イコライザー',cases:'機材ケース',cables:'オーディオケーブル',drinks:'スツールと飲み物',light:'ディスコの照明'},
};
const positions = {
  'music-clutter':[
    ['speaker',.24,.26,83],['speaker',.76,.22,83],['cases',.32,.14,68],
    ['records',.18,.53,62],['records',.83,.50,58],['sleeves',.30,.62,46],
    ['headphones',.61,.80,43],['equalizer',.70,.24,76],['cables',.43,.77,40],
    ['drinks',.43,.47,48],['light',.32,.91,58],['sleeves',.86,.89,35],
    ['cases',.75,.13,58],['records',.185,.535,51,37],['headphones',.245,.265,36,63],
  ],
};
export function clutterActors(theme) {
  return (positions[theme] || []).map(([file,u,v,worldWidth,elevation],index)=>({
    id:`clutter-${theme}-${index}`,name:names[theme][file],kind:'object',
    atlas:`/assets/themed-density/${theme}/${file}.png`,columns:1,rows:1,frames:1,fps:1,
    worldWidth,footAnchor:241/256,u,v,...(elevation?{elevation}:{}),
  }));
}

export function enrichRoomClutter(rooms){return rooms.map(room=>{if(room.roomStyle!=='disco')return room;const ids=new Set(room.actors.map(a=>a.id));return {...room,actors:[...room.actors,...clutterActors('music-clutter').filter(a=>!ids.has(a.id))]};});}

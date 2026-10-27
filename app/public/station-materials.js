// One material palette for the station shell, corridors and built-in fixtures.
// Character images, themed props, posters and colored indicator lights are kept.
export const STATION_PALETTE={
  floor:'#242b33',floorAlt:'#2b333d',corridor:'#2d3741',corridorAlt:'#35404b',
  wallLeft:'#303841',wallRight:'#272f38',panel:'#363f49',panelShade:'#2e3741',
  frame:'#3b4855',beam:'#414e5b',side:'#303c48',metal:'#485865',edge:'#536471',
  trim:'#697985',recess:'#22333f',dark:'#121c26',label:'#c3d1dc',labelMuted:'#94a9b9',
  selected:'#344d47',light:'#93ced2',bolt:'#5c7486',
};

// Existing architectural primitives refer to the old material swatches.
// Resolve them here so the same panel cannot remain white in another draw pass.
const p=STATION_PALETTE,aliases={};
function swatches(role,values){for(const value of values)aliases[value]=p[role];}
swatches('floor',['#edf3f4']);swatches('floorAlt',['#e8eff1']);
swatches('wallLeft',['#f3f6f6']);swatches('wallRight',['#e6edef']);
swatches('panel',['#fafbfb','#eef3f5','#e7eff1']);swatches('panelShade',['#eef4f4']);
swatches('frame',['#eef3f4','#e0eaee']);
swatches('beam',['#d2e0e5','#d0dfe6','#d1e0e7','#d3dfe4','#d4e0e5','#dfe9ed','#cbd8df','#d4e1e7','#d3e0e5']);
swatches('side',['#b3c6d0','#b8cad3','#b5c7d0','#aabfc9','#aebfc9','#c4d2d8','#c5d2d8','#d9e4e8','#d7e2e7','#e1eaee']);
swatches('edge',['#9db2bd','#bdcbd3','#c6d3d9','#c9d6dd','#b7cbd4','#d1e0e4','#9fb8c5','#9fb6c4','#8ca7b7','#9cb2bf','#aabec9','#99b9c8','#c8dce4','#a6bbc6','#8fa8b7','#829eae','#829eaf','#819aa9','#8ea7b5','#a0b4be','#8fa7b5','#8eabba','#93adbd','#9bb5c4','#92aab8','#869ca9','#8aa4b4','#7f9eae']);
swatches('metal',['#afc5d0','#b9cdd6','#bccdd4','#9cb4c1','#a6bfcb','#a7bdc8','#d6e3e7','#c4d7df','#dce9ec','#cfdee5','#c1d3dc']);
swatches('trim',['#ffffff','#fbfefe','#f8ffff','#f2fafb','#edf8fa','#e2ffff','#f2f7f7']);
swatches('recess',['#7e94a3','#809fab','#9eb9c2','#9baeb9','#afc9d4','#c1dad6','#cfdbdf','#a0b9c4','#9ab6c4','#7895a5','#8faab9','#b2c6cf','#91abb9','#aabdc7']);
swatches('dark',['#3e5968','#5e7b8c']);swatches('label',['#3d5869']);swatches('labelMuted',['#536e7e']);
swatches('beam',['#cedce2']);swatches('selected',['#bcd9b4']);swatches('bolt',['#9eb7c5','#7898aa']);
export function stationColor(value){return typeof value==='string'?(aliases[value.toLowerCase()]||value):value;}

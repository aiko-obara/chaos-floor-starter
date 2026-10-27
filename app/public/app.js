import { WorldRenderer } from './renderer.js';
import { MusicPanel } from './music-panel.js';
import { normaliseMusic, normaliseRecord, recordFromScene, recordCatalog } from './music-room.js';
import { compactRoomPlan, nextRoomAddress } from './room-layout.js';
import { normaliseReferences } from './references.js';
import { Viewer } from './viewer.js';
import { enrichRoomClutter } from './room-clutter.js';
import { normaliseStationStage, createStationStage } from './station-structures.js';

const $ = (id) => document.getElementById(id);
const lifetime = new AbortController();
const STORAGE_KEY = 'chaos-starter-world-v3';
const LEGACY_STORAGE_KEY = 'chaos-starter-world-v2';
const WORLD_PREFIX = 'F796';
const form = $('generation-form');
const prompt = $('prompt');
const submitButton = $('generate-button');
const status = $('generation-status');
const renderer = new WorldRenderer($('world-canvas'), (zoom) => {
  $('zoom-fit').title = `${Math.round(zoom * 100)}% · 全体を表示`;
}, (selection) => { queueMicrotask(() => updateSelection(selection)); }, (selection)=>viewer.activate(selection));
const viewer=new Viewer({document,renderer});
let config = null;
let assets = [];
let selectedAsset = null;
let selectedAddress = 'A02';
let referenceData = null;
let busy = false;
let placing = false;
let fileVersion = 0;
let generationVersion = 0;
let worldReady = false;
let stage = null;
let pendingJob = null;
let layoutUndo = null;
const musicPanel=new MusicPanel({document,
  getCatalog:()=>recordCatalog([...assets,...(worldReady?getPlacements():[])]),
  getRooms:()=>worldReady?getPlacements():[],getTarget:()=>worldReady?musicTarget():null,
  onModeChange:()=>{if(worldReady){updateSelection(renderer.getSelection());saveWorld();}},
  onPlace:placeMusicRecord,onFocus:focusMusicRoom,onGenerate:generateMusicRecord,readImage:readReferenceImage,
});

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `generation-status ${kind}`;
  if(pendingJob?.mode==='music')musicPanel.setStatus(message,kind);
}

function assetType() {
  return form.querySelector('input[name="asset-type"]:checked')?.value === 'object' ? 'object' : 'character';
}

function canonicalReferenceUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function markDirty() {
  $('input-state').textContent = '未生成';
  $('input-state').classList.remove('generated');
  $('prompt-count').textContent = `${prompt.value.length} / 2000`;
  const query = prompt.value.trim();
  $('image-search').href = `https://www.google.com/search?udm=2&q=${encodeURIComponent(query || (assetType() === 'object' ? 'オブジェクト' : 'キャラクター'))}`;
  if (!busy && config) setStatus(config.generationAvailable ? '参照画像を選び、素材を生成してください。' : '自由入力の生成は未接続です。作成済みの素材で、番地への配置を試せます。');
}

function safeAssetUrl(value) {
  return typeof value === 'string' && /^\/(?:assets|generated)\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..');
}

function normaliseAsset(scene, index = 0) {
  const kind = scene.assetType === 'object' || scene.actors?.[0]?.kind === 'object' ? 'object' : 'character';
  return {
    ...scene,
    id: scene.id || `asset-${index}`,
    title: scene.name || scene.characterName || scene.title || (kind === 'object' ? 'オブジェクト' : 'キャラクター'),
    assetType: scene.assetType === 'collection' ? 'collection' : kind,
    actors: (scene.actors || []).map((actor) => ({
      ...actor,
      kind: actor.kind || kind,
      name: actor.name || scene.name || scene.characterName || scene.title,
      sceneId: actor.sceneId || scene.id || `asset-${index}`,
      title: actor.title || scene.name || scene.characterName || scene.title,
      prompt: actor.prompt || scene.prompt || '',
    })),
  };
}

function getPlacements() {
  return renderer.getPlacements();
}

function boundedText(value, maximum = 200) {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

function savedActor(value, placement = false) {
  if (!value || typeof value !== 'object' || !safeAssetUrl(value.atlas)) return null;
  const columns = value.columns;
  const rows = value.rows;
  if (!Number.isInteger(columns) || columns < 1 || columns > 16 || !Number.isInteger(rows) || rows < 1 || rows > 16) return null;
  const address = String(value.address || '').replace(/^F796-/, '');
  if (placement && !/^[A-H]0[1-8]$/.test(address)) return null;
  const actor = {
    id: boundedText(value.id), assetId: boundedText(value.assetId),
    kind: value.kind === 'object' ? 'object' : 'character',
    name: boundedText(value.name), title: boundedText(value.title),
    prompt: boundedText(value.prompt, 2000), sceneId: boundedText(value.sceneId),
    atlas: value.atlas, columns, rows,
    frames: Math.max(1, Math.min(columns * rows, Number.isInteger(value.frames) ? value.frames : 1)),
    fps: Math.max(.1, Math.min(30, Number.isFinite(value.fps) ? value.fps : 5)),
    motion: boundedText(value.motion, 120),
  };
  if (Array.isArray(value.frameDurations) && value.frameDurations.length === actor.frames && value.frameDurations.every((duration) => Number.isFinite(duration) && duration >= 40 && duration <= 4000)) actor.frameDurations = [...value.frameDurations];
  if (placement) actor.address = address;
  if (actor.kind === 'character' && ['left', 'right'].includes(value.facing)) actor.facing = value.facing;
  for (const [key, maximum] of [['worldWidth', 1000], ['scale', 5], ['footAnchor', 1], ['elevation', 96], ['u', 1], ['v', 1]]) {
    if (Number.isFinite(value[key]) && value[key] > 0 && value[key] <= maximum) actor[key] = value[key];
  }
  return actor;
}

function savedAsset(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 200 || !Array.isArray(value.actors) || !value.actors.length || value.actors.length > 64) return null;
  const actors = value.actors.map((actor) => savedActor(actor && { ...actor, kind: actor.kind || value.assetType }));
  if (actors.some((actor) => !actor)) return null;
  const music=normaliseMusic(value.music),recordInfo=value.recordInfo===undefined?undefined:normaliseRecord(value.recordInfo);
  if(music===null || (value.roomStyle==='disco'&&!music) || recordInfo===null)return null;
  return normaliseAsset({
    id: value.id, name: boundedText(value.name || value.title),
    title: boundedText(value.title), prompt: boundedText(value.prompt, 2000),
    assetType: value.assetType === 'collection' ? 'collection' : value.assetType === 'object' ? 'object' : 'character',
    accent: /^#[0-9a-f]{6}$/i.test(value.accent || '') ? value.accent : '#b8cbd2',
    source: value.source === 'sample' ? 'sample' : 'generated', actors,
    ...(value.roomStyle==='disco'?{roomStyle:'disco',music}:{}),...(recordInfo?{recordInfo}:{}),
    ...(normaliseReferences(value.references).length?{references:normaliseReferences(value.references)}:{}),
  });
}

function savedPendingJob(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) return null;
  const info=value.mode==='music'?musicInfo(value.recordInfo):null;
  if(value.mode==='music'&&!info)return null;
  return {
    id: value.id, name: boundedText(value.name), prompt: boundedText(value.prompt, 2000),
    assetType: value.assetType === 'object' ? 'object' : 'character',
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : Date.now(),
    ...(info?{mode:'music',recordInfo:info}:{}),
  };
}

function savedRoom(value) {
  const scene = savedAsset(value);
  const address = String(value?.address || '').replace(/^F796-/, '');
  return scene && /^[A-H]0[1-8]$/.test(address) ? { ...scene, address } : null;
}

function readSavedWorld() {
  const result = { rooms: null, assets: [], pendingJob: null, legacy: false,creationMode:'world',musicQuery:'' };
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const raw = current || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return result;
    if (raw.length > 4000000) { result.error = '保存データが大きすぎます。元データは保持しています。'; return result; }
    const saved = JSON.parse(raw);
    result.creationMode=saved.creationMode==='music'?'music':'world';result.musicQuery=boundedText(saved.musicQuery);
    result.stage=normaliseStationStage(saved.stage);
    if (![2, 3].includes(saved.version)) { result.error = '保存形式に対応していません。元データは保持しています。'; return result; }
    if (saved.version === 3 && (!Array.isArray(saved.rooms) || saved.rooms.length > 64)) result.error = '保存した番地データを確認できません。元データは保持しています。';
    if (saved.version === 3 && Array.isArray(saved.rooms) && saved.rooms.length <= 64) {
      const rooms = saved.rooms.map(savedRoom), used = new Set();
      if (rooms.every((room) => room && !used.has(room.address) && used.add(room.address))) result.rooms = rooms;
      else result.error = '保存した番地データを確認できません。元データは保持しています。';
      if (/^[A-H]0[1-8]$/.test(saved.selectedAddress || '')) selectedAddress = saved.selectedAddress;
    }
    if (saved.version === 2 && Array.isArray(saved.placements) && saved.placements.length <= 64) {
      const actors = saved.placements.map((actor) => savedActor(actor)).filter(Boolean);
      if (actors.length) result.rooms = [{ id: 'starter-legacy', title: '以前の部屋', prompt: '保存した素材', assetType: 'collection', source: 'sample', address: 'A01', accent: '#e9c687', actors }];
      result.legacy = true;
    }
    if (Array.isArray(saved.assets)) result.assets = saved.assets.map(savedAsset).filter(Boolean);
    result.pendingJob = savedPendingJob(saved.pendingJob);
    return result;
  } catch { result.error = '保存データを読み取れません。元データは保持しています。'; return result; }
}

function worldDocument() {
  return { version: 3, floor: 796, style: 'pixel-isometric',
    rooms: getPlacements(), selectedAddress, stage,
    assets: assets.map(savedAsset).filter(Boolean), pendingJob: savedPendingJob(pendingJob),
    creationMode:musicPanel.mode,musicQuery:musicPanel.query };
}

function saveWorld() {
  try {
    const snapshot = JSON.stringify(worldDocument());
    if (snapshot.length > 4000000) throw new Error('保存容量を超えています。');
    localStorage.setItem(STORAGE_KEY, snapshot);
    $('save-note').textContent = '番地ごとの一式と、部屋の中の配置を保存しました。';
  } catch {
    $('save-note').textContent = 'このブラウザには保存できません。「配置を保存」から JSON を保存できます。';
  }
}

function mergeSavedAssets(samples, saved) {
  const known = new Map(samples.map((scene) => [scene.id, scene]));
  for (const scene of saved.assets) {
    if (known.has(scene.id)) continue;
    // Old sample sprites now form one collection. Keep generated materials reusable.
    if (scene.source === 'sample' && samples.some((sample) => sample.actors.some((a) => scene.actors.some((b) => a.atlas === b.atlas || a.legacyAtlases?.includes(b.atlas))))) continue;
    known.set(scene.id, scene);
  }
  for (const room of saved.rooms || []) if (!known.has(room.id)) known.set(room.id, normaliseAsset(room));
  return [...known.values()];
}

// Upgrade only recognized built-in animation revisions; keep the user's room,
// membership, free coordinates, scale and every custom/generated asset intact.
function upgradeSampleMotions(rooms, samples) {
  return rooms.map((room) => {
    const sample = samples.find((item) => item.id === room.id);
    if (!sample) return room;
    return { ...room, actors: room.actors.map((actor) => {
      const replacement = sample.actors.find((item) => item.id === actor.id && item.legacyAtlases?.includes(actor.atlas));
      if (!replacement) return actor;
      return { ...actor, atlas: replacement.atlas, columns: replacement.columns, rows: replacement.rows,
        frames: replacement.frames, fps: replacement.fps, motion: replacement.motion,
        frameDurations: replacement.frameDurations ? [...replacement.frameDurations] : undefined };
    }) };
  });
}

function syncPlayback() {
  const paused = !renderer.playing;
  $('play-button').setAttribute('aria-label', paused ? '再生' : '一時停止');
  $('play-button').setAttribute('aria-pressed', String(paused));
  $('play-icon').textContent = paused ? '▶' : 'Ⅱ';
  $('playback-label').textContent = paused ? 'アニメーション一時停止中' : 'アニメーション再生中';
  ['play-button', 'zoom-out', 'zoom-in', 'zoom-fit', 'export-world'].forEach((id) => { $(id).disabled = !worldReady; });
  updateLayoutControls();
}

function updateLayoutControls() {
  const rooms = worldReady ? getPlacements() : [], locked = !worldReady || busy || placing;
  $('next-address').disabled = locked || !nextRoomAddress(rooms);
  $('arrange-world').disabled = locked || rooms.length < 2 || compactRoomPlan(rooms).every((entry)=>entry.from===entry.to);
  $('undo-layout').hidden = !layoutUndo;
  $('undo-layout').disabled = locked || !layoutUndo;
}
function clearLayoutUndo() {
  layoutUndo = null;
  $('layout-note').textContent = '並べ直すと番地が変わります。部屋の中はそのまま。';
}

function updateSelection(selection) {
  if (lifetime.signal.aborted) return;
  const detail = typeof selection === 'string' ? renderer.getSelection() : selection || renderer.getSelection();
  if (detail?.address) selectedAddress = detail.address.replace(/^F796-/, '');
  const occupied = !!detail?.occupied;
  const fullAddress = `${WORLD_PREFIX}-${selectedAddress}`;
  $('coordinate-label').textContent = fullAddress;
  $('placement-heading').textContent = fullAddress;
  $('address-state').textContent = occupied ? '配置済み' : '空き番地';
  $('address-state').classList.toggle('occupied', occupied);
  const room = detail?.room;
  $('placement-detail').textContent = occupied
    ? room.roomStyle==='disco'?`好きな曲のジャケット ${room.music.records.length} / 48 枚 · ラック6台のMusic部屋。`:`${room.title} · ${room.actors.length} 点がこの番地にまとまっています。`
    : selectedAsset ? `${selectedAsset.title} の一式を置けます。室内の位置は生成時に決まります。` : 'テーマを選んで、この番地に一式を置きましょう。';
  $('place-label').textContent = room?.roomStyle==='disco'?'Music部屋を大きく見る':selectedAsset?.recordInfo?'Musicモードで飾る':occupied ? '番地の一式を置き換える' : '一式をこの番地に置く';
  $('place-button').disabled = !worldReady || !selectedAsset || placing;
  const rooms = worldReady ? getPlacements() : [];
  $('placed-count').textContent = String(rooms.length).padStart(2, '0');
  const occupiedAddresses = new Map(rooms.map((item) => [item.address, item]));
  document.querySelectorAll('.address-cell').forEach((cell) => {
    const address = cell.dataset.address, placed = occupiedAddresses.get(address);
    cell.setAttribute('aria-pressed', String(address === selectedAddress));
    cell.dataset.occupied = String(!!placed);
    cell.setAttribute('aria-label', `${WORLD_PREFIX}-${address} ${placed ? `${placed.title} ${placed.actors.length}点` : '空き番地'}`);
  });
  musicPanel.refresh();
  updateLayoutControls();
}

function selectAsset(scene) {
  selectedAsset = scene;
  if (worldReady && !scene.recordInfo && scene.roomStyle !== 'disco') {
    const rooms = getPlacements();
    if (!rooms.some((room)=>room.id===scene.id) && rooms.some((room)=>room.address===selectedAddress)) {
      const address = nextRoomAddress(rooms);
      if (address) renderer.selectAddress(address);
    }
  }
  document.querySelectorAll('.asset-card').forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.assetId === scene.id)));
  updateSelection(renderer.getSelection());
}

function renderAssetList() {
  $('asset-list').replaceChildren();
  const themes=assets.filter((scene)=>scene.roomStyle!=='disco'&&!scene.recordInfo);
  themes.forEach((scene) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'asset-card';
    card.dataset.assetId = scene.id;
    card.setAttribute('aria-pressed', String(selectedAsset?.id === scene.id));
    const thumb = document.createElement('span');
    thumb.className = 'asset-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('span');
    const actor = scene.actors[0];
    if (actor && safeAssetUrl(actor.atlas)) {
      frame.style.backgroundImage = `url(${JSON.stringify(actor.atlas)})`;
      frame.style.backgroundSize = `${Math.max(1, actor.columns || 1) * 100}% ${Math.max(1, actor.rows || 1) * 100}%`;
    }
    thumb.append(frame);
    const text = document.createElement('span');
    text.className = 'asset-card-text';
    const type = document.createElement('span');
    type.className = 'asset-tag';
    type.textContent = 'THEME COLLECTION';
    const title = document.createElement('strong');
    title.textContent = scene.title;
    const note = document.createElement('span');
    note.textContent = `${scene.actors.length} 点をひとつの番地へ${actor?.motion ? ` · ${actor.motion}` : ''}`;
    text.append(type, title, note);
    card.append(thumb, text);
    card.addEventListener('click', () => selectAsset(scene));
    $('asset-list').append(card);
  });
  $('asset-count').textContent = String(themes.length).padStart(2, '0');
}

function renderAddressGrid() {
  const addresses = renderer.getAddresses?.() || renderer.addresses();
  $('address-grid').replaceChildren();
  addresses.forEach((address) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'address-cell';
    cell.dataset.address = address;
    cell.textContent = address;
    cell.setAttribute('aria-pressed', 'false');
    cell.addEventListener('click', () => renderer.selectAddress(address));
    $('address-grid').append(cell);
  });
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  lifetime.signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error?.message || '接続を確認して、もう一度お試しください。');
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('接続に時間がかかっています。ページを開き直して確認してください。');
    throw error;
  } finally {
    clearTimeout(timeout);
    lifetime.signal.removeEventListener('abort', abort);
  }
}

function waitForPoll(milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { lifetime.signal.removeEventListener('abort', stop); resolve(); }, milliseconds);
    const stop = () => { clearTimeout(timer); resolve(); };
    lifetime.signal.addEventListener('abort', stop, { once: true });
  });
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  submitButton.querySelector('span').textContent = value ? 'アニメーションを生成中…' : pendingJob ? '前回の生成を確認する' : '素材を生成する';
  form.querySelectorAll('input,textarea,button:not([type="submit"])').forEach((input) => { input.disabled = value; });
  form.setAttribute('aria-busy', String(value));
  musicPanel.setBusy(value);
  updateLayoutControls();
}

function musicInfo(value) {
  if(!value || !['track','artist','album'].every((key)=>typeof value[key]==='string'&&value[key].trim()&&value[key].length<=200))return null;
  const sourceUrl=canonicalReferenceUrl(value.sourceUrl||'');if(!sourceUrl)return null;
  return {track:value.track.trim(),artist:value.artist.trim(),album:value.album.trim(),sourceUrl};
}
async function readReferenceImage(file) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6*1024*1024)throw new Error('PNG・JPEG・WebP、6 MB 以下の参照画像を選んでください。');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('画像を読み込めませんでした。'));reader.readAsDataURL(file);});
}
function musicTarget() {
  const rooms=getPlacements();
  const selected=rooms.find((room)=>room.address===selectedAddress);
  if(selected?.roomStyle==='disco')return selected;
  if(!selected)return {address:selectedAddress};
  return rooms.find((room)=>room.roomStyle==='disco')||{address:nextRoomAddress(rooms)};
}
async function placeMusicRecord(record) {
  if(!worldReady)throw new Error('宇宙の準備ができるまでお待ちください。');
  if(busy||placing)throw new Error('現在の処理が終わるまでお待ちください。');
  const target=musicTarget();if(!target.address)throw new Error('空き番地がありません。');
  placing=true;
  updateSelection(renderer.getSelection());
  try {
    const result=await renderer.placeRecord(record,{address:target.address});
    if(!result.placed)throw new Error('配置を完了できませんでした。');
    clearLayoutUndo();selectedAddress=target.address;saveWorld();updateSelection(renderer.getSelection());showWorldStage();return result;
  } finally{placing=false;updateSelection(renderer.getSelection());}
}
function focusMusicRoom() {
  if(!worldReady)return;const room=musicTarget();
  if(room.roomStyle==='disco'){renderer.focusAddress(room.address);saveWorld();showWorldStage();}
}
function showWorldStage(){viewer.setStudioOpen(false);}
async function generateMusicRecord(info, imageData) {
  if(busy||placing)return;
  if(!worldReady)throw new Error('宇宙の準備ができるまでお待ちください。');
  if(pendingJob){await pollPendingGeneration({resumed:true});return;}
  if(!config?.generationAvailable)throw new Error('自由入力の生成は未接続です。今回制作した「ハゼ馳せる果てるまで」のジャケットは、曲名から選んで飾れます。');
  const checked=musicInfo(info);if(!checked)throw new Error('曲名・アルバム名・アーティストと、確認したHTTPSのページを入力してください。');
  if(!imageData)throw new Error('ジャケットの参照画像を選んでください。');
  const direction=`曲「${checked.track}」、アーティスト「${checked.artist}」、収録アルバム「${checked.album}」。参照のアルバムジャケットの構図と主要な配色を保ち、共通の等角ピクセル画のレコードジャケットとして制作。印刷面とケースは固定し、星のきらめきや保護スリーブの光が動く4コマのループ。ディスコのレコードラックに飾る一枚の素材。`;
  setBusy(true);musicPanel.setStatus('ジャケットを共通の画風で生成し、動きを付けています。','running');
  try {
    const job=await api('/api/generations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:direction,assetType:'object',reference:{name:checked.album,pageUrl:checked.sourceUrl,imageData}})});
    pendingJob=savedPendingJob({id:job.id,name:checked.album,prompt:direction,assetType:'object',mode:'music',recordInfo:checked,startedAt:Date.now()});
    if(!pendingJob)throw new Error('生成の受付番号を確認できませんでした。');
    saveWorld();await pollPendingGeneration();
  } finally{if(!lifetime.signal.aborted)setBusy(false);}
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (!worldReady) { setStatus('宇宙の準備ができるまでお待ちください。', 'error'); return; }
  if (pendingJob) { await pollPendingGeneration({ resumed: true }); return; }
  if (!prompt.value.trim()) { prompt.focus(); return; }
  if (!config?.generationAvailable) {
    setStatus(config ? '自由入力の生成は未接続です。入力内容はそのまま残っています。作成済み素材を選び、番地への配置を試せます。' : '生成の接続状態を取得できません。ページを開き直してください。', 'error');
    return;
  }
  const name = $('reference-name').value.trim();
  if (!name) { setStatus('特定した素材の名前を入力してください。', 'error'); document.querySelector('.reference-details').open = true; $('reference-name').focus(); return; }
  const pageUrl = canonicalReferenceUrl($('reference-url').value);
  if (!pageUrl) { setStatus('参照ページの https:// で始まる URL を入力してください。', 'error'); document.querySelector('.reference-details').open = true; $('reference-url').focus(); return; }
  if (!referenceData) {
    setStatus('生成に使う参照画像を選んでください。', 'error');
    document.querySelector('.reference-details').open = true;
    $('reference-file').focus();
    return;
  }
  const submitted = { prompt: prompt.value.trim(), assetType: assetType(), reference: { name, pageUrl, imageData: referenceData } };
  setBusy(true);
  setStatus('参照画像を共通の画風に描き直し、動きをつけています。数分かかる場合があります。', 'running');
  try {
    const job = await api('/api/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) });
    pendingJob = savedPendingJob({ id: job.id, name, prompt: submitted.prompt, assetType: submitted.assetType, startedAt: Date.now() });
    if (!pendingJob) throw new Error('生成の受付番号を確認できませんでした。新しい生成は自動で開始しません。');
    saveWorld();
    await pollPendingGeneration();
  } catch (error) {
    if (!lifetime.signal.aborted) setStatus(error.message || '生成できませんでした。入力内容は保持しています。', 'error');
  } finally {
    if (!lifetime.signal.aborted) setBusy(false);
  }
});

async function pollPendingGeneration({ resumed = false } = {}) {
  if (!pendingJob) return;
  const job = pendingJob;
  const version = ++generationVersion;
  const started = Date.now();
  setBusy(true);
  if (resumed) setStatus('前回の生成結果を確認しています。新しい生成は開始していません。', 'running');
  try {
    while (!lifetime.signal.aborted && version === generationVersion) {
      const result = await api(`/api/generations/${encodeURIComponent(job.id)}`);
      if (lifetime.signal.aborted || version !== generationVersion) return;
      if (result.status === 'failed') {
        pendingJob = null;
        saveWorld();
        throw new Error(result.error?.message || '生成を完了できませんでした。');
      }
      if (result.status === 'succeeded') {
        const info=job.mode==='music'?recordFromScene(result.scene,job.recordInfo):null;
        if(job.mode==='music'&&!info)throw new Error('生成したジャケットを確認できませんでした。');
        const scene = savedAsset({ ...result.scene, name: result.scene?.name || job.name, prompt: job.prompt, assetType: job.assetType, source: 'generated',...(info?{recordInfo:info}:{}) });
        if (!scene) {
          pendingJob = null;
          saveWorld();
          throw new Error('生成結果に素材が見つかりませんでした。');
        }
        const index = assets.findIndex((asset) => asset.id === scene.id);
        if (index >= 0) assets[index] = scene;
        else assets.push(scene);
        if(!info)selectAsset(scene);
        pendingJob = null;
        saveWorld();
        renderAssetList();
        updateSelection(renderer.getSelection());
        if(!info){$('input-state').textContent = '生成済み';$('input-state').classList.add('generated');}
        if(info){musicPanel.showRecord(info);musicPanel.setStatus('ジャケットができました。Music部屋に飾れます。');}
        else setStatus('動く素材ができました。床の番地を選び、一式をひとつの番地へ置けます。');
        return;
      }
      if (result.status !== 'running') {
        pendingJob = null;
        saveWorld();
        throw new Error('生成状態を確認できませんでした。');
      }
      if (Date.now() - started > 6 * 60 * 1000) throw new Error('生成結果の確認を中断しました。再読み込みで前回の生成を再確認できます。');
      await waitForPoll(1800);
    }
  } catch (error) {
    if (error.status === 404) {
      pendingJob = null;
      saveWorld();
      if (!lifetime.signal.aborted) {setStatus('前回の生成をサーバーで確認できませんでした。保存済みの素材と配置は保持しています。新しい生成は開始していません。', 'error');if(job.mode==='music')musicPanel.setStatus('前回の生成を確認できませんでした。新しい生成は開始していません。','error');}
    } else if (!lifetime.signal.aborted) {
      setStatus(`${error.message || '生成結果を確認できませんでした。'}${pendingJob ? ' 再読み込みで前回の生成を再確認できます。新しい生成は自動で開始しません。' : ''}`, 'error');
      if(job.mode==='music')musicPanel.setStatus(error.message||'生成結果を確認できませんでした。','error');
    }
  } finally {
    if (!lifetime.signal.aborted) setBusy(false);
  }
}

prompt.addEventListener('input', markDirty);
['reference-name', 'reference-url'].forEach((id) => $(id).addEventListener('input', markDirty));
form.querySelectorAll('input[name="asset-type"]').forEach((input) => input.addEventListener('change', markDirty));
$('reference-file').addEventListener('change', async () => {
  const version = ++fileVersion;
  const file = $('reference-file').files?.[0];
  referenceData = null;
  $('upload-preview').hidden = true;
  $('upload-label').textContent = '参照画像を選ぶ';
  $('reference-indicator').textContent = '未選択';
  markDirty();
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) {
    setStatus('PNG・JPEG・WebP、6 MB 以下の参照画像を選んでください。', 'error');
    $('reference-file').value = '';
    return;
  }
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      reader.readAsDataURL(file);
    });
    if (version !== fileVersion || lifetime.signal.aborted) return;
    referenceData = data;
    $('reference-preview').src = data;
    $('upload-label').textContent = '参照画像を変更する';
    $('reference-indicator').textContent = '画像を選択済み';
    $('upload-preview').hidden = false;
    if (config?.generationAvailable) setStatus('参照画像を選択しました。生成を開始できます。');
  } catch (error) { setStatus(error.message, 'error'); }
});
$('remove-reference').addEventListener('click', () => {
  ++fileVersion;
  referenceData = null;
  $('reference-file').value = '';
  $('reference-preview').removeAttribute('src');
  $('upload-preview').hidden = true;
  $('upload-label').textContent = '参照画像を選ぶ';
  $('reference-indicator').textContent = '未選択';
  markDirty();
});
$('place-button').addEventListener('click', async () => {
  if (!worldReady || !selectedAsset || placing) return;
  if(renderer.getSelection().room?.roomStyle==='disco'){musicPanel.setMode('music');renderer.focusAddress(selectedAddress);saveWorld();showWorldStage();return;}
  if(selectedAsset.recordInfo){musicPanel.setMode('music');musicPanel.showRecord(selectedAsset.recordInfo);return;}
  const asset = selectedAsset;
  const address = selectedAddress;
  placing = true;
  updateSelection(renderer.getSelection());
  try {
    const placed = await renderer.appendScene(asset, { address });
    if (!placed || lifetime.signal.aborted) throw new Error('素材を配置できませんでした。');
    clearLayoutUndo();
    renderer.selectAddress(address);
    saveWorld();
    $('save-note').textContent = `${asset.title} を ${WORLD_PREFIX}-${address} に配置しました。${$('save-note').textContent}`;
    showWorldStage();
  } catch (error) {
    if (!lifetime.signal.aborted) $('save-note').textContent = error.message || '配置できませんでした。';
  } finally {
    placing = false;
    if (!lifetime.signal.aborted) updateSelection(renderer.getSelection());
  }
});
$('next-address').addEventListener('click', () => {
  if (!worldReady || busy || placing) return;
  const address = nextRoomAddress(getPlacements());
  if (!address) return;
  renderer.selectAddress(address); renderer.resetView(); updateSelection(renderer.getSelection()); saveWorld(); showWorldStage();
  if (!layoutUndo) clearLayoutUndo();
});
$('arrange-world').addEventListener('click', () => {
  if (!worldReady || busy || placing) return;
  const plan = compactRoomPlan(getPlacements());
  if (plan.length < 2 || plan.every((entry)=>entry.from===entry.to)) return;
  const previousSelection = selectedAddress;
  try {
    renderer.readdressRooms(plan);
    layoutUndo = {plan:plan.map(({from,to})=>({from:to,to:from})),selectedAddress:previousSelection};
    updateSelection(renderer.getSelection()); saveWorld(); showWorldStage();
    $('layout-note').textContent = `${plan.length}部屋を前後左右に並べ直し、番地を更新しました。次の配置・再読み込みまで戻せます。`;
  } catch (error) { $('layout-note').textContent = error.message || '部屋を並べ直せませんでした。'; }
});
$('undo-layout').addEventListener('click', () => {
  if (!worldReady || busy || placing || !layoutUndo) return;
  try {
    renderer.readdressRooms(layoutUndo.plan,{selectedAddress:layoutUndo.selectedAddress});
    layoutUndo = null; updateSelection(renderer.getSelection()); saveWorld(); showWorldStage();
    $('layout-note').textContent = '並べ直す前の番地へ戻しました。';
  } catch (error) { $('layout-note').textContent = error.message || '元の配置へ戻せませんでした。'; }
});
$('play-button').addEventListener('click', () => { renderer.setPlaying(!renderer.playing); syncPlayback(); });
$('zoom-out').addEventListener('click', () => renderer.setZoom(renderer.zoom / 1.2));
$('zoom-in').addEventListener('click', () => renderer.setZoom(renderer.zoom * 1.2));
$('zoom-fit').addEventListener('click', () => renderer.resetView());
$('export-world').addEventListener('click', () => {
  if (!worldReady) return;
  const blob = new Blob([JSON.stringify(worldDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'chaos-floor-796.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => { generationVersion += 1; lifetime.abort(); renderer.destroy(); }, { once: true });
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });

async function init() {
  markDirty();
  syncPlayback();
  const [configResult, sampleResult] = await Promise.allSettled([api('/api/config'), api('/api/samples')]);
  if (configResult.status === 'fulfilled') {
    config = configResult.value;
    markDirty();
  } else setStatus('生成の接続状態を取得できません。ページを開き直してください。', 'error');
  if (sampleResult.status !== 'fulfilled' || !sampleResult.value.samples?.length) throw new Error('素材を読み込めませんでした。ページを開き直してください。');
  const samples = sampleResult.value.samples.map(normaliseAsset);
  const saved = readSavedWorld();
  if (saved.error) throw new Error(saved.error);
  assets = mergeSavedAssets(samples, saved);
  pendingJob = saved.pendingJob;
  musicPanel.restore(saved.creationMode,saved.musicQuery);
  selectedAsset = assets.find((scene) => scene.address === selectedAddress) || assets[0];
  const initialRooms = samples.map((scene, index) => ({ ...scene, address: scene.address || `A0${index + 1}` }));
  let rooms = saved.rooms || initialRooms;
  if (!saved.rooms && !saved.legacy) {
    const plan = compactRoomPlan(rooms);
    rooms = rooms.map((room,index)=>({...room,address:plan[index].to}));
    selectedAddress = rooms.find((room)=>room.id===selectedAsset?.id)?.address || rooms[0].address;
  }
  if (saved.legacy) {
    const known = new Set(rooms.map((room) => room.id));
    const occupied = new Set(rooms.map((room) => room.address));
    for (const scene of initialRooms) if (!known.has(scene.id)) {
      const address = !occupied.has(scene.address) ? scene.address : nextRoomAddress(rooms);
      if (address) { rooms = [...rooms, { ...scene, address }]; occupied.add(address); }
    }
  }
  rooms = upgradeSampleMotions(rooms, samples);
  rooms = enrichRoomClutter(rooms, samples);
  stage = saved.stage || createStationStage();
  const selectedRoom = rooms.find((room)=>room.address===selectedAddress);
  selectedAsset = assets.find((scene)=>scene.id===selectedRoom?.id) || selectedAsset;
  renderAssetList();
  try {
    worldReady = await renderer.load({ rooms, selectedAddress, stage });
  } catch (error) {
    // A failed saved scene is never silently replaced by a sample world.
    throw new Error(`保存した番地を表示できませんでした。保存データは保持しています。${error.message || ''}`);
  }
  if (!worldReady) throw new Error('宇宙を表示できませんでした。ページを開き直してください。');
  renderer.fillView();
  $('stage-empty').hidden = true;
  $('stage').setAttribute('aria-busy', 'false');
  renderAddressGrid();
  renderer.selectAddress(selectedAddress);
  if(saved.creationMode==='music'&&renderer.getSelection().room?.roomStyle==='disco')renderer.focusAddress(selectedAddress);
  updateSelection(renderer.getSelection());
  syncPlayback();
  saveWorld();
  if (pendingJob) {
    if(pendingJob.mode==='music')musicPanel.resume(pendingJob);
    else {
      prompt.value = pendingJob.prompt;
      $('reference-name').value = pendingJob.name;
      form.querySelectorAll('input[name="asset-type"]').forEach((input) => { input.checked = input.value === pendingJob.assetType; });
      markDirty();
    }
    await pollPendingGeneration({ resumed: true });
  }
}

init().catch((error) => {
  $('stage-empty').querySelector('p').textContent = error.message || 'ページを読み込めませんでした。';
  $('stage-empty').querySelector('.loading-ring').hidden = true;
  $('stage').setAttribute('aria-busy', 'false');
  setStatus(error.message || 'ページを読み込めませんでした。開き直してください。', 'error');
});

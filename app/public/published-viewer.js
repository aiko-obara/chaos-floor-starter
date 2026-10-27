import { WorldRenderer } from './renderer.js';
import { Viewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const renderer = new WorldRenderer($('world-canvas'), (zoom) => {
  $('zoom-fit').title = `${Math.round(zoom * 100)}% · 全体を表示`;
}, (selection) => {
  $('coordinate-label').textContent = selection.address;
}, (selection) => viewer.activate(selection));
const viewer = new Viewer({ document, renderer, editable: false });

function syncPlayback() {
  $('play-button').setAttribute('aria-pressed', String(!renderer.playing));
  $('play-button').setAttribute('aria-label', renderer.playing ? '一時停止' : '再生');
  $('play-icon').textContent = renderer.playing ? 'Ⅱ' : '▶';
  $('playback-label').textContent = renderer.playing ? 'アニメーション再生中' : 'アニメーション停止中';
}
$('play-button').addEventListener('click', () => {
  renderer.setPlaying(!renderer.playing);
  syncPlayback();
});
$('zoom-out').addEventListener('click', () => renderer.setZoom(renderer.zoom / 1.2));
$('zoom-in').addEventListener('click', () => renderer.setZoom(renderer.zoom * 1.2));
$('zoom-fit').addEventListener('click', () => renderer.resetView());
const lifetime = new AbortController();
window.addEventListener('pagehide', () => { lifetime.abort(); renderer.destroy(); }, { once: true });
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });

async function init() {
  syncPlayback();
  const response = await fetch('/world.json', { signal: lifetime.signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('カオスを読み込めませんでした。ページを開き直してください。');
  const world = await response.json();
  if (world.version !== 3 || !world.rooms?.length) throw new Error('公開データを確認できません。');
  if (!await renderer.load(world)) throw new Error('カオスを表示できませんでした。');
  renderer.fillView();
  $('placed-count').textContent = String(world.rooms.reduce((sum, room) => sum + room.actors.length, 0));
  $('stage-empty').hidden = true;
  $('stage').setAttribute('aria-busy', 'false');
  syncPlayback();
}
init().catch((error) => {
  if (lifetime.signal.aborted) return;
  $('stage-empty').querySelector('p').textContent = error.message || 'ページを読み込めませんでした。';
  $('stage-empty').querySelector('.loading-ring').hidden = true;
  $('stage').setAttribute('aria-busy', 'false');
});

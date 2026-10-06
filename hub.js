/* NEXUS YouTube Power Hub 2.0.0 — Ultimate YouTube Player & Creator Overlay
 * Glassmorphism Dark UI, Shadow DOM isolation, zero external dependencies.
 * Works seamlessly on youtube.com or any embedded HTML5 video player.
 */
(() => {
'use strict';

window.YTHub?.destroy?.();

const KEY = 'yt-nexus-hub-v1';
const abort = new AbortController();
const pending = new Set();
const logs = [];

// Base data state
let data = {
  version: 2,
  videoNotes: {}, // keyed by videoId
  customSpeed: 1.0,
  volumeBoost: 100, // percentage 100% - 600%
  filters: { brightness: 100, contrast: 100, saturate: 100, invert: 0, sepia: 0 },
  zenMode: false,
  loopA: null,
  loopB: null,
  accent: '#ff0033',
  opacity: 94
};

try {
  const saved = localStorage.getItem(KEY);
  if (saved) Object.assign(data, JSON.parse(saved));
} catch (e) {
  logs.push('Erro localStorage: ' + e.message);
}

let page = 'controls';
let alive = true;
let isMaximized = false;
let isMiniDock = false;

// Audio Booster via Web Audio API
let audioCtx = null;
let audioSourceNode = null;
let gainNode = null;

function setupAudioBooster(video) {
  try {
    if (!video) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && !audioSourceNode) {
      // Create media element source if cross-origin allows
      try {
        audioSourceNode = audioCtx.createMediaElementSource(video);
        gainNode = audioCtx.createGain();
        audioSourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      } catch (err) {
        // May fail if already connected or CORS restricted
      }
    }
    if (gainNode) {
      gainNode.gain.setValueAtTime((data.volumeBoost || 100) / 100, audioCtx.currentTime);
    }
  } catch {}
}

function setBoostGain(percent) {
  data.volumeBoost = percent;
  save();
  const v = getVideo();
  if (v && !gainNode) setupAudioBooster(v);
  if (gainNode && audioCtx) {
    gainNode.gain.setValueAtTime(percent / 100, audioCtx.currentTime);
  }
}

// Video Element Helpers
function getVideo() {
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function getVideoId() {
  const url = new URL(location.href);
  if (url.searchParams.has('v')) return url.searchParams.get('v');
  const path = url.pathname;
  if (path.startsWith('/shorts/')) return path.split('/')[2];
  if (path.startsWith('/embed/')) return path.split('/')[2];
  return 'demo-video';
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTimeToSeconds(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(str) || 0;
}

// Apply Video Filters
function applyVideoFilters() {
  const v = getVideo();
  if (!v) return;
  const f = data.filters;
  v.style.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) invert(${f.invert}%) sepia(${f.sepia}%)`;
}

// A-B Loop Watcher
let loopInterval = setInterval(() => {
  const v = getVideo();
  if (!v || data.loopA === null || data.loopB === null) return;
  if (v.currentTime >= data.loopB) {
    v.currentTime = data.loopA;
  }
}, 200);

// Zen Mode Style Injection
let zenStyleEl = null;
function toggleZenMode(enable) {
  data.zenMode = enable;
  save();
  if (enable) {
    if (!zenStyleEl) {
      zenStyleEl = document.createElement('style');
      zenStyleEl.id = 'yt-nexus-zen-mode';
      zenStyleEl.textContent = `
        #secondary, #related, #comments, ytd-comments, ytd-merch-shelf-renderer,
        ytd-banner-promo-renderer, #chat, #chat-container {
          display: none !important;
        }
        #primary { max-width: 100% !important; margin: 0 auto !important; }
      `;
      document.head.append(zenStyleEl);
    }
  } else {
    zenStyleEl?.remove();
    zenStyleEl = null;
  }
}
if (data.zenMode) toggleZenMode(true);

// Host & Shadow DOM
const host = document.createElement('div');
host.id = 'yt-nexus-hub-root';
document.body.append(host);
const root = host.attachShadow({ mode: 'open' });

const style = document.createElement('style');
style.textContent = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  color: #f1f1f1;
  font-family: "YouTube Sans", "Roboto", "Segoe UI", -apple-system, sans-serif;
  font-size: 13.5px;
  --yt-red: #ff0033;
  --yt-red-glow: rgba(255, 0, 51, 0.35);
  --bg-panel: rgba(15, 15, 15, 0.94);
  --bg-card: rgba(33, 33, 33, 0.72);
  --bg-card-hover: rgba(45, 45, 45, 0.9);
  --bg-input: rgba(20, 20, 20, 0.85);
  --border: rgba(255, 255, 255, 0.1);
  --border-focus: var(--yt-red);
  --text-main: #f1f1f1;
  --text-muted: #aaaaaa;
}
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button, a { cursor: pointer; user-select: none; }
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  border-radius: 18px;
  padding: 8px 14px;
  transition: all 0.15s ease;
  font-weight: 500;
}
button:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}
button:active { transform: translateY(0); }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.primary {
  background: var(--yt-red);
  color: #ffffff;
  font-weight: 700;
  border-color: var(--yt-red);
  box-shadow: 0 4px 18px var(--yt-red-glow);
}
button.primary:hover {
  background: #cc0029;
  box-shadow: 0 6px 24px var(--yt-red-glow);
}
button.active {
  background: rgba(255, 0, 51, 0.2);
  border-color: var(--yt-red);
  color: #ff4d6d;
}
button.sm { padding: 5px 10px; font-size: 12px; border-radius: 14px; }
button.danger { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
input, select, textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--yt-red-glow);
}
textarea { min-height: 100px; resize: vertical; line-height: 1.5; }
label { display: grid; gap: 5px; margin: 8px 0; color: #ccc; font-size: 12.5px; font-weight: 600; }
a { color: var(--yt-red); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 8px; }
h2 { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
p { line-height: 1.6; color: var(--text-muted); margin: 0 0 8px; }
small { color: var(--text-muted); font-size: 12px; }

/* Scrollbars */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--yt-red); }

/* Main Window */
.window {
  pointer-events: auto;
  position: absolute;
  left: max(16px, calc(50vw - 500px));
  top: 7vh;
  width: min(1000px, calc(100vw - 32px));
  height: min(720px, 86vh);
  min-width: 380px;
  min-height: 400px;
  resize: both;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.85), 0 0 40px var(--yt-red-glow);
  display: flex;
  flex-direction: column;
}
.window.maximized {
  left: 8px !important;
  top: 8px !important;
  width: calc(100vw - 16px) !important;
  height: calc(100vh - 16px) !important;
  resize: none !important;
  border-radius: 12px;
}

/* Header */
.top {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  background: rgba(24, 24, 24, 0.85);
  border-bottom: 1px solid var(--border);
  touch-action: none;
  cursor: move;
  user-select: none;
}
.yt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--yt-red);
  color: white;
  width: 28px;
  height: 20px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 900;
  box-shadow: 0 0 12px var(--yt-red-glow);
}
.logo-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.logo-title span { color: var(--yt-red); }
.badge {
  font: 10px monospace;
  background: rgba(255, 0, 51, 0.15);
  color: #ff4d6d;
  padding: 3px 7px;
  border-radius: 6px;
  font-weight: 700;
  border: 1px solid rgba(255, 0, 51, 0.3);
}
.spacer { flex: 1; }
.win-btn { width: 32px; height: 32px; padding: 0; border-radius: 10px; background: rgba(255, 255, 255, 0.05); }
.win-btn:hover { background: rgba(255, 255, 255, 0.15); }
.win-btn.close:hover { background: #ef4444; border-color: #ef4444; color: white; }

/* Layout & Sidebar */
.layout { display: flex; flex: 1; min-height: 0; }
.side {
  width: 210px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 14px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(18, 18, 18, 0.6);
}
.side button {
  width: 100%;
  justify-content: flex-start;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13px;
}
.side button:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.side button.active {
  background: rgba(255, 0, 51, 0.15);
  border-color: rgba(255, 0, 51, 0.3);
  color: #ff4d6d;
  font-weight: 700;
}
.side-cat {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.35);
  margin: 10px 8px 3px;
  text-transform: uppercase;
}
main {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}
.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--yt-red);
  margin-bottom: 5px;
  text-transform: uppercase;
}

/* Grids & Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 14px 0; }
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 18px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease;
}
.card:hover {
  background: var(--bg-card-hover);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.card p { flex: 1; margin: 6px 0 12px; font-size: 12.5px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.row > * { flex: 1; min-width: 130px; }
.actions { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; align-items: center; }
.hero {
  padding: 20px 24px;
  border-radius: 18px;
  background: radial-gradient(ellipse at top right, var(--yt-red-glow), transparent 70%), rgba(28, 28, 28, 0.85);
  border: 1px solid var(--border);
  margin-bottom: 20px;
}
.hero h2 { font-size: 19px; margin: 0 0 6px; }

/* Items & Outputs */
.item {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin: 8px 0;
  background: rgba(28, 28, 28, 0.6);
}
.item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.output {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  margin-top: 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 14px;
  border-radius: 12px;
  font-family: monospace;
  font-size: 12.5px;
}
.toast {
  pointer-events: auto;
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 20px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid var(--yt-red);
  box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 20px var(--yt-red-glow);
  color: white;
  font-weight: 600;
  z-index: 9999;
}

/* Floating Launcher & Mini HUD */
.launcher {
  pointer-events: auto;
  position: absolute;
  right: 24px;
  bottom: 24px;
  background: rgba(18, 18, 18, 0.92);
  border: 1px solid var(--yt-red);
  border-radius: 30px;
  padding: 10px 18px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.7), 0 0 20px var(--yt-red-glow);
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  backdrop-filter: blur(16px);
}
.launcher:hover { transform: scale(1.05); }

.mini-dock {
  pointer-events: auto;
  position: absolute;
  right: 24px;
  bottom: 24px;
  background: rgba(18, 18, 18, 0.94);
  border: 1px solid var(--yt-red);
  border-radius: 30px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 25px var(--yt-red-glow);
  backdrop-filter: blur(20px);
}
.mini-dock span { font-weight: 700; font-family: monospace; color: #ff4d6d; }

.footer {
  border-top: 1px solid var(--border);
  padding: 10px 20px;
  color: var(--text-muted);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 15, 15, 0.7);
}
.hide { display: none !important; }

@media(max-width: 768px) {
  .side { width: 56px; padding: 8px 4px; }
  .side-cat { display: none; }
  .side button { font-size: 0; justify-content: center; padding: 10px; }
  main { padding: 16px; }
}
`;
root.append(style);

// DOM Creators
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v, { signal: abort.signal });
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
};

const btn = (text, fn, primary = false, extraClass = '') =>
  el('button', {
    text,
    onclick: fn,
    class: [primary ? 'primary' : '', extraClass].filter(Boolean).join(' ')
  });

const input = (placeholder, value = '', type = 'text') => el('input', { placeholder, value, type });
const area = (value = '') => { const x = el('textarea'); x.value = value; return x; };
const field = (name, x) => el('label', { text: name }, x);
const card = (title, desc, action) => el('div', { class: 'card' }, [el('h2', { text: title }), el('p', { text: desc }), action]);

function toast(message) {
  root.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: message });
  root.append(t);
  setTimeout(() => t.remove(), 3500);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

async function copy(v) {
  try {
    await navigator.clipboard.writeText(String(v));
    toast('Copiado para a área de transferência!');
  } catch {
    toast('Erro ao copiar.');
  }
}

const out = () => el('div', { class: 'output', role: 'status', text: 'Resultados aparecem aqui.' });

// Window & Top Controls
const win = el('section', { class: 'window', 'aria-label': 'NEXUS YouTube Hub' });
const top = el('header', { class: 'top' }, [
  el('div', { class: 'yt-icon', text: '▶' }),
  el('div', { class: 'logo-title' }, [
    el('strong', { text: 'NEXUS' }),
    el('span', { text: 'YouTube Studio' })
  ]),
  el('span', { class: 'badge', text: 'POWER OVERLAY' }),
  el('span', { class: 'spacer' }),
  el('div', { style: 'display: flex; gap: 6px;' }, [
    btn('⊟', () => toggleMiniDock(), false, 'win-btn'),
    btn('⛶', () => toggleMaximize(), false, 'win-btn'),
    btn('—', () => win.classList.add('hide'), false, 'win-btn'),
    btn('×', () => destroy(), false, 'win-btn close')
  ])
]);

const side = el('nav', { class: 'side' });
const main = el('main');
const footer = el('div', { class: 'footer' }, [
  el('span', { text: 'NEXUS YT HUB 2.0.0 · GLASSMORPHISM EDITION' }),
  el('span', { text: 'Atalhos: Alt+Shift+Y (Hub) | Alt+Shift+M (Mini HUD) | Esc' })
]);

win.append(top, el('div', { class: 'layout' }, [side, main]), footer);

// Launcher & Mini Dock
const launcher = el('button', {
  class: 'launcher',
  onclick: () => win.classList.toggle('hide')
}, [
  el('span', { class: 'yt-icon', text: '▶', style: 'width: 22px; height: 16px; font-size: 9px;' }),
  el('span', { text: 'YT HUB' })
]);

const miniSpeedEl = el('span', { text: '1.0x' });
const miniDock = el('div', { class: 'mini-dock hide' }, [
  miniSpeedEl,
  btn('📸 Screenshot', () => takeScreenshot(), false, 'sm'),
  btn('Abrir Hub ↗', () => {
    toggleMiniDock();
    win.classList.remove('hide');
  }, true, 'sm')
]);

root.append(win, launcher, miniDock);

// Window Dragging & Maximizing
let drag = null;
top.addEventListener('pointerdown', e => {
  if (isMaximized || e.target.closest('button')) return;
  const r = win.getBoundingClientRect();
  drag = { x: e.clientX - r.left, y: e.clientY - r.top };
  top.setPointerCapture(e.pointerId);
}, { signal: abort.signal });

top.addEventListener('pointermove', e => {
  if (!drag || isMaximized) return;
  win.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.x)) + 'px';
  win.style.top = Math.max(0, Math.min(innerHeight - 56, e.clientY - drag.y)) + 'px';
}, { signal: abort.signal });

top.addEventListener('pointerup', () => drag = null, { signal: abort.signal });

function toggleMaximize() {
  isMaximized = !isMaximized;
  win.classList.toggle('maximized', isMaximized);
}

function toggleMiniDock() {
  isMiniDock = !isMiniDock;
  if (isMiniDock) {
    win.classList.add('hide');
    miniDock.classList.remove('hide');
    launcher.classList.add('hide');
  } else {
    miniDock.classList.add('hide');
    launcher.classList.remove('hide');
  }
}

// Global Shortcuts
document.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && e.code === 'KeyY') {
    e.preventDefault();
    if (isMiniDock) toggleMiniDock();
    win.classList.toggle('hide');
  } else if (e.altKey && e.shiftKey && e.code === 'KeyM') {
    e.preventDefault();
    toggleMiniDock();
  } else if (e.key === 'Escape' && !win.classList.contains('hide')) {
    win.classList.add('hide');
  }
}, { signal: abort.signal });

// Navigation Tree
const navTree = [
  {
    cat: 'Player Master',
    items: [
      ['controls', '⚡ Controles do Vídeo'],
      ['downloader', '📥 Baixar Vídeo / Áudio'],
      ['filters', '🎨 Cinema & Filtros'],
      ['looper', '🔁 A-B Looper'],
      ['audio', '🔊 Volume Booster (600%)']
    ]
  },
  {
    cat: 'Estudo & Criação',
    items: [
      ['notes', '📝 Notas com Timestamp'],
      ['chapters', '⏱ Gerador de Capítulos'],
      ['tools', '🛠 Extrator & SEO Tools']
    ]
  },
  {
    cat: 'Foco & Visual',
    items: [
      ['zen', '🧘 Modo Zen & Shorts'],
      ['settings', '⚙ Ajustes do Hub']
    ]
  }
];

for (const sec of navTree) {
  side.append(el('div', { class: 'side-cat', text: sec.cat }));
  for (const [id, label] of sec.items) {
    side.append(el('button', {
      'data-page': id,
      text: label,
      onclick: () => render(id)
    }));
  }
}

function heading(title, desc) {
  main.append(
    el('div', { class: 'eyebrow', text: 'NEXUS YT / ' + title.toUpperCase() }),
    el('h1', { text: title }),
    el('p', { text: desc })
  );
}

function render(id = page) {
  page = id;
  main.replaceChildren();
  side.querySelectorAll('button[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  if (pages[id]) pages[id]();
}

// Take HD Screenshot
function takeScreenshot() {
  const v = getVideo();
  if (!v) return toast('Nenhum vídeo em reprodução detectado.');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 1920;
    canvas.height = v.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
      if (!blob) return toast('Erro ao capturar frame.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yt-screenshot-${getVideoId()}-${Math.floor(v.currentTime)}s.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Screenshot HD capturada e baixada!');
    }, 'image/png');
  } catch (err) {
    toast('Proteção CORS impediu a captura direta do frame.');
  }
}

// =========================================================================
// HUB PAGES
// =========================================================================
const pages = {
  // 1. VIDEO CONTROLS
  controls() {
    heading('Controles do Player', 'Velocidades ilimitadas, captura de frame e controle de reprodução.');
    const v = getVideo();

    const speedVal = el('span', {
      style: 'font-size: 22px; font-weight: 800; color: var(--yt-red); font-family: monospace;',
      text: `${v ? v.playbackRate.toFixed(2) : '1.00'}x`
    });

    const speedSlider = el('input', { type: 'range', min: '0.25', max: '5', step: '0.05', value: v ? String(v.playbackRate) : '1' });
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      if (v) v.playbackRate = val;
      speedVal.textContent = `${val.toFixed(2)}x`;
      miniSpeedEl.textContent = `${val.toFixed(2)}x`;
      data.customSpeed = val;
      save();
    }, { signal: abort.signal });

    const hero = el('div', { class: 'hero' }, [
      el('div', { style: 'display: flex; justify-content: space-between; align-items: center;' }, [
        el('h2', { text: 'Velocidade de Reprodução' }),
        speedVal
      ]),
      field('Ajuste Fino Contínuo (0.25x até 5.0x)', speedSlider)
    ]);

    const presets = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];
    const presetRow = el('div', { class: 'actions' });
    for (const p of presets) {
      presetRow.append(btn(`${p}x`, () => {
        if (v) v.playbackRate = p;
        speedSlider.value = String(p);
        speedVal.textContent = `${p.toFixed(2)}x`;
        miniSpeedEl.textContent = `${p.toFixed(2)}x`;
        data.customSpeed = p;
        save();
      }, v && Math.abs(v.playbackRate - p) < 0.01, 'sm'));
    }

    const actionGrid = el('div', { class: 'grid' }, [
      card('Captura de Tela HD', 'Captura o frame exato do vídeo na resolução original e faz o download em PNG.',
        btn('📸 Tirar Screenshot do Frame', () => takeScreenshot(), true)
      ),
      card('Picture-in-Picture (PiP)', 'Destaque o player do YouTube em uma janela flutuante no seu sistema operacional.',
        btn('🪟 Alternar Janela PiP', async () => {
          if (!v) return toast('Vídeo não detectado.');
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await v.requestPictureInPicture();
          }
        })
      ),
      card('Pular Silêncio / Avanço', 'Pule trechos rapidamente sem precisar usar o mouse na timeline.',
        el('div', { class: 'actions' }, [
          btn('-10s', () => { if (v) v.currentTime -= 10; }, false, 'sm'),
          btn('+10s', () => { if (v) v.currentTime += 10; }, false, 'sm'),
          btn('+30s', () => { if (v) v.currentTime += 30; }, false, 'sm')
        ])
      ),
      card('Detector de Anúncios', 'Muta e avança propagandas imediatamente se um anúncio estiver em reprodução.',
        btn('⚡ Forçar Skip de Anúncio', () => {
          const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
          if (skipBtn) {
            skipBtn.click();
            toast('Anúncio pulado com sucesso!');
          } else if (v && document.querySelector('.ad-showing')) {
            v.currentTime = v.duration || 9999;
            toast('Anúncio finalizado!');
          } else {
            toast('Nenhum anúncio detectado no momento.');
          }
        })
      )
    ]);

    main.append(hero, el('h2', { text: 'Velocidades Rápidas:' }), presetRow, actionGrid);
  },

  // DOWNLOADER (VIDEO & AUDIO)
  downloader() {
    heading('Download de Vídeo & Áudio', 'Baixe o vídeo atual em alta qualidade (MP4) ou extraia o áudio (MP3).');
    const v = getVideo();
    const vid = getVideoId();
    const isYT = vid && vid !== 'demo-video';
    const ytUrl = isYT ? `https://www.youtube.com/watch?v=${vid}` : location.href;
    const directSrc = v ? (v.currentSrc || v.src || v.querySelector('source')?.src || '') : '';

    const hero = el('div', { class: 'hero' }, [
      el('h2', { text: isYT ? `Vídeo do YouTube: ${vid}` : 'Vídeo HTML5 Detectado' }),
      el('p', { text: isYT ? ytUrl : (directSrc || 'Reprodutor de vídeo ativo.') })
    ]);

    // Local direct video downloader (works in preview.html and direct MP4 players)
    const localSection = el('div', { style: 'margin-bottom: 20px;' });
    if (directSrc && !directSrc.startsWith('blob:')) {
      localSection.append(
        card('Download Direto do Arquivo MP4', 'Baixe o arquivo de vídeo original diretamente para o seu computador sem intermediários.',
          btn('📥 Baixar Arquivo MP4 Direto', () => {
            const a = document.createElement('a');
            a.href = directSrc;
            a.download = `video-${vid || 'download'}.mp4`;
            a.target = '_blank';
            a.click();
            toast('Iniciando download do vídeo!');
          }, true)
        )
      );
    }

    // YouTube 1-Click Online Downloaders
    const ytGrid = el('div', { class: 'grid' }, [
      card('SaveFrom (SS YouTube)', 'O método mais clássico e confiável. Abre direto na página de download do vídeo em MP4 (720p / 1080p).',
        btn('📥 Baixar via SaveFrom ↗', () => {
          const url = isYT ? `https://ssyoutube.com/watch?v=${vid}` : `https://ssyoutube.com/?url=${encodeURIComponent(location.href)}`;
          window.open(url, '_blank');
        }, true)
      ),
      card('Y2Mate (Vídeo & Full HD)', 'Excelente para baixar em múltiplas qualidades de vídeo MP4 e conversão rápida.',
        btn('🎬 Baixar via Y2Mate ↗', () => {
          const url = isYT ? `https://www.y2mate.com/youtube/${vid}` : `https://www.y2mate.com/`;
          window.open(url, '_blank');
        })
      ),
      card('Converter Apenas Áudio (MP3)', 'Extraia apenas a trilha sonora ou podcast do vídeo diretamente em arquivo de áudio MP3.',
        btn('🎵 Baixar Áudio MP3 ↗', () => {
          const url = isYT ? `https://www.y2mate.com/youtube-mp3/${vid}` : `https://www.y2mate.com/`;
          window.open(url, '_blank');
        })
      ),
      card('Cobalt Web (Sem Anúncios)', 'Interface oficial do Cobalt open-source sem pop-ups.',
        btn('⚡ Abrir no Cobalt Web ↗', () => {
          window.open(`https://cobalt.tools/#${encodeURIComponent(ytUrl)}`, '_blank');
        })
      ),
      card('Comando yt-dlp para Terminal', 'Copia o comando otimizado para baixar com qualidade máxima e áudio original sem perda.',
        btn('💻 Copiar Comando yt-dlp', () => {
          copy(`yt-dlp -f "bv*+ba/b" --merge-output-format mp4 "${ytUrl}"`);
          toast('Comando yt-dlp copiado!');
        })
      )
    ]);

    main.append(
      hero,
      localSection,
      el('h2', { text: 'Opções de Download:' }),
      ytGrid
    );
  },

  // 2. VIDEO FILTERS & CINEMA MODE
  filters() {
    heading('Cinema & Filtros Visuais', 'Ajuste brilho, contraste, saturação e ative modos especiais direto no elemento de vídeo.');
    const f = data.filters;

    const bSlider = el('input', { type: 'range', min: '50', max: '200', value: String(f.brightness) });
    const cSlider = el('input', { type: 'range', min: '50', max: '200', value: String(f.contrast) });
    const sSlider = el('input', { type: 'range', min: '0', max: '250', value: String(f.saturate) });

    const update = () => {
      f.brightness = Number(bSlider.value);
      f.contrast = Number(cSlider.value);
      f.saturate = Number(sSlider.value);
      applyVideoFilters();
      save();
    };

    bSlider.addEventListener('input', update, { signal: abort.signal });
    cSlider.addEventListener('input', update, { signal: abort.signal });
    sSlider.addEventListener('input', update, { signal: abort.signal });

    const presets = [
      ['Padrão', () => { f.brightness = 100; f.contrast = 100; f.saturate = 100; f.invert = 0; f.sepia = 0; }],
      ['Cores Vívidas', () => { f.brightness = 105; f.contrast = 120; f.saturate = 140; f.invert = 0; f.sepia = 0; }],
      ['Modo Noturno (Amoled)', () => { f.brightness = 85; f.contrast = 115; f.saturate = 90; f.invert = 0; f.sepia = 0; }],
      ['Preto & Branco Clássico', () => { f.brightness = 100; f.contrast = 110; f.saturate = 0; f.invert = 0; f.sepia = 0; }],
      ['Sepia / Leitura', () => { f.brightness = 95; f.contrast = 95; f.saturate = 80; f.sepia = 60; f.invert = 0; }]
    ];

    const presetRow = el('div', { class: 'actions' });
    for (const [name, fn] of presets) {
      presetRow.append(btn(name, () => {
        fn();
        bSlider.value = String(f.brightness);
        cSlider.value = String(f.contrast);
        sSlider.value = String(f.saturate);
        applyVideoFilters();
        save();
        toast(`Filtro "${name}" aplicado!`);
      }, false, 'sm'));
    }

    main.append(
      el('div', { class: 'hero' }, [
        el('h2', { text: 'Ajustes de Calibração' }),
        el('div', { class: 'row' }, [
          field(`Brilho (${f.brightness}%)`, bSlider),
          field(`Contraste (${f.contrast}%)`, cSlider),
          field(`Saturação (${f.saturate}%)`, sSlider)
        ])
      ]),
      el('h2', { text: 'Predefinições Rápidas:' }),
      presetRow,
      el('div', { class: 'actions', style: 'margin-top: 20px;' }, [
        btn('Redefinir Filtros Originais', () => {
          f.brightness = 100; f.contrast = 100; f.saturate = 100; f.invert = 0; f.sepia = 0;
          bSlider.value = '100'; cSlider.value = '100'; sSlider.value = '100';
          applyVideoFilters();
          save();
          toast('Filtros restaurados!');
        }, false, 'danger')
      ])
    );
  },

  // 3. A-B LOOPER
  looper() {
    heading('A-B Looper', 'Repita trechos específicos continuamente para tutoriais, músicas e estudos.');
    const v = getVideo();

    const curTimeEl = el('span', { text: v ? formatTime(v.currentTime) : '00:00', style: 'font-weight: 800; font-family: monospace; color: var(--yt-red);' });
    const aEl = el('span', { text: data.loopA !== null ? formatTime(data.loopA) : 'Não definido', style: 'font-weight: 700; font-family: monospace;' });
    const bEl = el('span', { text: data.loopB !== null ? formatTime(data.loopB) : 'Não definido', style: 'font-weight: 700; font-family: monospace;' });

    const hero = el('div', { class: 'hero' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'item' }, [
          el('small', { text: 'Ponto A (Início)' }),
          el('div', { style: 'font-size: 20px; margin-top: 4px;' }, [aEl])
        ]),
        el('div', { class: 'item' }, [
          el('small', { text: 'Ponto B (Fim)' }),
          el('div', { style: 'font-size: 20px; margin-top: 4px;' }, [bEl])
        ])
      ]),
      el('div', { style: 'margin-top: 10px;' }, [
        el('small', { text: 'Tempo atual do vídeo: ' }),
        curTimeEl
      ])
    ]);

    const setABtn = btn('Marcar Ponto A [Início]', () => {
      if (!v) return toast('Vídeo não detectado.');
      data.loopA = v.currentTime;
      aEl.textContent = formatTime(data.loopA);
      save();
      toast(`Ponto A definido em ${formatTime(data.loopA)}`);
    }, true);

    const setBBtn = btn('Marcar Ponto B [Fim]', () => {
      if (!v) return toast('Vídeo não detectado.');
      if (data.loopA === null) return toast('Defina o Ponto A primeiro.');
      if (v.currentTime <= data.loopA) return toast('O Ponto B deve ser maior que o Ponto A.');
      data.loopB = v.currentTime;
      bEl.textContent = formatTime(data.loopB);
      save();
      toast(`Ponto B definido em ${formatTime(data.loopB)} · Loop Ativo!`);
    }, true);

    const clearBtn = btn('Desativar Loop', () => {
      data.loopA = null;
      data.loopB = null;
      aEl.textContent = 'Não definido';
      bEl.textContent = 'Não definido';
      save();
      toast('Loop A-B cancelado.');
    }, false, 'danger');

    main.append(hero, el('div', { class: 'actions' }, [setABtn, setBBtn, clearBtn]));
  },

  // 4. VOLUME BOOSTER (UP TO 600%)
  audio() {
    heading('Volume Booster (Até 600%)', 'Amplificador de ganho via Web Audio API para vídeos com áudio baixo, podcasts ou sussurros.');
    const v = getVideo();

    const gainVal = el('span', {
      style: 'font-size: 24px; font-weight: 800; color: var(--yt-red); font-family: monospace;',
      text: `${data.volumeBoost || 100}%`
    });

    const gainSlider = el('input', { type: 'range', min: '100', max: '600', step: '10', value: String(data.volumeBoost || 100) });
    gainSlider.addEventListener('input', () => {
      const val = Number(gainSlider.value);
      gainVal.textContent = `${val}%`;
      setBoostGain(val);
    }, { signal: abort.signal });

    const presets = [100, 150, 200, 300, 450, 600];
    const presetRow = el('div', { class: 'actions' });
    for (const p of presets) {
      presetRow.append(btn(`${p}%`, () => {
        gainSlider.value = String(p);
        gainVal.textContent = `${p}%`;
        setBoostGain(p);
        toast(`Volume amplificado para ${p}%!`);
      }, data.volumeBoost === p, 'sm'));
    }

    main.append(
      el('div', { class: 'hero' }, [
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center;' }, [
          el('h2', { text: 'Ganho Adicional do Áudio' }),
          gainVal
        ]),
        field('Slider de Amplificação (100% até 600%)', gainSlider)
      ]),
      el('h2', { text: 'Amplificações Rápidas:' }),
      presetRow,
      el('p', { text: 'Nota: A amplificação é aplicada no buffer de áudio do player sem distorcer o sistema.', style: 'margin-top: 14px;' })
    );
  },

  // 5. TIMESTAMPED VIDEO NOTES
  notes() {
    const vid = getVideoId();
    heading('Notas com Timestamp', `Anotações vinculadas aos segundos exatos deste vídeo (${vid}).`);
    const v = getVideo();

    if (!Array.isArray(data.videoNotes[vid])) data.videoNotes[vid] = [];
    const notesList = data.videoNotes[vid];

    const noteInput = area();
    noteInput.placeholder = 'Escreva sua anotação ou resumo deste momento do vídeo…';

    const listContainer = el('div');

    function renderNotes() {
      listContainer.replaceChildren();
      if (notesList.length === 0) {
        listContainer.append(el('p', { text: 'Nenhuma anotação neste vídeo ainda. Salve uma abaixo!' }));
        return;
      }

      for (const item of notesList.sort((a, b) => a.time - b.time)) {
        const timeBtn = btn(formatTime(item.time), () => {
          if (v) {
            v.currentTime = item.time;
            toast(`Pulei para ${formatTime(item.time)}`);
          }
        }, true, 'sm');

        const delBtn = btn('Excluir', () => {
          data.videoNotes[vid] = data.videoNotes[vid].filter(x => x.id !== item.id);
          save();
          renderNotes();
        }, false, 'sm danger');

        listContainer.append(el('div', { class: 'item' }, [
          el('div', { class: 'item-head' }, [
            el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
              timeBtn,
              el('small', { text: new Date(item.createdAt).toLocaleDateString('pt-BR') })
            ]),
            delBtn
          ]),
          el('p', { text: item.text, style: 'margin-top: 6px; white-space: pre-wrap;' })
        ]));
      }
    }

    const addBtn = btn('Salvar Nota no Momento Atual ⏱', () => {
      const txt = noteInput.value.trim();
      if (!txt) return toast('Digite um texto para a anotação.');
      const currentTime = v ? v.currentTime : 0;
      notesList.push({
        id: crypto.randomUUID(),
        time: currentTime,
        text: txt,
        createdAt: Date.now()
      });
      noteInput.value = '';
      save();
      renderNotes();
      toast(`Nota salva em ${formatTime(currentTime)}!`);
    }, true);

    const exportBtn = btn('Copiar Notas em Markdown', () => {
      if (notesList.length === 0) return toast('Nenhuma nota para exportar.');
      const md = notesList
        .sort((a, b) => a.time - b.time)
        .map(n => `- **[${formatTime(n.time)}]** ${n.text}`)
        .join('\n');
      copy(md);
    });

    main.append(
      field('Nova Anotação', noteInput),
      el('div', { class: 'actions' }, [addBtn, exportBtn]),
      el('h2', { text: 'Anotações Salvas deste Vídeo:' }),
      listContainer
    );
    renderNotes();
  },

  // 6. CHAPTERS GENERATOR
  chapters() {
    heading('Gerador de Capítulos', 'Crie marcadores de tempo no padrão oficial do YouTube prontos para a descrição.');
    const v = getVideo();

    const titleInput = input('Nome do capítulo (ex: Introdução, Demonstração, Conclusão)');
    const chaptersOut = out();
    chaptersOut.textContent = '00:00 Início\n';

    const addBtn = btn('Adicionar Capítulo no Tempo Atual ⏱', () => {
      const name = titleInput.value.trim() || 'Capítulo';
      const timeStr = v ? formatTime(v.currentTime) : '00:00';
      chaptersOut.textContent += `${timeStr} ${name}\n`;
      titleInput.value = '';
      toast(`Capítulo "${name}" marcado em ${timeStr}`);
    }, true);

    main.append(
      field('Título do Trecho / Capítulo', titleInput),
      el('div', { class: 'actions' }, [
        addBtn,
        btn('Copiar Todos os Capítulos', () => copy(chaptersOut.textContent), true),
        btn('Limpar Capítulos', () => { chaptersOut.textContent = '00:00 Início\n'; }, false, 'danger')
      ]),
      el('h2', { text: 'Lista Formatada para a Descrição do YouTube:' }),
      chaptersOut
    );
  },

  // 7. THUMBNAILS & SEO TOOLS
  tools() {
    heading('Extrator de Capas & SEO', 'Baixe thumbnails em 4K/HD e analise metadados e tags do vídeo.');
    const vid = getVideoId();

    const thumbQualities = [
      ['Max Resolução (1080p / 4K)', `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`],
      ['Alta Qualidade (HQ 720p)', `https://img.youtube.com/vi/${vid}/hqdefault.jpg`],
      ['Padrão Médio (MQ)', `https://img.youtube.com/vi/${vid}/mqdefault.jpg`]
    ];

    const thumbCards = el('div', { class: 'grid' });
    for (const [qName, qUrl] of thumbQualities) {
      thumbCards.append(card(qName, 'Link direto e download da miniatura oficial.',
        el('div', { class: 'actions' }, [
          btn('Abrir Imagem ↗', () => window.open(qUrl, '_blank')),
          btn('Copiar Link', () => copy(qUrl), true, 'sm')
        ])
      ));
    }

    // Playlist Time Calculator
    const speedSelect = el('select', {}, [
      el('option', { value: '1.0', text: '1.0x (Normal)' }),
      el('option', { value: '1.25', text: '1.25x' }),
      el('option', { value: '1.5', text: '1.5x' }),
      el('option', { value: '1.75', text: '1.75x' }),
      el('option', { value: '2.0', text: '2.0x' })
    ]);
    const durationInput = input('Duração em minutos ou HH:MM:SS (ex: 45 ou 01:30:00)', '60');
    const calcResult = out();

    const calcBtn = btn('Calcular Tempo Real de Visualização', () => {
      const spd = parseFloat(speedSelect.value);
      const secs = parseTimeToSeconds(durationInput.value.trim());
      const neededSecs = secs / spd;
      const savedSecs = secs - neededSecs;
      calcResult.textContent =
        `Tempo Original: ${formatTime(secs)}\n` +
        `Tempo Assistindo a ${spd}x: ${formatTime(neededSecs)}\n` +
        `Tempo Economizado: ${formatTime(savedSecs)} 🎉`;
    }, true);

    main.append(
      el('h2', { text: `Miniaturas do Vídeo (${vid}):` }),
      thumbCards,
      el('h2', { text: 'Calculadora de Tempo de Vídeo/Playlist:', style: 'margin-top: 24px;' }),
      el('div', { class: 'row' }, [
        field('Duração do Conteúdo', durationInput),
        field('Velocidade Escolhida', speedSelect)
      ]),
      calcBtn,
      calcResult
    );
  },

  // 8. ZEN MODE & SHORTS CONVERTER
  zen() {
    heading('Modo Zen & Conversor de Shorts', 'Ambiente imersivo livre de distrações e atalho para transformar Shorts em player padrão.');
    
    const zenCheck = el('input', { type: 'checkbox' });
    zenCheck.checked = !!data.zenMode;
    zenCheck.style.width = '20px';
    zenCheck.style.height = '20px';
    zenCheck.addEventListener('change', () => {
      toggleZenMode(zenCheck.checked);
      toast(zenCheck.checked ? 'Modo Zen ativado! Distrações ocultadas.' : 'Modo Zen desativado.');
    }, { signal: abort.signal });

    const shortsCard = card('Converter Shorts em Player Padrão',
      'Shorts removem controles como timeline, velocidade e tela cheia. Clique para abrir como vídeo normal.',
      btn('Abrir como Vídeo Normal (/watch)', () => {
        const url = new URL(location.href);
        if (url.pathname.startsWith('/shorts/')) {
          const id = url.pathname.split('/')[2];
          location.href = `https://www.youtube.com/watch?v=${id}`;
        } else {
          toast('Você já está no player padrão do YouTube.');
        }
      }, true)
    );

    main.append(
      el('div', { class: 'hero' }, [
        el('div', { style: 'display: flex; align-items: center; gap: 12px;' }, [
          zenCheck,
          el('div', [
            el('h2', { text: 'Ativar Modo Zen (Foco Total)', style: 'margin: 0;' }),
            el('p', { text: 'Oculta recomendações da barra lateral, comentários e sugestões ao redor do vídeo.', style: 'margin: 0;' })
          ])
        ])
      ]),
      el('div', { class: 'grid' }, [shortsCard])
    );
  },

  // 9. SETTINGS & DIAGNOSTICS
  settings() {
    heading('Ajustes do Hub', 'Opacidade do vidro, backup e descarregamento.');

    const opSlider = el('input', { type: 'range', min: '60', max: '100', value: String(data.opacity || 94) });
    opSlider.addEventListener('input', () => {
      data.opacity = Number(opSlider.value);
      root.host.style.setProperty('--bg-panel', `rgba(15, 15, 15, ${data.opacity / 100})`);
      save();
    }, { signal: abort.signal });

    const diagOut = out();

    main.append(
      el('div', { class: 'hero' }, [
        field('Opacidade do Vidro Glassmorphism (%)', opSlider)
      ]),
      el('div', { class: 'actions' }, [
        btn('Exportar Notas (Backup JSON)', () => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'yt-nexus-backup.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast('Backup exportado!');
        }, true),
        btn('Descarregar NEXUS Hub', () => destroy(), false, 'danger')
      ]),
      btn('Ver Diagnóstico do Ambiente', () => {
        const v = getVideo();
        diagOut.textContent =
          `URL Atual: ${location.href}\n` +
          `Vídeo Detectado: ${v ? 'SIM' : 'NÃO'}\n` +
          `Resolução Nativa: ${v ? `${v.videoWidth}x${v.videoHeight}` : 'N/A'}\n` +
          `Duração: ${v ? formatTime(v.duration) : 'N/A'}\n` +
          `Velocidade Atual: ${v ? v.playbackRate : 1}x\n` +
          `AudioContext: ${audioCtx ? audioCtx.state : 'Inativo'}\n` +
          `Modo Zen: ${data.zenMode ? 'Ativo' : 'Desativado'}`;
      }),
      diagOut
    );
  }
};

// Cleanup Function
function destroy() {
  alive = false;
  abort.abort();
  clearInterval(loopInterval);
  toggleZenMode(false);
  try { if (gainNode) gainNode.disconnect(); } catch {}
  try { if (audioCtx) audioCtx.close(); } catch {}
  host.remove();
  if (window.YTHub?.destroy === destroy) delete window.YTHub;
}

window.YTHub = {
  version: '2.0.0',
  open: () => {
    win.classList.remove('hide');
    miniDock.classList.add('hide');
    launcher.classList.remove('hide');
  },
  destroy
};

render();
})();

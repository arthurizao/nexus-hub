/* NEXUS Hub 1.2.0 — Ultimate Personal Command Center
 * Client overlay with Shadow DOM isolation, zero external runtime dependencies.
 * Respects Discord terms: no token sniffing, no automated messages, local-first storage.
 */
(() => {
'use strict';

window.NexusHub?.destroy?.();

const KEY = 'nexus-hub-v2';
const KEY_V1 = 'nexus-hub-v1';
const abort = new AbortController();
const pending = new Set();
const logs = [];

// Base data schema with backward compatibility
let data = {
  version: 2,
  notes: {},
  snippets: [],
  bookmarks: [],
  tasks: [],
  accent: '#a78bfa',
  opacity: 96,
  soundFx: true,
  winBounds: null
};

// Migrate or load localStorage
try {
  const savedV2 = localStorage.getItem(KEY);
  if (savedV2) {
    Object.assign(data, JSON.parse(savedV2));
  } else {
    const savedV1 = localStorage.getItem(KEY_V1);
    if (savedV1) {
      Object.assign(data, JSON.parse(savedV1));
    }
  }
} catch (e) {
  logs.push('Erro ao carregar dados locais: ' + e.message);
}
if (!Array.isArray(data.tasks)) data.tasks = [];
if (!Array.isArray(data.snippets)) data.snippets = [];
if (!Array.isArray(data.bookmarks)) data.bookmarks = [];
if (typeof data.notes !== 'object' || data.notes === null) data.notes = {};

let page = 'home';
let timerEnd = 0;
let timerPaused = 1500;
let alive = true;
let isMaximized = false;
let isMiniDock = false;
let ambientAudioNode = null;
let ambientGainNode = null;
let currentAmbientType = null;

// Web Audio API Synthesizer (0 external files)
let audioCtx = null;
function getAudioCtx() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function sfx(type = 'click') {
  if (!data.soundFx) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.09);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {}
}

// Synthesized Ambient Soundscapes
function stopAmbient() {
  if (ambientAudioNode) {
    try {
      if (typeof ambientAudioNode.stop === 'function') ambientAudioNode.stop();
      ambientAudioNode.disconnect();
    } catch {}
    ambientAudioNode = null;
  }
  if (ambientGainNode) {
    try { ambientGainNode.disconnect(); } catch {}
    ambientGainNode = null;
  }
  currentAmbientType = null;
}

function startAmbient(type = 'rain', volume = 0.5) {
  stopAmbient();
  const ctx = getAudioCtx();
  if (!ctx) throw new Error('Web Audio indisponível neste navegador.');

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime);
  gain.connect(ctx.destination);
  ambientGainNode = gain;

  if (type === 'rain') {
    // Brown / Pink Noise Rain simulation with filter
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gain);
    whiteNoise.start();
    ambientAudioNode = whiteNoise;
  } else if (type === 'space') {
    // Deep Space Cosmic Drone (Twin low sine oscillators + filter)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(55, ctx.currentTime);
    osc2.frequency.setValueAtTime(55.6, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, ctx.currentTime);
    filter.Q.setValueAtTime(4, ctx.currentTime);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    osc1.start();
    osc2.start();

    ambientAudioNode = {
      stop() {
        try { osc1.stop(); osc2.stop(); } catch {}
      },
      disconnect() {
        try { filter.disconnect(); } catch {}
      }
    };
  } else if (type === 'focus432') {
    // 432Hz Harmonic Focus Drone with gentle beating
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(216, ctx.currentTime);
    osc2.frequency.setValueAtTime(218, ctx.currentTime);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();

    ambientAudioNode = {
      stop() {
        try { osc1.stop(); osc2.stop(); } catch {}
      },
      disconnect() {}
    };
  } else if (type === 'neon') {
    // Neon Cyber Hum (60Hz power grid hum with harmonic resonance)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180, ctx.currentTime);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    osc.start();
    ambientAudioNode = osc;
  }
  currentAmbientType = type;
}

// Host and Shadow DOM
const host = document.createElement('div');
host.id = 'nexus-hub-root';
document.body.append(host);
const root = host.attachShadow({ mode: 'open' });

const style = document.createElement('style');
style.textContent = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  color: #edf0fa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
  font-size: 14px;
  --accent: #a78bfa;
  --accent-glow: rgba(167, 139, 250, 0.28);
  --bg-panel: rgba(17, 20, 33, 0.96);
  --bg-card: rgba(26, 31, 48, 0.75);
  --bg-card-hover: rgba(36, 43, 66, 0.9);
  --bg-input: rgba(14, 17, 28, 0.85);
  --border: rgba(255, 255, 255, 0.09);
  --border-focus: var(--accent);
  --text-main: #edf0fa;
  --text-muted: #9ba6bf;
  --danger: #ef4444;
  --success: #10b981;
}
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button, a { cursor: pointer; user-select: none; }
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--border);
  background: #24293c;
  color: var(--text-main);
  border-radius: 10px;
  padding: 9px 14px;
  transition: all 0.16s ease;
}
button:hover {
  background: #333a54;
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}
button:active { transform: translateY(0); }
button:disabled { opacity: 0.45; cursor: wait; transform: none; }
button.primary {
  background: var(--accent);
  color: #0b0d17;
  font-weight: 700;
  border-color: var(--accent);
  box-shadow: 0 4px 16px var(--accent-glow);
}
button.primary:hover {
  filter: brightness(1.12);
  box-shadow: 0 6px 22px var(--accent-glow);
}
button.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}
button.danger:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: var(--danger);
}
button.sm { padding: 5px 9px; font-size: 12px; border-radius: 7px; }
input, select, textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 11px 14px;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
textarea { min-height: 120px; resize: vertical; line-height: 1.5; }
label { display: grid; gap: 6px; margin: 10px 0; color: #b6bfd3; font-size: 13px; font-weight: 500; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 8px; }
h2 { font-size: 16px; font-weight: 700; margin: 0 0 10px; }
p { line-height: 1.6; color: var(--text-muted); margin: 0 0 10px; }
small { color: var(--text-muted); font-size: 12px; }

/* Custom Scrollbar */
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }

/* Main Window */
.window {
  pointer-events: auto;
  position: absolute;
  left: max(16px, calc(50vw - 560px));
  top: 6vh;
  width: min(1120px, calc(100vw - 32px));
  height: min(780px, 88vh);
  min-width: 380px;
  min-height: 420px;
  resize: both;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-panel);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.75), 0 0 40px var(--accent-glow);
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s ease;
}
.window.maximized {
  left: 8px !important;
  top: 8px !important;
  width: calc(100vw - 16px) !important;
  height: calc(100vh - 16px) !important;
  resize: none !important;
  border-radius: 12px;
}

/* Header Bar */
.top {
  height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: rgba(24, 28, 45, 0.85);
  border-bottom: 1px solid var(--border);
  touch-action: none;
  cursor: move;
  user-select: none;
}
.logo-box { display: flex; align-items: center; gap: 8px; }
.logo {
  color: var(--accent);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 2.5px;
  text-shadow: 0 0 16px var(--accent-glow);
}
.badge {
  font: 10px monospace;
  background: var(--accent-glow);
  color: var(--accent);
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.live-clock {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(0,0,0,0.25);
  padding: 4px 8px;
  border-radius: 6px;
  margin-left: 6px;
}
.spacer { flex: 1; }
.window-controls { display: flex; gap: 6px; align-items: center; }
.window-controls button {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 14px;
}
.window-controls button:hover { background: rgba(255, 255, 255, 0.12); }
.window-controls button.close-btn:hover { background: var(--danger); color: white; border-color: var(--danger); }

/* Layout & Navigation */
.layout { display: flex; flex: 1; min-height: 0; }
.side {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 14px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(14, 18, 30, 0.5);
}
.nav-category {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.35);
  margin: 10px 8px 4px;
  text-transform: uppercase;
}
.side button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  padding: 9px 12px;
  border-radius: 9px;
  justify-content: flex-start;
}
.side button .nav-icon { font-size: 15px; width: 18px; text-align: center; }
.side button:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
.side button.active {
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  border-color: rgba(255, 255, 255, 0.08);
}
main {
  flex: 1;
  overflow-y: auto;
  padding: 26px 30px;
  scroll-behavior: smooth;
}
.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--accent);
  margin-bottom: 6px;
  text-transform: uppercase;
}

/* Grids & Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin: 16px 0; }
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 18px;
  border-radius: 14px;
  transition: all 0.18s ease;
  display: flex;
  flex-direction: column;
}
.card:hover {
  background: var(--bg-card-hover);
  border-color: rgba(255, 255, 255, 0.16);
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}
.card p { flex: 1; margin: 8px 0 14px; font-size: 13px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
.row > * { flex: 1; min-width: 140px; }
.actions { display: flex; gap: 8px; margin: 14px 0; flex-wrap: wrap; align-items: center; }
.hero {
  padding: 24px;
  border-radius: 18px;
  background: radial-gradient(ellipse at top right, var(--accent-glow), transparent 70%), rgba(28, 34, 52, 0.85);
  border: 1px solid var(--border);
  margin-bottom: 22px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
.hero h2 { font-size: 20px; margin: 0 0 6px; }
.stat-box { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 14px; }
.stat-item { background: rgba(0,0,0,0.25); padding: 12px 18px; border-radius: 12px; border: 1px solid var(--border); }
.stat-val { font-size: 26px; font-weight: 800; color: var(--accent); }
.stat-lbl { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
.stat { font-size: 44px; font-weight: 900; color: var(--accent); font-family: monospace; letter-spacing: 2px; }

/* Outputs & Items */
.output {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  margin-top: 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 16px;
  border-radius: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: #d1d7e5;
}
.item {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin: 10px 0;
  background: rgba(22, 27, 43, 0.65);
  transition: border-color 0.15s ease;
}
.item:hover { border-color: rgba(255, 255, 255, 0.18); }
.item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.tag.alta { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); }
.tag.media { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
.tag.baixa { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }

/* Discord Embed Simulator */
.embed-preview-wrapper {
  background: #313338;
  border-radius: 12px;
  padding: 18px;
  margin: 18px 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.embed-preview-bot { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.embed-preview-avatar { width: 36px; height: 36px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; overflow: hidden; }
.embed-preview-avatar img { width: 100%; height: 100%; object-fit: cover; }
.embed-preview-botname { font-weight: 700; font-size: 14px; color: #f2f3f5; display: flex; align-items: center; gap: 6px; }
.embed-preview-botbadge { background: #5865f2; color: white; font-size: 10px; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
.discord-embed-card {
  background: #2b2d31;
  border-radius: 4px;
  padding: 14px 18px;
  border-left: 4px solid var(--accent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 600px;
}
.embed-author { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #f2f3f5; }
.embed-author img { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
.embed-title { font-size: 15px; font-weight: 700; color: #00a8fc; margin: 2px 0; }
.embed-desc { font-size: 13px; color: #dbdee1; line-height: 1.45; white-space: pre-wrap; }
.embed-fields-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 6px; }
.embed-field-title { font-size: 12px; font-weight: 700; color: #f2f3f5; }
.embed-field-val { font-size: 12px; color: #dbdee1; margin-top: 2px; }
.embed-footer { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #949ba4; margin-top: 8px; }
.embed-footer img { width: 16px; height: 16px; border-radius: 50%; }

/* Minigame Cyber-Breach */
.matrix-grid {
  display: grid;
  grid-template-columns: repeat(4, 52px);
  gap: 8px;
  margin: 16px 0;
  user-select: none;
}
.matrix-cell {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #151928;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: monospace;
  font-size: 16px;
  font-weight: 800;
  color: #9ba6bf;
  cursor: pointer;
  transition: all 0.15s ease;
}
.matrix-cell.active-scope {
  border-color: var(--accent);
  background: rgba(167, 139, 250, 0.12);
  color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}
.matrix-cell.selected {
  background: #0d101a;
  color: rgba(255, 255, 255, 0.2);
  border-color: transparent;
  cursor: default;
}
.buffer-box {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  border: 1px solid var(--border);
}
.buffer-slot {
  width: 38px;
  height: 38px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  font-weight: 700;
  color: var(--accent);
  background: rgba(255, 255, 255, 0.03);
}

/* Soundscape Visualizer */
.sound-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 28px;
  padding: 0 8px;
}
.sound-bar {
  width: 4px;
  background: var(--accent);
  border-radius: 2px;
  height: 6px;
  transition: height 0.1s ease;
}
.playing .sound-bar:nth-child(1) { animation: barPulse 0.6s infinite alternate; }
.playing .sound-bar:nth-child(2) { animation: barPulse 0.4s 0.1s infinite alternate; }
.playing .sound-bar:nth-child(3) { animation: barPulse 0.7s 0.2s infinite alternate; }
.playing .sound-bar:nth-child(4) { animation: barPulse 0.5s 0.15s infinite alternate; }
.playing .sound-bar:nth-child(5) { animation: barPulse 0.65s 0.05s infinite alternate; }
@keyframes barPulse { 0% { height: 4px; } 100% { height: 26px; } }

/* Toast */
.toast {
  pointer-events: auto;
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 22px;
  border-radius: 12px;
  background: #252b3f;
  border: 1px solid var(--border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px var(--accent-glow);
  color: #fff;
  font-weight: 500;
  max-width: 85vw;
  z-index: 9999;
  animation: toastIn 0.2s ease-out;
}
@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* Launcher & Mini-dock */
.launcher {
  pointer-events: auto;
  position: absolute;
  right: 24px;
  bottom: 24px;
  background: #1c2236;
  border: 1px solid var(--accent);
  border-radius: 16px;
  font-weight: 900;
  letter-spacing: 1.5px;
  padding: 14px 18px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.6), 0 0 20px var(--accent-glow);
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 8px;
}
.launcher:hover { background: #28304d; transform: scale(1.05); }

.mini-dock {
  pointer-events: auto;
  position: absolute;
  right: 24px;
  bottom: 24px;
  background: rgba(17, 20, 33, 0.95);
  border: 1px solid var(--accent);
  border-radius: 30px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 25px var(--accent-glow);
  backdrop-filter: blur(16px);
}
.mini-dock .timer-pill {
  font-family: monospace;
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
  background: rgba(0,0,0,0.3);
  padding: 4px 10px;
  border-radius: 20px;
}

.footer {
  border-top: 1px solid var(--border);
  padding: 10px 20px;
  color: var(--text-muted);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(14, 17, 28, 0.6);
}
.hide { display: none !important; }

@media(max-width: 768px) {
  .side { width: 62px; padding: 10px 4px; }
  .side .nav-category { display: none; }
  .side button { justify-content: center; padding: 10px; font-size: 0; }
  .side button .nav-icon { font-size: 18px; margin: 0; }
  main { padding: 16px; }
  .badge { display: none; }
  .live-clock { display: none; }
}
`;
root.append(style);

// DOM helpers
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
    onclick: (e) => {
      sfx('click');
      fn(e);
    },
    class: [primary ? 'primary' : '', extraClass].filter(Boolean).join(' ')
  });

const input = (placeholder, value = '', type = 'text') => el('input', { placeholder, value, type });
const area = (value = '') => { const x = el('textarea'); x.value = value; return x; };
const field = (name, x) => el('label', { text: name }, x);
const card = (title, desc, action) => el('div', { class: 'card' }, [el('h2', { text: title }), el('p', { text: desc }), action]);

function toast(message) {
  sfx('alert');
  root.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: message });
  root.append(t);
  setTimeout(() => t.remove(), 4000);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    toast('Armazenamento local cheio. Exporte um backup.');
  }
}

async function copy(v) {
  try {
    await navigator.clipboard.writeText(String(v));
    sfx('success');
    toast('Copiado para a área de transferência!');
  } catch {
    toast('Clipboard bloqueado pelo navegador.');
  }
}

const out = () => el('div', { class: 'output', role: 'status', text: 'Os resultados aparecem aqui.' });
const download = (name, value) => {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function api(url, options = {}) {
  const c = new AbortController();
  pending.add(c);
  const timeout = setTimeout(() => c.abort(), 16000);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...options
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 429 ? ' — Limite de requisições excedido' : ''}`);
    return await r.json();
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Tempo limite da consulta excedido.' : e.message;
    logs.push(msg);
    throw new Error(msg + ' Verifique a conexão ou restrições CORS/CSP.');
  } finally {
    clearTimeout(timeout);
    pending.delete(c);
  }
}

function run(button, target, fn) {
  button.disabled = true;
  target.textContent = 'Carregando…';
  Promise.resolve()
    .then(fn)
    .then(v => {
      if (alive) {
        target.textContent = v;
        sfx('success');
      }
    })
    .catch(e => {
      if (alive) target.textContent = e.message;
    })
    .finally(() => {
      if (alive) button.disabled = false;
    });
}

function store(name) {
  try { return window.Vencord?.Webpack?.getStore?.(name) || null; } catch { return null; }
}

function context() {
  const cid = store('SelectedChannelStore')?.getChannelId?.() || location.pathname.match(/\/channels\/[^/]+\/([^/]+)/)?.[1];
  const ch = store('ChannelStore')?.getChannel?.(cid);
  return { cid, gid: ch?.guild_id || location.pathname.match(/\/channels\/([^/]+)/)?.[1], name: ch?.name };
}

// Navigation structure
const navSections = [
  {
    category: 'Principal',
    items: [
      ['home', '◈', 'Início'],
      ['discord', '☷', 'Radar Servidor'],
      ['embeds', '✉', 'Embed Studio']
    ]
  },
  {
    category: 'Produtividade',
    items: [
      ['notes', '✎', 'Notas'],
      ['tasks', '☑', 'Tarefas'],
      ['snippets', '▤', 'Textos Prontos'],
      ['bookmarks', '☆', 'Favoritos']
    ]
  },
  {
    category: 'Mídia & Estilo',
    items: [
      ['textstyler', '𝔉', 'Texto & Estilos'],
      ['soundscape', '♬', 'Soundscape'],
      ['colors', '◉', 'Color Studio']
    ]
  },
  {
    category: 'Consultas',
    items: [
      ['crypto', '⟠', 'Cripto Ticker'],
      ['weather', '☀', 'Clima'],
      ['translate', '文', 'Tradutor'],
      ['github', '⌘', 'GitHub Explorer'],
      ['timestamp', '◷', 'Timestamps']
    ]
  },
  {
    category: 'Sistema',
    items: [
      ['focus', '◎', 'Modo Foco'],
      ['minigame', '🖳', 'Cyber-Breach'],
      ['tools', '⚒', 'Utilitários'],
      ['settings', '⚙', 'Ajustes']
    ]
  }
];

// Main Window Elements
const win = el('section', { class: 'window', 'aria-label': 'NEXUS Hub' });
const clockEl = el('span', { class: 'live-clock', text: '--:--:--' });

const top = el('header', { class: 'top' }, [
  el('div', { class: 'logo-box' }, [
    el('span', { class: 'logo', text: '◈ NEXUS' }),
    el('span', { class: 'badge', text: 'COMMAND CENTER' }),
    clockEl
  ]),
  el('span', { class: 'spacer' }),
  el('div', { class: 'window-controls' }, [
    btn('⊟', () => toggleMiniDock(), false, 'dock-btn'),
    btn('⛶', () => toggleMaximize(), false, 'max-btn'),
    btn('—', () => win.classList.add('hide')),
    btn('×', () => destroy(), false, 'close-btn')
  ])
]);

const side = el('nav', { class: 'side' });
const main = el('main');
const footer = el('div', { class: 'footer' }, [
  el('span', { text: 'NEXUS v1.2.0 · LOCAL FIRST · ZERO TELEMETRIA' }),
  el('span', { text: 'Atalhos: Alt+Shift+N (Hub) | Alt+Shift+M (Dock) | Esc' })
]);

win.append(top, el('div', { class: 'layout' }, [side, main]), footer);

// Mini dock & Launcher
const launcher = el('button', {
  class: 'launcher',
  text: '◈ NEXUS',
  onclick: () => {
    sfx('click');
    win.classList.toggle('hide');
  }
});

const miniDock = el('div', { class: 'mini-dock hide' }, [
  el('span', { class: 'timer-pill', id: 'mini-timer', text: '25:00' }),
  btn('Abrir Hub ↗', () => {
    toggleMiniDock();
    win.classList.remove('hide');
  }, true, 'sm')
]);

root.append(win, launcher, miniDock);

// Build sidebar items
for (const sec of navSections) {
  side.append(el('div', { class: 'nav-category', text: sec.category }));
  for (const [id, icon, label] of sec.items) {
    side.append(el('button', {
      'data-page': id,
      onclick: () => render(id)
    }, [
      el('span', { class: 'nav-icon', text: icon }),
      el('span', { text: label })
    ]));
  }
}

// Window Dragging & Sizing Persistence
let drag = null;
top.addEventListener('pointerdown', e => {
  if (isMaximized || e.target.closest('button')) return;
  const r = win.getBoundingClientRect();
  drag = { x: e.clientX - r.left, y: e.clientY - r.top };
  top.setPointerCapture(e.pointerId);
}, { signal: abort.signal });

top.addEventListener('pointermove', e => {
  if (!drag || isMaximized) return;
  const nx = Math.max(0, Math.min(innerWidth - 120, e.clientX - drag.x));
  const ny = Math.max(0, Math.min(innerHeight - 60, e.clientY - drag.y));
  win.style.left = nx + 'px';
  win.style.top = ny + 'px';
}, { signal: abort.signal });

top.addEventListener('pointerup', () => {
  if (drag) {
    drag = null;
    saveWindowBounds();
  }
}, { signal: abort.signal });

function saveWindowBounds() {
  if (isMaximized) return;
  data.winBounds = {
    left: win.style.left,
    top: win.style.top,
    width: win.style.width,
    height: win.style.height
  };
  save();
}

// Restore window bounds if saved
if (data.winBounds) {
  if (data.winBounds.left) win.style.left = data.winBounds.left;
  if (data.winBounds.top) win.style.top = data.winBounds.top;
  if (data.winBounds.width) win.style.width = data.winBounds.width;
  if (data.winBounds.height) win.style.height = data.winBounds.height;
}

function toggleMaximize() {
  isMaximized = !isMaximized;
  win.classList.toggle('maximized', isMaximized);
  sfx('click');
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
  sfx('click');
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && e.code === 'KeyN') {
    e.preventDefault();
    if (isMiniDock) toggleMiniDock();
    win.classList.toggle('hide');
    sfx('click');
  } else if (e.altKey && e.shiftKey && e.code === 'KeyM') {
    e.preventDefault();
    toggleMiniDock();
  } else if (e.key === 'Escape' && !win.classList.contains('hide')) {
    win.classList.add('hide');
    sfx('click');
  }
}, { signal: abort.signal });

function heading(title, desc) {
  main.append(
    el('div', { class: 'eyebrow', text: 'NEXUS / ' + title.toUpperCase() }),
    el('h1', { text: title }),
    el('p', { text: desc })
  );
}

function render(id = page) {
  page = id;
  main.replaceChildren();
  root.host.style.setProperty('--accent', data.accent);
  root.host.style.setProperty('--accent-glow', data.accent + '44');
  root.host.style.setProperty('--bg-panel', `rgba(17, 20, 33, ${(data.opacity || 96) / 100})`);
  side.querySelectorAll('button[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  if (pages[id]) pages[id]();
}

// Live Clock & Timer updater
function updateClock() {
  const d = new Date();
  clockEl.textContent = d.toLocaleTimeString('pt-BR');
}
const clockInterval = setInterval(updateClock, 1000);
updateClock();

// =========================================================================
// PAGES
// =========================================================================
const pages = {
  // HOME / COMMAND CENTER
  home() {
    heading('Command Center', 'Acesso instantâneo a ferramentas essenciais, sem sair do chat.');
    const search = input('Buscar ferramenta ou utilitário… (ex: embed, clima, crypto, notas)');
    const grid = el('div', { class: 'grid' });

    // Active stats
    const doneTasks = data.tasks.filter(t => t.done).length;
    const hero = el('div', { class: 'hero' }, [
      el('div', { class: 'eyebrow', text: 'VISÃO GERAL DO SISTEMA' }),
      el('h2', { text: 'NEXUS Personal Hub Ativo' }),
      el('p', { text: 'Privacidade total, dados locais, síntese sonora Web Audio e ferramentas rápidas integradas.' }),
      el('div', { class: 'stat-box' }, [
        el('div', { class: 'stat-item' }, [
          el('div', { class: 'stat-val', text: String(data.snippets.length) }),
          el('div', { class: 'stat-lbl', text: 'Textos Prontos' })
        ]),
        el('div', { class: 'stat-item' }, [
          el('div', { class: 'stat-val', text: `${doneTasks}/${data.tasks.length}` }),
          el('div', { class: 'stat-lbl', text: 'Tarefas Feitas' })
        ]),
        el('div', { class: 'stat-item' }, [
          el('div', { class: 'stat-val', text: String(data.bookmarks.length) }),
          el('div', { class: 'stat-lbl', text: 'Favoritos Salvos' })
        ])
      ]),
      el('div', { style: 'margin-top: 16px' }, [search])
    ]);

    main.append(hero, grid);

    const cards = [
      ['embeds', 'Embed & Webhook Studio', 'Crie embeds profissionais com preview em tempo real e teste webhooks.'],
      ['discord', 'Radar do Servidor', 'Explore cargos e membros em cache do cliente sem requisições forçadas.'],
      ['tasks', 'Cyber Tarefas', 'Checklist com prioridades e cálculo de produtividade local.'],
      ['textstyler', 'Texto & Estilos', 'Fontes personalizadas, Glitch Zalgo, Markdown e biblioteca Kaomoji.'],
      ['soundscape', 'Soundscapes Sintetizados', 'Chuva cyberpunk, ruído marrom e frequências de foco em Web Audio.'],
      ['colors', 'Color Studio', 'Seletor HEX, RGB, HSL e conversor para Discord Int para desenvolvedores de bots.'],
      ['crypto', 'Cripto Ticker', 'Cotações em tempo real de BTC, ETH, SOL e variação em 24h via CoinGecko.'],
      ['weather', 'Previsão do Tempo', 'Consulte temperatura, umidade, vento e previsão de 3 dias via Open-Meteo.'],
      ['focus', 'Modo Foco Pomodoro', 'Cronômetro de produtividade integrado e alarme suave.'],
      ['minigame', 'Cyber-Breach Game', 'Minigame de hacking e decodificação estilo Cyberpunk 2077.'],
      ['notes', 'Bloco de Notas', 'Notas persistentes salvas por servidor ou globalmente.'],
      ['tools', 'Bancada de Utilitários', 'Snowflake decoder, formatador JSON, latência de rede e sorteador.']
    ];

    const paint = () => {
      grid.replaceChildren();
      const q = search.value.toLowerCase().trim();
      for (const [id, t, d] of cards.filter(x => x.join(' ').toLowerCase().includes(q))) {
        grid.append(card(t, d, btn('Abrir Ferramenta ↗', () => render(id))));
      }
    };
    search.addEventListener('input', paint, { signal: abort.signal });
    paint();
  },

  // DISCORD SERVER RADAR
  discord() {
    heading('Radar do Servidor', 'Leitura segura dos dados em cache do Vencord. Nenhuma requisição forçada.');
    const result = out();
    const b = btn('Atualizar Leitura do Servidor', () => {
      try {
        const { gid, cid, name } = context();
        const gs = store('GuildStore');
        const rs = store('GuildRoleStore');
        const ms = store('GuildMemberStore');

        if (!gid || gid === '@me') throw new Error('Abra um canal de um servidor no Discord primeiro.');
        const guild = gs?.getGuild?.(gid);
        const rawRoles = rs?.getRoles?.(gid) || guild?.roles;
        const roles = Array.isArray(rawRoles) ? rawRoles : Object.values(rawRoles || {});
        const rawMembers = ms?.getMembers?.(gid);
        const members = Array.isArray(rawMembers) ? rawMembers : Object.values(rawMembers || {});

        result.replaceChildren(
          el('h2', { text: guild?.name || 'Servidor ' + gid }),
          el('p', { text: `Canal Ativo: #${name || cid || 'indisponível'} · ${members.length} membros carregados no cache local.` }),
          el('small', { text: 'Observação: Apenas membros na memória local são contados para evitar rate limits.' })
        );

        for (const r of roles.sort((a, b) => (b.position || 0) - (a.position || 0))) {
          const count = members.filter(m => r.id === gid || (m.roles || []).includes(r.id)).length;
          result.append(el('div', { class: 'item' }, [
            el('div', { class: 'item-header' }, [
              el('strong', { text: r.name }),
              btn('Copiar ID', () => copy(r.id), false, 'sm')
            ]),
            el('small', { text: `ID: ${r.id} · Cor: #${(r.color || 0).toString(16).padStart(6, '0')} · ${count} membros em cache` })
          ]));
        }
      } catch (e) {
        result.textContent = e.message;
      }
    }, true);
    main.append(b, result);
  },

  // DISCORD EMBED & WEBHOOK STUDIO
  embeds() {
    heading('Embed & Webhook Studio', 'Crie embeds ricos para Discord com preview fidedigno e teste direto via Webhook.');
    
    const hookUrl = input('URL do Webhook (ex: https://discord.com/api/webhooks/...)');
    const botName = input('Nome do Bot (Opcional)', 'NEXUS Assistant');
    const botAvatar = input('URL do Avatar do Bot (Opcional)');
    const title = input('Título do Embed', 'Anúncio Oficial NEXUS');
    const desc = area('Este é um exemplo de embed gerado pelo **NEXUS Hub**.\nSuporta **negrito**, *itálico*, `código` e links!');
    const colorInput = input('', '#5865f2', 'color');
    const authorName = input('Nome do Autor (Opcional)');
    const footerText = input('Texto do Rodapé (Opcional)', 'NEXUS Hub • Sistema Automático');

    // Preset color buttons
    const colorRow = el('div', { class: 'row' });
    const colors = [
      ['Blurple', '#5865f2'],
      ['Verde', '#57f287'],
      ['Amarelo', '#fee75c'],
      ['Fúcsia', '#eb459e'],
      ['Vermelho', '#ed4245'],
      ['Ciano', '#00b0f4']
    ];
    for (const [cName, cHex] of colors) {
      colorRow.append(btn(cName, () => {
        colorInput.value = cHex;
        updatePreview();
      }, false, 'sm'));
    }

    // Embed visual preview container
    const previewWrap = el('div', { class: 'embed-preview-wrapper' });
    const cardEl = el('div', { class: 'discord-embed-card' });
    const authorEl = el('div', { class: 'embed-author' });
    const titleEl = el('div', { class: 'embed-title' });
    const descEl = el('div', { class: 'embed-desc' });
    const footerEl = el('div', { class: 'embed-footer' });

    cardEl.append(authorEl, titleEl, descEl, footerEl);
    previewWrap.append(
      el('div', { class: 'embed-preview-bot' }, [
        el('div', { class: 'embed-preview-avatar', text: 'NX' }),
        el('div', { class: 'embed-preview-botname' }, [
          el('span', { id: 'preview-bot-name', text: 'NEXUS Assistant' }),
          el('span', { class: 'embed-preview-botbadge', text: 'BOT' })
        ])
      ]),
      cardEl
    );

    function hexToInt(hex) {
      return parseInt(hex.replace('#', ''), 16) || 0;
    }

    function buildPayload() {
      const embed = {
        title: title.value.trim() || undefined,
        description: desc.value.trim() || undefined,
        color: hexToInt(colorInput.value)
      };
      if (authorName.value.trim()) embed.author = { name: authorName.value.trim() };
      if (footerText.value.trim()) embed.footer = { text: footerText.value.trim() };

      const payload = {
        username: botName.value.trim() || undefined,
        avatar_url: botAvatar.value.trim() || undefined,
        embeds: [embed]
      };
      return payload;
    }

    function updatePreview() {
      cardEl.style.borderLeftColor = colorInput.value;
      authorEl.textContent = authorName.value.trim();
      authorEl.style.display = authorName.value.trim() ? 'block' : 'none';
      titleEl.textContent = title.value.trim();
      titleEl.style.display = title.value.trim() ? 'block' : 'none';
      descEl.textContent = desc.value;
      footerEl.textContent = footerText.value.trim();
      footerEl.style.display = footerText.value.trim() ? 'block' : 'none';
      root.getElementById('preview-bot-name').textContent = botName.value.trim() || 'Webhook Bot';
    }

    title.addEventListener('input', updatePreview, { signal: abort.signal });
    desc.addEventListener('input', updatePreview, { signal: abort.signal });
    colorInput.addEventListener('input', updatePreview, { signal: abort.signal });
    authorName.addEventListener('input', updatePreview, { signal: abort.signal });
    footerText.addEventListener('input', updatePreview, { signal: abort.signal });
    botName.addEventListener('input', updatePreview, { signal: abort.signal });

    const statusEl = out();

    const sendBtn = btn('Enviar via Webhook 🚀', async () => {
      const url = hookUrl.value.trim();
      if (!url.startsWith('https://discord.com/api/webhooks/')) {
        return toast('Insira uma URL de Webhook válida do Discord.');
      }
      sendBtn.disabled = true;
      statusEl.textContent = 'Enviando payload para o Discord…';
      try {
        const payload = buildPayload();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'omit'
        });
        if (res.ok || res.status === 204) {
          sfx('success');
          statusEl.textContent = 'Mensagem enviada com sucesso ao canal do Discord!';
          toast('Embed enviado com sucesso!');
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Falha HTTP ${res.status}: ${errData.message || 'Erro ao enviar'}`);
        }
      } catch (err) {
        statusEl.textContent = 'Erro ao disparar Webhook: ' + err.message;
        toast('Erro ao disparar Webhook.');
      } finally {
        sendBtn.disabled = false;
      }
    }, true);

    const copyJsonBtn = btn('Copiar JSON Payload', () => {
      copy(JSON.stringify(buildPayload(), null, 2));
    });

    main.append(
      field('Webhook URL do Discord', hookUrl),
      el('div', { class: 'row' }, [
        field('Nome do Bot', botName),
        field('URL do Avatar', botAvatar)
      ]),
      el('div', { class: 'row' }, [
        field('Título do Embed', title),
        field('Cor da Borda', colorInput)
      ]),
      colorRow,
      field('Descrição do Embed', desc),
      el('div', { class: 'row' }, [
        field('Autor do Embed', authorName),
        field('Rodapé', footerText)
      ]),
      el('h2', { text: 'Preview em Tempo Real:' }),
      previewWrap,
      el('div', { class: 'actions' }, [sendBtn, copyJsonBtn]),
      statusEl
    );
    updatePreview();
  },

  // CYBER TAREFAS / TODO
  tasks() {
    heading('Cyber Tarefas', 'Controle de afazeres com prioridades, cálculo de progresso e persistência.');

    const taskTitle = input('Nome da tarefa…');
    const prioritySelect = el('select', {}, [
      el('option', { value: 'baixa', text: 'Prioridade Baixa' }),
      el('option', { value: 'media', text: 'Prioridade Média' }),
      el('option', { value: 'alta', text: 'Prioridade Alta' })
    ]);
    prioritySelect.value = 'media';

    const list = el('div');
    const progressEl = el('div', { class: 'hero', style: 'padding: 16px 20px;' });

    function updateProgress() {
      const total = data.tasks.length;
      const done = data.tasks.filter(t => t.done).length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      progressEl.replaceChildren(
        el('div', { class: 'item-header' }, [
          el('strong', { text: `Progresso: ${done} de ${total} tarefas concluídas (${pct}%)` }),
          el('span', { class: 'badge', text: pct === 100 && total > 0 ? 'COMPLETO' : 'EM ANDAMENTO' })
        ]),
        el('div', { style: 'background: rgba(0,0,0,0.3); height: 8px; border-radius: 4px; overflow: hidden; margin-top: 8px;' }, [
          el('div', { style: `background: var(--accent); width: ${pct}%; height: 100%; transition: width 0.3s ease;` })
        ])
      );
    }

    function renderTasks() {
      list.replaceChildren();
      updateProgress();
      if (data.tasks.length === 0) {
        list.append(el('p', { text: 'Nenhuma tarefa cadastrada. Adicione uma acima!' }));
        return;
      }
      for (const t of data.tasks) {
        const check = el('input', { type: 'checkbox' });
        check.checked = !!t.done;
        check.style.width = '18px';
        check.style.height = '18px';
        check.style.cursor = 'pointer';

        const label = el('span', {
          text: t.title,
          style: t.done ? 'text-decoration: line-through; opacity: 0.55;' : 'font-weight: 500;'
        });

        check.addEventListener('change', () => {
          t.done = check.checked;
          if (t.done) sfx('success');
          else sfx('click');
          save();
          renderTasks();
        }, { signal: abort.signal });

        const delBtn = btn('Excluir', () => {
          data.tasks = data.tasks.filter(x => x.id !== t.id);
          save();
          renderTasks();
        }, false, 'sm danger');

        const item = el('div', { class: 'item' }, [
          el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 12px;' }, [
            el('div', { style: 'display: flex; align-items: center; gap: 12px; flex: 1;' }, [
              check,
              label,
              el('span', { class: `tag ${t.priority}`, text: t.priority })
            ]),
            delBtn
          ])
        ]);
        list.append(item);
      }
    }

    const addBtn = btn('Adicionar Tarefa', () => {
      const val = taskTitle.value.trim();
      if (!val) return toast('Digite o nome da tarefa.');
      data.tasks.unshift({
        id: crypto.randomUUID(),
        title: val,
        priority: prioritySelect.value,
        done: false,
        createdAt: Date.now()
      });
      taskTitle.value = '';
      save();
      renderTasks();
      sfx('click');
    }, true);

    main.append(
      progressEl,
      el('div', { class: 'row' }, [
        field('Nova Tarefa', taskTitle),
        field('Prioridade', prioritySelect)
      ]),
      el('div', { class: 'actions' }, [
        addBtn,
        btn('Limpar Concluídas', () => {
          data.tasks = data.tasks.filter(t => !t.done);
          save();
          renderTasks();
        }, false, 'sm')
      ]),
      list
    );
    renderTasks();
  },

  // FANCY TEXT & MARKDOWN MATRIX
  textstyler() {
    heading('Texto & Estilos', 'Gere fontes estilizadas para o Discord, Glitch Zalgo, Markdown e Kaomojis prontos.');
    
    const rawInput = input('Digite seu texto aqui…', 'Nexus Hub');
    const resultBox = el('div');

    const unicodeMaps = {
      'Gótico / Fraktur': s => s.replace(/[a-zA-Z]/g, c => {
        const code = c.charCodeAt(0);
        return code >= 97 ? String.fromCodePoint(0x1D51E + code - 97) : String.fromCodePoint(0x1D504 + code - 65);
      }),
      'Bold Sans': s => s.replace(/[a-zA-Z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
        return code >= 97 ? String.fromCodePoint(0x1D5EE + code - 97) : String.fromCodePoint(0x1D5D4 + code - 65);
      }),
      'Italic Sans': s => s.replace(/[a-zA-Z]/g, c => {
        const code = c.charCodeAt(0);
        return code >= 97 ? String.fromCodePoint(0x1D622 + code - 97) : String.fromCodePoint(0x1D608 + code - 65);
      }),
      'Círculos / Bubble': s => s.replace(/[a-zA-Z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 49 && code <= 57) return String.fromCodePoint(0x2460 + code - 49);
        if (code === 48) return '⓪';
        return code >= 97 ? String.fromCodePoint(0x24D0 + code - 97) : String.fromCodePoint(0x24B6 + code - 65);
      }),
      'Espaçado / Wide': s => s.split('').join(' '),
      'De Cabeça para Baixo': s => {
        const map = { a:'ɐ', b:'q', c:'ɔ', d:'p', e:'ǝ', f:'ɟ', g:'ƃ', h:'ɥ', i:'ᴉ', j:'ɾ', k:'ʞ', l:'l', m:'ɯ', n:'u', o:'o', p:'d', q:'b', r:'ɹ', s:'s', t:'ʇ', u:'n', v:'ʌ', w:'ʍ', x:'x', y:'ʎ', z:'z' };
        return s.toLowerCase().split('').reverse().map(c => map[c] || c).join('');
      }
    };

    function generateZalgo(text, intensity = 4) {
      const diacritics = [
        '\u0300','\u0301','\u0302','\u0303','\u0304','\u0305','\u0306','\u0307','\u0308','\u0309','\u030A','\u030B',
        '\u0316','\u0317','\u0318','\u0319','\u031C','\u031D','\u031E','\u031F','\u0320','\u0324','\u0325','\u0326'
      ];
      return text.split('').map(c => {
        let res = c;
        for (let i = 0; i < intensity; i++) {
          res += diacritics[Math.floor(Math.random() * diacritics.length)];
        }
        return res;
      }).join('');
    }

    function renderStyles() {
      resultBox.replaceChildren();
      const txt = rawInput.value.trim() || 'NEXUS';

      for (const [name, fn] of Object.entries(unicodeMaps)) {
        try {
          const styled = fn(txt);
          resultBox.append(el('div', { class: 'item' }, [
            el('div', { class: 'item-header' }, [
              el('small', { text: name }),
              btn('Copiar', () => copy(styled), false, 'sm')
            ]),
            el('div', { text: styled, style: 'font-size: 16px; margin-top: 4px; font-weight: 600;' })
          ]));
        } catch {}
      }

      // Zalgo generator card
      const zalgoTxt = generateZalgo(txt, 4);
      resultBox.append(el('div', { class: 'item' }, [
        el('div', { class: 'item-header' }, [
          el('small', { text: 'Glitch / Zalgo Effect' }),
          btn('Copiar', () => copy(zalgoTxt), false, 'sm')
        ]),
        el('div', { text: zalgoTxt, style: 'font-size: 16px; margin-top: 4px;' })
      ]));

      // Discord Markdown shortcuts
      const mdShortcuts = [
        ['Spoiler', `||${txt}||`],
        ['Subtexto Discreto', `-# ${txt}`],
        ['Cabeçalho Grande', `# ${txt}`],
        ['Bloco de Código', `\`\`\`${txt}\`\`\``],
        ['Citação', `> ${txt}`]
      ];
      for (const [mName, mVal] of mdShortcuts) {
        resultBox.append(el('div', { class: 'item' }, [
          el('div', { class: 'item-header' }, [
            el('small', { text: 'Discord ' + mName }),
            btn('Copiar', () => copy(mVal), false, 'sm')
          ]),
          el('code', { text: mVal, style: 'font-size: 13px; color: var(--accent);' })
        ]));
      }
    }

    rawInput.addEventListener('input', renderStyles, { signal: abort.signal });

    // Kaomoji library
    const kaomojiGrid = el('div', { class: 'actions' });
    const emojis = [
      '(╯°□°)╯︵ ┻━┻', '┬─┬ノ( º _ ºノ)', '( ͡° ͜ʖ ͡°)', '¯\\_(ツ)_/¯',
      '(づ｡◕‿‿◕｡)づ', '(ง\'̀-\'́)ง', '(•_•) ( •_•)>⌐■-■ (⌐■_■)', 'ಠ_ಠ',
      '(=^･ω･^=)', '(づ￣ ³￣)づ', '(っ˘ڡ˘ς)', '(っ◕‿◕)っ'
    ];
    for (const k of emojis) {
      kaomojiGrid.append(btn(k, () => copy(k), false, 'sm'));
    }

    main.append(
      field('Texto Original', rawInput),
      el('h2', { text: 'Kaomojis Prontos para Copiar:' }),
      kaomojiGrid,
      el('h2', { text: 'Estilos Gerados:', style: 'margin-top: 20px;' }),
      resultBox
    );
    renderStyles();
  },

  // SOUNDSCAPE SINTETIZADO (Web Audio)
  soundscape() {
    heading('Soundscape Sintetizado', 'Sons ambientes de foco e ruídos de imersão gerados via Web Audio API, sem streaming.');

    const visualizer = el('div', { class: `sound-bars ${ambientAudioNode ? 'playing' : ''}` }, [
      el('div', { class: 'sound-bar' }),
      el('div', { class: 'sound-bar' }),
      el('div', { class: 'sound-bar' }),
      el('div', { class: 'sound-bar' }),
      el('div', { class: 'sound-bar' })
    ]);

    const statusDisplay = el('div', {
      class: 'stat',
      style: 'font-size: 20px; margin: 10px 0;',
      text: ambientAudioNode ? `Tocando: ${currentAmbientType}` : 'Pausado'
    });

    const volSlider = el('input', { type: 'range', min: '0', max: '100', value: '50' });
    volSlider.addEventListener('input', () => {
      const v = Number(volSlider.value) / 100;
      if (ambientGainNode && audioCtx) {
        ambientGainNode.gain.setValueAtTime(v * 0.25, audioCtx.currentTime);
      }
    }, { signal: abort.signal });

    const hero = el('div', { class: 'hero' }, [
      el('div', { style: 'display: flex; align-items: center; justify-content: space-between;' }, [
        statusDisplay,
        visualizer
      ]),
      field('Volume do Som Ambiente', volSlider)
    ]);

    const soundCards = [
      ['rain', '🌧️ Chuva Cyberpunk', 'Filtro de ruído rosa suave simulando chuva constante em neon.'],
      ['space', '🌌 Deep Space Drone', 'Osciladores harmônicos graves de 55Hz com filtro passa-baixa ressonante.'],
      ['focus432', '☕ 432Hz Harmonic Beats', 'Frequência de foco alfa com modulação harmônica binaural.'],
      ['neon', '⚡ Zumbido de Neon 60Hz', 'Harmônico do circuito elétrico clássico cyberpunk.']
    ];

    const grid = el('div', { class: 'grid' });
    for (const [sType, sName, sDesc] of soundCards) {
      grid.append(card(sName, sDesc, btn('Reproduzir Som', () => {
        try {
          startAmbient(sType, Number(volSlider.value) / 100);
          statusDisplay.textContent = `Tocando: ${sName}`;
          visualizer.classList.add('playing');
          toast(`Iniciando ${sName}`);
        } catch (e) {
          toast(e.message);
        }
      }, currentAmbientType === sType)));
    }

    main.append(
      hero,
      el('div', { class: 'actions' }, [
        btn('Parar Áudio ■', () => {
          stopAmbient();
          statusDisplay.textContent = 'Pausado';
          visualizer.classList.remove('playing');
          toast('Áudio ambiente interrompido.');
        }, false, 'danger')
      ]),
      grid
    );
  },

  // COLOR STUDIO
  colors() {
    heading('Color Studio', 'Paletas, contraste WCAG e conversor instantâneo para Discord Decimal Int.');
    
    const colorPicker = input('', '#5865f2', 'color');
    const hexInput = input('HEX (ex: #5865F2)', '#5865f2');
    const resultBox = el('div');

    function updateColor(hex) {
      if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return;
      const cleanHex = hex.startsWith('#') ? hex : '#' + hex;
      colorPicker.value = cleanHex;
      hexInput.value = cleanHex;

      const r = parseInt(cleanHex.slice(1, 3), 16);
      const g = parseInt(cleanHex.slice(3, 5), 16);
      const b = parseInt(cleanHex.slice(5, 7), 16);
      const discordInt = (r << 16) + (g << 8) + b;

      // Luminance for WCAG contrast vs #313338
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const contrastText = lum > 0.5 ? 'Alto contraste em fundo escuro' : 'Baixo contraste em fundo escuro';

      resultBox.replaceChildren(
        el('div', { class: 'hero', style: `background: ${cleanHex}; color: ${lum > 0.5 ? '#111' : '#fff'}; transition: all 0.2s ease;` }, [
          el('h2', { text: 'Amostra de Cor' }),
          el('p', { text: `${contrastText} · RGB(${r}, ${g}, ${b})`, style: `color: ${lum > 0.5 ? '#222' : '#eee'};` })
        ]),
        el('div', { class: 'grid' }, [
          card('Discord Integer Color', 'Valor numérico decimal exigido por bots de Discord em embeds.', btn(`Copiar Int: ${discordInt}`, () => copy(discordInt), true)),
          card('Código HEX', 'Código hexadecimal padrão para CSS e interfaces.', btn(`Copiar: ${cleanHex.toUpperCase()}`, () => copy(cleanHex.toUpperCase()))),
          card('RGB', 'Formato de canais Vermelho, Verde e Azul.', btn(`Copiar: rgb(${r}, ${g}, ${b})`, () => copy(`rgb(${r}, ${g}, ${b})`)))
        ])
      );
    }

    colorPicker.addEventListener('input', () => updateColor(colorPicker.value), { signal: abort.signal });
    hexInput.addEventListener('input', () => updateColor(hexInput.value), { signal: abort.signal });

    // Presets
    const presetsRow = el('div', { class: 'actions' });
    const presets = [
      ['Blurple', '#5865f2'],
      ['Cyber Cyan', '#00e5ff'],
      ['Neon Green', '#00ff66'],
      ['Hot Pink', '#ff007f'],
      ['Matrix', '#00ff41'],
      ['Gold', '#ffb703']
    ];
    for (const [pName, pHex] of presets) {
      presetsRow.append(btn(pName, () => updateColor(pHex), false, 'sm'));
    }

    main.append(
      el('div', { class: 'row' }, [
        field('Seletor de Cor', colorPicker),
        field('Código HEX', hexInput)
      ]),
      el('h2', { text: 'Cores Predefinidas:' }),
      presetsRow,
      resultBox
    );
    updateColor('#5865f2');
  },

  // CRIPTO TICKER (CoinGecko public free API)
  crypto() {
    heading('Cripto Ticker', 'Cotações em tempo real de criptomoedas populares sem chave de API via CoinGecko.');
    const grid = el('div', { class: 'grid' });
    const status = el('small', { text: 'Clique em Atualizar para consultar preços ao vivo.' });

    const fetchBtn = btn('Atualizar Cotações ⟳', async () => {
      fetchBtn.disabled = true;
      grid.replaceChildren(el('p', { text: 'Consultando CoinGecko…' }));
      try {
        const res = await api('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin&vs_currencies=usd,brl&include_24hr_change=true');
        grid.replaceChildren();

        const meta = {
          bitcoin: { name: 'Bitcoin', sym: 'BTC', icon: '₿' },
          ethereum: { name: 'Ethereum', sym: 'ETH', icon: 'Ξ' },
          solana: { name: 'Solana', sym: 'SOL', icon: '◎' },
          binancecoin: { name: 'BNB', sym: 'BNB', icon: '◈' },
          ripple: { name: 'XRP', sym: 'XRP', icon: '✕' },
          dogecoin: { name: 'Dogecoin', sym: 'DOGE', icon: 'Ð' }
        };

        for (const [id, dataCoin] of Object.entries(res)) {
          const coin = meta[id] || { name: id, sym: id.toUpperCase(), icon: '●' };
          const change = dataCoin.usd_24h_change || 0;
          const isUp = change >= 0;

          grid.append(el('div', { class: 'card' }, [
            el('div', { class: 'item-header' }, [
              el('strong', { text: `${coin.icon} ${coin.name} (${coin.sym})` }),
              el('span', {
                class: `tag ${isUp ? 'baixa' : 'alta'}`,
                text: `${isUp ? '+' : ''}${change.toFixed(2)}%`
              })
            ]),
            el('div', { style: 'font-size: 22px; font-weight: 800; margin: 10px 0; color: var(--accent);', text: `$ ${dataCoin.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` }),
            el('small', { text: `R$ ${dataCoin.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` })
          ]));
        }
        status.textContent = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
        sfx('success');
      } catch (err) {
        grid.replaceChildren(el('p', { text: 'Falha ao buscar cotações: ' + err.message }));
      } finally {
        fetchBtn.disabled = false;
      }
    }, true);

    main.append(
      el('div', { class: 'actions' }, [fetchBtn, status]),
      grid
    );
    fetchBtn.click();
  },

  // CYBER-BREACH MINIGAME
  minigame() {
    heading('Cyber-Breach', 'Desafio de decodificação de buffer inspirado no Breach Protocol do Cyberpunk 2077.');

    const hexSet = ['1C', 'E9', '7A', '55', 'BD'];
    let gridData = [];
    let targetSeq = [];
    let currentBuffer = [];
    let activeRow = 0;
    let activeCol = null;
    let isHorizontal = true;
    let score = 0;

    const gameContainer = el('div');

    function initGame() {
      gridData = [];
      for (let r = 0; r < 4; r++) {
        const row = [];
        for (let c = 0; c < 4; c++) {
          row.push({
            val: hexSet[Math.floor(Math.random() * hexSet.length)],
            used: false,
            r, c
          });
        }
        gridData.push(row);
      }
      targetSeq = [
        hexSet[Math.floor(Math.random() * hexSet.length)],
        hexSet[Math.floor(Math.random() * hexSet.length)],
        hexSet[Math.floor(Math.random() * hexSet.length)]
      ];
      currentBuffer = [];
      activeRow = 0;
      activeCol = null;
      isHorizontal = true;
      renderBoard();
    }

    function checkSeq() {
      const bufStr = currentBuffer.join(',');
      const tgtStr = targetSeq.join(',');
      if (bufStr.includes(tgtStr)) {
        sfx('success');
        score += 100;
        toast('BREACH CONCLUÍDO! +100 Pontos!');
        initGame();
        return;
      }
      if (currentBuffer.length >= 4) {
        sfx('alert');
        toast('BUFFER CHEIO. Falha na invasão!');
        initGame();
      }
    }

    function renderBoard() {
      gameContainer.replaceChildren();

      const headerStats = el('div', { class: 'hero', style: 'padding: 16px 20px;' }, [
        el('div', { class: 'item-header' }, [
          el('h2', { text: `Pontuação: ${score}` }),
          el('span', { class: 'badge', text: isHorizontal ? `LINHA ATIVA: ${activeRow + 1}` : `COLUNA ATIVA: ${activeCol + 1}` })
        ]),
        el('div', { style: 'margin-top: 8px;' }, [
          el('small', { text: 'Alvo a Decodificar: ' }),
          el('strong', { style: 'color: var(--accent); letter-spacing: 3px; font-family: monospace;', text: targetSeq.join('  ') })
        ])
      ]);

      const bufferWrap = el('div', { class: 'buffer-box' }, [
        el('small', { text: 'BUFFER (4 máx): ' }),
        ...[0, 1, 2, 3].map(idx => el('div', { class: 'buffer-slot', text: currentBuffer[idx] || '' }))
      ]);

      const matrixEl = el('div', { class: 'matrix-grid' });

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const cell = gridData[r][c];
          const isEligible = !cell.used && (isHorizontal ? r === activeRow : c === activeCol);

          const cellEl = el('div', {
            class: `matrix-cell ${cell.used ? 'selected' : ''} ${isEligible ? 'active-scope' : ''}`,
            text: cell.used ? '·' : cell.val
          });

          if (isEligible) {
            cellEl.addEventListener('click', () => {
              sfx('click');
              cell.used = true;
              currentBuffer.push(cell.val);
              if (isHorizontal) {
                isHorizontal = false;
                activeCol = c;
              } else {
                isHorizontal = true;
                activeRow = r;
              }
              renderBoard();
              checkSeq();
            });
          }
          matrixEl.append(cellEl);
        }
      }

      gameContainer.append(
        headerStats,
        bufferWrap,
        matrixEl,
        el('div', { class: 'actions' }, [
          btn('Reiniciar Quebra-Cabeça', () => {
            initGame();
            sfx('click');
          })
        ])
      );
    }

    main.append(gameContainer);
    initGame();
  },

  // NOTES
  notes() {
    const scope = context().gid || 'global';
    heading('Notas', 'Salvas localmente, vinculadas ao servidor atual do Discord ou globalmente.');
    const text = area(data.notes[scope] || '');
    text.placeholder = 'Ideias, comandos, tarefas e anotações deste servidor…';
    const status = el('small', { text: 'Escopo: ' + scope });
    text.addEventListener('input', () => {
      data.notes[scope] = text.value;
      save();
      status.textContent = 'Salvo localmente · ' + scope;
    }, { signal: abort.signal });
    main.append(text, status, el('div', { class: 'actions' }, [
      btn('Copiar Nota', () => copy(text.value), true),
      btn('Limpar Nota', () => {
        text.value = '';
        data.notes[scope] = '';
        save();
        status.textContent = 'Nota limpa · ' + scope;
      }, false, 'danger')
    ]));
  },

  // SNIPPETS / TEXTOS PRONTOS
  snippets() {
    heading('Textos Prontos', 'Modelos e respostas rápidas com 1 clique para copiar.');
    const title = input('Título do modelo (ex: Regras, Cargo VIP)');
    const text = area();
    const list = el('div');

    main.append(
      title,
      text,
      el('div', { class: 'actions' }, [
        btn('Salvar Modelo', () => {
          if (!title.value.trim() || !text.value.trim()) return toast('Preencha título e texto.');
          data.snippets.unshift({ id: crypto.randomUUID(), title: title.value.trim(), text: text.value });
          save();
          render();
          toast('Modelo salvo!');
        }, true)
      ]),
      list
    );

    for (const s of data.snippets) {
      list.append(el('div', { class: 'item' }, [
        el('div', { class: 'item-header' }, [
          el('h2', { text: s.title }),
          el('div', { class: 'actions', style: 'margin: 0;' }, [
            btn('Copiar', () => copy(s.text), true, 'sm'),
            btn('Excluir', () => {
              data.snippets = data.snippets.filter(x => x.id !== s.id);
              save();
              render();
            }, false, 'sm danger')
          ])
        ]),
        el('p', { text: s.text.slice(0, 200) + (s.text.length > 200 ? '…' : '') })
      ]));
    }
  },

  // BOOKMARKS
  bookmarks() {
    heading('Favoritos', 'Guarde atalhos rápidos para canais e mensagens do Discord.');
    const title = input('Nome do favorito');
    const url = input('https://discord.com/channels/…');

    const add = () => {
      try {
        const u = new URL(url.value);
        if (u.protocol !== 'https:' || !['discord.com', 'ptb.discord.com', 'canary.discord.com'].includes(u.hostname) || !u.pathname.startsWith('/channels/')) throw new Error();
        data.bookmarks.unshift({ id: crypto.randomUUID(), title: title.value.trim() || 'Favorito', url: u.href });
        save();
        render();
        toast('Favorito salvo!');
      } catch {
        toast('Insira um link HTTPS válido de canal ou mensagem do Discord.');
      }
    };

    main.append(
      title,
      url,
      el('div', { class: 'actions' }, [
        btn('Salvar Favorito', add, true),
        btn('Capturar Canal Atual', () => {
          const c = context();
          if (!c.cid) return toast('Canal indisponível no cache.');
          url.value = `https://discord.com/channels/${c.gid || '@me'}/${c.cid}`;
          title.value = c.name ? `#${c.name}` : 'Canal Atual';
          toast('Canal detectado!');
        })
      ])
    );

    for (const f of data.bookmarks) {
      main.append(el('div', { class: 'item' }, [
        el('div', { class: 'item-header' }, [
          el('a', { text: f.title, href: f.url, target: '_blank', rel: 'noopener noreferrer' }),
          btn('Excluir', () => {
            data.bookmarks = data.bookmarks.filter(x => x.id !== f.id);
            save();
            render();
          }, false, 'sm danger')
        ]),
        el('small', { text: f.url })
      ]));
    }
  },

  // WEATHER
  weather() {
    heading('Previsão do Tempo', 'Dados meteorológicos em tempo real via Open-Meteo · CC BY 4.0.');
    const city = input('Nome da cidade (ex: São Paulo, Brasília, Curitiba)', 'São Paulo');
    const result = out();

    const b = btn('Buscar Cidade', () => run(b, result, async () => {
      const g = await api('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({
        name: city.value.trim(),
        count: 5,
        language: 'pt',
        format: 'json'
      }));
      if (!g.results?.length) throw new Error('Cidade não encontrada.');

      setTimeout(() => {
        if (!alive || !result.isConnected) return;
        result.replaceChildren();
        for (const place of g.results) {
          const choose = btn(`${place.name} · ${place.admin1 || ''} · ${place.country || ''}`, () => run(choose, result, async () => {
            const w = await api('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
              latitude: place.latitude,
              longitude: place.longitude,
              current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
              daily: 'temperature_2m_max,temperature_2m_min',
              timezone: 'auto',
              forecast_days: 3
            }));
            return `${place.name}, ${place.country}\n\n` +
              `Temperatura Atual: ${w.current.temperature_2m} °C\n` +
              `Umidade: ${w.current.relative_humidity_2m}%\n` +
              `Vento: ${w.current.wind_speed_10m} km/h\n` +
              `Hora da Leitura: ${w.current.time}\n\n` +
              `Previsão para os próximos 3 dias:\n` +
              w.daily.time.map((d, i) => `${d}: ${w.daily.temperature_2m_min[i]}°C mín — ${w.daily.temperature_2m_max[i]}°C máx`).join('\n');
          }));
          result.append(choose);
        }
      }, 0);
      return 'Selecione a localidade correta:';
    }), true);

    main.append(city, b, result);
  },

  // TRANSLATE
  translate() {
    heading('Tradutor', 'Traduções rápidas com MyMemory API. Limite de 500 bytes por requisição.');
    const from = el('select');
    const to = el('select');
    const langs = [['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol'], ['fr', 'Francês'], ['de', 'Alemão'], ['ja', 'Japonês'], ['ru', 'Russo']];
    for (const [v, t] of langs) {
      from.append(el('option', { value: v, text: t }));
      to.append(el('option', { value: v, text: t }));
    }
    to.value = 'en';

    const text = area();
    const result = out();

    const b = btn('Traduzir Agora', () => run(b, result, async () => {
      if (!text.value.trim()) throw new Error('Digite o texto a ser traduzido.');
      if (new TextEncoder().encode(text.value).length > 500) throw new Error('Limite de 500 bytes excedido.');
      const r = await api('https://api.mymemory.translated.net/get?' + new URLSearchParams({
        q: text.value,
        langpair: from.value + '|' + to.value
      }));
      if (Number(r.responseStatus) !== 200) throw new Error(r.responseDetails || 'Falha na tradução.');
      return r.responseData.translatedText;
    }), true);

    main.append(
      el('div', { class: 'row' }, [field('De', from), field('Para', to)]),
      text,
      el('div', { class: 'actions' }, [b, btn('Copiar Tradução', () => copy(result.textContent))]),
      result
    );
  },

  // GITHUB EXPLORER
  github() {
    heading('GitHub Explorer', 'Consulte repositórios públicos, estrelas, forks e commits sem autenticação.');
    const repo = input('autor/repositorio (ex: Vendicated/Vencord)', 'Vendicated/Vencord');
    const result = out();

    const b = btn('Consultar Repositório', () => run(b, result, async () => {
      const val = repo.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(val)) throw new Error('Formato inválido. Use usuario/repositorio.');
      const r = await api('https://api.github.com/repos/' + val);
      return `${r.full_name}\n${r.description || 'Sem descrição cadastrada'}\n\n` +
        `★ ${r.stargazers_count.toLocaleString()} estrelas   ⑂ ${r.forks_count.toLocaleString()} forks\n` +
        `Issues abertas: ${r.open_issues_count}\n` +
        `Linguagem principal: ${r.language || 'N/A'}\n` +
        `Branch padrão: ${r.default_branch}\n` +
        `Último push: ${new Date(r.pushed_at).toLocaleString('pt-BR')}\n\n` +
        `Link: ${r.html_url}`;
    }), true);

    main.append(repo, el('div', { class: 'actions' }, [b, btn('Copiar Dados', () => copy(result.textContent))]), result);
  },

  // TIMESTAMPS
  timestamp() {
    heading('Gerador de Timestamps do Discord', 'Selecione uma data; o Discord adaptará o horário para o fuso de cada membro.');
    const date = input('', '', 'datetime-local');
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    date.value = d.toISOString().slice(0, 16);
    const result = out();

    const paint = () => {
      const ms = new Date(date.value).getTime();
      result.replaceChildren();
      if (!Number.isFinite(ms)) return result.textContent = 'Selecione uma data válida.';
      const ts = Math.floor(ms / 1000);
      const formats = [
        ['R', 'Relativo', 'ex: há 2 horas ou daqui a 10 minutos'],
        ['F', 'Data Completa e Dia da Semana', 'ex: Segunda-feira, 25 de Outubro de 2026 14:00'],
        ['f', 'Data e Hora', 'ex: 25 de Outubro de 2026 14:00'],
        ['t', 'Hora Curta', 'ex: 14:00'],
        ['T', 'Hora com Segundos', 'ex: 14:00:00'],
        ['d', 'Data Curta', 'ex: 25/10/2026'],
        ['D', 'Data Longa', 'ex: 25 de Outubro de 2026']
      ];
      for (const [code, label, desc] of formats) {
        result.append(el('div', { class: 'item' }, [
          el('div', { class: 'item-header' }, [
            el('strong', { text: label }),
            btn(`<t:${ts}:${code}>`, () => copy(`<t:${ts}:${code}>`), true, 'sm')
          ]),
          el('small', { text: desc })
        ]));
      }
    };
    date.addEventListener('input', paint, { signal: abort.signal });
    main.append(date, result);
    paint();
  },

  // MODO FOCO / POMODORO
  focus() {
    heading('Modo Foco Pomodoro', 'Temporizador contínuo com notificações visuais e sonoras.');
    const display = el('div', { class: 'stat', id: 'timer' });
    const mins = input('Duração em minutos', '25', 'number');
    mins.min = '1';
    mins.max = '240';

    main.append(el('div', { class: 'hero' }, [
      display,
      field('Duração (minutos)', mins),
      el('div', { class: 'actions' }, [
        btn('Iniciar ▶', () => {
          if (timerEnd) return;
          const n = Number(mins.value);
          if (!Number.isFinite(n) || n < 1 || n > 240) return toast('Use de 1 a 240 minutos.');
          timerEnd = Date.now() + timerPaused * 1000;
          tick();
          sfx('success');
        }, true),
        btn('Pausar ⏸', () => {
          if (timerEnd) {
            timerPaused = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
            timerEnd = 0;
          }
          tick();
        }),
        btn('Resetar ⟳', () => {
          const n = Number(mins.value);
          if (!Number.isFinite(n) || n < 1 || n > 240) return toast('Use de 1 a 240 minutos.');
          timerEnd = 0;
          timerPaused = n * 60;
          tick();
        })
      ])
    ]));
    tick();
  },

  // UTILITÁRIOS
  tools() {
    heading('Bancada de Utilitários', 'Ferramentas locais de diagnóstico, ping, JSON e decodificação.');
    const grid = el('div', { class: 'grid' });
    main.append(grid);

    // Discord Snowflake
    const snow = input('Snowflake ID do Discord (ex: 155149108183695360)');
    const sr = out();
    grid.append(el('div', { class: 'card' }, [
      el('h2', { text: 'Snowflake → Data de Criação' }),
      snow,
      btn('Decodificar ID', () => {
        try {
          if (!/^\d{15,22}$/.test(snow.value.trim())) throw new Error();
          const ms = Number((BigInt(snow.value.trim()) >> 22n) + 1420070400000n);
          const d = new Date(ms);
          if (!Number.isFinite(d.getTime())) throw new Error();
          sr.textContent = `Data Local: ${d.toLocaleString('pt-BR')}\nISO: ${d.toISOString()}\nUnix: ${Math.floor(ms / 1000)}`;
          sfx('success');
        } catch {
          sr.textContent = 'ID Snowflake inválido.';
        }
      }),
      sr
    ]));

    // Latency Ping Test
    const pingRes = out();
    const pingBtn = btn('Testar Latência / Ping', async () => {
      pingBtn.disabled = true;
      pingRes.textContent = 'Medindo latência de rede…';
      try {
        const tests = [
          ['Discord Gateway', 'https://gateway.discord.gg'],
          ['Cloudflare CDN', 'https://cloudflare.com/favicon.ico'],
          ['Google DNS', 'https://dns.google/resolve?name=example.com']
        ];
        const results = [];
        for (const [name, url] of tests) {
          const t0 = performance.now();
          try {
            await fetch(url, { mode: 'no-cors', cache: 'no-store' });
            const ms = Math.round(performance.now() - t0);
            results.push(`${name}: ${ms} ms`);
          } catch {
            results.push(`${name}: Falha / Bloqueado`);
          }
        }
        pingRes.textContent = results.join('\n') + `\n\nResolução de Tela: ${innerWidth}x${innerHeight}\nStatus: ${navigator.onLine ? 'Online' : 'Offline'}`;
        sfx('success');
      } catch (e) {
        pingRes.textContent = 'Erro no teste: ' + e.message;
      } finally {
        pingBtn.disabled = false;
      }
    });
    grid.append(el('div', { class: 'card' }, [
      el('h2', { text: 'Diagnóstico de Rede & Ping' }),
      pingBtn,
      pingRes
    ]));

    // JSON Formatter
    const jsonArea = area();
    const jr = out();
    grid.append(el('div', { class: 'card' }, [
      el('h2', { text: 'Formatar / Validar JSON' }),
      jsonArea,
      el('div', { class: 'actions' }, [
        btn('Formatar JSON', () => {
          try {
            jr.textContent = JSON.stringify(JSON.parse(jsonArea.value), null, 2);
            sfx('success');
          } catch (e) {
            jr.textContent = 'JSON Inválido: ' + e.message;
          }
        }, true),
        btn('Copiar', () => copy(jr.textContent))
      ]),
      jr
    ]));

    // Sorteador Local
    const names = area();
    const nr = out();
    names.placeholder = 'Digite uma opção por linha';
    grid.append(el('div', { class: 'card' }, [
      el('h2', { text: 'Sorteador Criptográfico' }),
      names,
      btn('Sortear Item', () => {
        const list = names.value.split('\n').map(x => x.trim()).filter(Boolean);
        if (!list.length) return nr.textContent = 'Insira pelo menos uma opção.';
        let n;
        const limit = 2 ** 32 - (2 ** 32 % list.length);
        do {
          n = crypto.getRandomValues(new Uint32Array(1))[0];
        } while (n >= limit);
        nr.textContent = `Vencedor: ${list[n % list.length]}`;
        sfx('success');
      }, true),
      nr
    ]));
  },

  // SETTINGS & BACKUP
  settings() {
    heading('Ajustes & Diagnóstico', 'Configurações de tema, opacidade, sons de clique e backup v2.');

    // Theme Accent
    const color = input('', data.accent, 'color');
    color.addEventListener('input', () => {
      data.accent = color.value;
      root.host.style.setProperty('--accent', data.accent);
      root.host.style.setProperty('--accent-glow', data.accent + '44');
      save();
    }, { signal: abort.signal });

    // Transparency Slider
    const opSlider = el('input', { type: 'range', min: '50', max: '100', value: String(data.opacity || 96) });
    opSlider.addEventListener('input', () => {
      data.opacity = Number(opSlider.value);
      root.host.style.setProperty('--bg-panel', `rgba(17, 20, 33, ${data.opacity / 100})`);
      save();
    }, { signal: abort.signal });

    // Sound FX toggle
    const soundCheck = el('input', { type: 'checkbox' });
    soundCheck.checked = !!data.soundFx;
    soundCheck.style.width = '20px';
    soundCheck.style.height = '20px';
    soundCheck.addEventListener('change', () => {
      data.soundFx = soundCheck.checked;
      save();
      sfx('click');
    }, { signal: abort.signal });

    // File import
    const file = input('', '', 'file');
    file.accept = '.json';
    file.addEventListener('change', async () => {
      try {
        if (!file.files[0]) return;
        if (file.files[0].size > 4000000) throw new Error('Backup maior que 4 MB.');
        const parsed = JSON.parse(await file.files[0].text());
        const d = parsed.data || parsed;
        if (d.notes && typeof d.notes === 'object') data.notes = d.notes;
        if (Array.isArray(d.snippets)) data.snippets = d.snippets;
        if (Array.isArray(d.bookmarks)) data.bookmarks = d.bookmarks;
        if (Array.isArray(d.tasks)) data.tasks = d.tasks;
        if (d.accent && /^#[0-9a-fA-F]{6}$/.test(d.accent)) data.accent = d.accent;
        if (typeof d.opacity === 'number') data.opacity = d.opacity;
        if (typeof d.soundFx === 'boolean') data.soundFx = d.soundFx;
        save();
        render();
        sfx('success');
        toast('Backup restaurado com sucesso!');
      } catch (err) {
        toast('Erro ao importar backup: ' + err.message);
      }
    }, { signal: abort.signal });

    const diagResult = out();

    main.append(
      el('div', { class: 'row' }, [
        field('Cor Principal de Destaque', color),
        field('Opacidade do Painel (%)', opSlider)
      ]),
      el('div', { style: 'display: flex; align-items: center; gap: 12px; margin: 14px 0;' }, [
        soundCheck,
        el('span', { text: 'Efeitos Sonoros Interativos (Web Audio SFX)' })
      ]),
      el('div', { class: 'actions' }, [
        btn('Exportar Backup Completo (JSON)', () => {
          download('nexus-backup-v2.json', JSON.stringify({ version: 2, timestamp: Date.now(), data }, null, 2));
          sfx('success');
        }, true),
        btn('Descarregar NEXUS Hub', destroy, false, 'danger')
      ]),
      field('Importar Backup JSON (Restaura todas as configurações)', file),
      btn('Executar Diagnóstico do Ambiente', () => {
        diagResult.textContent =
          `Vencord Detectado: ${window.Vencord ? 'SIM' : 'NÃO (Modo standalone/web)'}\n` +
          ['SelectedChannelStore', 'ChannelStore', 'GuildStore', 'GuildRoleStore', 'GuildMemberStore']
            .map(n => `${n}: ${store(n) ? 'DISPONÍVEL' : 'INDISPONÍVEL'}`)
            .join('\n') +
          `\n\nWeb Audio API: ${audioCtx ? 'ATIVO' : 'STANDBY'}\n` +
          `Erros Registrados Recentemente:\n` +
          (logs.slice(-10).join('\n') || 'Nenhum erro registrado.');
        sfx('success');
      }),
      diagResult
    );
  }
};

// Pomodoro tick
function tick() {
  const remaining = timerEnd ? Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)) : timerPaused;
  if (timerEnd && remaining === 0) {
    timerEnd = 0;
    timerPaused = 1500;
    sfx('success');
    toast('Sessão Pomodoro concluída! Descanse alguns minutos.');
  }
  const formatted = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  const d = root.getElementById('timer');
  if (d) d.textContent = formatted;
  const mini = root.getElementById('mini-timer');
  if (mini) mini.textContent = formatted;
}
const timerInterval = setInterval(tick, 500);

// Cleanup
function destroy() {
  alive = false;
  abort.abort();
  stopAmbient();
  for (const c of pending) c.abort();
  pending.clear();
  clearInterval(timerInterval);
  clearInterval(clockInterval);
  host.remove();
  if (window.NexusHub?.destroy === destroy) delete window.NexusHub;
}

window.NexusHub = {
  version: '1.2.0',
  open: () => {
    win.classList.remove('hide');
    miniDock.classList.add('hide');
    launcher.classList.remove('hide');
  },
  destroy
};

render();
})();

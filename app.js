'use strict';

const $ = (s) => document.querySelector(s);
const KEY = 'playguide.songs.v1';

// ---------- Dados ----------
let songs = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(songs));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---------- Guia: texto <-> trechos ----------
// Uma linha = um trecho. Tempo opcional no início: "1:25 Solo", "[1:25] Solo", "1:25 - Solo".
const TIME_RE = /^\s*\[?(\d{1,3}):(\d{2})\]?\s*[-–—:]?\s*(.*)$/;

function parse(text) {
  const sections = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(TIME_RE);
    if (m) sections.push({ time: +m[1] * 60 + +m[2], label: m[3] || '…' });
    else sections.push({ time: null, label: line });
  }
  return sections;
}

function serialize(sections) {
  return sections.map((s) => (s.time == null ? s.label : `${fmt(s.time)} ${s.label}`)).join('\n');
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Navegação ----------
function show(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
}

// ---------- Repertório ----------
function renderList() {
  $('#songs').innerHTML = songs.map((s, i) => {
    const secs = parse(s.text);
    const timed = secs.filter((x) => x.time != null).length;
    const info = secs.length ? `${secs.length} trechos${timed < secs.length ? ` · ${secs.length - timed} sem tempo` : ''}` : 'guia vazia';
    return `<li data-i="${i}">
      <button class="open">${i + 1}. ${esc(s.title || 'Sem título')}<small>${info}</small></button>
      <button class="icon up" aria-label="Subir">↑</button>
      <button class="icon edit" aria-label="Editar">✎</button>
    </li>`;
  }).join('');
}

$('#songs').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const i = +li.dataset.i;
  if (e.target.closest('.open')) openPlayer(i);
  else if (e.target.closest('.edit')) openEditor(i);
  else if (e.target.closest('.up') && i > 0) {
    [songs[i - 1], songs[i]] = [songs[i], songs[i - 1]];
    save();
    renderList();
  }
});

$('#l-new').onclick = () => openEditor(-1);
$('#l-menu').onclick = () => $('#l-tools').classList.toggle('hidden');

$('#l-export').onclick = () => {
  const blob = new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `playguide-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('#l-import').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    songs = data.map((s) => ({ title: String(s.title || ''), text: String(s.text || '') }));
    save();
    renderList();
  } catch {
    $('#l-empty').textContent = 'Arquivo de backup inválido.';
  }
  e.target.value = '';
};

// ---------- Editor ----------
let editing = -1;

function openEditor(i) {
  editing = i;
  const s = songs[i] || { title: '', text: '' };
  $('#e-title').value = s.title;
  $('#e-text').value = s.text;
  $('#e-del').classList.toggle('hidden', i < 0);
  show('v-edit');
}

function commitEditor() {
  const song = { title: $('#e-title').value.trim() || 'Sem título', text: $('#e-text').value };
  if (editing < 0) { songs.push(song); editing = songs.length - 1; }
  else songs[editing] = song;
  save();
}

$('#e-back').onclick = () => { renderList(); show('v-list'); };
$('#e-save').onclick = () => { commitEditor(); renderList(); show('v-list'); };
$('#e-del').onclick = () => {
  if (editing >= 0 && $('#e-del').dataset.confirm) {
    songs.splice(editing, 1);
    save();
    renderList();
    show('v-list');
  } else {
    // segundo toque confirma (evita diálogos nativos)
    $('#e-del').dataset.confirm = '1';
    $('#e-del').textContent = 'Toque de novo para excluir';
    setTimeout(() => { delete $('#e-del').dataset.confirm; $('#e-del').textContent = 'Excluir'; }, 2500);
  }
};
$('#e-rec').onclick = () => {
  if (!parse($('#e-text').value).length) { $('#e-text').focus(); return; }
  commitEditor();
  openRecorder(editing);
};

// ---------- Cronômetro ----------
function makeClock() {
  return {
    base: 0, startedAt: 0, running: false,
    now() { return this.base + (this.running ? (performance.now() - this.startedAt) / 1000 : 0); },
    start() { if (!this.running) { this.startedAt = performance.now(); this.running = true; } },
    pause() { if (this.running) { this.base = this.now(); this.running = false; } },
    set(t) { this.base = t; this.startedAt = performance.now(); },
    reset() { this.base = 0; this.running = false; },
  };
}

// Mantém a tela acesa enquanto toca
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch { /* não suportado */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (play.clock.running || rec.clock.running)) keepAwake(true);
});

// ---------- Prompter ----------
const play = { i: 0, secs: [], clock: makeClock(), manual: null, shown: -1, raf: 0 };

function openPlayer(i) {
  play.i = i;
  play.secs = parse(songs[i].text);
  play.clock.reset();
  play.manual = null;
  play.shown = -1;
  $('#p-title').textContent = songs[i].title;
  updatePlayButton();
  show('v-play');
  cancelAnimationFrame(play.raf);
  tick();
}

// Índice do trecho atual: último trecho com tempo <= agora,
// ou o trecho escolhido manualmente (para trechos sem tempo ou para adiantar).
function currentIndex(t) {
  let ti = 0;
  play.secs.forEach((s, k) => { if (s.time != null && s.time <= t) ti = k; });
  if (play.manual != null) {
    if (play.manual > ti) return play.manual;
    play.manual = null;
  }
  return ti;
}

function nextTimed(from) {
  for (let k = from + 1; k < play.secs.length; k++) if (play.secs[k].time != null) return play.secs[k];
  return null;
}

function tick() {
  const t = play.clock.now();
  const secs = play.secs;
  $('#p-time').textContent = fmt(t);

  if (!secs.length) {
    $('#p-cur-text').textContent = 'Guia vazia';
    $('#p-prev').textContent = $('#p-next').textContent = '';
  } else {
    const cur = currentIndex(t);
    if (cur !== play.shown) {
      play.shown = cur;
      $('#p-prev').textContent = secs[cur - 1] ? secs[cur - 1].label : '';
      $('#p-cur-text').textContent = secs[cur].label;
      $('#p-count').textContent = `${cur + 1}/${secs.length}`;
      const el = $('#p-cur');
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }

    // Barra de progresso e contagem para o próximo trecho
    const start = secs[cur].time;
    const nxt = cur + 1 < secs.length ? secs[cur + 1] : null;
    const target = nextTimed(cur);
    let pct = 0;
    if (start != null && target && target === nxt) pct = (t - start) / (target.time - start);
    $('#p-prog').style.width = `${Math.min(100, Math.max(0, pct * 100))}%`;

    let nextHtml = nxt ? esc(nxt.label) : '';
    if (nxt && nxt.time != null && play.clock.running) {
      const left = Math.ceil(nxt.time - t);
      if (left <= 5 && left > 0) nextHtml += `<span class="next-in">em ${left}s</span>`;
    }
    if (!nxt && play.i + 1 < songs.length) nextHtml = `Próxima música: ${esc(songs[play.i + 1].title)}`;
    if ($('#p-next').innerHTML !== nextHtml) $('#p-next').innerHTML = nextHtml;
  }

  play.raf = requestAnimationFrame(tick);
}

function updatePlayButton() {
  $('#p-play').textContent = play.clock.running ? '❚❚' : '▶';
}

function togglePlay() {
  if (play.clock.running) play.clock.pause();
  else play.clock.start();
  keepAwake(play.clock.running);
  updatePlayButton();
}

function sectionNext() {
  const cur = currentIndex(play.clock.now());
  const k = cur + 1;
  if (k >= play.secs.length) return;
  if (play.secs[k].time != null) { play.clock.set(play.secs[k].time); play.manual = null; }
  else play.manual = k;
}

function sectionBack() {
  const cur = currentIndex(play.clock.now());
  const k = Math.max(0, cur - 1);
  // volta o relógio para o último trecho com tempo antes de k
  let j = k;
  while (j >= 0 && play.secs[j].time == null) j--;
  play.clock.set(j >= 0 ? play.secs[j].time : 0);
  play.manual = play.secs[k] && play.secs[k].time == null ? k : null;
  play.shown = -1;
}

function changeSong(d) {
  const i = play.i + d;
  if (i < 0 || i >= songs.length) return;
  keepAwake(false);
  openPlayer(i);
}

$('#p-play').onclick = togglePlay;
$('#p-secnext').onclick = sectionNext;
$('#p-secback').onclick = sectionBack;
$('#stage').onclick = sectionNext; // tocar na tela = próximo trecho
$('#p-prevsong').onclick = () => changeSong(-1);
$('#p-nextsong').onclick = () => changeSong(1);
$('#p-reset').onclick = () => { play.clock.reset(); play.manual = null; play.shown = -1; keepAwake(false); updatePlayButton(); };
$('#p-back').onclick = () => {
  cancelAnimationFrame(play.raf);
  play.clock.pause();
  keepAwake(false);
  renderList();
  show('v-list');
};

// ---------- Gravar tempos ----------
const rec = { i: 0, secs: [], idx: -1, clock: makeClock(), raf: 0 };

function openRecorder(i) {
  rec.i = i;
  rec.secs = parse(songs[i].text).map((s) => ({ ...s, time: null }));
  rec.idx = -1;
  rec.clock.reset();
  $('#r-title').textContent = songs[i].title;
  renderRec();
  show('v-rec');
  cancelAnimationFrame(rec.raf);
  recTick();
}

function recTick() {
  $('#r-time').textContent = fmt(rec.clock.now());
  rec.raf = requestAnimationFrame(recTick);
}

function renderRec() {
  $('#r-list').innerHTML = rec.secs.map((s, k) =>
    `<li class="${k < rec.idx ? 'done' : k === rec.idx ? 'now' : ''}">${s.time != null ? `<b>${fmt(s.time)}</b>` : ''}${esc(s.label)}</li>`
  ).join('');
  const now = $('#r-list .now');
  if (now) now.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const last = rec.secs.length - 1;
  const tap = $('#r-tap');
  if (rec.idx < 0) tap.textContent = `Começar: ${rec.secs[0].label}`;
  else if (rec.idx < last) tap.textContent = `Agora: ${rec.secs[rec.idx + 1].label}`;
  else tap.textContent = 'Fim — Salvar';
}

function finishRec() {
  cancelAnimationFrame(rec.raf);
  rec.clock.pause();
  keepAwake(false);
}

$('#r-tap').onclick = () => {
  const last = rec.secs.length - 1;
  if (rec.idx < 0) {
    rec.clock.start();
    keepAwake(true);
    rec.idx = 0;
    rec.secs[0].time = 0;
  } else if (rec.idx < last) {
    rec.idx++;
    rec.secs[rec.idx].time = Math.floor(rec.clock.now());
  } else {
    $('#r-save').click();
    return;
  }
  renderRec();
};

$('#r-undo').onclick = () => {
  if (rec.idx < 0) return;
  rec.secs[rec.idx].time = null;
  rec.idx--;
  if (rec.idx < 0) rec.clock.reset();
  renderRec();
};

$('#r-save').onclick = () => {
  if (rec.idx >= 0) {
    songs[rec.i].text = serialize(rec.secs);
    save();
  }
  finishRec();
  openEditor(rec.i);
};

$('#r-cancel').onclick = () => { finishRec(); openEditor(rec.i); };

// ---------- Início ----------
renderList();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

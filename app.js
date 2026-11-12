'use strict';

const $ = (s) => document.querySelector(s);
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const KEY = 'playguide.sets.v1';
const OLD_KEY = 'playguide.songs.v1';
const SECTION_PRESETS = ['Intro', 'Verso', 'Pré-refrão', 'Refrão', 'Ponte', 'Solo', 'Instrumental', 'Final'];

// ---------- Utilidades ----------
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Tempo digitado só com números: "125" -> "1:25"
function maskTime(v) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, -2)}:${d.slice(-2)}` : d;
}

// "1:25" ou "125" -> 85; "90" -> 90 (vira 1:30); vazio -> null
function readTime(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return null;
  return d.length > 2 ? +d.slice(0, -2) * 60 + +d.slice(-2) : +d;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso) {
  if (!iso) return 'Sem data';
  return parseDate(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Confirmação com segundo toque (evita diálogos nativos)
function confirmTap(btn, action) {
  if (btn.dataset.confirm) { action(); return; }
  const html = btn.innerHTML;
  btn.dataset.confirm = '1';
  btn.textContent = 'Toque de novo para confirmar';
  setTimeout(() => { delete btn.dataset.confirm; btn.innerHTML = html; }, 2500);
}

function show(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
}

// Guia em texto livre (versões antigas e backups): "1:25 Solo" -> { time: 85, label: 'Solo' }
const TIME_RE = /^\s*\[?(\d{1,3}):(\d{2})\]?\s*[-–—:]?\s*(.*)$/;

function parseText(text) {
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

// ---------- Dados ----------
// sets = [{ title, date: 'AAAA-MM-DD', songs: [{ title, sections: [{ time, label }] }] }]
function cleanSong(m) {
  const sections = Array.isArray(m.sections) ? m.sections : parseText(m.text);
  return {
    title: String(m.title || ''),
    sections: sections.map((s) => ({
      time: Number.isFinite(s.time) ? Math.max(0, Math.floor(s.time)) : null,
      label: String(s.label || '…'),
    })),
  };
}

function cleanSets(data) {
  if (!Array.isArray(data)) throw new Error('formato inválido');
  // lista simples de músicas (primeira versão) vira um repertório
  if (data.length && !Array.isArray(data[0].songs)) data = [{ title: 'Minhas músicas', date: today(), songs: data }];
  return data.map((s) => ({ title: String(s.title || ''), date: String(s.date || ''), songs: (s.songs || []).map(cleanSong) }));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(data)) return cleanSets(data);
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (Array.isArray(old) && old.length) return cleanSets(old);
  } catch { /* dados corrompidos */ }
  return [];
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(sets));
}

let sets = load();
let setIdx = -1;
let songs = []; // músicas do repertório aberto (mesma referência de sets[setIdx].songs)

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---------- Repertórios ----------
// Próximos (a partir de hoje) em ordem crescente, depois os passados do mais recente ao mais antigo.
function sortedSetIndexes() {
  const t = today();
  return sets.map((s, i) => i).sort((a, b) => {
    const da = sets[a].date || '', db = sets[b].date || '';
    const fa = da >= t, fb = db >= t;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? da.localeCompare(db) : db.localeCompare(da);
  });
}

function renderSets() {
  const t = today();
  $('#sets').innerHTML = sortedSetIndexes().map((i) => {
    const s = sets[i];
    const n = s.songs.length;
    const isToday = s.date === t;
    const cls = isToday ? 'row--today' : s.date && s.date < t ? 'row--past' : '';
    const box = s.date
      ? `<b>${parseDate(s.date).getDate()}</b><small>${parseDate(s.date).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small>`
      : '<b>–</b><small>data</small>';
    return `<li class="row ${cls}" data-i="${i}">
      <button class="row__main">
        <span class="datebox">${box}</span>
        <span class="row__body">
          <span class="row__title">${esc(s.title || 'Sem nome')}</span>
          <span class="row__meta">${isToday ? '<span class="tag">Hoje</span>' : ''}${fmtDate(s.date)} · ${n} ${n === 1 ? 'música' : 'músicas'}</span>
        </span>
        <span class="row__chev">${icon('forward')}</span>
      </button>
    </li>`;
  }).join('');
}

function openSet(i) {
  setIdx = i;
  songs = sets[i].songs;
  $('#l-title').value = sets[i].title;
  $('#l-date').value = sets[i].date || '';
  $('#l-tools').classList.add('hidden');
  renderList();
  show('v-list');
}

function goSets() {
  renderSets();
  show('v-sets');
}

$('#sets').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) openSet(+li.dataset.i);
});

$('#s-new').onclick = () => {
  sets.push({ title: '', date: today(), songs: [] });
  save();
  openSet(sets.length - 1);
  $('#l-title').focus();
};

$('#s-menu').onclick = () => $('#s-tools').classList.toggle('hidden');

$('#s-export').onclick = () => {
  const blob = new Blob([JSON.stringify(sets, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `playguide-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('#s-import').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    sets = cleanSets(JSON.parse(await file.text()));
    save();
    renderSets();
  } catch {
    $('#s-empty').textContent = 'Arquivo de backup inválido.';
  }
  e.target.value = '';
};

// ---------- Músicas do repertório ----------
$('#l-title').oninput = () => { sets[setIdx].title = $('#l-title').value; save(); };
$('#l-date').onchange = () => { sets[setIdx].date = $('#l-date').value; save(); };
$('#l-back').onclick = goSets;
$('#l-menu').onclick = () => $('#l-tools').classList.toggle('hidden');

$('#l-dup').onclick = () => {
  const copy = JSON.parse(JSON.stringify(sets[setIdx]));
  copy.title = `${copy.title || 'Sem nome'} (cópia)`;
  sets.push(copy);
  save();
  openSet(sets.length - 1);
  $('#l-title').focus();
};

$('#l-del').onclick = () => confirmTap($('#l-del'), () => {
  sets.splice(setIdx, 1);
  save();
  goSets();
});

function renderList() {
  $('#songs').innerHTML = songs.map((s, i) => {
    const secs = s.sections;
    const untimed = secs.filter((x) => x.time == null).length;
    let info = secs.length ? `${secs.length} ${secs.length === 1 ? 'trecho' : 'trechos'}` : 'Sem trechos';
    if (secs.length && untimed) info += ` · ${untimed} sem tempo`;
    return `<li class="row" data-i="${i}">
      <button class="row__main" data-act="play">
        <span class="badge">${i + 1}</span>
        <span class="row__body">
          <span class="row__title">${esc(s.title || 'Sem título')}</span>
          <span class="row__meta">${info}</span>
        </span>
      </button>
      <button class="btn btn--icon btn--ghost" data-act="up" aria-label="Subir"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
      <button class="btn btn--icon btn--ghost" data-act="edit" aria-label="Editar">${icon('edit')}</button>
    </li>`;
  }).join('');
  $('#l-play').disabled = !songs.length;
}

$('#songs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const i = +btn.closest('li').dataset.i;
  const act = btn.dataset.act;
  if (act === 'play') openPlayer(i);
  else if (act === 'edit') openEditor(i);
  else if (act === 'up' && i > 0) {
    [songs[i - 1], songs[i]] = [songs[i], songs[i - 1]];
    save();
    renderList();
  }
});

$('#l-new').onclick = () => openEditor(-1);
$('#l-play').onclick = () => { if (songs.length) openPlayer(0); };

// ---------- Editor de música ----------
let editing = -1;
let draft = [];

function openEditor(i) {
  editing = i;
  const s = songs[i] || { title: '', sections: [] };
  draft = s.sections.map((x) => ({ ...x }));
  $('#e-title').value = s.title;
  $('#e-del').classList.toggle('hidden', i < 0);
  renderSections();
  show('v-edit');
  if (i < 0) $('#e-title').focus();
}

function renderSections() {
  $('#e-secs').innerHTML = draft.map((s, k) => `<li class="sec" data-k="${k}">
      <input class="field field--time" data-f="time" type="text" inputmode="numeric" placeholder="0:00" value="${s.time == null ? '' : fmt(s.time)}" aria-label="Tempo">
      <input class="field sec__label" data-f="label" type="text" placeholder="Nome do trecho" value="${esc(s.label)}" aria-label="Nome do trecho" enterkeyhint="next">
      <button class="btn btn--icon btn--ghost" data-act="up" aria-label="Subir"${k === 0 ? ' disabled' : ''}>${icon('up')}</button>
      <button class="btn btn--icon btn--ghost" data-act="del" aria-label="Remover">${icon('x')}</button>
    </li>`).join('');
  $('#e-count').textContent = draft.length || '';
  $('#e-rec').disabled = !draft.length;
  validateTimes();
}

// Tempo menor que o de um trecho anterior fica em vermelho
function validateTimes() {
  let last = -1;
  document.querySelectorAll('#e-secs [data-f="time"]').forEach((input, k) => {
    const t = draft[k].time;
    input.classList.toggle('is-invalid', t != null && t < last);
    if (t != null) last = Math.max(last, t);
  });
}

$('#e-secs').addEventListener('input', (e) => {
  const li = e.target.closest('.sec');
  if (!li) return;
  const sec = draft[+li.dataset.k];
  if (e.target.dataset.f === 'time') {
    e.target.value = maskTime(e.target.value);
    sec.time = readTime(e.target.value);
  } else {
    sec.label = e.target.value;
  }
});

$('#e-secs').addEventListener('focusout', (e) => {
  if (e.target.dataset.f !== 'time') return;
  const sec = draft[+e.target.closest('.sec').dataset.k];
  if (sec) e.target.value = sec.time == null ? '' : fmt(sec.time);
  validateTimes();
});

// Enter no nome pula para o tempo do próximo trecho
$('#e-secs').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const next = e.target.closest('.sec').nextElementSibling;
  if (next) next.querySelector('[data-f="time"]').focus();
  else e.target.blur();
});

$('#e-secs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const k = +btn.closest('.sec').dataset.k;
  if (btn.dataset.act === 'del') draft.splice(k, 1);
  else if (k > 0) [draft[k - 1], draft[k]] = [draft[k], draft[k - 1]];
  renderSections();
});

$('#e-chips').innerHTML = SECTION_PRESETS.map((l) => `<button class="chip" data-label="${l}">${icon('plus')}${l}</button>`).join('')
  + `<button class="chip chip--outline" data-label="">${icon('plus')}Outro</button>`;

$('#e-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  let label = chip.dataset.label;
  if (label === 'Verso') label = `Verso ${draft.filter((s) => /^Verso\b/.test(s.label)).length + 1}`;
  draft.push({ time: null, label });
  renderSections();
  const row = $('#e-secs').lastElementChild;
  row.scrollIntoView({ block: 'nearest' });
  if (!label) row.querySelector('[data-f="label"]').focus();
});

function commitEditor() {
  const sections = draft
    .map((s) => ({ time: s.time, label: s.label.trim() }))
    .filter((s) => s.label || s.time != null)
    .map((s) => ({ time: s.time, label: s.label || '…' }));
  const title = $('#e-title').value.trim();
  if (editing < 0 && !title && !sections.length) return; // nada digitado
  const song = { title: title || 'Sem título', sections };
  if (editing < 0) { songs.push(song); editing = songs.length - 1; }
  else songs[editing] = song;
  save();
}

function leaveEditor() {
  commitEditor();
  renderList();
  show('v-list');
}

$('#e-back').onclick = leaveEditor;
$('#e-done').onclick = leaveEditor;

$('#e-del').onclick = () => confirmTap($('#e-del'), () => {
  songs.splice(editing, 1);
  save();
  renderList();
  show('v-list');
});

$('#e-rec').onclick = () => {
  if (!draft.length) return;
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
  play.secs = songs[i].sections;
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
    $('#p-cur-text').textContent = 'Sem trechos';
    $('#p-prev').textContent = $('#p-next').textContent = '';
    $('#p-count').textContent = '';
  } else {
    const cur = currentIndex(t);
    if (cur !== play.shown) {
      play.shown = cur;
      $('#p-prev').textContent = secs[cur - 1] ? secs[cur - 1].label : '';
      $('#p-cur-text').textContent = secs[cur].label;
      $('#p-count').textContent = `Música ${play.i + 1}/${songs.length} · trecho ${cur + 1}/${secs.length}`;
      const el = $('#p-cur');
      el.classList.remove('is-changing');
      void el.offsetWidth;
      el.classList.add('is-changing');
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
      if (left <= 5 && left > 0) nextHtml += `<span class="cue__countdown">em ${left}s</span>`;
    }
    if (!nxt && play.i + 1 < songs.length) nextHtml = `Próxima música: ${esc(songs[play.i + 1].title)}`;
    if ($('#p-next').innerHTML !== nextHtml) $('#p-next').innerHTML = nextHtml;
  }

  play.raf = requestAnimationFrame(tick);
}

function updatePlayButton() {
  $('#p-play').innerHTML = icon(play.clock.running ? 'pause' : 'play');
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
  rec.secs = songs[i].sections.map((s) => ({ ...s, time: null }));
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
  $('#r-list').innerHTML = rec.secs.map((s, k) => {
    const cls = k < rec.idx ? 'is-done' : k === rec.idx ? 'is-now' : '';
    return `<li class="rec-item ${cls}"><span class="rec-item__time">${s.time != null ? fmt(s.time) : '–'}</span>${esc(s.label)}</li>`;
  }).join('');
  const now = $('#r-list .is-now');
  if (now) now.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const last = rec.secs.length - 1;
  const tap = $('#r-tap');
  if (rec.idx < 0) tap.textContent = `Começar: ${rec.secs[0].label}`;
  else if (rec.idx < last) tap.textContent = `Agora: ${rec.secs[rec.idx + 1].label}`;
  else tap.textContent = 'Fim — Salvar';
  $('#r-undo').disabled = rec.idx < 0;
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
    songs[rec.i].sections = rec.secs;
    save();
  }
  finishRec();
  openEditor(rec.i);
};

$('#r-cancel').onclick = () => { finishRec(); openEditor(rec.i); };

// ---------- Início ----------
// Abre direto o repertório de hoje, se existir.
renderSets();
const todayIdx = sets.findIndex((s) => s.date === today());
if (todayIdx >= 0) openSet(todayIdx);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

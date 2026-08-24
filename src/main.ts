/**
 * Точка входа. Здесь только связка: логика куба — в core/, картинка — в render/,
 * тяжёлые вычисления — в workers/. Состояние приложения — три вещи:
 *   base     — исходное состояние (собранный или «свой» кубик),
 *   history  — список ходов,
 *   cursor   — сколько ходов из history применено (лента ходов = скраббер).
 */
import {
  applyMove, applyMoves, fromFaceletString, isSolved, randomScramble, solvedState,
  toFaceletString, type Move, type State,
} from './core/cube';
import { formatRussian, formatSingmaster, moveLabel, parse, NotationError } from './core/notation';
import { ALGORITHMS, PATTERNS } from './core/patterns';
import type { SearchStats } from './core/search';
import { CubeView } from './render/cubeView';
import { LineChart } from './ui/chart';
import { SphereMusic } from './ui/audio';
import essay from './essay.json';
import type { KociembaOut } from './workers/kociemba.worker';
import type { SearchOut } from './workers/search.worker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// Состояние
// ---------------------------------------------------------------------------
let base: State = solvedState();
let history: Move[] = [];
let cursor = 0;
const music = new SphereMusic();

const current = (): State => applyMoves(base, history.slice(0, cursor));
const speedInput = $<HTMLInputElement>('speed');
/** Ползунок хранит «обратную» скорость: справа быстрее. */
const durationMs = () => 1500 - Number(speedInput.value);

const view = new CubeView($('cube-stage'), base, { onDragMove: (m) => void doMove(m) });

// Очередь ходов: клавиши и лента могут прийти быстрее, чем крутится анимация.
const queue: Move[] = [];
let pumping = false;
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const m = queue.shift()!;
    const before = current();
    // новый ход после отката обрезает «будущее» — как в любом редакторе
    history = history.slice(0, cursor);
    history.push(m);
    cursor++;
    const after = applyMove(before, m);
    music.play(m, durationMs());
    renderRibbon();
    await view.animateMove(m, after, durationMs());
    renderCounter();
  }
  pumping = false;
}
function doMove(m: Move): Promise<void> { queue.push(m); return pump(); }
function doMoves(ms: Move[]): Promise<void> { queue.push(...ms); return pump(); }

/** Мгновенно перейти к состоянию после `n` ходов (скраббер). */
function seek(n: number): void {
  cursor = Math.max(0, Math.min(history.length, n));
  view.setState(current());
  renderRibbon();
  renderCounter();
}

function resetAll(state: State = solvedState()): void {
  queue.length = 0;
  base = state; history = []; cursor = 0;
  view.setState(base);
  renderRibbon(); renderCounter();
}

// ---------------------------------------------------------------------------
// Лента ходов и счётчик
// ---------------------------------------------------------------------------
const ribbon = $('ribbon');
function renderRibbon(): void {
  ribbon.innerHTML = '';
  if (!history.length) {
    const e = document.createElement('span');
    e.className = 'chip-empty';
    e.textContent = 'Ходов пока нет — покрутите слой или выберите узор';
    ribbon.appendChild(e);
    return;
  }
  const ru = $<HTMLInputElement>('chk-qtm-notation').checked;
  history.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i < cursor ? ' done' : '') + (i === cursor - 1 ? ' cur' : '');
    b.dataset.axis = m.axis;
    b.textContent = ru ? formatRussian([m]) : moveLabel(m);
    b.title = `Ход ${i + 1}: перейти сюда`;
    b.setAttribute('role', 'option');
    b.onclick = () => seek(i + 1);
    ribbon.appendChild(b);
  });
  const cur = ribbon.querySelector<HTMLElement>('.cur');
  if (cur) ribbon.scrollLeft = cur.offsetLeft - ribbon.clientWidth / 2; // без scrollIntoView: он дёргает страницу
}

function renderCounter(): void {
  $('move-count').textContent = String(cursor);
  const n = cursor % 100;
  $('move-label').textContent = n % 10 === 1 && n !== 11 ? 'ход' : n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20) ? 'хода' : 'ходов';
  const flag = $('solved-flag');
  const s = isSolved(current());
  flag.textContent = s ? 'собран' : 'не собран';
  flag.classList.toggle('no', !s);
}

// ---------------------------------------------------------------------------
// Кнопки панели
// ---------------------------------------------------------------------------
$('btn-reset').onclick = () => resetAll();
$('btn-scramble').onclick = () => void doMoves(randomScramble(25));
$('btn-undo').onclick = () => { if (cursor > 0) seek(cursor - 1); };
$('btn-play').onclick = () => void play();
$('btn-copy').onclick = () => void navigator.clipboard?.writeText(formatSingmaster(history));

async function play(): Promise<void> {
  const rest = history.slice(cursor);
  if (!rest.length) return;
  const btn = $<HTMLButtonElement>('btn-play');
  btn.disabled = true;
  for (const m of rest) {
    const before = current();
    cursor++;
    music.play(m, durationMs());
    renderRibbon();
    await view.animateMove(m, applyMove(before, m), durationMs());
    renderCounter();
  }
  btn.disabled = false;
}

const speedVal = $('speed-val');
const showSpeed = () => { const d = durationMs(); speedVal.textContent = d === 0 ? 'мгновенно' : `${d} мс`; };
speedInput.oninput = showSpeed; showSpeed();
$<HTMLInputElement>('chk-trail').onchange = (e) => view.setTrail((e.target as HTMLInputElement).checked);
$<HTMLInputElement>('chk-sound').onchange = () => music.toggle();
$<HTMLInputElement>('chk-qtm-notation').onchange = renderRibbon;

$<HTMLFormElement>('form-moves').onsubmit = (e) => {
  e.preventDefault();
  const inp = $<HTMLInputElement>('inp-moves');
  const err = $('moves-error');
  try {
    const ms = parse(inp.value);
    err.textContent = '';
    inp.value = '';
    void doMoves(ms);
  } catch (ex) {
    err.textContent = ex instanceof NotationError ? `${ex.message} (позиция ${ex.position + 1})` : String(ex);
  }
};

$('btn-save').onclick = () => {
  localStorage.setItem('cubirubi.save', JSON.stringify({ base: toFaceletString(base), moves: formatSingmaster(history), cursor }));
};
$('btn-restore').onclick = () => {
  const raw = localStorage.getItem('cubirubi.save');
  if (!raw) return;
  const s = JSON.parse(raw) as { base: string; moves: string; cursor: number };
  resetAll(fromFaceletString(s.base));
  history = parse(s.moves);
  seek(s.cursor);
};

const dlg = $<HTMLDialogElement>('dlg-custom');
$('btn-custom').onclick = () => { $<HTMLTextAreaElement>('custom-facelets').value = toFaceletString(current()); dlg.showModal(); };
$('custom-ok').onclick = (e) => {
  e.preventDefault();
  try {
    const st = fromFaceletString($<HTMLTextAreaElement>('custom-facelets').value.replace(/\s+/g, '').toUpperCase());
    resetAll(st);
    dlg.close();
  } catch (ex) { $('custom-error').textContent = (ex as Error).message; }
};

// ---------------------------------------------------------------------------
// Клавиатура — раскладка старого сайта
// ---------------------------------------------------------------------------
const KEYS: Record<string, Move> = {
  п: { axis: 'R', turns: 1 }, л: { axis: 'L', turns: 1 }, в: { axis: 'U', turns: 1 }, н: { axis: 'D', turns: 1 },
  ф: { axis: 'F', turns: 1 }, т: { axis: 'B', turns: 1 }, с: { axis: 'E', turns: 1 }, о: { axis: 'M', turns: 1 },
  r: { axis: 'R', turns: 1 }, l: { axis: 'L', turns: 1 }, u: { axis: 'U', turns: 1 }, d: { axis: 'D', turns: 1 },
  f: { axis: 'F', turns: 1 }, b: { axis: 'B', turns: 1 }, m: { axis: 'M', turns: 1 }, e: { axis: 'E', turns: 1 }, s: { axis: 'S', turns: 1 },
  '6': { axis: 'y', turns: 1 }, '4': { axis: 'y', turns: 3 }, '8': { axis: 'x', turns: 1 }, '2': { axis: 'x', turns: 3 },
};
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
  if (e.key === ' ') { e.preventDefault(); resetAll(); return; }
  if (e.key === 'Enter') { e.preventDefault(); void doMoves(randomScramble(25)); return; }
  if (e.key === 'Backspace') { e.preventDefault(); if (cursor > 0) seek(cursor - 1); return; }
  if (e.key === 'ArrowLeft') { seek(cursor - 1); return; }
  if (e.key === 'ArrowRight') { seek(cursor + 1); return; }
  const m = KEYS[e.key.toLowerCase()];
  if (!m) return;
  e.preventDefault();
  void doMove(e.shiftKey ? { axis: m.axis, turns: 3 } : m);
});

// ---------------------------------------------------------------------------
// Узоры и формулы
// ---------------------------------------------------------------------------
function renderPatterns(): void {
  const host = $('patterns');
  let group = '';
  for (const p of PATTERNS) {
    if (p.group !== group) {
      group = p.group;
      const g = document.createElement('div'); g.className = 'group'; g.textContent = group; host.appendChild(g);
    }
    const b = document.createElement('button');
    b.className = 'pattern';
    b.innerHTML = `${p.name}<small>${p.moves}</small>`;
    b.onclick = () => { resetAll(); void doMoves(parse(p.moves)); };
    host.appendChild(b);
  }
  const ah = $('algorithms');
  for (const a of ALGORITHMS) {
    const b = document.createElement('button');
    b.className = 'pattern';
    b.title = a.hint;
    b.innerHTML = `${a.name}<small>${a.moves}</small>`;
    b.onclick = () => void doMoves(parse(a.moves));
    ah.appendChild(b);
  }
}
renderPatterns();

// ---------------------------------------------------------------------------
// Решатель Кочембы (Worker)
// ---------------------------------------------------------------------------
const kociemba = new Worker(new URL('./workers/kociemba.worker.ts', import.meta.url), { type: 'module' });
const kBtn = $<HTMLButtonElement>('btn-kociemba');
const kOut = $('kociemba-out');
let kId = 0;
kociemba.onmessage = (e: MessageEvent<KociembaOut>) => {
  const msg = e.data;
  if (msg.type === 'ready') { kBtn.disabled = false; kBtn.textContent = 'Собрать алгоритмом Кочембы'; }
  if (msg.type === 'solution') {
    const ms = parse(msg.alg);
    kOut.textContent = `${ms.length} ходов за ${msg.ms.toFixed(0)} мс: ${msg.alg}`;
    kBtn.disabled = false;
    void doMoves(ms);
  }
  if (msg.type === 'error') { kOut.textContent = `Не решается: ${msg.message}`; kBtn.disabled = false; }
};
kociemba.onerror = (e) => { kOut.textContent = `Решатель не загрузился: ${e.message}`; };
kociemba.postMessage({ type: 'init' });
kBtn.onclick = () => {
  if (isSolved(current())) { kOut.textContent = 'Кубик уже собран — сначала разберите.'; return; }
  kBtn.disabled = true;
  kOut.textContent = 'Ищу…';
  kociemba.postMessage({ type: 'solve', facelets: toFaceletString(current()), id: ++kId });
};

// ---------------------------------------------------------------------------
// Прямой перебор (Worker) + живая статистика
// ---------------------------------------------------------------------------
const brute = new Worker(new URL('./workers/search.worker.ts', import.meta.url), { type: 'module' });
const liveChart = new LineChart($('chart-live'), { yLabel: 'уникальные / все', yMin: 0, yMax: 1, xLabel: 'время перебора', xTick: () => '' });
const liveRatio: number[] = [];
const liveRepeatRatio: number[] = [];
const depthNodes: number[] = [];
let bruteStartState: State | null = null;
let bruteScramble: Move[] = [];

const fmtN = (n: number) => n.toLocaleString('ru-RU');

brute.onmessage = (e: MessageEvent<SearchOut>) => {
  const s: SearchStats = e.data.stats;
  $('st-depth').textContent = String(s.depth);
  $('st-nodes').textContent = fmtN(s.nodes);
  $('st-rate').textContent = s.elapsedMs > 0 ? fmtN(Math.round((s.nodes / s.elapsedMs) * 1000)) : '—';
  $('st-unique').textContent = fmtN(s.unique);
  $('st-repeats').textContent = fmtN(s.repeats);
  const ratio = s.unique + s.repeats > 0 ? s.unique / (s.unique + s.repeats) : 0;
  $('st-ratio').textContent = s.unique + s.repeats > 0 ? ratio.toFixed(3) : '—';
  $('brute-path').textContent = 'ветка: ' + (s.path.length ? formatSingmaster(s.path) : '—');
  depthNodes[s.depth] = s.nodesAtDepth;
  if (s.unique + s.repeats > 0) {
    liveRatio.push(ratio);
    liveRepeatRatio.push(1 - ratio);
    if (liveRatio.length > 400) { liveRatio.shift(); liveRepeatRatio.shift(); }
    liveChart.update([
      { name: 'уникальные / все', color: '#1fa94a', values: liveRatio },
      { name: 'повторы / все', color: '#d8322b', values: liveRepeatRatio },
    ]);
  }
  renderDepthBars(s.depth);
  if (s.done) {
    $<HTMLButtonElement>('btn-brute-start').disabled = false;
    $<HTMLButtonElement>('btn-brute-stop').disabled = true;
    if (s.solution) {
      $('brute-out').textContent = `Нашёл за ${(s.elapsedMs / 1000).toFixed(2)} с: ${formatSingmaster(s.solution)} (${s.solution.length} ходов, ${fmtN(s.nodes)} кубиков)`;
      if (bruteStartState) { resetAll(bruteStartState); void doMoves(s.solution); }
    } else {
      $('brute-out').textContent = 'Глубина исчерпана, решения нет.';
    }
  }
};

function renderDepthBars(cur: number): void {
  const host = $('depth-bars');
  host.innerHTML = '';
  const max = Math.max(1, ...depthNodes.filter(Boolean));
  for (let d = 1; d < depthNodes.length; d++) {
    const b = document.createElement('div');
    b.className = 'bar' + (d === cur ? ' cur' : '');
    b.style.height = `${Math.max(3, (100 * (depthNodes[d] || 0)) / max)}%`;
    b.title = `уровень ${d}: ${fmtN(depthNodes[d] || 0)} кубиков`;
    b.innerHTML = `<span>${d}</span>`;
    host.appendChild(b);
  }
}

$('btn-brute-start').onclick = () => {
  const depth = Math.max(1, Math.min(8, Number($<HTMLInputElement>('inp-depth').value) || 4));
  const metric = $<HTMLSelectElement>('sel-metric').value as 'QTM' | 'HTM';
  bruteScramble = randomScramble(depth);
  bruteStartState = applyMoves(solvedState(), bruteScramble);
  resetAll(); void doMoves(bruteScramble);
  liveRatio.length = 0; liveRepeatRatio.length = 0; depthNodes.length = 0;
  $('brute-out').textContent = `Перемешка: ${formatSingmaster(bruteScramble)}`;
  $<HTMLButtonElement>('btn-brute-start').disabled = true;
  $<HTMLButtonElement>('btn-brute-stop').disabled = false;
  brute.postMessage({
    type: 'start',
    state: bruteStartState,
    opts: {
      metric,
      maxDepth: depth + (metric === 'QTM' ? 2 : 1),
      uniqueLimit: $<HTMLInputElement>('chk-unique').checked ? 2_000_000 : 0,
      pruning: $<HTMLInputElement>('chk-prune').checked,
    },
  });
};
$('btn-brute-stop').onclick = () => {
  brute.postMessage({ type: 'stop' });
  $<HTMLButtonElement>('btn-brute-start').disabled = false;
  $<HTMLButtonElement>('btn-brute-stop').disabled = true;
  $('brute-out').textContent = 'Остановлено.';
};

// ---------------------------------------------------------------------------
// Эссе и графики по данным автора
// ---------------------------------------------------------------------------
type Block = { h?: string; p?: string; img?: string; live?: string };
function renderEssay(): void {
  const host = $('essay');
  for (const b of essay as Block[]) {
    if (b.h) { const h = document.createElement('h3'); h.textContent = b.h; host.appendChild(h); }
    else if (b.p) { const p = document.createElement('p'); p.innerHTML = b.p; host.appendChild(p); }
    else if (b.img) {
      const f = document.createElement('figure');
      const im = document.createElement('img');
      im.src = `./img/${b.img}`; im.loading = 'lazy'; im.alt = b.img.replace('.gif', '');
      const c = document.createElement('figcaption'); c.textContent = b.img.replace('.gif', '').replace('ris', 'рис. ').replace('tab', 'таблица ');
      f.append(im, c); host.appendChild(f);
    } else if (b.live === 'brack') {
      const wrap = document.createElement('div');
      wrap.className = 'chart-host';
      const cap = document.createElement('p'); cap.className = 'small'; cap.textContent = 'Тот же график по данным brack.xls, построенный из таблицы, а не по картинке:';
      host.appendChild(cap);
      host.appendChild(wrap);
      void drawBrack(wrap);
    }
  }
}
renderEssay();

async function drawBrack(host: HTMLElement): Promise<void> {
  const d = await (await fetch('./data/brack.json')).json() as { step: number; unique: number[]; repeats: number[]; total: number[] };
  const chart = new LineChart(host, { yMin: 0, yMax: 1, yLabel: 'доля', xLabel: 'кубиков перебрано', xTick: (i) => `${((i + 1) * d.step / 1e6).toFixed(1)} млн` });
  chart.update([
    { name: 'уникальные / все', color: '#1fa94a', values: d.unique.map((u, i) => u / d.total[i]) },
    { name: 'повторы / все', color: '#d8322b', values: d.repeats.map((r, i) => r / d.total[i]) },
    { name: 'уникальные / повторы', color: '#f5c400', values: d.unique.map((u, i) => Math.min(1, u / d.repeats[i])) },
  ]);
}

async function drawDataSection(): Promise<void> {
  await drawBrack($('chart-brack'));
  const c = await (await fetch('./data/cubi.json')).json() as { repeatsPerUnique: number[] };
  new LineChart($('chart-cubi'), { logY: true, yMin: 1, yLabel: 'повторов', xLabel: 'номер уникального кубика' })
    .update([{ name: 'повторов у кубика №i', color: '#1e63d6', values: c.repeatsPerUnique }]);
  const s = await (await fetch('./data/serii.json')).json() as { uniqueRun: number[]; repeatRun: number[] };
  new LineChart($('chart-serii'), { logY: true, yMin: 1, yLabel: 'длина серии', xLabel: 'номер серии' })
    .update([
      { name: 'серия уникальных', color: '#1fa94a', values: s.uniqueRun },
      { name: 'серия повторов', color: '#d8322b', values: s.repeatRun },
    ]);
}
void drawDataSection();

renderRibbon();
renderCounter();

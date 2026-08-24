/**
 * Модель кубика Рубика 3×3×3 на фейслетах (стикерах).
 *
 * Состояние — Uint8Array(54): индекс = позиция стикера, значение = цвет (0..5).
 * Порядок граней и нумерация совпадают с конвенцией Кочембы (U R F D L B),
 * каждая грань — 9 стикеров построчно, если смотреть на грань снаружи:
 *
 *              U0 U1 U2
 *              U3 U4 U5
 *              U6 U7 U8
 *   L36 L37 L38 F18 F19 F20 R9  R10 R11 B45 B46 B47
 *   L39 L40 L41 F21 F22 F23 R12 R13 R14 B48 B49 B50
 *   L42 L43 L44 F24 F25 F26 R15 R16 R17 B51 B52 B53
 *              D27 D28 D29
 *              D30 D31 D32
 *              D33 D34 D35
 *
 * Ход — перестановка индексов. Никакого DOM, никаких глобалов:
 * всё, что здесь есть, можно запускать в Web Worker и в тестах.
 */

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

/** Все базовые движения: 6 граней, 3 среза, 3 поворота всего куба. */
export const AXES = ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'x', 'y', 'z'] as const;
export type Axis = (typeof AXES)[number];

/** Ход = ось + число четвертей по часовой (1, 2 или 3; 3 ≡ обратный). */
export interface Move {
  axis: Axis;
  turns: 1 | 2 | 3;
}

export type State = Uint8Array;

/** Индекс стикера по грани, строке и столбцу (0..2). */
export const idx = (face: Face, row: number, col: number): number =>
  FACES.indexOf(face) * 9 + row * 3 + col;

/** Собранный куб: каждая грань залита своим цветом. */
export function solvedState(): State {
  const s = new Uint8Array(54);
  for (let i = 0; i < 54; i++) s[i] = Math.floor(i / 9);
  return s;
}

// ---------------------------------------------------------------------------
// Построение перестановок из 4-циклов.
// Цикл (a, b, c, d) означает: стикер из a переезжает в b, из b — в c и т.д.
// ---------------------------------------------------------------------------

type Cycle = [number, number, number, number];

/** Собственные циклы грани при повороте по часовой (снаружи). */
function faceCycles(face: Face): Cycle[] {
  const f = (r: number, c: number) => idx(face, r, c);
  return [
    [f(0, 0), f(0, 2), f(2, 2), f(2, 0)], // углы
    [f(0, 1), f(1, 2), f(2, 1), f(1, 0)], // рёбра
  ];
}

const U = (r: number, c: number) => idx('U', r, c);
const R = (r: number, c: number) => idx('R', r, c);
const F = (r: number, c: number) => idx('F', r, c);
const D = (r: number, c: number) => idx('D', r, c);
const L = (r: number, c: number) => idx('L', r, c);
const B = (r: number, c: number) => idx('B', r, c);

/** Циклы боковых стикеров для каждой оси (выведены и проверены тестами). */
const SIDE_CYCLES: Record<Axis, Cycle[]> = {
  U: [0, 1, 2].map((j): Cycle => [F(0, j), L(0, j), B(0, j), R(0, j)]),
  D: [0, 1, 2].map((j): Cycle => [F(2, j), R(2, j), B(2, j), L(2, j)]),
  R: [0, 1, 2].map((i): Cycle => [F(i, 2), U(i, 2), B(2 - i, 0), D(i, 2)]),
  L: [0, 1, 2].map((i): Cycle => [F(i, 0), D(i, 0), B(2 - i, 2), U(i, 0)]),
  F: [0, 1, 2].map((j): Cycle => [U(2, j), R(j, 0), D(0, 2 - j), L(2 - j, 2)]),
  B: [0, 1, 2].map((j): Cycle => [U(0, j), L(2 - j, 0), D(2, 2 - j), R(j, 2)]),
  // Срезы: M — как L, E — как D, S — как F (стандартная нотация).
  M: [[F(0, 1), D(0, 1), B(2, 1), U(0, 1)], [F(1, 1), D(1, 1), B(1, 1), U(1, 1)], [F(2, 1), D(2, 1), B(0, 1), U(2, 1)]],
  E: [[F(1, 0), R(1, 0), B(1, 0), L(1, 0)], [F(1, 1), R(1, 1), B(1, 1), L(1, 1)], [F(1, 2), R(1, 2), B(1, 2), L(1, 2)]],
  S: [[U(1, 0), R(0, 1), D(1, 2), L(2, 1)], [U(1, 1), R(1, 1), D(1, 1), L(1, 1)], [U(1, 2), R(2, 1), D(1, 0), L(0, 1)]],
  x: [], y: [], z: [], // повороты куба собираются композицией ниже
};

/** Перестановка одного четвертьоборота: perm[i] = откуда берётся стикер для позиции i. */
function permFromCycles(cycles: Cycle[]): Uint8Array {
  const p = new Uint8Array(54);
  for (let i = 0; i < 54; i++) p[i] = i;
  for (const [a, b, c, d] of cycles) {
    p[b] = a; p[c] = b; p[d] = c; p[a] = d;
  }
  return p;
}

/** Композиция: сначала p, потом q. */
function compose(p: Uint8Array, q: Uint8Array): Uint8Array {
  const r = new Uint8Array(54);
  for (let i = 0; i < 54; i++) r[i] = p[q[i]];
  return r;
}

function inverse(p: Uint8Array): Uint8Array {
  const r = new Uint8Array(54);
  for (let i = 0; i < 54; i++) r[p[i]] = i;
  return r;
}

const QUARTER: Record<Axis, Uint8Array> = {} as Record<Axis, Uint8Array>;
for (const face of FACES) QUARTER[face] = permFromCycles([...faceCycles(face), ...SIDE_CYCLES[face]]);
for (const s of ['M', 'E', 'S'] as const) QUARTER[s] = permFromCycles(SIDE_CYCLES[s]);
// x = R M' L',  y = U E' D',  z = F S B'
QUARTER.x = compose(compose(QUARTER.R, inverse(QUARTER.M)), inverse(QUARTER.L));
QUARTER.y = compose(compose(QUARTER.U, inverse(QUARTER.E)), inverse(QUARTER.D));
QUARTER.z = compose(compose(QUARTER.F, QUARTER.S), inverse(QUARTER.B));

/** Готовые перестановки для всех 36 ходов: PERMS[axis][turns]. */
export const PERMS: Record<Axis, [null, Uint8Array, Uint8Array, Uint8Array]> = {} as never;
for (const a of AXES) {
  const q1 = QUARTER[a];
  const q2 = compose(q1, q1);
  PERMS[a] = [null, q1, q2, compose(q2, q1)];
}

// ---------------------------------------------------------------------------
// Операции над состоянием
// ---------------------------------------------------------------------------

/** Применить ход на месте (быстрый путь для перебора). `tmp` — рабочий буфер. */
export function applyMoveInPlace(state: State, move: Move, tmp: State): void {
  const p = PERMS[move.axis][move.turns]!;
  for (let i = 0; i < 54; i++) tmp[i] = state[p[i]];
  state.set(tmp);
}

/** Применить ход, вернуть новое состояние (не мутирует вход). */
export function applyMove(state: State, move: Move): State {
  const p = PERMS[move.axis][move.turns]!;
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[i] = state[p[i]];
  return out;
}

export function applyMoves(state: State, moves: Move[]): State {
  let s = state;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

export const invertMove = (m: Move): Move => ({ axis: m.axis, turns: (4 - m.turns) as 1 | 2 | 3 });
export const invertMoves = (moves: Move[]): Move[] => moves.map(invertMove).reverse();

/** Куб собран, если на каждой грани все стикеры совпадают с центром. */
export function isSolved(state: State): boolean {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9 + 4];
    for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
}

export function statesEqual(a: State, b: State): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Строка из 54 букв граней (формат Кочембы / cubejs): цвет → буква грани центра. */
export function toFaceletString(state: State): string {
  const letter: Record<number, string> = {};
  for (let f = 0; f < 6; f++) letter[state[f * 9 + 4]] = FACES[f];
  let s = '';
  for (let i = 0; i < 54; i++) s += letter[state[i]];
  return s;
}

/** Обратно: строка из 54 букв → состояние. Бросает исключение на мусоре. */
export function fromFaceletString(s: string): State {
  if (s.length !== 54) throw new Error(`Ожидалось 54 символа, получено ${s.length}`);
  const st = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const f = FACES.indexOf(s[i] as Face);
    if (f < 0) throw new Error(`Недопустимый символ «${s[i]}» в позиции ${i}`);
    st[i] = f;
  }
  return st;
}

/** Компактный ключ состояния для хеш-таблиц (54 цифры → строка). */
export function stateKey(state: State): string {
  let k = '';
  for (let i = 0; i < 54; i++) k += state[i];
  return k;
}

/** Случайная перемешка: `n` случайных четвертьоборотов граней без повтора грани подряд. */
export function randomScramble(n: number, rng: () => number = Math.random): Move[] {
  const out: Move[] = [];
  let prev = -1;
  while (out.length < n) {
    const f = Math.floor(rng() * 6);
    if (f === prev) continue;
    prev = f;
    out.push({ axis: FACES[f], turns: rng() < 0.5 ? 1 : 3 });
  }
  return out;
}

/**
 * Упрощение последовательности: склеивает соседние ходы по одной оси,
 * выбрасывает нулевые. Это то, что на старом сайте называлось
 * «оптимизация строки» (opt_2 / opt_3 / cutt), но без побочных эффектов.
 */
export function simplify(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.axis === m.axis) {
      const t = (last.turns + m.turns) % 4;
      out.pop();
      if (t !== 0) out.push({ axis: m.axis, turns: t as 1 | 2 | 3 });
    } else {
      out.push(m);
    }
  }
  return out;
}

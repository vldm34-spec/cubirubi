/**
 * Нотация ходов. На старом сайте в одном меню узоров встречались три формата:
 *
 *   1. Русские буквы подряд:      ппллввннффтт        (строчная — вперёд, прописная — назад)
 *   2. Singmaster с цифрами:      L2 R3 F1 D2         (1 = один раз, 2 = дважды, 3 = обратно)
 *   3. Singmaster со штрихом:     D F2 U' B F'
 *
 * Здесь всё это парсится в единый массив Move и печатается обратно в любой из форматов.
 */

import type { Axis, Move } from './cube';

/** Русская буква → ось. Совпадает с горячими клавишами сайта. */
const RU_TO_AXIS: Record<string, Axis> = {
  в: 'U', н: 'D', л: 'L', п: 'R', ф: 'F', т: 'B',
  с: 'E', // «Середина» — горизонтальный средний слой
  о: 'M', // «Вертикаль» — вертикальный средний слой
};

const AXIS_TO_RU: Partial<Record<Axis, string>> = {
  U: 'в', D: 'н', L: 'л', R: 'п', F: 'ф', B: 'т', E: 'с', M: 'о',
};

const LATIN_AXES = new Set<string>(['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'x', 'y', 'z']);

export class NotationError extends Error {
  constructor(message: string, public position: number) {
    super(message);
  }
}

/**
 * Разобрать строку ходов любого из трёх форматов (можно вперемешку).
 * Пробелы, запятые и переводы строк игнорируются.
 * Латинские строчные u r f d l b трактуются как соответствующие грани
 * (так делал `exekod` на старом сайте), а x y z — как повороты куба.
 */
export function parse(text: string): Move[] {
  const moves: Move[] = [];
  const s = text.normalize('NFC');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[\s,;.]/.test(ch)) { i++; continue; }

    let axis: Axis | null = null;
    let turns: 1 | 2 | 3 = 1;

    const lower = ch.toLowerCase();
    if (RU_TO_AXIS[lower]) {
      axis = RU_TO_AXIS[lower];
      if (ch !== lower) turns = 3; // прописная русская = обратный ход
    } else if (LATIN_AXES.has(ch)) {
      axis = ch as Axis;
    } else if (LATIN_AXES.has(ch.toUpperCase()) && 'urfdlb'.includes(ch)) {
      axis = ch.toUpperCase() as Axis;
    } else {
      throw new NotationError(`Непонятный символ «${ch}»`, i);
    }
    i++;

    // Суффиксы: 2, 3, ', `, ’ и их комбинации (например 2' ≡ 2).
    while (i < s.length) {
      const sfx = s[i];
      if (sfx === '2') turns = ((turns * 2) % 4 || 2) as 1 | 2 | 3;
      else if (sfx === '3' || sfx === "'" || sfx === '`' || sfx === '’' || sfx === '′') turns = ((4 - turns) % 4 || 3) as 1 | 2 | 3;
      else if (sfx === '1') { /* явная единица */ }
      else break;
      i++;
    }
    moves.push({ axis, turns });
  }
  return moves;
}

/** Singmaster: R U' F2 */
export function formatSingmaster(moves: Move[]): string {
  return moves.map((m) => m.axis + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '')).join(' ');
}

/** Русская запись сайта: ппВф (двойной ход печатается двумя буквами). */
export function formatRussian(moves: Move[]): string {
  let out = '';
  for (const m of moves) {
    const ru = AXIS_TO_RU[m.axis];
    if (!ru) { out += m.axis + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : ''); continue; }
    if (m.turns === 2) out += ru + ru;
    else if (m.turns === 3) out += ru.toUpperCase();
    else out += ru;
  }
  return out;
}

/** Один ход как токен для ленты ходов. */
export const moveLabel = (m: Move): string => m.axis + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');

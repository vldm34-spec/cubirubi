/**
 * Узоры со старого сайта — как данные, а не как код.
 * Строки ходов сохранены в оригинальной записи автора (все три нотации),
 * парсер их нормализует.
 */
export interface Pattern {
  name: string;
  moves: string;
  group: 'Шахматы' | 'Вишни' | 'Мезоны' | 'Кольца и буквы' | 'Фигуры' | 'Уголки и кресты';
}

export const PATTERNS: Pattern[] = [
  { group: 'Шахматы', name: 'Шахматы второго порядка', moves: 'ппллввннффтт' },
  { group: 'Шахматы', name: 'Шахматы третьего порядка', moves: 'ллПфннЛФнВтФнпффНлпп' },
  { group: 'Шахматы', name: 'Шахматы шестого порядка', moves: 'L2 R3 F1 D2 L3 F3 D1 U3 B1 F3 D1 R1 F2 D3 L1 R2' },
  { group: 'Вишни', name: 'Вишни простые', moves: 'ппффппффппфф' },
  { group: 'Вишни', name: 'Вишни второго порядка', moves: 'F3 D1 L2 U3 R1 B1 L2 F3 D1 F1 U3 F3 L3 B1 D1 L1 F3' },
  { group: 'Вишни', name: 'Вишни третьего порядка', moves: "D F2 U' B F' L R' D L2 U' B R2 B' U L2 U'" },
  { group: 'Мезоны', name: 'Кварк', moves: "U' L2 U F' R2 F U' L2 U F' R2 F" },
  { group: 'Мезоны', name: 'Мезон', moves: "U2 F2 R2 U' L2 D B R' B R' B R' D' L2 U'" },
  { group: 'Мезоны', name: 'Мезон с кварком', moves: "D' B2 F2 R2 B2 F2 D U2 B L' B L B2 L B2 U' L U'" },
  { group: 'Мезоны', name: 'Мезон первого порядка', moves: "U' L2 F2 D' L' D U2 R U' R' U2 R2 U F' L' U R'" },
  { group: 'Кольца и буквы', name: 'Буква О', moves: "D' U L' R B' F D' U" },
  { group: 'Кольца и буквы', name: 'Кольцо второго порядка', moves: "U' B2 R2 U2 F' D2 L' F2 U' F2 D2 F U2 R' U2" },
  { group: 'Кольца и буквы', name: 'Кольцо третьего порядка', moves: "F2 D' R2 D' L' U' L' R B D' U B L F2 L U2" },
  { group: 'Кольца и буквы', name: 'Буква Т', moves: "B2 D2 L R' D2 B2 L R'" },
  { group: 'Кольца и буквы', name: 'Буква П', moves: "D' U B D' L' R F D' B' D' U L" },
  { group: 'Фигуры', name: 'Змейка', moves: "U B2 L D B' F L' D U' L' R F' D2 R'" },
  { group: 'Фигуры', name: 'Рыбки', moves: "U F2 U' B' U2 B U' F2 U' R' U2 B' U2 B R" },
  { group: 'Фигуры', name: 'Эшер', moves: "U R2 D2 B2 U' F L2 B R D R B R' D' F2 U2" },
  { group: 'Фигуры', name: 'Глобус', moves: "B2 L2 R2 D B2 F2 L2 R2 D2 U' F2 L' D U' B F' D2 U2 L R' U'" },
  { group: 'Фигуры', name: 'Диагональ', moves: 'D2 U1 B2 U2 B2 L2 B2 D1 F3 L3 U3 F2 D2 F1 D1 B3 L1 F1 U3' },
  { group: 'Фигуры', name: 'Ракета третьего порядка', moves: "D U L2 B2 D U' F' U F' R F2 R' F D' B2 L2 D' U'" },
  { group: 'Фигуры', name: 'Ракета второго порядка', moves: "B2 U L2 R2 D' F' D' R U F2 L2 U L' D2 L R B' U" },
  { group: 'Фигуры', name: 'Винт', moves: "U' L2 U2 R2 U' B2 L' B D R' B' L' B' D2 B' L D B' U'" },
  { group: 'Уголки и кресты', name: 'Уголки второго порядка', moves: "R2 B2 D B2 D U R2 D' B' D' R F2 R' D B U'" },
  { group: 'Уголки и кресты', name: 'Уголки третьего порядка', moves: "U F2 D R D' L' U F' L2 U2 R U' R' U2 L' U'" },
  { group: 'Уголки и кресты', name: 'Крест второго порядка', moves: "L2 R' B2 F2 D2 B2 F2 L2 R2 U2 R'" },
  { group: 'Уголки и кресты', name: 'Крест третьего порядка', moves: "R2 U' F2 D U' L2 B2 F2 U' F' L2 R2 D2 U2 B R2 F2" },
];

/** Формулы третьего слоя со старого сайта (раздел «Помочь собрать третий слой»). */
export const ALGORITHMS: { name: string; moves: string; hint: string }[] = [
  { name: 'Крест наверх', moves: "F R U R' U' F'", hint: 'Рёбра верхнего слоя поднять наверх' },
  { name: 'Крест на место', moves: "R U R' U R U2 R'", hint: 'Рёбра верха расставить по местам' },
  { name: 'Углы на место', moves: "U R U' L' U R' U' L", hint: 'Угловые кубики верха на свои места' },
  { name: 'Углы в цвет', moves: "R' D' R D", hint: 'Повторять, поворачивая верх между углами' },
  { name: 'Ножницы (пфпф)', moves: "R F' R' F", hint: 'Из старого раздела помощи' },
  { name: 'вфпвПВФ', moves: "U F R U R' U' F'", hint: 'Из старого раздела помощи' },
];

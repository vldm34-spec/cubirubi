/**
 * Минимальный линейный график на SVG. Без библиотек: нам нужны 3 типа графиков,
 * и все они — линии по времени/индексу. Умеет перерисовываться на лету.
 */
export interface Series { name: string; color: string; values: number[] }
export interface ChartOptions {
  yLabel?: string;
  xLabel?: string;
  yMax?: number;
  yMin?: number;
  /** Подпись по X для индекса i (например «10 тыс.»). */
  xTick?: (i: number) => string;
  logY?: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export class LineChart {
  private readonly svg: SVGSVGElement;
  private readonly W = 640;
  private readonly H = 260;
  private readonly pad = { l: 52, r: 14, t: 14, b: 34 };

  constructor(host: HTMLElement, private readonly opts: ChartOptions = {}) {
    this.svg = el('svg', { viewBox: `0 0 ${this.W} ${this.H}`, class: 'chart', role: 'img' });
    host.appendChild(this.svg);
  }

  update(series: Series[]): void {
    const { W, H, pad } = this;
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const n = Math.max(1, ...series.map((s) => s.values.length));
    let yMax = this.opts.yMax ?? Math.max(1e-9, ...series.flatMap((s) => s.values));
    let yMin = this.opts.yMin ?? 0;
    if (this.opts.logY) { yMin = Math.max(1, yMin); yMax = Math.max(yMin * 10, yMax); }
    const sy = (v: number) => {
      const t = this.opts.logY
        ? (Math.log10(Math.max(yMin, v)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))
        : (v - yMin) / (yMax - yMin || 1);
      return pad.t + (1 - Math.min(1, Math.max(0, t))) * (H - pad.t - pad.b);
    };
    const sx = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) : 0.5) * (W - pad.l - pad.r);

    // сетка и подписи Y
    for (let k = 0; k <= 4; k++) {
      const v = this.opts.logY ? yMin * Math.pow(yMax / yMin, k / 4) : yMin + ((yMax - yMin) * k) / 4;
      const y = sy(v);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'chart-grid' }));
      const t = el('text', { x: pad.l - 6, y: y + 4, class: 'chart-tick', 'text-anchor': 'end' });
      t.textContent = fmt(v);
      svg.appendChild(t);
    }
    // подписи X
    for (let k = 0; k <= 4; k++) {
      const i = Math.round(((n - 1) * k) / 4);
      const t = el('text', { x: sx(i), y: H - pad.b + 16, class: 'chart-tick', 'text-anchor': 'middle' });
      t.textContent = this.opts.xTick ? this.opts.xTick(i) : String(i);
      svg.appendChild(t);
    }
    if (this.opts.xLabel) {
      const t = el('text', { x: (pad.l + W - pad.r) / 2, y: H - 6, class: 'chart-label', 'text-anchor': 'middle' });
      t.textContent = this.opts.xLabel; svg.appendChild(t);
    }
    if (this.opts.yLabel) {
      const t = el('text', { x: 12, y: (pad.t + H - pad.b) / 2, class: 'chart-label', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(pad.t + H - pad.b) / 2})` });
      t.textContent = this.opts.yLabel; svg.appendChild(t);
    }
    // линии
    for (const s of series) {
      if (!s.values.length) continue;
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
      svg.appendChild(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    }
    // легенда
    let lx = pad.l;
    for (const s of series) {
      svg.appendChild(el('rect', { x: lx, y: pad.t - 2, width: 12, height: 3, fill: s.color }));
      const t = el('text', { x: lx + 16, y: pad.t + 3, class: 'chart-tick' });
      t.textContent = s.name; svg.appendChild(t);
      lx += 16 + s.name.length * 7 + 18;
    }
  }
}

function fmt(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + ' млн';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + ' тыс';
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

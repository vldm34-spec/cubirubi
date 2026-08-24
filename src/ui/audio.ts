/**
 * «Музыка сфер». На старом сайте — 19 WAV и bgsound под IE.
 * Здесь — Web Audio: каждой грани своя нота в пределах одной октавы
 * (как и задумывал автор), обратный ход — на полтона ниже.
 */
import type { Move } from '../core/cube';

const NOTE: Record<string, number> = {
  U: 523.25, // C5
  R: 587.33, // D5
  F: 659.25, // E5
  D: 698.46, // F5
  L: 783.99, // G5
  B: 880.0,  // A5
  M: 493.88, E: 466.16, S: 440.0, x: 392.0, y: 369.99, z: 349.23,
};

export class SphereMusic {
  private ctx: AudioContext | null = null;
  enabled = false;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled && !this.ctx) this.ctx = new AudioContext();
    if (this.enabled) void this.ctx?.resume();
    return this.enabled;
  }

  play(move: Move, durationMs: number): void {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = NOTE[move.axis] ?? 440;
    const freq = move.turns === 3 ? base / Math.pow(2, 1 / 12) : move.turns === 2 ? base * 2 : base;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const len = Math.max(0.08, Math.min(0.5, durationMs / 1000));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
}

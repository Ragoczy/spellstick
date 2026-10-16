import { NET_READOUT_TEXT as T } from '../content/online';
import type { CorrectionSummary } from '../net';

/**
 * The network readout (M12): N in an online match shows how the connection is doing, for
 * tuning the online feel from real games. Not saved: it's off again after a reload.
 */

export interface ReadoutData {
  /** Watching (no controls to send). */
  watching: boolean;
  rttMs: number | null;
  rttAvgMs: number | null;
  /** How many ticks this screen runs ahead of the latest server state. */
  aheadTicks: number | null;
  /** How early the server says our controls arrive (ticks), and what the clock aims for. */
  slack: number | null;
  targetSlack: number;
  /** Null until there are two samples to measure between. */
  snapsPerSecond: number | null;
  kbPerSecond: number | null;
  corrections: CorrectionSummary;
  tickHz: number;
}

const dash = '—';
const n = (v: number | null, unit = '') => (v === null ? dash : `${Math.round(v)}${unit}`);
/** A correction size: "none" when there were none. */
const cm = (avg: number | null, max: number | null) =>
  max === null ? T.none : avg === null ? `${max} cm ${T.max}` : `${avg} cm ${T.avg}, ${max} cm ${T.max}`;

/** The readout's lines: a label and a value each. */
export function readoutLines(d: ReadoutData): [string, string][] {
  const c = d.corrections;
  const ahead =
    d.aheadTicks === null
      ? dash
      : `${d.aheadTicks} ${T.ticks} (${Math.round((d.aheadTicks / d.tickHz) * 1000)} ms)`;
  const fixes = [`${c.perSecond}/s`];
  if (!d.watching) fixes.push(`${T.you} ${cm(c.mineAvgCm, c.mineMaxCm)}`);
  fixes.push(`${T.others} ${cm(null, c.othersMaxCm)}`);
  if (c.snaps > 0) fixes.push(T.snaps(c.snaps));
  const lines: [string, string][] = [
    [T.ping, d.rttMs === null ? dash : `${n(d.rttMs, ' ms')} (${T.avg} ${n(d.rttAvgMs)})`],
    [T.ahead, ahead],
  ];
  if (!d.watching) {
    lines.push([T.controls, d.slack === null ? dash : T.early(d.slack, d.targetSlack)]);
  }
  lines.push([T.updates, d.snapsPerSecond === null ? dash : `${d.snapsPerSecond}/s · ${d.kbPerSecond} KB/s`]);
  lines.push([T.fixes, fixes.join(' · ')]);
  return lines;
}

/** Rates from running totals: call `sample` now and then with the totals so far. */
export class RateMeter {
  private last: { at: number; snaps: number; bytes: number } | null = null;
  snapsPerSecond: number | null = null;
  kbPerSecond: number | null = null;

  sample(at: number, snaps: number, bytes: number): void {
    const last = this.last;
    this.last = { at, snaps, bytes };
    if (!last || at <= last.at) return;
    const secs = (at - last.at) / 1000;
    this.snapsPerSecond = Math.round((snaps - last.snaps) / secs);
    this.kbPerSecond = Math.round(((bytes - last.bytes) / 1024 / secs) * 10) / 10;
  }

  reset(): void {
    this.last = null;
    this.snapsPerSecond = null;
    this.kbPerSecond = null;
  }
}

/** The readout panel: a small box at the top left, over the rink. */
export class NetReadout {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'net-readout';
    this.el.setAttribute('aria-live', 'off');
    const title = document.createElement('div');
    title.className = 'net-title';
    title.textContent = T.title;
    this.body = document.createElement('table');
    this.el.append(title, this.body);
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }

  update(d: ReadoutData): void {
    this.body.replaceChildren(
      ...readoutLines(d).map(([label, value]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = label;
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(th, td);
        return tr;
      }),
    );
  }
}

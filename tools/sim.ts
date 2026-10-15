/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1 [--workers 8] [--home-level normal] [--away-level hard]
 *                  [--home-style physical] [--away-style passing] [--strict]
 *   npm run sim -- --style-matrix --games 200 --seed 1 [--strict]
 *
 * Runs matches with no renderer and prints a stats report. Each match depends only on
 * its seed, so games are split across worker threads and the results are identical to
 * a single-threaded run. `--strict` exits non-zero if a balance threshold from CLAUDE.md
 * is broken (hard failures from M6 on). `--style-matrix` plays every pairing of two
 * different team styles (M9), `--games` each way, and reports each style's record and
 * per-team stats; with `--strict` it fails if a style is the obvious pick.
 */
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { makeConfig, type AiStyle, type Difficulty } from '../src/sim';
import {
  balanceWarnings,
  createReport,
  formatReport,
  formatStyleTable,
  mergeReports,
  recordMatch,
  recordStyleMatchup,
  styleWarnings,
  type Report,
  type StyleTable,
} from './report';
import { runMatch } from './runMatch';

/** One match to play: its seed and each side's difficulty and style. */
interface Task {
  seed: number;
  levels: [Difficulty, Difficulty];
  styles: [AiStyle, AiStyle];
}

const pairingKey = (t: Task) => t.styles.join(' vs ');

/** Plays the tasks and returns one report per style pairing. */
function runTasks(tasks: readonly Task[]): Record<string, Report> {
  const config = makeConfig();
  const out: Record<string, Report> = {};
  for (const t of tasks) {
    const report = (out[pairingKey(t)] ??= createReport());
    recordMatch(report, runMatch(config, t.seed, t.levels, t.styles));
  }
  return out;
}

/** Runs the tasks across `workers` threads (or inline for one) and merges the reports per pairing. */
async function runParallel(tasks: readonly Task[], workers: number): Promise<Record<string, Report>> {
  if (workers === 1) return runTasks(tasks);
  // Deal tasks round-robin so each worker gets a similar mix.
  const chunks: Task[][] = Array.from({ length: workers }, () => []);
  tasks.forEach((t, i) => chunks[i % workers]!.push(t));
  const parts = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<Record<string, Report>>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: chunk });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  const merged: Record<string, Report> = {};
  for (const part of parts) {
    for (const [key, r] of Object.entries(part)) merged[key] = mergeReports(merged[key] ?? createReport(), r);
  }
  return merged;
}

const isLevel = (s: string): s is Difficulty => s === 'easy' || s === 'normal' || s === 'hard';
const STYLES = Object.keys(makeConfig().ai.styles) as AiStyle[];
const isStyle = (s: string): s is AiStyle => (STYLES as string[]).includes(s);

if (!isMainThread) {
  parentPort!.postMessage(runTasks(workerData as Task[]));
} else {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: '100' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      'home-level': { type: 'string', default: 'normal' },
      'away-level': { type: 'string', default: 'normal' },
      'home-style': { type: 'string', default: 'balanced' },
      'away-style': { type: 'string', default: 'balanced' },
      'style-matrix': { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
    },
  });
  const games = Number(values.games);
  const baseSeed = Number(values.seed);
  const workers = Math.max(1, Math.min(Number(values.workers), games * (values['style-matrix'] ? 6 : 1)));
  const home = values['home-level'];
  const away = values['away-level'];
  const homeStyle = values['home-style'];
  const awayStyle = values['away-style'];
  if (
    !Number.isInteger(games) ||
    games < 1 ||
    !Number.isInteger(baseSeed) ||
    !Number.isInteger(workers) ||
    !isLevel(home) ||
    !isLevel(away) ||
    !isStyle(homeStyle) ||
    !isStyle(awayStyle)
  ) {
    console.error(
      'Usage: npm run sim -- --games <n> --seed <int> [--workers <n>] [--home-level easy|normal|hard] [--away-level easy|normal|hard]' +
        ` [--home-style ${STYLES.join('|')}] [--away-style ...] [--style-matrix] [--strict]`,
    );
    process.exit(1);
  }
  const levels: [Difficulty, Difficulty] = [home, away];
  const seeds = Array.from({ length: games }, (_, i) => baseSeed + i);
  const started = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;

  if (values['style-matrix']) {
    // The styles teams play (the 'balanced' baseline is for the same-AI gate, not a team).
    const played = STYLES.filter((s) => s !== 'balanced');
    const pairings = played.flatMap((a) =>
      played.filter((b) => b !== a).map((b): [AiStyle, AiStyle] => [a, b]),
    );
    const tasks = pairings.flatMap((styles) => seeds.map((seed): Task => ({ seed, levels, styles })));
    const reports = await runParallel(tasks, workers);
    const table: StyleTable = new Map();
    for (const [a, b] of pairings) recordStyleMatchup(table, a, b, reports[`${a} vs ${b}`]!);
    console.log(formatStyleTable(table, { gamesPerPairing: games, elapsedMs: elapsedMs() }));
    if (values.strict && styleWarnings(table).length > 0) {
      console.error('Style balance broken (see STYLE WARNINGS above).');
      process.exit(2);
    }
  } else {
    const styles: [AiStyle, AiStyle] = [homeStyle, awayStyle];
    const tasks = seeds.map((seed): Task => ({ seed, levels, styles }));
    const report = Object.values(await runParallel(tasks, workers))[0]!;
    const config = makeConfig();
    const styleNote = homeStyle === awayStyle ? '' : `, styles ${homeStyle} vs ${awayStyle}`;
    console.log(
      formatReport(report, config, {
        games,
        baseSeed,
        elapsedMs: elapsedMs(),
        setup: `${config.teams.runnersPerSide} runners + goalie per side, ${home} vs ${away}${styleNote}, ${workers} worker${workers === 1 ? '' : 's'}`,
      }),
    );

    // Balance thresholds only make sense with the same AI on both sides.
    if (values.strict && home === away && homeStyle === awayStyle && balanceWarnings(report).length > 0) {
      console.error('Balance thresholds broken (see BALANCE WARNINGS above).');
      process.exit(2);
    }
  }
}

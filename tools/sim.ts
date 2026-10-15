/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1 [--workers 8] [--home-level normal] [--away-level hard]
 *                  [--home-style physical] [--away-style passing] [--loadouts random|default] [--strict]
 *   npm run sim -- --style-matrix --games 200 --seed 1 [--strict]
 *   npm run sim -- --spell-edges --games 200 --seed 1 [--strict]
 *
 * Runs matches with no renderer and prints a stats report. Each match depends only on
 * its seed, so games are split across worker threads and the results are identical to
 * a single-threaded run. `--strict` exits non-zero if a balance threshold from CLAUDE.md
 * is broken (hard failures from M6 on).
 *
 * Loadouts (M10): by default each team carries three spells drawn at random per match (from
 * the seed); `--loadouts default` gives both teams the starting three instead.
 * `--style-matrix` plays every pairing of two different team styles (M9), `--games` each way.
 * `--spell-edges` measures each of the ten spells: `--games` matches in which one team always
 * carries it and the other never does, sides alternating; `--strict` fails a spell that wins
 * too often (the obvious pick) or too rarely (a dead pick).
 */
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import {
  drawLoadout,
  loadoutRng,
  makeConfig,
  SPELL_POOL,
  type AiStyle,
  type Difficulty,
  type RunnerSpell,
  type TeamIndex,
} from '../src/sim';
import {
  balanceWarnings,
  createReport,
  formatReport,
  formatSpellEdges,
  formatStyleTable,
  mergeReports,
  recordMatch,
  recordStyleMatchup,
  spellEdgeWarnings,
  styleWarnings,
  type Report,
  type SpellEdge,
  type StyleTable,
} from './report';
import { runMatch } from './runMatch';

/** How a match's two loadouts are chosen. */
type LoadoutPlan =
  | { kind: 'default' }
  | { kind: 'random' }
  /** `spell` always on `side`, never on the other. */
  | { kind: 'edge'; spell: RunnerSpell; side: TeamIndex };

/** One match to play, and which report it counts toward. */
interface Task {
  seed: number;
  levels: [Difficulty, Difficulty];
  styles: [AiStyle, AiStyle];
  plan: LoadoutPlan;
  key: string;
}

function loadoutsFor(plan: LoadoutPlan, seed: number): [RunnerSpell[], RunnerSpell[]] | undefined {
  if (plan.kind === 'default') return undefined;
  if (plan.kind === 'random') return [drawLoadout(loadoutRng(seed, 0)), drawLoadout(loadoutRng(seed, 1))];
  const withIt = drawLoadout(loadoutRng(seed, plan.side), { include: plan.spell });
  const without = drawLoadout(loadoutRng(seed, 1 - plan.side), { exclude: plan.spell });
  return plan.side === 0 ? [withIt, without] : [without, withIt];
}

/** Plays the tasks and returns one report per key. */
function runTasks(tasks: readonly Task[]): Record<string, Report> {
  const config = makeConfig();
  const out: Record<string, Report> = {};
  for (const t of tasks) {
    const report = (out[t.key] ??= createReport());
    recordMatch(report, runMatch(config, t.seed, t.levels, t.styles, loadoutsFor(t.plan, t.seed)));
  }
  return out;
}

/** Runs the tasks across `workers` threads (or inline for one) and merges the reports per key. */
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
      loadouts: { type: 'string', default: 'random' },
      'style-matrix': { type: 'boolean', default: false },
      'spell-edges': { type: 'boolean', default: false },
      /** With --spell-edges: measure just these spells (comma-separated ids), for quick tuning. */
      only: { type: 'string', default: '' },
      strict: { type: 'boolean', default: false },
    },
  });
  const games = Number(values.games);
  const baseSeed = Number(values.seed);
  const home = values['home-level'];
  const away = values['away-level'];
  const homeStyle = values['home-style'];
  const awayStyle = values['away-style'];
  const loadouts = values.loadouts;
  if (
    !Number.isInteger(games) ||
    games < 1 ||
    !Number.isInteger(baseSeed) ||
    !Number.isInteger(Number(values.workers)) ||
    !isLevel(home) ||
    !isLevel(away) ||
    !isStyle(homeStyle) ||
    !isStyle(awayStyle) ||
    (loadouts !== 'random' && loadouts !== 'default')
  ) {
    console.error(
      'Usage: npm run sim -- --games <n> --seed <int> [--workers <n>] [--home-level easy|normal|hard] [--away-level easy|normal|hard]' +
        ` [--home-style ${STYLES.join('|')}] [--away-style ...] [--loadouts random|default] [--style-matrix] [--spell-edges] [--strict]`,
    );
    process.exit(1);
  }
  const levels: [Difficulty, Difficulty] = [home, away];
  const plan: LoadoutPlan = { kind: loadouts };
  const seeds = Array.from({ length: games }, (_, i) => baseSeed + i);
  const started = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;
  const pool = (tasks: Task[]) => Math.max(1, Math.min(Number(values.workers), tasks.length));

  if (values['spell-edges']) {
    const balanced: [AiStyle, AiStyle] = ['balanced', 'balanced'];
    const only = values.only ? values.only.split(',') : null;
    const measured = SPELL_POOL.filter((s) => !only || only.includes(s));
    const tasks = measured.flatMap((spell) =>
      seeds.map((seed, i): Task => {
        const side: TeamIndex = i % 2 === 0 ? 0 : 1;
        return {
          seed,
          levels,
          styles: balanced,
          plan: { kind: 'edge', spell, side },
          key: `${spell}|${side}`,
        };
      }),
    );
    const reports = await runParallel(tasks, pool(tasks));
    const edges: SpellEdge[] = measured.map((spell) => {
      const asHome = reports[`${spell}|0`] ?? createReport();
      const asAway = reports[`${spell}|1`] ?? createReport();
      const both = mergeReports(asHome, asAway);
      return {
        spell,
        games: both.games,
        wins: asHome.homeWins + asAway.awayWins,
        losses: asHome.awayWins + asAway.homeWins,
        casts: both.spellCasts[spell] ?? 0,
        goals: both.goals,
      };
    });
    console.log(formatSpellEdges(edges, { gamesPerSpell: games, elapsedMs: elapsedMs() }));
    if (values.strict && spellEdgeWarnings(edges).length > 0) {
      console.error('Spell balance broken (see SPELL WARNINGS above).');
      process.exit(2);
    }
  } else if (values['style-matrix']) {
    // The styles teams play (the 'balanced' baseline is for the same-AI gate, not a team).
    const played = STYLES.filter((s) => s !== 'balanced');
    const pairings = played.flatMap((a) =>
      played.filter((b) => b !== a).map((b): [AiStyle, AiStyle] => [a, b]),
    );
    const tasks = pairings.flatMap((styles) =>
      seeds.map((seed): Task => ({ seed, levels, styles, plan, key: styles.join(' vs ') })),
    );
    const reports = await runParallel(tasks, pool(tasks));
    const table: StyleTable = new Map();
    for (const [a, b] of pairings) recordStyleMatchup(table, a, b, reports[`${a} vs ${b}`]!);
    console.log(formatStyleTable(table, { gamesPerPairing: games, elapsedMs: elapsedMs() }));
    if (values.strict && styleWarnings(table).length > 0) {
      console.error('Style balance broken (see STYLE WARNINGS above).');
      process.exit(2);
    }
  } else {
    const styles: [AiStyle, AiStyle] = [homeStyle, awayStyle];
    const tasks = seeds.map((seed): Task => ({ seed, levels, styles, plan, key: 'all' }));
    const workers = pool(tasks);
    const report = (await runParallel(tasks, workers)).all!;
    const config = makeConfig();
    const styleNote = homeStyle === awayStyle ? '' : `, styles ${homeStyle} vs ${awayStyle}`;
    console.log(
      formatReport(report, config, {
        games,
        baseSeed,
        elapsedMs: elapsedMs(),
        setup: `${config.teams.runnersPerSide} runners + goalie per side, ${home} vs ${away}${styleNote}, ${loadouts} loadouts, ${workers} worker${workers === 1 ? '' : 's'}`,
      }),
    );

    // Balance thresholds only make sense with the same AI on both sides.
    if (values.strict && home === away && homeStyle === awayStyle && balanceWarnings(report).length > 0) {
      console.error('Balance thresholds broken (see BALANCE WARNINGS above).');
      process.exit(2);
    }
  }
}

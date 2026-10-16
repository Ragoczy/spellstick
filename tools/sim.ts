/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1 [--workers 8] [--home-level normal] [--away-level hard]
 *                  [--home-style physical] [--away-style passing] [--loadouts random|default] [--strict]
 *   npm run sim -- --style-matrix --games 200 --seed 1 [--strict]
 *   npm run sim -- --spell-edges --games 200 --seed 1 [--strict]
 *   npm run sim -- --net --games 4 --seed 1 [--links east:europe,wifi:east] [--set online.inputSlackTicks=4,...]
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
 * `--net` (M12) plays online matches through the real server room and screens' prediction
 * code over simulated connections (tools/netSim.ts), `--games` per pairing of connections,
 * and reports how often and how far screens are corrected. `--set` tries other `online`
 * settings (comma-separated `online.<key>=<number>`).
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
import {
  averagePairing,
  DEFAULT_PAIRINGS,
  formatNetReport,
  LINK_NAMES,
  runNetMatch,
  type LinkName,
  type NetMatchResult,
} from './netSim';
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

/** One online match for `--net`. */
interface NetTask {
  seed: number;
  links: [LinkName, LinkName];
  online: Record<string, number>;
}

function runNetTasks(tasks: readonly NetTask[]): NetMatchResult[] {
  return tasks.map((t) => runNetMatch(makeConfig({ online: t.online }), t.seed, t.links));
}

/** Runs `--net` matches across `workers` threads, in task order. */
async function runNetParallel(tasks: readonly NetTask[], workers: number): Promise<NetMatchResult[]> {
  if (workers === 1) return runNetTasks(tasks);
  const chunks: { i: number; task: NetTask }[][] = Array.from({ length: workers }, () => []);
  tasks.forEach((task, i) => chunks[i % workers]!.push({ i, task }));
  const out: NetMatchResult[] = [];
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { net: chunk.map((c) => c.task) } });
          w.once('message', (results: NetMatchResult[]) => {
            results.forEach((r, k) => (out[chunk[k]!.i] = r));
            resolve();
          });
          w.once('error', reject);
        }),
    ),
  );
  return out;
}

/** `online.<key>=<number>` pairs, comma-separated; null if malformed. */
function parseOnlineSettings(text: string): Record<string, number> | null {
  const known = makeConfig().online as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const part of text.split(',').filter(Boolean)) {
    const m = /^online\.(\w+)=(-?[\d.]+)$/.exec(part.trim());
    if (!m || typeof known[m[1]!] !== 'number' || !Number.isFinite(Number(m[2]))) return null;
    out[m[1]!] = Number(m[2]);
  }
  return out;
}

/** `home:away` link names, comma-separated; null if malformed. */
function parsePairings(text: string): [LinkName, LinkName][] | null {
  const isLink = (s: string | undefined): s is LinkName => (LINK_NAMES as string[]).includes(s ?? '');
  const out: [LinkName, LinkName][] = [];
  for (const part of text.split(',').filter(Boolean)) {
    const [a, b] = part.trim().split(':');
    if (!isLink(a) || !isLink(b)) return null;
    out.push([a, b]);
  }
  return out.length > 0 ? out : null;
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
  const data = workerData as Task[] | { net: NetTask[] };
  parentPort!.postMessage(Array.isArray(data) ? runTasks(data) : runNetTasks(data.net));
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
      net: { type: 'boolean', default: false },
      /** With --net: which connections to pair, `home:away,...` (default: a spread). */
      links: { type: 'string', default: '' },
      /** With --net: other online settings to try, `online.<key>=<number>,...`. */
      set: { type: 'string', default: '' },
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

  if (values.net) {
    const pairings = values.links ? parsePairings(values.links) : DEFAULT_PAIRINGS;
    const online = parseOnlineSettings(values.set);
    if (!pairings || !online) {
      console.error(
        `Usage: npm run sim -- --net --games <n> --seed <int> [--links home:away,...] [--set online.<key>=<number>,...]  (links: ${LINK_NAMES.join(', ')})`,
      );
      process.exit(1);
    }
    const tasks = pairings.flatMap((links) => seeds.map((seed): NetTask => ({ seed, links, online })));
    const results = await runNetParallel(tasks, pool(tasks as unknown as Task[]));
    const rows = pairings.map((links, p) => averagePairing(links, results.slice(p * games, (p + 1) * games)));
    const o = makeConfig({ online }).online;
    const settings =
      `input lead ${o.inputSlackTicks} ticks, smoothing ${o.smoothSeconds} s, snapshots every ${o.snapshotEveryTicks} tick${o.snapshotEveryTicks === 1 ? '' : 's'}` +
      (Object.keys(online).length > 0 ? ` (--set ${values.set})` : " (the game's own)");
    console.log(formatNetReport(rows, { games, baseSeed, elapsedMs: elapsedMs(), settings }));
  } else if (values['spell-edges']) {
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

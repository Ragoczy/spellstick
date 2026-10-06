/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1 [--workers 8] [--home-level normal] [--away-level hard] [--strict]
 *
 * Runs matches with no renderer and prints a stats report. Each match depends only on
 * its seed, so games are split across worker threads and the results are identical to
 * a single-threaded run. `--strict` exits non-zero if a balance threshold from CLAUDE.md
 * is broken (hard failures from M6 on).
 */
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { makeConfig, type Difficulty } from '../src/sim';
import {
  balanceWarnings,
  createReport,
  formatReport,
  mergeReports,
  recordMatch,
  type Report,
} from './report';
import { runMatch } from './runMatch';

interface Job {
  seeds: number[];
  levels: [Difficulty, Difficulty];
}

function runSeeds(job: Job): Report {
  const config = makeConfig();
  const report = createReport();
  for (const seed of job.seeds) recordMatch(report, runMatch(config, seed, job.levels));
  return report;
}

const isLevel = (s: string): s is Difficulty => s === 'easy' || s === 'normal' || s === 'hard';

if (!isMainThread) {
  parentPort!.postMessage(runSeeds(workerData as Job));
} else {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: '100' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      'home-level': { type: 'string', default: 'normal' },
      'away-level': { type: 'string', default: 'normal' },
      strict: { type: 'boolean', default: false },
    },
  });
  const games = Number(values.games);
  const baseSeed = Number(values.seed);
  const workers = Math.max(1, Math.min(Number(values.workers), games));
  const home = values['home-level'];
  const away = values['away-level'];
  if (
    !Number.isInteger(games) ||
    games < 1 ||
    !Number.isInteger(baseSeed) ||
    !Number.isInteger(workers) ||
    !isLevel(home) ||
    !isLevel(away)
  ) {
    console.error(
      'Usage: npm run sim -- --games <n> --seed <int> [--workers <n>] [--home-level easy|normal|hard] [--away-level easy|normal|hard] [--strict]',
    );
    process.exit(1);
  }
  const levels: [Difficulty, Difficulty] = [home, away];

  const started = process.hrtime.bigint();
  const seeds = Array.from({ length: games }, (_, i) => baseSeed + i);
  let report: Report;
  if (workers === 1) {
    report = runSeeds({ seeds, levels });
  } else {
    // Deal seeds round-robin so each worker gets a similar mix.
    const chunks: number[][] = Array.from({ length: workers }, () => []);
    seeds.forEach((s, i) => chunks[i % workers]!.push(s));
    const parts = await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<Report>((resolve, reject) => {
            const w = new Worker(new URL(import.meta.url), {
              workerData: { seeds: chunk, levels } satisfies Job,
            });
            w.once('message', resolve);
            w.once('error', reject);
          }),
      ),
    );
    report = parts.reduce((acc, r) => mergeReports(acc, r), createReport());
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const config = makeConfig();
  console.log(
    formatReport(report, config, {
      games,
      baseSeed,
      elapsedMs,
      setup: `${config.teams.runnersPerSide} runners + goalie per side, ${home} vs ${away}, ${workers} worker${workers === 1 ? '' : 's'}`,
    }),
  );

  // Balance thresholds only make sense with the same AI on both sides.
  if (values.strict && home === away && balanceWarnings(report).length > 0) {
    console.error('Balance thresholds broken (see BALANCE WARNINGS above).');
    process.exit(2);
  }
}

/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1 [--workers 8]
 *
 * Runs matches with no renderer and prints a stats report. Each match depends only on
 * its seed, so games are split across worker threads and the results are identical to
 * a single-threaded run.
 */
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { makeConfig } from '../src/sim';
import { createReport, formatReport, mergeReports, recordMatch, type Report } from './report';
import { runMatch, SIM_RUNNERS_PER_SIDE } from './runMatch';

interface Job {
  seeds: number[];
}

function runSeeds(seeds: number[]): Report {
  const config = makeConfig();
  const report = createReport();
  for (const seed of seeds) recordMatch(report, runMatch(config, seed));
  return report;
}

if (!isMainThread) {
  parentPort!.postMessage(runSeeds((workerData as Job).seeds));
} else {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: '100' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
    },
  });
  const games = Number(values.games);
  const baseSeed = Number(values.seed);
  const workers = Math.max(1, Math.min(Number(values.workers), games));
  if (!Number.isInteger(games) || games < 1 || !Number.isInteger(baseSeed) || !Number.isInteger(workers)) {
    console.error('Usage: npm run sim -- --games <n> --seed <int> [--workers <n>]');
    process.exit(1);
  }

  const started = process.hrtime.bigint();
  const seeds = Array.from({ length: games }, (_, i) => baseSeed + i);
  let report: Report;
  if (workers === 1) {
    report = runSeeds(seeds);
  } else {
    // Deal seeds round-robin so each worker gets a similar mix.
    const chunks: number[][] = Array.from({ length: workers }, () => []);
    seeds.forEach((s, i) => chunks[i % workers]!.push(s));
    const parts = await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<Report>((resolve, reject) => {
            const w = new Worker(new URL(import.meta.url), { workerData: { seeds: chunk } satisfies Job });
            w.once('message', resolve);
            w.once('error', reject);
          }),
      ),
    );
    report = parts.reduce((acc, r) => mergeReports(acc, r), createReport());
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  console.log(
    formatReport(report, makeConfig(), {
      games,
      baseSeed,
      elapsedMs,
      setup: `${SIM_RUNNERS_PER_SIDE} runners + goalie per side, ${workers} worker${workers === 1 ? '' : 's'}`,
    }),
  );
}

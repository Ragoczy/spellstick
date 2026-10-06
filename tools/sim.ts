/**
 * Headless AI-vs-AI match runner.
 *
 *   npm run sim -- --games 1000 --seed 1
 *
 * Runs matches with no renderer and prints a stats report.
 */
import { parseArgs } from 'node:util';
import { makeConfig } from '../src/sim';
import { createReport, formatReport, recordMatch } from './report';
import { runMatch } from './runMatch';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '100' },
    seed: { type: 'string', default: '1' },
  },
});

const games = Number(values.games);
const baseSeed = Number(values.seed);
if (!Number.isInteger(games) || games < 1 || !Number.isInteger(baseSeed)) {
  console.error('Usage: npm run sim -- --games <n> --seed <int>');
  process.exit(1);
}

const config = makeConfig();
const report = createReport();
const started = process.hrtime.bigint();
for (let i = 0; i < games; i++) {
  recordMatch(report, runMatch(config, baseSeed + i));
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

console.log(formatReport(report, config, { games, baseSeed, elapsedMs }));

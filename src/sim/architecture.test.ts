import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

/** Strips comments so a doc comment mentioning Math.random() doesn't trip the check. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const importsOf = (src: string): string[] =>
  [...src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)].map(
    (m) => m[1] ?? '',
  );

describe('architecture rules', () => {
  const simFiles = sourceFiles(join(SRC, 'sim'));
  const aiFiles = sourceFiles(join(SRC, 'ai'));

  it('finds the sim sources', () => {
    expect(simFiles.length).toBeGreaterThan(3);
  });

  it.each(simFiles.map((f) => [relative(SRC, f), f]))(
    '%s does not import phaser, render, ui, or ai',
    (_n, f) => {
      for (const spec of importsOf(code(f))) {
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^phaser(\/|$)/);
        expect(spec, `${f} imports ${spec}`).not.toMatch(/(^|\/)(render|ui|ai)(\/|$)/);
      }
    },
  );

  it.each([...simFiles, ...aiFiles].map((f) => [relative(SRC, f), f]))(
    '%s does not use Math.random()',
    (_n, f) => {
      expect(code(f)).not.toMatch(/Math\s*\.\s*random/);
    },
  );

  it.each(aiFiles.map((f) => [relative(SRC, f), f]))('%s does not import phaser, render, or ui', (_n, f) => {
    for (const spec of importsOf(code(f))) {
      expect(spec).not.toMatch(/^phaser(\/|$)/);
      expect(spec).not.toMatch(/(^|\/)(render|ui)(\/|$)/);
    }
  });
});

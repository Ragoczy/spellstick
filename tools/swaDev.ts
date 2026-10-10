/**
 * Runs the built game plus the auth API locally under the Static Web Apps CLI
 * (http://localhost:4280), with the app settings read from the git-ignored .env.
 * `npm run dev:swa` builds both first.
 *
 * Azure Functions runs Node 22 at most (Core Tools 4.15 refuses Node 24), and SWA CLI 2.0.10
 * refuses to start the Functions host on newer Node. So this starts the host itself, with its
 * Node worker pinned to Node 22 (fetched by npx when this machine runs something newer),
 * and points `swa start` at it.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

const SWA_CLI = '@azure/static-web-apps-cli@2.0.10';
const CORE_TOOLS = 'azure-functions-core-tools@4.15.2';
const FUNCTIONS_NODE = '22';
const API_PORT = 7071;
const REQUIRED = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET'];

if (existsSync('.env')) process.loadEnvFile('.env');
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const env: NodeJS.ProcessEnv = { ...process.env, FUNCTIONS_WORKER_RUNTIME: 'node' };
if (Number(process.versions.node.split('.')[0]) > Number(FUNCTIONS_NODE)) {
  console.log(
    `Node ${process.version} is newer than Azure Functions supports; using Node ${FUNCTIONS_NODE} for the API.`,
  );
  env.languageWorkers__node__defaultExecutablePath = execSync(
    `npx --yes -p node@${FUNCTIONS_NODE} node -p process.execPath`,
    { encoding: 'utf8' },
  ).trim();
}

const children: ChildProcess[] = [];
const run = (command: string, cwd = '.') => {
  const child = spawn(command, { cwd, env, stdio: 'inherit', shell: true });
  children.push(child);
  child.on('exit', (code) => {
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
};

run(`npx --yes ${CORE_TOOLS} start --port ${API_PORT}`, 'api');
run(`npx --yes ${SWA_CLI} start spellstick --api-devserver-url http://localhost:${API_PORT}`);

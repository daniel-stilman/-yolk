import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createYolkServer } from '../server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForServer(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

function makeRuntimeDir(prefix = 'yolk-test-flow-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function startTestFlowServer(options = {}) {
  const baseDir = options.baseDir || makeRuntimeDir();
  const cleanup = options.cleanup !== false;
  const instance = await createYolkServer({
    port: Number(options.port ?? 0),
    baseDir,
    sampleMediaDir: path.join(repoRoot, 'sample media'),
    seedDemo: options.seedDemo !== false,
    enableLanDiscovery: false,
    enableNatTraversal: false,
    enableTrackers: false
  });
  try {
    await waitForServer(instance.url);
  } catch (error) {
    await instance.close().catch(() => null);
    if (cleanup) fs.rmSync(baseDir, { recursive: true, force: true });
    throw error;
  }
  let stopped = false;
  return {
    baseDir,
    baseUrl: instance.url,
    async stop() {
      if (stopped) return;
      stopped = true;
      await instance.close();
      if (cleanup) fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };
}

function parseArgs(argv) {
  const args = { open: false, port: 4173 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--open') args.open = true;
    else if (value === '--port' && argv[index + 1]) {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else if (value.startsWith('--port=')) {
      args.port = Number(value.slice('--port='.length));
    }
  }
  return args;
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return;
    }
    if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
    const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {}
}

if (process.argv[1] === __filename) {
  const options = parseArgs(process.argv.slice(2));
  const runner = await startTestFlowServer({ port: options.port });
  console.log(`Yolk test-flow app running at ${runner.baseUrl}`);
  console.log(`Runtime dir: ${runner.baseDir}`);
  console.log('Press Ctrl+C to stop.');
  if (options.open) openBrowser(runner.baseUrl);

  const shutdown = async () => {
    await runner.stop().catch(() => null);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Runs a check module through Vite's SSR pipeline, so prototype TypeScript
 * (including its `.js` → `.ts` import style) can run headlessly in Node.
 *
 * Usage: node scripts/headless-check.mjs src/game/proto/checks/multi-car.ts
 *
 * The module must export `run(): Promise<boolean> | boolean` — true = FAILED.
 */
import { createServer } from 'vite';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/headless-check.mjs <check-module.ts>');
  process.exit(2);
}

const server = await createServer({
  configFile: false,
  logLevel: 'warn',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const path = entry.startsWith('/') ? entry : `/${entry}`;
  const mod = await server.ssrLoadModule(path);
  if (typeof mod.run !== 'function') {
    throw new Error(`${entry} must export a run() function`);
  }
  const failed = await mod.run();
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}

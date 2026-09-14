import { spawnSync } from 'node:child_process';
import { nextBuildNumber } from './build-number.js';

function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const buildNumber = await nextBuildNumber();
run('tsc', ['-b']);
run('vite', ['build'], { ...process.env, ORAKEL_BUILD_NUMBER: buildNumber });

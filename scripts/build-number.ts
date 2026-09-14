import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function nextBuildNumber(): Promise<string> {
  const explicit = process.env.ORAKEL_BUILD_NUMBER?.trim();
  if (explicit && /^\d+$/.test(explicit)) return explicit;

  const statePath = path.resolve('.orakel-build-number');
  let current = 0;
  try {
    current = Number.parseInt(await readFile(statePath, 'utf8'), 10) || 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const next = current + 1;
  await writeFile(statePath, `${next}\n`, { mode: 0o600 });
  return String(next);
}

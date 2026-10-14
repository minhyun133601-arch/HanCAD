import fs from 'node:fs/promises';
import path from 'node:path';

/** Node deadlines remain effective when the browser main thread is blocked. */
export async function deadline(label, operation, timeoutMs = 30000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createProgress(output, result) {
  const started = Date.now();
  result.checkpoints = [];
  result.status = 'running';
  async function save() {
    result.updatedAt = new Date().toISOString();
    await deadline(
      'Save benchmark diagnostics',
      () =>
        Promise.all([
          fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)),
          fs.writeFile(
            path.join(output, 'progress.json'),
            JSON.stringify(
              {
                status: result.status,
                elapsedMs: Date.now() - started,
                stage: result.checkpoints.at(-1),
                samples: result.samples,
                error: result.error,
              },
              null,
              2,
            ),
          ),
        ]),
      10000,
    );
  }
  async function step(label, operation, timeoutMs = 30000) {
    const checkpoint = { name: label, status: 'running', startedAt: new Date().toISOString() };
    result.checkpoints.push(checkpoint);
    console.log(`[benchmark] ${label}: start`);
    await save();
    const tick = Date.now();
    try {
      const value = await deadline(label, operation, timeoutMs);
      checkpoint.status = 'passed';
      checkpoint.elapsedMs = Date.now() - tick;
      await save();
      console.log(`[benchmark] ${label}: passed (${checkpoint.elapsedMs}ms)`);
      return value;
    } catch (error) {
      checkpoint.status = 'failed';
      checkpoint.elapsedMs = Date.now() - tick;
      checkpoint.error = String(error?.stack ?? error);
      result.status = 'failed';
      result.error = checkpoint.error;
      await save();
      console.error(`[benchmark] ${label}: failed (${checkpoint.elapsedMs}ms)`);
      throw error;
    }
  }
  return { save, step };
}

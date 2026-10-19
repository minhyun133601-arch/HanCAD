import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { requireFreeNativePort } from '../scripts/native-acceptance-runtime.mjs';

test('native acceptance rejects an occupied CDP port without disturbing its owner', async () => {
  const owner = createServer();
  await new Promise((resolve) => owner.listen(0, '127.0.0.1', resolve));
  const port = owner.address().port;
  try {
    await assert.rejects(requireFreeNativePort(port), /requires a free local CDP port/);
    assert.equal(owner.listening, true);
  } finally {
    await new Promise((resolve) => owner.close(resolve));
  }
  await requireFreeNativePort(port);
});

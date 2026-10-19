import assert from 'node:assert/strict';

/** Real native WebView pointer acquisition; the owning runner checks the complete U/REDO graph. */
export async function verifyNativeQuickTrim(qa, page, { fresh, capture, undoRedo }) {
  const { enter, drawing, mapping, point, idle, assertPoint } = qa;
  await fresh([
    'TRIMEXTENDMODE',
    '1',
    'EDGEMODE',
    '0',
    'L',
    '0,0',
    '100,0',
    '',
    'L',
    '20,-20',
    '20,40',
    '',
    'L',
    '70,-20',
    '70,40',
    '',
    'L',
    '30,20',
    '50,20',
    '',
  ]);
  const before = await drawing(page),
    view = await mapping(page);
  await enter(page, 'TRIM');
  await point(page, view, 40, -5, false);
  await page.mouse.down();
  try {
    await point(page, view, 40, 5, false);
    await capture('quick-trim-drag-fence-in-progress');
  } finally {
    await page.mouse.up();
  }
  await page.keyboard.down('Shift');
  try {
    await point(page, view, 49, 20, false);
    await capture('quick-trim-shift-extend-provisional');
    await point(page, view, 49, 20);
  } finally {
    await page.keyboard.up('Shift');
  }
  assert.deepEqual(
    (await drawing(page)).entities,
    before.entities,
    'TRIM fence and Shift extension remain provisional until the command ends',
  );
  await enter(page, '');
  await idle(page);
  const result = (await drawing(page)).entities,
    fragments = result.filter((entity) => entity.type === 'line' && entity.a.y === 0);
  assert.equal(result.length, 5);
  assert.equal(fragments.length, 2);
  assert.deepEqual(
    fragments.map((entity) => [entity.a.x, entity.b.x]).sort((a, b) => a[0] - b[0]),
    [
      [0, 20],
      [70, 100],
    ],
    'Dragging the fence removes the bounded middle segment',
  );
  for (const original of before.entities.slice(1, 3))
    assert.deepEqual(
      result.find((entity) => entity.id === original.id),
      original,
    );
  const extended = result.find((entity) => entity.id === before.entities[3].id);
  assertPoint(extended.a, { x: 30, y: -20 });
  assertPoint(extended.b, { x: 70, y: -20 });
  await undoRedo('native-quick-trim-drag-fence-shift-extend', before);
}

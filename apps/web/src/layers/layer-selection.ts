import type { LayerHost } from './layer-host';

export function selectedLayerNames(host: LayerHost, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return [
    ...new Set([
      ...host
        .getState()
        .entities.filter((entity) => wanted.has(entity.id))
        .map((entity) => entity.layer),
      ...ids.flatMap((id) => {
        const layer = host.getEntityLayer?.(id);
        return layer ? [layer] : [];
      }),
    ]),
  ];
}

import type { CadEntity } from '@hancad/legacy-bridge';
import { entityProperties, propertyTypeLabel } from './entity-properties';

export function rolloverProperties(
  entity: CadEntity,
  korean: boolean,
): { label: string; value: string }[] {
  return entityProperties([entity])
    .filter((property) => ['type', 'color', 'layer', 'linetype'].includes(property.key))
    .map((property) => ({
      label: korean ? property.ko : property.en,
      value: property.key === 'type' ? propertyTypeLabel(property.value, korean) : property.value,
    }));
}

export function RolloverProperties({
  entity,
  korean,
  screen,
}: {
  entity: CadEntity;
  korean: boolean;
  screen: { x: number; y: number };
}) {
  return (
    <aside
      className="properties-rollover"
      role="tooltip"
      data-testid="rollover-properties"
      style={{ left: screen.x + 18, top: screen.y + 20 }}
    >
      {rolloverProperties(entity, korean).map((property) => (
        <div key={property.label}>
          <span>{property.label}</span>
          <span>{property.value}</span>
        </div>
      ))}
    </aside>
  );
}

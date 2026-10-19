import type { CadEntity } from '@hancad/legacy-bridge';
import type { DrawRequest } from './draw-program';

const names: Record<string, [ko: string, en: string]> = {
  COLOR: ['색상', 'color'],
  LAYER: ['도면층 이름', 'layer name'],
  LTYPE: ['선종류 이름', 'linetype name'],
  LTSCALE: ['선종류 축척 비율', 'linetype scale factor'],
  LWEIGHT: ['선가중치', 'lineweight'],
  THICKNESS: ['두께', 'thickness'],
  TRANSPARENCY: ['투명도', 'transparency'],
  ELEV: ['고도', 'elevation'],
  MATERIAL: ['재료 이름', 'material name'],
  PLOTSTYLE: ['플롯 스타일 이름', 'plot style name'],
  ANNOTATIVE: ['주석 특성', 'annotative property'],
};
function value(entity: CadEntity, property: string): string {
  if (property === 'COLOR')
    return entity.trueColor === undefined
      ? entity.aci === 256 || entity.aci === undefined
        ? 'ByLayer'
        : entity.aci === 0
          ? 'ByBlock'
          : String(entity.aci)
      : `${entity.trueColor >> 16},${(entity.trueColor >> 8) & 255},${entity.trueColor & 255}`;
  if (property === 'LAYER') return entity.layer;
  if (property === 'LTYPE') return entity.linetype ?? 'ByLayer';
  if (property === 'LTSCALE') return String(entity.linetypeScale ?? 1);
  if (property === 'LWEIGHT')
    return entity.lineweight === undefined || entity.lineweight === -1
      ? 'ByLayer'
      : entity.lineweight === -2
        ? 'ByBlock'
        : entity.lineweight === -3
          ? 'Default'
          : (entity.lineweight / 100).toFixed(2);
  if (property === 'THICKNESS') return String(entity.thickness ?? 0);
  if (property === 'TRANSPARENCY') return String(entity.transparency ?? 'ByLayer');
  if (property === 'MATERIAL') return entity.material ?? 'ByLayer';
  if (property === 'PLOTSTYLE') return entity.plotStyle ?? 'ByLayer';
  if (property === 'ANNOTATIVE') return entity.annotative ? 'Yes' : 'No';
  return '0';
}
export function propertyValuePrompt(
  entities: readonly CadEntity[],
  property: string,
): Pick<DrawRequest, 'ko' | 'en'> {
  const [ko, en] = names[property] ?? [property, property.toLowerCase()],
    values = entities.map((entity) => value(entity, property)),
    current = values.every((value) => value === values[0]) ? (values[0] ?? '') : '*VARIES*';
  return {
    ko: `새 ${ko} 입력${property === 'COLOR' ? ' [트루컬러(T)/색상표(CO)]' : property === 'ANNOTATIVE' ? ' [예(Y)/아니오(N)]' : ''} <${current}>:`,
    en: `Enter new ${en}${property === 'COLOR' ? ' [Truecolor/COlorbook]' : property === 'ANNOTATIVE' ? ' [Yes/No]' : ''} <${current}>:`,
  };
}

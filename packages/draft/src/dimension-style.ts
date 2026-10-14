import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadDimension, CadDimensionGeometry, CadSettings } from '@hancad/legacy-bridge';
import { draftEntityBase } from './entities';

/** Model-space subset: DIMSCALE=0 resolves to 1; annotative layouts are not implemented. */
export function dimensionSettingsFromVariables(
  settings: CadSettings,
  getNumber: (name: string) => number,
  getText?: (name: string) => string,
): CadSettings {
  return {
    ...settings,
    dimScale: getNumber('DIMSCALE') || 1,
    dimTextSize: getNumber('DIMTXT') || 2.5,
    arrowSize: getNumber('DIMASZ'),
    dimPrecision: getNumber('DIMDEC'),
    extensionGap: getNumber('DIMEXO'),
    extensionOvershoot: getNumber('DIMEXE'),
    dimGap: getNumber('DIMGAP'),
    dimMeasurementFactor: getNumber('DIMLFAC'),
    dimZeroSuppression: getNumber('DIMZIN'),
    dimPost: getText?.('DIMPOST') ?? settings.dimPost ?? '',
  };
}

export function dimensionEntity(
  settings: CadSettings,
  definition: Partial<CadDimension> & Pick<CadDimension, 'kind'>,
  id?: string,
): CadDimension {
  return {
    ...draftEntityBase(settings, id),
    type: 'dimension',
    precision: settings.dimPrecision,
    dimScale: settings.dimScale || 1,
    textSize: settings.dimTextSize || 2.5,
    arrowSize: settings.arrowSize,
    extensionGap: settings.extensionGap,
    extensionOvershoot: settings.extensionOvershoot,
    unit: settings.dimUnit,
    ...(settings.dimGap === undefined ? {} : { textGap: settings.dimGap }),
    ...(settings.dimMeasurementFactor === undefined
      ? {}
      : { measurementFactor: settings.dimMeasurementFactor }),
    ...(settings.dimZeroSuppression === undefined
      ? {}
      : { zeroSuppression: settings.dimZeroSuppression }),
    ...(settings.dimPost ? { post: settings.dimPost } : {}),
    ...definition,
  };
}

export function dimensionGeometry(entity: CadDimension): CadDimensionGeometry | null {
  return getLegacyRuntime().core.cadEngine.dimensionGeometry(entity);
}

export function applyDimensionStyle(entity: CadDimension, settings: CadSettings): CadDimension {
  const styled = dimensionEntity(settings, { kind: entity.kind });
  return {
    ...entity,
    precision: styled.precision,
    dimScale: styled.dimScale,
    textSize: styled.textSize,
    arrowSize: styled.arrowSize,
    extensionGap: styled.extensionGap,
    extensionOvershoot: styled.extensionOvershoot,
    unit: styled.unit,
    ...(styled.textGap === undefined ? {} : { textGap: styled.textGap }),
    ...(styled.measurementFactor === undefined
      ? {}
      : { measurementFactor: styled.measurementFactor }),
    ...(styled.zeroSuppression === undefined ? {} : { zeroSuppression: styled.zeroSuppression }),
    post: styled.post ?? '',
  };
}

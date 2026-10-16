/**
 * Number formatting shared by DIESEL rtos/angtos (AutoLISP rtos/angtos semantics).
 * Linear modes: 1 scientific, 2 decimal, 3 engineering, 4 architectural, 5 fractional.
 * Angular modes: 0 degrees, 1 deg/min/sec, 2 grads, 3 radians, 4 surveyor's units.
 */
function fixed(value: number, precision: number): string {
  const text = value.toFixed(Math.max(0, Math.min(8, precision)));
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

function fraction(value: number, precision: number): { whole: number; text: string } {
  const denominator = 2 ** Math.max(0, Math.min(8, precision));
  let units = Math.round(Math.abs(value) * denominator);
  let whole = Math.floor(units / denominator);
  units -= whole * denominator;
  let bottom = denominator;
  while (units > 0 && units % 2 === 0) {
    units /= 2;
    bottom /= 2;
  }
  if (units === 0) return { whole, text: '' };
  if (units === bottom) whole += 1;
  return { whole, text: `${units}/${bottom}` };
}

export function formatLinear(value: number, mode: number, precision: number): string {
  const sign = value < 0 ? '-' : '';
  switch (mode) {
    case 1: {
      const [mantissa = '0', exponent = '0'] = Math.abs(value)
        .toExponential(Math.max(0, Math.min(8, precision)))
        .split('e');
      const power = Number(exponent);
      return `${sign}${mantissa}E${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`;
    }
    case 3: {
      const feet = Math.floor(Math.abs(value) / 12);
      const inches = Math.abs(value) - feet * 12;
      return `${sign}${feet}'-${fixed(inches, precision)}"`;
    }
    case 4: {
      const total = Math.abs(value);
      const feet = Math.floor(total / 12);
      const { whole, text } = fraction(total - feet * 12, precision);
      const inches = whole === 12 ? 0 : whole;
      const carried = whole === 12 ? feet + 1 : feet;
      return `${sign}${carried}'-${inches}${text ? ` ${text}` : ''}"`;
    }
    case 5: {
      const { whole, text } = fraction(value, precision);
      return `${sign}${whole}${text ? ` ${text}` : ''}`;
    }
    default:
      return fixed(value, precision);
  }
}

export function formatAngle(radians: number, mode: number, precision: number): string {
  const degrees = (radians * 180) / Math.PI;
  switch (mode) {
    case 1:
    case 4: {
      const normalized = ((degrees % 360) + 360) % 360;
      if (mode === 4) return surveyor(normalized, precision);
      return dms(normalized, precision);
    }
    case 2:
      return `${fixed((degrees * 400) / 360, precision)}g`;
    case 3:
      return `${fixed(radians, precision)}r`;
    default:
      return fixed(degrees, precision);
  }
}

function dms(degrees: number, precision: number): string {
  let whole = Math.floor(degrees);
  let minutes = Math.floor((degrees - whole) * 60);
  let seconds = (degrees - whole - minutes / 60) * 3600;
  if (precision <= 0) return `${Math.round(degrees)}d`;
  if (precision <= 2) {
    minutes = Math.round((degrees - whole) * 60);
    if (minutes === 60) [whole, minutes] = [whole + 1, 0];
    return `${whole}d${minutes}'`;
  }
  const decimals = Math.max(0, precision - 4);
  if (Number(seconds.toFixed(decimals)) >= 60) [minutes, seconds] = [minutes + 1, 0];
  if (minutes === 60) [whole, minutes] = [whole + 1, 0];
  return `${whole}d${minutes}'${seconds.toFixed(decimals)}"`;
}

function surveyor(degrees: number, precision: number): string {
  // Bearings are measured from north or south toward east or west.
  if (Math.abs(degrees - 90) < 1e-9) return 'E';
  if (Math.abs(degrees - 270) < 1e-9) return 'W';
  if (Math.abs(degrees) < 1e-9 || Math.abs(degrees - 360) < 1e-9) return 'N';
  if (Math.abs(degrees - 180) < 1e-9) return 'S';
  const north = degrees < 180;
  const east = degrees < 90 || degrees > 270;
  const offset = north ? Math.abs(90 - degrees) : Math.abs(270 - degrees);
  return `${north ? 'N' : 'S'} ${dms(offset, Math.max(precision, 1))} ${east ? 'E' : 'W'}`;
}

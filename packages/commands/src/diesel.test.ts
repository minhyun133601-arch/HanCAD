import { describe, expect, it } from 'vitest';
import { localJulianDate } from '../../sysvars/src/clock';
import { evaluateDiesel } from './diesel';
import type { DieselHost } from './diesel';

const variables: Record<string, string> = {
  THICKNESS: '5',
  HPANG: '15.5',
  USERR1: '10',
  USERS1: '0',
  CLAYER: '0',
  VIEWCTR: '1.5,2.5,0',
  SNAPMODE: '1',
};
const host: DieselHost = {
  getvar: (name) => variables[name.toUpperCase()],
  getenv: (name) => (name === 'HOME' ? 'C:\\Users\\cad' : undefined),
  units: () => ({ lunits: 2, luprec: 4, aunits: 0, auprec: 0 }),
  now: () => new Date(1998, 8, 5, 4, 53, 7, 250),
};
const run = (source: string) => evaluateDiesel(source, host);

describe('DIESEL evaluation', () => {
  it('reproduces the Autodesk reference examples', () => {
    expect(run('$(+, $(getvar, thickness), 10)')).toBe('15');
    expect(run('$(<, $(getvar, hpang), $(getvar, userr1))')).toBe('0');
    expect(run('$(eq, $(getvar, users1), $(getvar, clayer))')).toBe('1');
    expect(run('$(edtime,0,DDD"," DD MON YYYY - H:MMam/pm)')).toBe('Sat, 05 Sep 1998 - 4:53am');
  });

  it('passes literal text through and evaluates nested calls', () => {
    expect(run('Snap $(if,$(getvar,snapmode),ON,OFF) / $(upper,layer)')).toBe('Snap ON / LAYER');
    expect(run('$(if,0,yes)')).toBe('');
    expect(run('$(nth,1,a,b,c)')).toBe('b');
    expect(run('$(index,1,$(getvar,viewctr))')).toBe('2.5');
    expect(run('$(strlen,HanCAD)')).toBe('6');
    expect(run('$(substr,ABCDEF,2,3)')).toBe('BCD');
    expect(run('$(substr,ABCDEF,4)')).toBe('DEF');
    expect(run('$(fix,-3.9)')).toBe('-3');
    expect(run('$(-,10,2.5,0.5)')).toBe('7');
    expect(run('$(/,1,4)')).toBe('0.25');
    expect(run('$(*,0.1,3)')).toBe('0.3');
    expect(run('$(and,6,3)$(or,4,1)$(xor,5,1)')).toBe('254');
    expect(run('$(eval,$(upper,"$")(+,1,2))')).toBe('3');
    expect(run('$(getenv,HOME)|$(getenv,NOPE)|$(getvar,NOPE)')).toBe('C:\\Users\\cad||');
  });

  it('keeps quoted text literal, including quote marks written twice', () => {
    expect(run('"$(if,1,True,False)="""$(if,1,True,False)""""')).toBe('$(if,1,True,False)="True"');
    expect(run('$(strlen,"a,b")')).toBe('3');
  });

  it('formats linear and angular values like rtos and angtos', () => {
    expect(run('$(rtos,12.5)')).toBe('12.5000');
    expect(run('$(rtos,1234.56,1,3)')).toBe('1.235E+03');
    expect(run('$(rtos,30.5,3,2)')).toBe('2\'-6.50"');
    expect(run('$(rtos,30.5,4,2)')).toBe('2\'-6 1/2"');
    expect(run('$(rtos,1.75,5,4)')).toBe('1 3/4');
    expect(run('$(angtos,0.785398163)')).toBe('45');
    expect(run('$(angtos,0.785398163,0,2)')).toBe('45.00');
    expect(run('$(angtos,0.785398163,1,4)')).toBe('45d0\'0"');
    expect(run('$(angtos,0.785398163,2,2)')).toBe('50.00g');
    expect(run('$(angtos,0.785398163,3,2)')).toBe('0.79r');
    expect(run('$(angtos,0.785398163,4,2)')).toBe("N 45d0' E");
  });

  it('embeds AutoCAD error indications', () => {
    expect(run('$(+,1')).toBe('$?');
    expect(run('"unterminated')).toBe('$?');
    expect(run('$(foo,1)')).toBe('$(foo)??');
    expect(run('$(/,1,0)')).toBe('$(/,??)');
    expect(run('$(eq,1)')).toBe('$(eq,??)');
    expect(run('$(+,1,2,3,4,5,6,7,8,9)')).toBe('45');
    expect(run('$(+,1,2,3,4,5,6,7,8,9,10)')).toBe('$(+,??)');
    expect(run(`$(strlen,${'x'.repeat(10)})${'y'.repeat(5000)}`)).toBe('$(++)');
  });

  it('reads DATE-style local Julian dates on the wall clock', () => {
    const date = localJulianDate(new Date(2026, 9, 16, 13, 5, 9));
    expect(run(`$(edtime,${date},YYYY-MO-DD HH:MM:SS DDDD MONTH)`)).toBe(
      '2026-10-16 13:05:09 Friday October',
    );
    expect(run(`$(edtime,${date},H:MM AM/PM)`)).toBe('1:05 PM');
  });
});

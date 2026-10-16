import { describe, expect, it } from 'vitest';
import { parseMacro } from './macro';

describe('menu macros', () => {
  it('cancels twice, types the command and adds the automatic trailing space', () => {
    expect(parseMacro('^C^C_LINE')).toEqual({
      repeat: false,
      steps: [
        { type: 'cancel' },
        { type: 'cancel' },
        { type: 'text', text: '_LINE' },
        { type: 'space' },
      ],
    });
  });

  it('keeps transparent prefixes and spaces between options', () => {
    expect(parseMacro("'_zoom _e").steps).toEqual([
      { type: 'text', text: "'_zoom" },
      { type: 'space' },
      { type: 'text', text: '_e' },
      { type: 'space' },
    ]);
  });

  it('does not add a space after ;, \\, a control character or ^Z', () => {
    expect(parseMacro('^C^C_CIRCLE;\\').steps.at(-1)).toEqual({ type: 'pause' });
    expect(parseMacro('^C^C_LINE;0,0;').steps.at(-1)).toEqual({ type: 'enter' });
    expect(parseMacro('_ORTHOMODE;1^O').steps.at(-1)).toEqual({ type: 'toggle', key: 'O' });
    expect(parseMacro('_TEXT^Z').steps).toEqual([{ type: 'text', text: '_TEXT' }]);
  });

  it('recognizes repetition, control characters and DIESEL expressions', () => {
    const repeated = parseMacro('*^C^C_MOVE');
    expect(repeated.repeat).toBe(true);
    expect(repeated.steps[0]).toEqual({ type: 'cancel' });
    expect(parseMacro('^B^D^E^G^T^H^I^M^P^Q^V').steps.map((step) => step.type)).toEqual([
      'toggle',
      'toggle',
      'toggle',
      'toggle',
      'toggle',
      'backspace',
      'tab',
      'enter',
      'menuecho',
      'quiet',
      'unsupported',
    ]);
    expect(parseMacro('^C^C-insert;note;0,0;$M=$(*,$(getvar,dimscale),0.5);;0;').steps).toEqual([
      { type: 'cancel' },
      { type: 'cancel' },
      { type: 'text', text: '-insert' },
      { type: 'enter' },
      { type: 'text', text: 'note' },
      { type: 'enter' },
      { type: 'text', text: '0,0' },
      { type: 'enter' },
      { type: 'diesel', expression: '$(*,$(getvar,dimscale),0.5)' },
      { type: 'enter' },
      { type: 'enter' },
      { type: 'text', text: '0' },
      { type: 'enter' },
    ]);
    expect(parseMacro('^C^C^P$M=$(if,$(=,$(getvar,cvport),1),mspace,pspace)').steps.at(-1)).toEqual(
      { type: 'space' },
    );
  });
});

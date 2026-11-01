import { describe, expect, it } from 'vitest';
import { generateText } from '../src/plc/textgen';
import { scenarioLogic } from '../src/scenarios/logic';
import { motor } from '../src/scenarios/motor/logic';
import { tank } from '../src/scenarios/tank/logic';

describe('text generation', () => {
  it.each(scenarioLogic.map((s) => [s.id, s] as const))('%s generates both dialects', (_, s) => {
    for (const d of ['ab', 'siemens'] as const) {
      const text = generateText(s.program, d);
      expect(text.split('// Rung').length + text.split('// Network').length - 2).toBe(s.program.rungs.length);
    }
  });

  it('seal-in rung becomes a single assignment', () => {
    expect(generateText(motor.program, 'ab')).toContain(
      'Run_Cmd := (Start_PB OR Run_Cmd) AND Stop_PB AND EStop_OK AND NOT Fault_Active;',
    );
    expect(generateText(motor.program, 'siemens')).toContain(
      '"Run_Cmd" := ("Start_PB" OR "Run_Cmd") AND "Stop_PB" AND "EStop_OK" AND NOT "Fault_Active";',
    );
  });

  it('timers map to TONR / IEC TON', () => {
    expect(generateText(motor.program, 'ab')).toContain('TONR(FB_TMR);');
    expect(generateText(motor.program, 'siemens')).toContain('"FB_TMR".TON(IN := "Run_Cmd" AND NOT "Motor_Aux", PT := T#1S);');
  });

  it('analog scaling uses NORM_X / SCALE_X in SCL and REAL literals in compares', () => {
    const scl = generateText(tank.program, 'siemens');
    expect(scl).toContain('SCALE_X(MIN := 0.0, VALUE := NORM_X(MIN := 0, VALUE := "Level_Raw", MAX := 27648), MAX := 100.0)');
    expect(scl).toContain('("Level_Pct" >= 70.0)');
  });
});

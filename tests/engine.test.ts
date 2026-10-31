import { describe, expect, it } from 'vitest';
import { Plc } from '../src/plc/scan';
import type { Element, TagDef } from '../src/plc/types';

const bool = (name: string, initial = false): TagDef => ({ name, type: 'BOOL', initial });
const num = (name: string, initial = 0, type: 'INT' | 'REAL' = 'INT'): TagDef => ({ name, type, initial });

function plc(tags: TagDef[], ...rungs: Element[][]): Plc {
  return new Plc({ tags, rungs: rungs.map((elements) => ({ elements })) });
}

function scans(p: Plc, n: number) {
  for (let i = 0; i < n; i++) p.scan(10);
}

describe('contacts and coils', () => {
  it('XIC / XIO / OTE', () => {
    const p = plc([bool('A'), bool('B'), bool('Q')], [
      { op: 'XIC', tag: 'A' },
      { op: 'XIO', tag: 'B' },
      { op: 'OTE', tag: 'Q' },
    ]);
    p.scan();
    expect(p.mem.get('Q')).toBe(false);
    p.mem.set('A', true);
    p.scan();
    expect(p.mem.get('Q')).toBe(true);
    p.mem.set('B', true);
    p.scan();
    expect(p.mem.get('Q')).toBe(false);
  });

  it('OTL / OTU retain state', () => {
    const p = plc(
      [bool('S'), bool('R'), bool('Q')],
      [{ op: 'XIC', tag: 'S' }, { op: 'OTL', tag: 'Q' }],
      [{ op: 'XIC', tag: 'R' }, { op: 'OTU', tag: 'Q' }],
    );
    p.mem.set('S', true);
    p.scan();
    p.mem.set('S', false);
    p.scan();
    expect(p.mem.get('Q')).toBe(true);
    p.mem.set('R', true);
    p.scan();
    expect(p.mem.get('Q')).toBe(false);
  });

  it('seal-in circuit with parallel branch', () => {
    const p = plc([bool('Start'), bool('Stop', true), bool('Run')], [
      { op: 'BRANCH', branches: [[{ op: 'XIC', tag: 'Start' }], [{ op: 'XIC', tag: 'Run' }]] },
      { op: 'XIC', tag: 'Stop' },
      { op: 'OTE', tag: 'Run' },
    ]);
    p.mem.set('Start', true);
    p.scan();
    p.mem.set('Start', false);
    p.scan();
    expect(p.mem.get('Run')).toBe(true);
    p.mem.set('Stop', false); // NC stop pressed
    p.scan();
    expect(p.mem.get('Run')).toBe(false);
  });

  it('ONS passes exactly one scan per rising edge', () => {
    const p = plc([bool('In'), bool('Os'), num('N')], [
      { op: 'XIC', tag: 'In' },
      { op: 'ONS', tag: 'Os' },
      { op: 'ADD', a: 'N', b: 1, dest: 'N' },
    ]);
    p.mem.set('In', true);
    scans(p, 5);
    expect(p.mem.get('N')).toBe(1);
    p.mem.set('In', false);
    p.scan();
    p.mem.set('In', true);
    scans(p, 3);
    expect(p.mem.get('N')).toBe(2);
  });

  it('records power flow per element', () => {
    const a: Element = { op: 'XIC', tag: 'A' };
    const q: Element = { op: 'OTE', tag: 'Q' };
    const p = plc([bool('A', true), bool('Q')], [a, q]);
    p.scan();
    expect(p.flow.get(a)).toEqual({ in: true, out: true, state: true });
    expect(p.rungOut[0]).toBe(true);
  });
});

describe('timers', () => {
  const tmr = (type: 'TON' | 'TOF' | 'RTO'): Element[] => [{ op: 'XIC', tag: 'In' }, { op: type, tag: 'T' }];
  const tags = (): TagDef[] => [bool('In'), { name: 'T', type: 'TIMER', preset: 100 }];

  it('TON times while true, resets when false', () => {
    const p = plc(tags(), tmr('TON'));
    p.mem.set('In', true);
    scans(p, 9);
    expect(p.mem.get('T.DN')).toBe(false);
    expect(p.mem.get('T.TT')).toBe(true);
    p.scan();
    expect(p.mem.get('T.DN')).toBe(true);
    expect(p.mem.get('T.ACC')).toBe(100);
    p.mem.set('In', false);
    p.scan();
    expect(p.mem.get('T.DN')).toBe(false);
    expect(p.mem.get('T.ACC')).toBe(0);
  });

  it('TOF holds DN for preset after rung goes false', () => {
    const p = plc(tags(), tmr('TOF'));
    p.mem.set('In', true);
    p.scan();
    expect(p.mem.get('T.DN')).toBe(true);
    p.mem.set('In', false);
    scans(p, 9);
    expect(p.mem.get('T.DN')).toBe(true);
    p.scan();
    expect(p.mem.get('T.DN')).toBe(false);
  });

  it('RTO retains ACC until RES', () => {
    const p = plc(tags().concat(bool('R')), tmr('RTO'), [{ op: 'XIC', tag: 'R' }, { op: 'RES', tag: 'T' }]);
    p.mem.set('In', true);
    scans(p, 5);
    p.mem.set('In', false);
    scans(p, 5);
    expect(p.mem.get('T.ACC')).toBe(50);
    p.mem.set('In', true);
    scans(p, 5);
    expect(p.mem.get('T.DN')).toBe(true);
    p.mem.set('R', true);
    p.scan();
    expect(p.mem.get('T.ACC')).toBe(0);
    expect(p.mem.get('T.DN')).toBe(false);
  });
});

describe('counters', () => {
  it('CTU counts rising edges, RES clears', () => {
    const p = plc(
      [bool('In'), bool('R'), { name: 'C', type: 'COUNTER', preset: 3 }],
      [{ op: 'XIC', tag: 'In' }, { op: 'CTU', tag: 'C' }],
      [{ op: 'XIC', tag: 'R' }, { op: 'RES', tag: 'C' }],
    );
    for (let i = 0; i < 3; i++) {
      p.mem.set('In', true);
      scans(p, 3);
      p.mem.set('In', false);
      p.scan();
    }
    expect(p.mem.get('C.ACC')).toBe(3);
    expect(p.mem.get('C.DN')).toBe(true);
    p.mem.set('R', true);
    p.scan();
    expect(p.mem.get('C.ACC')).toBe(0);
    expect(p.mem.get('C.DN')).toBe(false);
  });

  it('CTD counts down', () => {
    const p = plc([bool('In'), { name: 'C', type: 'COUNTER', preset: 0 }], [{ op: 'XIC', tag: 'In' }, { op: 'CTD', tag: 'C' }]);
    p.mem.set('In', true);
    p.scan();
    expect(p.mem.get('C.ACC')).toBe(-1);
    expect(p.mem.get('C.DN')).toBe(false);
  });
});

describe('compare, move, math, scale', () => {
  it('compares gate the rung', () => {
    const ops = ['EQU', 'NEQ', 'GRT', 'GEQ', 'LES', 'LEQ'] as const;
    const expected = [false, true, true, true, false, false]; // 5 vs 3
    ops.forEach((op, i) => {
      const p = plc([num('X', 5), bool('Q')], [{ op, a: 'X', b: 3 }, { op: 'OTE', tag: 'Q' }]);
      p.scan();
      expect(p.mem.get('Q'), op).toBe(expected[i]);
    });
  });

  it('MOV and math only execute on a true rung', () => {
    const p = plc([bool('En'), num('A', 7), num('B'), num('C')], [
      { op: 'XIC', tag: 'En' },
      { op: 'BRANCH', branches: [[{ op: 'MOV', src: 'A', dest: 'B' }], [{ op: 'MUL', a: 'A', b: 3, dest: 'C' }]] },
    ]);
    p.scan();
    expect(p.mem.get('B')).toBe(0);
    p.mem.set('En', true);
    p.scan();
    expect(p.mem.get('B')).toBe(7);
    expect(p.mem.get('C')).toBe(21);
  });

  it('DIV by zero leaves dest unchanged; INT rounds', () => {
    const p = plc([num('Q', 4), num('Z', 0)], [{ op: 'DIV', a: 10, b: 'Z', dest: 'Q' }]);
    p.scan();
    expect(p.mem.get('Q')).toBe(4);
    p.mem.set('Z', 4);
    p.scan();
    expect(p.mem.get('Q')).toBe(3); // 2.5 rounds to 3
  });

  it('SCP scales raw analog counts to engineering units', () => {
    const p = plc([num('Raw', 13824), num('Pct', 0, 'REAL')], [
      { op: 'SCP', input: 'Raw', inMin: 0, inMax: 27648, outMin: 0, outMax: 100, dest: 'Pct' },
    ]);
    p.scan();
    expect(p.mem.get('Pct')).toBe(50);
  });
});

describe('scan order', () => {
  it('a later rung sees an earlier rung’s result in the same scan', () => {
    const p = plc(
      [bool('A', true), bool('B'), bool('C')],
      [{ op: 'XIC', tag: 'A' }, { op: 'OTE', tag: 'B' }],
      [{ op: 'XIC', tag: 'B' }, { op: 'OTE', tag: 'C' }],
    );
    p.scan();
    expect(p.mem.get('C')).toBe(true);
  });

  it('an earlier rung sees a later rung’s result one scan late', () => {
    const p = plc(
      [bool('A', true), bool('B'), bool('C')],
      [{ op: 'XIC', tag: 'B' }, { op: 'OTE', tag: 'C' }],
      [{ op: 'XIC', tag: 'A' }, { op: 'OTE', tag: 'B' }],
    );
    p.scan();
    expect(p.mem.get('C')).toBe(false);
    p.scan();
    expect(p.mem.get('C')).toBe(true);
  });
});

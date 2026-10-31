import { Memory } from './memory';
import type { CompareOp, Element, Instruction, MathOp, Program, Rung } from './types';

/** Power flow of one element during the last scan, read by the ladder view. */
export interface Flow {
  in: boolean;
  out: boolean;
  /** The instruction's own condition (contact closed, compare true, coil bit on). */
  state: boolean;
}

export const SCAN_MS = 10;

function compare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case 'EQU': return a === b;
    case 'NEQ': return a !== b;
    case 'GRT': return a > b;
    case 'GEQ': return a >= b;
    case 'LES': return a < b;
    case 'LEQ': return a <= b;
  }
}

function math(op: MathOp, a: number, b: number): number | null {
  switch (op) {
    case 'ADD': return a + b;
    case 'SUB': return a - b;
    case 'MUL': return a * b;
    case 'DIV': return b === 0 ? null : a / b; // divide by zero: dest unchanged (minor fault in a real PLC)
  }
}

/**
 * Executes a program the way a Logix / S7 CPU does: rungs top to bottom, each
 * instruction left to right. Every instruction runs every scan, including on
 * false rungs, so OTE clears and TON resets when the rung goes false.
 */
export class Plc {
  readonly mem: Memory;
  readonly flow = new WeakMap<Element, Flow>();
  readonly rungOut: boolean[];
  scanCount = 0;
  dt = SCAN_MS;

  constructor(readonly program: Program) {
    this.mem = new Memory(program.tags);
    this.rungOut = program.rungs.map(() => false);
  }

  reset(): void {
    this.mem.reset();
    this.rungOut.fill(false);
    this.scanCount = 0;
  }

  scan(dt: number = SCAN_MS): void {
    this.dt = dt;
    this.program.rungs.forEach((rung, i) => {
      this.rungOut[i] = this.runRung(rung);
    });
    this.scanCount++;
  }

  private runRung(rung: Rung): boolean {
    return this.series(rung.elements, true);
  }

  private series(elements: Element[], power: boolean): boolean {
    for (const el of elements) power = this.element(el, power);
    return power;
  }

  private element(el: Element, power: boolean): boolean {
    if (el.op === 'BRANCH') {
      let out = false;
      for (const b of el.branches) out = this.series(b, power) || out;
      this.flow.set(el, { in: power, out, state: out });
      return out;
    }
    const [out, state] = this.instruction(el, power);
    this.flow.set(el, { in: power, out, state });
    return out;
  }

  /** Returns [rung-out, instruction state]. */
  private instruction(ins: Instruction, rin: boolean): [boolean, boolean] {
    const m = this.mem;
    switch (ins.op) {
      case 'XIC': {
        const s = m.getBool(ins.tag);
        return [rin && s, s];
      }
      case 'XIO': {
        const s = !m.getBool(ins.tag);
        return [rin && s, s];
      }
      case 'ONS': {
        const out = rin && !m.getBool(ins.tag);
        m.set(ins.tag, rin);
        return [out, out];
      }
      case 'OTE':
        m.set(ins.tag, rin);
        return [rin, rin];
      case 'OTL':
        if (rin) m.set(ins.tag, true);
        return [rin, m.getBool(ins.tag)];
      case 'OTU':
        if (rin) m.set(ins.tag, false);
        return [rin, m.getBool(ins.tag)];
      case 'TON': {
        const t = m.timer(ins.tag);
        if (rin) {
          t.en = true;
          if (!t.dn) t.acc = Math.min(t.pre, t.acc + this.dt);
          t.dn = t.acc >= t.pre;
          t.tt = !t.dn;
        } else {
          t.en = t.tt = t.dn = false;
          t.acc = 0;
        }
        return [rin, t.dn];
      }
      case 'TOF': {
        const t = m.timer(ins.tag);
        if (rin) {
          t.en = t.dn = true;
          t.tt = false;
          t.acc = 0;
        } else {
          t.en = false;
          if (t.dn) {
            t.acc = Math.min(t.pre, t.acc + this.dt);
            t.tt = t.acc < t.pre;
            t.dn = t.tt;
          }
        }
        return [rin, t.dn];
      }
      case 'RTO': {
        const t = m.timer(ins.tag);
        t.en = rin;
        if (rin && !t.dn) t.acc = Math.min(t.pre, t.acc + this.dt);
        t.dn = t.acc >= t.pre;
        t.tt = rin && !t.dn;
        return [rin, t.dn];
      }
      case 'CTU': {
        const c = m.counter(ins.tag);
        if (rin && !c.cu) c.acc++;
        c.cu = rin;
        c.dn = c.acc >= c.pre;
        return [rin, c.dn];
      }
      case 'CTD': {
        const c = m.counter(ins.tag);
        if (rin && !c.cd) c.acc--;
        c.cd = rin;
        c.dn = c.acc >= c.pre;
        return [rin, c.dn];
      }
      case 'RES': {
        if (rin) {
          const v = m.tag(ins.tag);
          if (typeof v === 'object') {
            v.acc = 0;
            v.dn = false;
            if ('tt' in v) v.en = v.tt = false;
            else v.cu = v.cd = false;
          }
        }
        return [rin, rin];
      }
      case 'MOV':
        if (rin) m.set(ins.dest, m.value(ins.src));
        return [rin, rin];
      case 'SCP':
        if (rin) {
          const x = m.value(ins.input);
          const y = ((x - ins.inMin) * (ins.outMax - ins.outMin)) / (ins.inMax - ins.inMin) + ins.outMin;
          m.set(ins.dest, y);
        }
        return [rin, rin];
      default: {
        if ('dest' in ins) {
          if (rin) {
            const r = math(ins.op, m.value(ins.a), m.value(ins.b));
            if (r !== null) m.set(ins.dest, r);
          }
          return [rin, rin];
        }
        const s = compare(ins.op, m.value(ins.a), m.value(ins.b));
        return [rin && s, s];
      }
    }
  }
}

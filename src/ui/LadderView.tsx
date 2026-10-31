import { type ReactNode, useEffect, useRef, useState } from 'react';
import { DIALECTS, type Dialect, addressOf, liveValue, operandLabel, splitPath, tagLabel, timeLiteral, timeValue } from '../plc/dialects';
import type { Memory } from '../plc/memory';
import type { Flow, Plc } from '../plc/scan';
import type { CompareOp, Element, Instruction, MathOp, Operand, Program } from '../plc/types';
import { isCompare, isMath, isOutput } from '../plc/types';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const WIRE = 44; // wire offset from the top of an element row
const CELL = 120; // contact / coil width
const ROW = 66; // contact row height
const LEAD = 14; // wire stub on each side of a box
const BR_PAD = 14; // branch rail inset
const RAIL_X = 44; // left rail (rung number sits left of it)
const MIN_W = 320;

interface Ctx {
  d: Dialect;
  mem: Memory;
  flow: WeakMap<Element, Flow>;
}

interface Node {
  w: number;
  h: number;
  draw(x: number, y: number): ReactNode;
}

const NO_FLOW: Flow = { in: false, out: false, state: false };
const flowOf = (c: Ctx, el: Element) => c.flow.get(el) ?? NO_FLOW;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Wire({ x1, x2, y, on, d }: { x1: number; x2: number; y: number; on: boolean; d: Dialect }) {
  if (x2 <= x1) return null;
  return <line x1={x1} x2={x2} y1={y} y2={y} className={wireClass(on, d)} />;
}

function VWire({ x, y1, y2, on, d }: { x: number; y1: number; y2: number; on: boolean; d: Dialect }) {
  return <line x1={x} x2={x} y1={y1} y2={y2} className={wireClass(on, d)} />;
}

const wireClass = (on: boolean, d: Dialect) => `wire ${on ? 'on' : 'off'} ${d}`;

function Label({ x, y, children, cls = 'lbl', anchor = 'middle' }: { x: number; y: number; children: ReactNode; cls?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} className={cls} textAnchor={anchor}>
      {children}
    </text>
  );
}

/** Tag name (and Siemens address) above a contact or coil. */
function TagHead({ c, x, y, path }: { c: Ctx; x: number; y: number; path: string }) {
  const addr = c.d === 'siemens' ? addressOf(c.mem.defs, path) : undefined;
  const desc = c.mem.defs.get(splitPath(path)[0])?.description;
  return (
    <g>
      {desc && <title>{desc}</title>}
      {addr && <Label x={x} y={y + WIRE - 31} cls="lbl addr">{addr}</Label>}
      <Label x={x} y={y + WIRE - 18}>{tagLabel(c.d, c.mem.defs, path)}</Label>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Contacts and coils
// ---------------------------------------------------------------------------

type Symbol = { kind: 'contact' | 'coil'; nc?: boolean; letter?: string };

function symbolFor(ins: Instruction, d: Dialect, c: Ctx): Symbol | null {
  switch (ins.op) {
    case 'XIC': return { kind: 'contact' };
    case 'XIO': return { kind: 'contact', nc: true };
    case 'OTE': return { kind: 'coil' };
    case 'OTL': return { kind: 'coil', letter: d === 'ab' ? 'L' : 'S' };
    case 'OTU': return { kind: 'coil', letter: d === 'ab' ? 'U' : 'R' };
    case 'RES':
      if (d === 'ab') return { kind: 'coil', letter: 'RES' };
      return c.mem.defs.get(splitPath(ins.tag)[0])?.type === 'TIMER' ? { kind: 'coil', letter: 'RT' } : null;
    default: return null;
  }
}

function contactNode(c: Ctx, el: Instruction & { tag: string }, sym: Symbol): Node {
  return {
    w: CELL,
    h: ROW,
    draw(x, y) {
      const f = flowOf(c, el);
      const cx = x + CELL / 2;
      const wy = y + WIRE;
      const half = sym.kind === 'coil' ? (sym.letter && sym.letter.length > 1 ? 15 : 11) : 8;
      const hot = f.state;
      return (
        <g key={`${x}:${y}`}>
          <Wire x1={x} x2={cx - half} y={wy} on={f.in} d={c.d} />
          <Wire x1={cx + half} x2={x + CELL} y={wy} on={f.out} d={c.d} />
          {c.d === 'ab' && hot && <rect x={cx - half - 5} y={wy - 15} width={half * 2 + 10} height={30} rx={2} className="ab-true" />}
          {sym.kind === 'contact' ? (
            <g className={`sym ${hot ? 'hot' : ''} ${c.d}`}>
              {c.d === 'ab' ? (
                <>
                  <path d={`M${cx - half + 4} ${wy - 11} h-4 v22 h4`} />
                  <path d={`M${cx + half - 4} ${wy - 11} h4 v22 h-4`} />
                </>
              ) : (
                <>
                  <line x1={cx - half} x2={cx - half} y1={wy - 11} y2={wy + 11} />
                  <line x1={cx + half} x2={cx + half} y1={wy - 11} y2={wy + 11} />
                </>
              )}
              {sym.nc && <line x1={cx - 5} y1={wy + 9} x2={cx + 5} y2={wy - 9} />}
            </g>
          ) : (
            <g className={`sym ${hot ? 'hot' : ''} ${c.d}`}>
              <path d={`M${cx - half + 5} ${wy - 11} q-6 11 0 22`} />
              <path d={`M${cx + half - 5} ${wy - 11} q6 11 0 22`} />
              {sym.letter && (
                <text x={cx} y={wy + 4} textAnchor="middle" className="sym-letter">
                  {sym.letter}
                </text>
              )}
            </g>
          )}
          <TagHead c={c} x={cx} y={y} path={el.tag} />
        </g>
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

interface Pin {
  name: string;
  value?: string;
  on?: boolean;
}

interface BoxSpec {
  title: string;
  subtitle?: string;
  /** Siemens instance name above the box. */
  above?: string;
  /** Siemens text under the box (edge memory bit). */
  below?: string;
  left: Pin[];
  right: Pin[];
}

const AB_W = 206;
const AB_OUT = 40;
const SI_W = 96;
const SI_SIDE = 82;
const PIN = 18;

function abBoxNode(c: Ctx, el: Element, spec: BoxSpec): Node {
  const rows = spec.left.length;
  const boxH = 24 + rows * 16 + 6;
  const w = LEAD + AB_W + (spec.right.length ? AB_OUT : 0) + LEAD;
  return {
    w,
    h: WIRE - 14 + boxH + 12,
    draw(x, y) {
      const f = flowOf(c, el);
      const wy = y + WIRE;
      const bx = x + LEAD;
      const by = wy - 14;
      const outX = bx + AB_W;
      return (
        <g key={`${x}:${y}`}>
          <Wire x1={x} x2={bx} y={wy} on={f.in} d="ab" />
          <rect x={bx} y={by} width={AB_W} height={boxH} className={`box ab ${f.state && isCompare(el.op) ? 'hot' : ''}`} />
          <text x={bx + 8} y={wy + 4} className="box-title">{spec.title}</text>
          {spec.subtitle && <text x={bx + 50} y={wy + 4} className="box-sub">{spec.subtitle}</text>}
          {spec.left.map((p, i) => (
            <g key={p.name}>
              <text x={bx + 8} y={wy + 24 + i * 16} className="box-pin">{p.name}</text>
              <text x={bx + 74} y={wy + 24 + i * 16} className="box-val">{p.value}</text>
            </g>
          ))}
          {/* Status bits (EN, DN...) on the right, below the rung wire. */}
          {spec.right.map((p, i) => (
            <g key={p.name}>
              <line x1={outX} x2={outX + 8} y1={wy + 20 + i * 16} y2={wy + 20 + i * 16} className={`pin-stub ${p.on ? 'hot' : ''}`} />
              <text x={outX + 11} y={wy + 24 + i * 16} className={`box-out ${p.on ? 'hot' : ''}`}>
                {p.name}
              </text>
            </g>
          ))}
          <Wire x1={outX} x2={x + w} y={wy} on={f.out} d="ab" />
        </g>
      );
    },
  };
}

function siBoxNode(c: Ctx, el: Element, spec: BoxSpec, wOverride?: number): Node {
  const pins = Math.max(spec.left.length, spec.right.length);
  const boxH = 22 + pins * PIN;
  const w = wOverride ?? LEAD + SI_SIDE + SI_W + SI_SIDE + LEAD;
  return {
    w,
    h: WIRE - 20 + boxH + (spec.below ? 22 : 12),
    draw(x, y) {
      const f = flowOf(c, el);
      const wy = y + WIRE;
      const bx = x + LEAD + SI_SIDE;
      const by = wy - 22;
      const right = bx + SI_W;
      return (
        <g key={`${x}:${y}`}>
          <Wire x1={x} x2={bx} y={wy} on={f.in} d="siemens" />
          {spec.above && <Label x={bx + SI_W / 2} y={by - 6}>{spec.above}</Label>}
          <rect x={bx} y={by} width={SI_W} height={boxH} className={`box siemens ${f.in ? 'live' : ''}`} />
          <text x={bx + SI_W / 2} y={by + 13} textAnchor="middle" className="box-title">{spec.title}</text>
          {spec.subtitle && <text x={bx + SI_W / 2} y={by + boxH - 6} textAnchor="middle" className="box-sub">{spec.subtitle}</text>}
          {spec.left.map((p, i) => (
            <g key={p.name}>
              <text x={bx + 5} y={wy + 4 + i * PIN} className="box-pin">{p.name}</text>
              {i > 0 && (
                <>
                  <line x1={bx - 8} x2={bx} y1={wy + i * PIN} y2={wy + i * PIN} className="pin-stub" />
                  <text x={bx - 11} y={wy + 4 + i * PIN} textAnchor="end" className="box-val">{p.value}</text>
                </>
              )}
            </g>
          ))}
          {spec.right.map((p, i) => (
            <g key={p.name}>
              <text x={right - 5} y={wy + 4 + i * PIN} textAnchor="end" className={`box-pin ${p.on ? 'hot' : ''}`}>{p.name}</text>
              {i > 0 && (
                <>
                  <line x1={right} x2={right + 8} y1={wy + i * PIN} y2={wy + i * PIN} className="pin-stub" />
                  <text x={right + 11} y={wy + 4 + i * PIN} className="box-val">{p.value}</text>
                </>
              )}
            </g>
          ))}
          {spec.below && <Label x={bx + SI_W / 2} y={by + boxH + 15}>{spec.below}</Label>}
          <Wire x1={right} x2={x + w} y={wy} on={f.out} d="siemens" />
        </g>
      );
    },
  };
}

const AB_TITLES: Record<string, string> = {
  TON: 'Timer On Delay', TOF: 'Timer Off Delay', RTO: 'Retentive Timer On',
  CTU: 'Count Up', CTD: 'Count Down',
  EQU: 'Equal', NEQ: 'Not Equal', GRT: 'Greater Than (A>B)', GEQ: 'Grtr Than or Eql (A>=B)', LES: 'Less Than (A<B)', LEQ: 'Less Than or Eql (A<=B)',
  MOV: 'Move', ADD: 'Add', SUB: 'Subtract', MUL: 'Multiply', DIV: 'Divide', SCP: 'Scale w/Parameters',
};
const SI_CMP: Record<CompareOp, string> = { EQU: '==', NEQ: '<>', GRT: '>', GEQ: '>=', LES: '<', LEQ: '<=' };
const SI_MATH: Record<MathOp, string> = { ADD: 'ADD', SUB: 'SUB', MUL: 'MUL', DIV: 'DIV' };

function typeName(c: Ctx, op: Operand): string {
  if (typeof op === 'number') return Number.isInteger(op) ? 'Int' : 'Real';
  const def = c.mem.defs.get(splitPath(op)[0]);
  if (def?.type === 'REAL') return 'Real';
  if (def?.type === 'TIMER') return 'Time';
  return 'Int';
}

/** AB operand row: tag name followed by its live value. */
function abVal(c: Ctx, op: Operand): string {
  if (typeof op === 'number') return String(op);
  return `${op}  ${liveValue('ab', c.mem, op)}`;
}

function boxNode(c: Ctx, ins: Instruction): Node {
  const { d, mem } = c;
  const lbl = (op: Operand, peer?: Operand) => operandLabel(d, mem.defs, op, peer);

  switch (ins.op) {
    case 'TON':
    case 'TOF':
    case 'RTO': {
      const t = mem.timer(ins.tag);
      if (d === 'ab')
        return abBoxNode(c, ins, {
          title: ins.op, subtitle: AB_TITLES[ins.op],
          left: [{ name: 'Timer', value: ins.tag }, { name: 'Preset', value: String(t.pre) }, { name: 'Accum', value: String(Math.round(t.acc)) }],
          right: [{ name: 'EN', on: t.en }, { name: 'DN', on: t.dn }],
        });
      const fb = ins.op === 'RTO' ? 'TONR' : ins.op;
      const left: Pin[] = [{ name: 'IN' }];
      if (ins.op === 'RTO') left.push({ name: 'R', value: 'FALSE' });
      left.push({ name: 'PT', value: timeLiteral(t.pre) });
      return siBoxNode(c, ins, {
        title: fb, subtitle: 'Time', above: `"${ins.tag}"`,
        left, right: [{ name: 'Q', on: t.dn }, { name: 'ET', value: timeValue(t.acc) }],
      });
    }
    case 'CTU':
    case 'CTD': {
      const k = mem.counter(ins.tag);
      if (d === 'ab')
        return abBoxNode(c, ins, {
          title: ins.op, subtitle: AB_TITLES[ins.op],
          left: [{ name: 'Counter', value: ins.tag }, { name: 'Preset', value: String(k.pre) }, { name: 'Accum', value: String(k.acc) }],
          right: [{ name: ins.op === 'CTU' ? 'CU' : 'CD', on: ins.op === 'CTU' ? k.cu : k.cd }, { name: 'DN', on: k.dn }],
        });
      return siBoxNode(c, ins, {
        title: ins.op, subtitle: 'Int', above: `"${ins.tag}"`,
        left: [{ name: ins.op === 'CTU' ? 'CU' : 'CD' }, { name: ins.op === 'CTU' ? 'R' : 'LD', value: 'FALSE' }, { name: 'PV', value: String(k.pre) }],
        right: [{ name: 'Q', on: k.dn }, { name: 'CV', value: String(k.acc) }],
      });
    }
    case 'RES':
      // Siemens has no reset coil for IEC counters: clear CV with MOVE.
      return siBoxNode(c, ins, {
        title: 'MOVE', subtitle: 'Int',
        left: [{ name: 'EN' }, { name: 'IN', value: '0' }],
        right: [{ name: 'ENO' }, { name: 'OUT1', value: `"${ins.tag}".CV` }],
      });
    case 'ONS':
      if (d === 'ab')
        return abBoxNode(c, ins, { title: 'ONS', subtitle: 'One Shot', left: [{ name: 'Storage', value: abVal(c, ins.tag) }], right: [] });
      return siBoxNode(c, ins, {
        title: 'P_TRIG', below: `"${ins.tag}"`,
        left: [{ name: 'CLK' }], right: [{ name: 'Q', on: flowOf(c, ins).out }],
      });
    case 'MOV':
      if (d === 'ab')
        return abBoxNode(c, ins, { title: 'MOV', subtitle: 'Move', left: [{ name: 'Source', value: abVal(c, ins.src) }, { name: 'Dest', value: abVal(c, ins.dest) }], right: [] });
      return siBoxNode(c, ins, {
        title: 'MOVE', subtitle: typeName(c, ins.dest),
        left: [{ name: 'EN' }, { name: 'IN', value: lbl(ins.src, ins.dest) }],
        right: [{ name: 'ENO' }, { name: 'OUT1', value: lbl(ins.dest) }],
      });
    case 'SCP':
      if (d === 'ab')
        return abBoxNode(c, ins, {
          title: 'SCP', subtitle: AB_TITLES.SCP,
          left: [
            { name: 'Input', value: abVal(c, ins.input) },
            { name: 'Input Min', value: String(ins.inMin) },
            { name: 'Input Max', value: String(ins.inMax) },
            { name: 'Scaled Min', value: String(ins.outMin) },
            { name: 'Scaled Max', value: String(ins.outMax) },
            { name: 'Output', value: abVal(c, ins.dest) },
          ],
          right: [],
        });
      return scaleXNode(c, ins);
    default:
      if (isMath(ins.op) && 'dest' in ins) {
        if (d === 'ab')
          return abBoxNode(c, ins, {
            title: ins.op, subtitle: AB_TITLES[ins.op],
            left: [{ name: 'Source A', value: abVal(c, ins.a) }, { name: 'Source B', value: abVal(c, ins.b) }, { name: 'Dest', value: abVal(c, ins.dest) }],
            right: [],
          });
        return siBoxNode(c, ins, {
          title: SI_MATH[ins.op], subtitle: typeName(c, ins.dest),
          left: [{ name: 'EN' }, { name: 'IN1', value: lbl(ins.a, ins.dest) }, { name: 'IN2', value: lbl(ins.b, ins.dest) }],
          right: [{ name: 'ENO' }, { name: 'OUT', value: lbl(ins.dest) }],
        });
      }
      if ('a' in ins && isCompare(ins.op)) {
        if (d === 'ab')
          return abBoxNode(c, ins, {
            title: ins.op, subtitle: AB_TITLES[ins.op],
            left: [{ name: 'Source A', value: abVal(c, ins.a) }, { name: 'Source B', value: abVal(c, ins.b) }],
            right: [],
          });
        return siCompareNode(c, ins);
      }
      throw new Error(`No box for ${ins.op}`);
  }
}

/** Siemens SCP equivalent: NORM_X chained into SCALE_X. */
function scaleXNode(c: Ctx, ins: Extract<Instruction, { op: 'SCP' }>): Node {
  const lbl = (op: Operand) => operandLabel('siemens', c.mem.defs, op);
  const real = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
  const norm = siBoxNode(c, ins, {
    title: 'NORM_X', subtitle: 'Int to Real',
    left: [{ name: 'EN' }, { name: 'MIN', value: String(ins.inMin) }, { name: 'VALUE', value: lbl(ins.input) }, { name: 'MAX', value: String(ins.inMax) }],
    right: [{ name: 'ENO' }, { name: 'OUT', value: '#Norm' }],
  });
  const scale = siBoxNode(c, ins, {
    title: 'SCALE_X', subtitle: 'Real to Real',
    left: [{ name: 'EN' }, { name: 'MIN', value: real(ins.outMin) }, { name: 'VALUE', value: '#Norm' }, { name: 'MAX', value: real(ins.outMax) }],
    right: [{ name: 'ENO' }, { name: 'OUT', value: lbl(ins.dest) }],
  });
  return {
    w: norm.w + scale.w,
    h: Math.max(norm.h, scale.h),
    draw: (x, y) => (
      <g key={`${x}:${y}`}>
        {norm.draw(x, y)}
        {scale.draw(x + norm.w, y)}
      </g>
    ),
  };
}

/** Siemens compare: a contact with the operator inside, operands above and below. */
function siCompareNode(c: Ctx, ins: Extract<Instruction, { a: Operand; b: Operand }>): Node {
  const op = ins.op as CompareOp;
  return {
    w: CELL + 10,
    h: ROW + 30,
    draw(x, y) {
      const f = flowOf(c, ins);
      const w = CELL + 10;
      const cx = x + w / 2;
      const wy = y + WIRE;
      const half = 17;
      const val = (o: Operand) => (typeof o === 'string' ? liveValue('siemens', c.mem, o) : '');
      return (
        <g key={`${x}:${y}`}>
          <Wire x1={x} x2={cx - half} y={wy} on={f.in} d="siemens" />
          <Wire x1={cx + half} x2={x + w} y={wy} on={f.out} d="siemens" />
          <g className={`sym ${f.state ? 'hot' : ''} siemens`}>
            <line x1={cx - half} x2={cx - half} y1={wy - 11} y2={wy + 11} />
            <line x1={cx + half} x2={cx + half} y1={wy - 11} y2={wy + 11} />
          </g>
          <text x={cx} y={wy - 1} textAnchor="middle" className="cmp-op">{SI_CMP[op]}</text>
          <text x={cx} y={wy + 9} textAnchor="middle" className="cmp-type">{typeName(c, ins.a)}</text>
          <Label x={cx} y={wy - 18}>{operandLabel('siemens', c.mem.defs, ins.a, ins.b)}</Label>
          {typeof ins.a === 'string' && <Label x={cx} y={wy - 31} cls="lbl live">{val(ins.a)}</Label>}
          <Label x={cx} y={wy + 27}>{operandLabel('siemens', c.mem.defs, ins.b, ins.a)}</Label>
          {typeof ins.b === 'string' && <Label x={cx} y={wy + 40} cls="lbl live">{val(ins.b)}</Label>}
        </g>
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Series and branches
// ---------------------------------------------------------------------------

function elementNode(c: Ctx, el: Element): Node {
  if (el.op === 'BRANCH') return branchNode(c, el);
  const sym = symbolFor(el, c.d, c);
  if (sym && 'tag' in el) return contactNode(c, el, sym);
  return boxNode(c, el);
}

function seriesNode(c: Ctx, els: Element[]): Node {
  const nodes = els.map((e) => elementNode(c, e));
  return {
    w: nodes.reduce((s, n) => s + n.w, 0),
    h: nodes.reduce((m, n) => Math.max(m, n.h), ROW),
    draw(x, y) {
      let cx = x;
      return nodes.map((n) => {
        const g = n.draw(cx, y);
        cx += n.w;
        return g;
      });
    },
  };
}

/** Power at the end of a series (or its input if it is empty). */
function seriesOut(c: Ctx, els: Element[], pin: boolean): boolean {
  return els.length ? flowOf(c, els[els.length - 1]).out : pin;
}

function branchNode(c: Ctx, el: Extract<Element, { op: 'BRANCH' }>): Node {
  const kids = el.branches.map((b) => seriesNode(c, b));
  const inner = kids.reduce((m, k) => Math.max(m, k.w), 0);
  const w = inner + BR_PAD * 2;
  return {
    w,
    h: kids.reduce((s, k) => s + k.h, 0),
    draw(x, y) {
      const f = flowOf(c, el);
      const lx = x + BR_PAD;
      const rx = x + w - BR_PAD;
      let oy = y;
      const tops = kids.map((k) => {
        const t = oy;
        oy += k.h;
        return t;
      });
      const lastWire = tops[tops.length - 1] + WIRE;
      return (
        <g key={`${x}:${y}`}>
          <Wire x1={x} x2={lx} y={y + WIRE} on={f.in} d={c.d} />
          <VWire x={lx} y1={y + WIRE} y2={lastWire} on={f.in} d={c.d} />
          {kids.map((k, i) => {
            const out = seriesOut(c, el.branches[i], f.in);
            return (
              <g key={i}>
                {k.draw(lx, tops[i])}
                <Wire x1={lx + k.w} x2={rx} y={tops[i] + WIRE} on={out} d={c.d} />
              </g>
            );
          })}
          <VWire x={rx} y1={y + WIRE} y2={lastWire} on={f.out} d={c.d} />
          <Wire x1={rx} x2={x + w} y={y + WIRE} on={f.out} d={c.d} />
        </g>
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Rungs
// ---------------------------------------------------------------------------

function RungSvg({ c, elements, index, fit }: { c: Ctx; elements: Element[]; index: number; fit: number }) {
  // Right-justify the trailing outputs, as both editors do.
  let split = elements.length;
  while (split > 0 && isOutput(elements[split - 1])) split--;
  if (split === 0) split = elements.length; // all-output rung (e.g. unconditional SCP): keep left
  const left = seriesNode(c, elements.slice(0, split));
  const right = seriesNode(c, elements.slice(split));
  const gap = 24;
  // Stretch to the container so the right rail sits at the edge, like the real editors.
  const body = Math.max(Math.max(MIN_W, fit) - RAIL_X - 14, left.w + gap + right.w);
  const width = RAIL_X + body + 14;
  const height = Math.max(left.h, right.h) + 8;
  const fillerOn = seriesOut(c, elements.slice(0, split), true);
  const rx = RAIL_X + body;
  const y = 4;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`rung-svg ${c.d}`} role="img" aria-label={`Rung ${index}`}>
      {c.d === 'ab' && <text x={RAIL_X - 10} y={y + WIRE + 4} textAnchor="end" className="rung-no">{index}</text>}
      <line x1={RAIL_X} x2={RAIL_X} y1={0} y2={height} className={`rail ${c.d}`} />
      <line x1={rx} x2={rx} y1={0} y2={height} className={`rail ${c.d}`} />
      {left.draw(RAIL_X, y)}
      <Wire x1={RAIL_X + left.w} x2={rx - right.w} y={y + WIRE} on={fillerOn} d={c.d} />
      {right.draw(rx - right.w, y)}
    </svg>
  );
}

export function LadderView({ plc, program, dialect }: { plc: Plc; program: Program; dialect: Dialect }) {
  const c: Ctx = { d: dialect, mem: plc.mem, flow: plc.flow };
  const info = DIALECTS[dialect];
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFit(Math.floor(e.contentRect.width) - 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`ladder ${dialect}`} ref={ref}>
      {program.rungs.map((r, i) => {
        const n = i + info.firstRung;
        return (
          <section key={i} className="rung">
            {dialect === 'siemens' ? (
              <header className="network-head">
                <span className="network-no">Network {n}:</span> {r.comment}
              </header>
            ) : (
              r.comment && <header className="rung-comment">{r.comment}</header>
            )}
            <div className="rung-scroll">
              <RungSvg c={c} elements={r.elements} index={n} fit={fit} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export { RungSvg, type Ctx as LadderCtx };

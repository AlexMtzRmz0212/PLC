// Generates Structured Text (Studio 5000) or SCL (TIA Portal) from a ladder program.
// The text is derived from the same rungs the simulator runs, so it can't drift.
import { DIALECTS, type Dialect, operandLabel, splitPath, tagLabel, timeLiteral } from './dialects';
import type { CompareOp, Element, Instruction, MathOp, Operand, Program, TagDef } from './types';
import { isCompare, isMath } from './types';

// ---------------------------------------------------------------------------
// Boolean expressions
// ---------------------------------------------------------------------------

type Expr =
  | { k: 'true' }
  | { k: 'atom'; s: string; cmp?: boolean }
  | { k: 'not'; e: Expr }
  | { k: 'and' | 'or'; es: Expr[] };

const TRUE: Expr = { k: 'true' };
const atom = (s: string, cmp = false): Expr => ({ k: 'atom', s, cmp });

function and(a: Expr, b: Expr): Expr {
  if (a.k === 'true') return b;
  if (b.k === 'true') return a;
  const es = [...(a.k === 'and' ? a.es : [a]), ...(b.k === 'and' ? b.es : [b])];
  return { k: 'and', es };
}

function or(list: Expr[]): Expr {
  if (list.some((e) => e.k === 'true')) return TRUE;
  if (list.length === 1) return list[0];
  return { k: 'or', es: list.flatMap((e) => (e.k === 'or' ? e.es : [e])) };
}

const PREC = { or: 1, and: 2, not: 3, atom: 4, true: 4 } as const;

function print(e: Expr, t: Text, parent = 0): string {
  switch (e.k) {
    case 'true':
      return t.true;
    case 'atom':
      return e.cmp ? `(${e.s})` : e.s;
    case 'not':
      return `NOT ${print(e.e, t, PREC.not)}`;
    case 'and':
    case 'or': {
      // AND groups inside an OR get parentheses too: legal without, but easier to read.
      const child = e.k === 'or' ? PREC.and + 1 : PREC.and;
      const s = e.es.map((x) => print(x, t, child)).join(e.k === 'and' ? ' AND ' : ' OR ');
      return PREC[e.k] < parent ? `(${s})` : s;
    }
  }
}

// ---------------------------------------------------------------------------
// Dialect-specific text
// ---------------------------------------------------------------------------

const CMP: Record<CompareOp, string> = { EQU: '=', NEQ: '<>', GRT: '>', GEQ: '>=', LES: '<', LEQ: '<=' };
const MATH: Record<MathOp, string> = { ADD: '+', SUB: '-', MUL: '*', DIV: '/' };

interface Text {
  dialect: Dialect;
  defs: Map<string, TagDef>;
  true: string;
  false: string;
}

const tag = (t: Text, path: string) => tagLabel(t.dialect, t.defs, path);
const val = (t: Text, op: Operand, peer?: Operand) => operandLabel(t.dialect, t.defs, op, peer);
const real = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** A statement, optionally guarded by an IF condition. Consecutive guards with the same condition merge. */
interface Stmt {
  guard?: string;
  lines: string[];
}

function scale(t: Text, ins: Extract<Instruction, { op: 'SCP' }>): string {
  const x = val(t, ins.input);
  if (t.dialect === 'siemens') {
    const norm = `NORM_X(MIN := ${ins.inMin}, VALUE := ${x}, MAX := ${ins.inMax})`;
    return `${tag(t, ins.dest)} := SCALE_X(MIN := ${real(ins.outMin)}, VALUE := ${norm}, MAX := ${real(ins.outMax)});`;
  }
  const off = ins.inMin ? `(${x} - ${ins.inMin})` : x;
  const span = ins.outMax - ins.outMin;
  const base = `${off} * ${real(span)} / ${real(ins.inMax - ins.inMin)}`;
  return `${tag(t, ins.dest)} := ${base}${ins.outMin ? ` + ${real(ins.outMin)}` : ''};`;
}

/** Contacts and compares only: the branch is a pure boolean expression. */
function isPure(el: Element): boolean {
  if (el.op === 'BRANCH') return el.branches.every((b) => b.every(isPure));
  return el.op === 'XIC' || el.op === 'XIO' || isCompare(el.op);
}

class Gen {
  stmts: Stmt[] = [];
  constructor(readonly t: Text) {}

  private emit(cond: Expr, line: string, guarded: boolean) {
    const c = print(cond, this.t);
    const guard = guarded && cond.k !== 'true' ? c : undefined;
    const last = this.stmts[this.stmts.length - 1];
    if (last && guard !== undefined && last.guard === guard) last.lines.push(line);
    else this.stmts.push({ guard, lines: [line] });
  }

  private def(path: string) {
    return this.t.defs.get(splitPath(path)[0]);
  }

  series(elements: Element[], cond: Expr): Expr {
    for (const el of elements) cond = this.element(el, cond);
    return cond;
  }

  private element(el: Element, cond: Expr): Expr {
    const t = this.t;
    if (el.op === 'BRANCH') {
      if (isPure(el)) return and(cond, or(el.branches.map((b) => this.series(b, TRUE))));
      return or(el.branches.map((b) => this.series(b, cond)));
    }
    const ab = t.dialect === 'ab';
    const c = print(cond, t);
    switch (el.op) {
      case 'XIC':
        return and(cond, atom(tag(t, el.tag)));
      case 'XIO':
        return and(cond, { k: 'not', e: atom(tag(t, el.tag)) });
      case 'ONS': {
        const name = splitPath(el.tag)[0];
        if (ab) {
          this.emit(cond, `${name}.InputBit := ${c};`, false);
          this.emit(cond, `OSRI(${name});`, false);
          return atom(`${name}.OutputBit`);
        }
        this.emit(cond, `"${name}"(CLK := ${c});`, false);
        return atom(`"${name}".Q`);
      }
      case 'OTE':
        this.emit(cond, `${tag(t, el.tag)} := ${c};`, false);
        return cond;
      case 'OTL':
      case 'OTU':
        this.emit(cond, `${tag(t, el.tag)} := ${el.op === 'OTL' ? t.true : t.false};`, true);
        return cond;
      case 'TON':
      case 'TOF':
      case 'RTO': {
        const name = splitPath(el.tag)[0];
        const pre = this.def(el.tag)?.preset ?? 0;
        if (ab) {
          this.emit(cond, `${name}.PRE := ${pre};`, false);
          this.emit(cond, `${name}.TimerEnable := ${c};`, false);
          this.emit(cond, `${el.op}R(${name});`, false);
        } else {
          const fb = el.op === 'RTO' ? 'TONR' : el.op;
          const r = el.op === 'RTO' ? ', R := FALSE' : '';
          this.emit(cond, `"${name}".${fb}(IN := ${c}${r}, PT := ${timeLiteral(pre)});`, false);
        }
        return cond;
      }
      case 'CTU':
      case 'CTD': {
        const name = splitPath(el.tag)[0];
        const pre = this.def(el.tag)?.preset ?? 0;
        if (ab) {
          this.emit(cond, `${name}.PRE := ${pre};`, false);
          this.emit(cond, `${name}.${el.op === 'CTU' ? 'CUEnable' : 'CDEnable'} := ${c};`, false);
          this.emit(cond, `CTUD(${name});`, false);
        } else {
          const pin = el.op === 'CTU' ? 'CU' : 'CD';
          const extra = el.op === 'CTU' ? 'R := FALSE' : 'LD := FALSE';
          this.emit(cond, `"${name}".${el.op}(${pin} := ${c}, ${extra}, PV := ${pre});`, false);
        }
        return cond;
      }
      case 'RES': {
        const name = splitPath(el.tag)[0];
        const timer = this.def(el.tag)?.type === 'TIMER';
        if (ab) this.emit(cond, `${name}.ACC := 0;`, true);
        else this.emit(cond, timer ? `RESET_TIMER("${name}");` : `"${name}".CV := 0;`, true);
        return cond;
      }
      case 'MOV':
        this.emit(cond, `${tag(t, el.dest)} := ${val(t, el.src, el.dest)};`, true);
        return cond;
      case 'SCP':
        this.emit(cond, scale(t, el), true);
        return cond;
      default:
        if (isMath(el.op) && 'dest' in el) {
          this.emit(cond, `${tag(t, el.dest)} := ${val(t, el.a, el.dest)} ${MATH[el.op]} ${val(t, el.b, el.dest)};`, true);
          return cond;
        }
        if ('a' in el && isCompare(el.op)) {
          return and(cond, atom(`${val(t, el.a, el.b)} ${CMP[el.op]} ${val(t, el.b, el.a)}`, true));
        }
        throw new Error(`Unsupported instruction ${(el as Instruction).op}`);
    }
  }
}

function render(stmts: Stmt[]): string[] {
  const out: string[] = [];
  for (const s of stmts) {
    if (s.guard === undefined) out.push(...s.lines);
    else {
      out.push(`IF ${s.guard} THEN`);
      out.push(...s.lines.map((l) => `    ${l}`));
      out.push('END_IF;');
    }
  }
  return out;
}

export function generateText(program: Program, dialect: Dialect): string {
  const defs = new Map(program.tags.map((d) => [d.name, d]));
  const t: Text = dialect === 'ab' ? { dialect, defs, true: '1', false: '0' } : { dialect, defs, true: 'TRUE', false: 'FALSE' };
  const d = DIALECTS[dialect];
  const header =
    dialect === 'ab'
      ? [
          '// Studio 5000 Structured Text, generated from the ladder routine.',
          '// In ST, timers are FBD_TIMER (TONR/TOFR/RTOR), counters FBD_COUNTER (CTUD),',
          '// one-shots FBD_ONESHOT (OSRI).',
        ]
      : [
          '// TIA Portal SCL, generated from the LAD network.',
          '// Timers and counters are IEC_TIMER / IEC_COUNTER multi-instances,',
          '// edge detection uses R_TRIG instances.',
        ];
  const lines = [...header];
  program.rungs.forEach((rung, i) => {
    const gen = new Gen(t);
    gen.series(rung.elements, TRUE);
    lines.push('');
    lines.push(`// ${d.rungWord} ${i + d.firstRung}${rung.comment ? `: ${rung.comment}` : ''}`);
    lines.push(...render(gen.stmts));
  });
  return lines.join('\n') + '\n';
}

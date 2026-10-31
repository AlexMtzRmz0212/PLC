// Vendor-neutral program model. A program is stored once and rendered as
// Allen-Bradley or Siemens ladder, or generated as ST / SCL text.

export type DataType = 'BOOL' | 'INT' | 'REAL' | 'TIMER' | 'COUNTER';

export interface TimerValue {
  pre: number; // preset, ms
  acc: number; // accumulated, ms
  en: boolean;
  tt: boolean;
  dn: boolean;
}

export interface CounterValue {
  pre: number;
  acc: number;
  cu: boolean; // last rung-in, used for edge detection
  cd: boolean;
  dn: boolean;
}

export type TagValue = boolean | number | TimerValue | CounterValue;

export interface TagDef {
  name: string;
  type: DataType;
  /** Siemens absolute address (%I0.0, %Q0.1, %M10.0, %IW64, %MD20). Timers/counters use instance DBs. */
  address?: string;
  io?: 'input' | 'output' | 'internal';
  initial?: boolean | number;
  /** Timer preset in ms, or counter preset. */
  preset?: number;
  description?: string;
}

/** A tag path: `Start_PB`, `Jam_TMR.DN`, `Batch_CTR.ACC`. */
export type TagPath = string;
/** Tag path or numeric literal. */
export type Operand = TagPath | number;

export type CompareOp = 'EQU' | 'NEQ' | 'GRT' | 'GEQ' | 'LES' | 'LEQ';
export type MathOp = 'ADD' | 'SUB' | 'MUL' | 'DIV';

export type Instruction =
  | { op: 'XIC'; tag: TagPath }
  | { op: 'XIO'; tag: TagPath }
  | { op: 'ONS'; tag: TagPath } // tag = storage bit
  | { op: 'OTE'; tag: TagPath }
  | { op: 'OTL'; tag: TagPath }
  | { op: 'OTU'; tag: TagPath }
  | { op: 'TON' | 'TOF' | 'RTO'; tag: TagPath }
  | { op: 'CTU' | 'CTD'; tag: TagPath }
  | { op: 'RES'; tag: TagPath }
  | { op: CompareOp; a: Operand; b: Operand }
  | { op: 'MOV'; src: Operand; dest: TagPath }
  | { op: MathOp; a: Operand; b: Operand; dest: TagPath }
  | {
      op: 'SCP';
      input: Operand;
      inMin: number;
      inMax: number;
      outMin: number;
      outMax: number;
      dest: TagPath;
    };

export interface Branch {
  op: 'BRANCH';
  /** Each branch is a series list of elements, evaluated with the same power-in. */
  branches: Element[][];
}

export type Element = Instruction | Branch;

export interface Rung {
  comment?: string;
  elements: Element[];
}

export interface Program {
  tags: TagDef[];
  rungs: Rung[];
}

export const COMPARE_OPS: readonly CompareOp[] = ['EQU', 'NEQ', 'GRT', 'GEQ', 'LES', 'LEQ'];
export const MATH_OPS: readonly MathOp[] = ['ADD', 'SUB', 'MUL', 'DIV'];

const OUTPUT_OPS = new Set([
  'OTE', 'OTL', 'OTU', 'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES', 'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'SCP',
]);

/** Output-type instructions (right-justified in the ladder view). */
export function isOutput(el: Element): boolean {
  if (el.op === 'BRANCH') return el.branches.every((b) => b.length > 0 && b.every(isOutput));
  return OUTPUT_OPS.has(el.op);
}

export function isCompare(op: string): op is CompareOp {
  return (COMPARE_OPS as readonly string[]).includes(op);
}

export function isMath(op: string): op is MathOp {
  return (MATH_OPS as readonly string[]).includes(op);
}

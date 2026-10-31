import type { Memory } from './memory';
import type { Operand, TagDef } from './types';

export type Dialect = 'ab' | 'siemens';

export const DIALECTS: Record<Dialect, { vendor: string; ide: string; text: string; rungWord: string; firstRung: number }> = {
  ab: { vendor: 'Allen-Bradley', ide: 'Studio 5000 Logix Designer', text: 'Structured Text', rungWord: 'Rung', firstRung: 0 },
  siemens: { vendor: 'Siemens', ide: 'TIA Portal', text: 'SCL', rungWord: 'Network', firstRung: 1 },
};

// AB member -> IEC_TIMER / IEC_COUNTER member.
const SIEMENS_TIMER: Record<string, string> = { DN: 'Q', ACC: 'ET', PRE: 'PT', EN: 'IN', TT: 'TT' };
const SIEMENS_COUNTER: Record<string, string> = { DN: 'QU', ACC: 'CV', PRE: 'PV', CU: 'CU', CD: 'CD' };

export function splitPath(path: string): [string, string | undefined] {
  const [name, member] = path.split('.');
  return [name, member];
}

/** Siemens time literal: 5000 -> T#5S, 1500 -> T#1S500MS. */
export function timeLiteral(ms: number): string {
  const s = Math.floor(ms / 1000);
  const rest = ms % 1000;
  if (s && rest) return `T#${s}S${rest}MS`;
  if (s) return `T#${s}S`;
  return `T#${rest}MS`;
}

/** Display a timer value in Siemens style: 1234 -> 1s234ms. */
export function timeValue(ms: number): string {
  const s = Math.floor(ms / 1000);
  const rest = Math.round(ms % 1000);
  return s ? (rest ? `${s}s${rest}ms` : `${s}s`) : `${rest}ms`;
}

export function memberFor(dialect: Dialect, def: TagDef | undefined, member: string): string {
  if (dialect === 'ab' || !def) return member;
  return (def.type === 'TIMER' ? SIEMENS_TIMER : SIEMENS_COUNTER)[member] ?? member;
}

/** Tag path as shown on a ladder element or in code. */
export function tagLabel(dialect: Dialect, defs: Map<string, TagDef>, path: string): string {
  const [name, member] = splitPath(path);
  if (dialect === 'ab') return path;
  const base = `"${name}"`;
  return member ? `${base}.${memberFor(dialect, defs.get(name), member)}` : base;
}

/** True when the path is a timer's ACC (Siemens shows it as a TIME). */
export function isTimerTime(defs: Map<string, TagDef>, path: Operand): boolean {
  if (typeof path === 'number') return false;
  const [name, member] = splitPath(path);
  return defs.get(name)?.type === 'TIMER' && (member === 'ACC' || member === 'PRE');
}

export function isReal(defs: Map<string, TagDef>, op: Operand): boolean {
  return typeof op === 'string' && defs.get(splitPath(op)[0])?.type === 'REAL';
}

/** Operand label. `peer` is the other side of a compare, so literals take its type. */
export function operandLabel(dialect: Dialect, defs: Map<string, TagDef>, op: Operand, peer?: Operand): string {
  if (typeof op === 'string') return tagLabel(dialect, defs, op);
  if (dialect === 'siemens' && peer !== undefined) {
    if (isTimerTime(defs, peer)) return timeLiteral(op);
    if (isReal(defs, peer) && Number.isInteger(op)) return `${op}.0`;
  }
  return String(op);
}

/** Absolute address shown under the symbol in Siemens view. */
export function addressOf(defs: Map<string, TagDef>, path: Operand): string | undefined {
  if (typeof path === 'number') return undefined;
  return defs.get(splitPath(path)[0])?.address;
}

/** Live value of an operand, formatted for display. */
export function liveValue(dialect: Dialect, mem: Memory, op: Operand): string {
  if (typeof op === 'number') return String(op);
  const v = mem.get(op);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (dialect === 'siemens' && isTimerTime(mem.defs, op)) return timeValue(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

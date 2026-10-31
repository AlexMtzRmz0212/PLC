// Small helpers so scenario programs read close to ladder mnemonics.
import type { CompareOp, Element, MathOp, Operand, Rung, TagDef, TagPath } from './types';

export const XIC = (tag: TagPath): Element => ({ op: 'XIC', tag });
export const XIO = (tag: TagPath): Element => ({ op: 'XIO', tag });
export const ONS = (tag: TagPath): Element => ({ op: 'ONS', tag });
export const OTE = (tag: TagPath): Element => ({ op: 'OTE', tag });
export const OTL = (tag: TagPath): Element => ({ op: 'OTL', tag });
export const OTU = (tag: TagPath): Element => ({ op: 'OTU', tag });
export const TON = (tag: TagPath): Element => ({ op: 'TON', tag });
export const TOF = (tag: TagPath): Element => ({ op: 'TOF', tag });
export const RTO = (tag: TagPath): Element => ({ op: 'RTO', tag });
export const CTU = (tag: TagPath): Element => ({ op: 'CTU', tag });
export const CTD = (tag: TagPath): Element => ({ op: 'CTD', tag });
export const RES = (tag: TagPath): Element => ({ op: 'RES', tag });
export const MOV = (src: Operand, dest: TagPath): Element => ({ op: 'MOV', src, dest });
export const SCP = (input: Operand, inMin: number, inMax: number, outMin: number, outMax: number, dest: TagPath): Element =>
  ({ op: 'SCP', input, inMin, inMax, outMin, outMax, dest });

const cmp = (op: CompareOp) => (a: Operand, b: Operand): Element => ({ op, a, b });
export const EQU = cmp('EQU');
export const NEQ = cmp('NEQ');
export const GRT = cmp('GRT');
export const GEQ = cmp('GEQ');
export const LES = cmp('LES');
export const LEQ = cmp('LEQ');

const mth = (op: MathOp) => (a: Operand, b: Operand, dest: TagPath): Element => ({ op, a, b, dest });
export const ADD = mth('ADD');
export const SUB = mth('SUB');
export const MUL = mth('MUL');
export const DIV = mth('DIV');

/** Parallel branch: each argument is one series path. */
export const BR = (...branches: Element[][]): Element => ({ op: 'BRANCH', branches });

export const rung = (comment: string, ...elements: Element[]): Rung => ({ comment, elements });

// Tag shorthands: name, Siemens address, description.
export const input = (name: string, address: string, description: string, type: 'BOOL' | 'INT' = 'BOOL'): TagDef =>
  ({ name, type, address, io: 'input', description });
export const output = (name: string, address: string, description: string): TagDef =>
  ({ name, type: 'BOOL', address, io: 'output', description });
export const bit = (name: string, address: string, description: string): TagDef =>
  ({ name, type: 'BOOL', address, io: 'internal', description });
export const int = (name: string, address: string, description: string, initial = 0): TagDef =>
  ({ name, type: 'INT', address, io: 'internal', description, initial });
export const real = (name: string, address: string, description: string): TagDef =>
  ({ name, type: 'REAL', address, io: 'internal', description });
export const timer = (name: string, presetMs: number, description: string): TagDef =>
  ({ name, type: 'TIMER', preset: presetMs, io: 'internal', description });
export const counter = (name: string, preset: number, description: string): TagDef =>
  ({ name, type: 'COUNTER', preset, io: 'internal', description });

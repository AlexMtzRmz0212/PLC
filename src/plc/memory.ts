import type { CounterValue, Operand, TagDef, TagPath, TagValue, TimerValue } from './types';

const TIMER_MEMBERS: Record<string, keyof TimerValue> = { PRE: 'pre', ACC: 'acc', EN: 'en', TT: 'tt', DN: 'dn' };
const COUNTER_MEMBERS: Record<string, keyof CounterValue> = { PRE: 'pre', ACC: 'acc', CU: 'cu', CD: 'cd', DN: 'dn' };

export function newTimer(pre: number): TimerValue {
  return { pre, acc: 0, en: false, tt: false, dn: false };
}

export function newCounter(pre: number): CounterValue {
  return { pre, acc: 0, cu: false, cd: false, dn: false };
}

function initialValue(def: TagDef): TagValue {
  switch (def.type) {
    case 'BOOL':
      return Boolean(def.initial ?? false);
    case 'INT':
    case 'REAL':
      return Number(def.initial ?? 0);
    case 'TIMER':
      return newTimer(def.preset ?? 0);
    case 'COUNTER':
      return newCounter(def.preset ?? 0);
  }
}

/** Tag database. Paths are `Name` or `Name.MEMBER` (AB member names). */
export class Memory {
  readonly defs = new Map<string, TagDef>();
  private values = new Map<string, TagValue>();

  constructor(tags: TagDef[]) {
    for (const def of tags) {
      if (this.defs.has(def.name)) throw new Error(`Duplicate tag ${def.name}`);
      this.defs.set(def.name, def);
      this.values.set(def.name, initialValue(def));
    }
  }

  reset(): void {
    for (const def of this.defs.values()) this.values.set(def.name, initialValue(def));
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  /** Raw tag value (timer/counter objects are live references). */
  tag(name: string): TagValue {
    const v = this.values.get(name);
    if (v === undefined) throw new Error(`Unknown tag ${name}`);
    return v;
  }

  timer(name: string): TimerValue {
    const v = this.tag(name);
    if (typeof v !== 'object' || !('tt' in v)) throw new Error(`${name} is not a TIMER`);
    return v;
  }

  counter(name: string): CounterValue {
    const v = this.tag(name);
    if (typeof v !== 'object' || !('cu' in v)) throw new Error(`${name} is not a COUNTER`);
    return v;
  }

  get(path: TagPath): boolean | number {
    const [name, member] = path.split('.');
    const v = this.tag(name);
    if (typeof v !== 'object') {
      if (member) throw new Error(`${name} has no member ${member}`);
      return v;
    }
    if (!member) throw new Error(`${name} needs a member (e.g. ${name}.DN)`);
    const key = 'tt' in v ? TIMER_MEMBERS[member] : COUNTER_MEMBERS[member];
    if (!key) throw new Error(`${name} has no member ${member}`);
    return (v as unknown as Record<string, boolean | number>)[key];
  }

  getBool(path: TagPath): boolean {
    return Boolean(this.get(path));
  }

  getNum(path: TagPath): number {
    return Number(this.get(path));
  }

  value(op: Operand): number {
    return typeof op === 'number' ? op : this.getNum(op);
  }

  set(path: TagPath, value: boolean | number): void {
    const [name, member] = path.split('.');
    const v = this.tag(name);
    if (typeof v !== 'object') {
      const def = this.defs.get(name)!;
      if (def.type === 'BOOL') this.values.set(name, Boolean(value));
      // Logix rounds REAL -> INT on store; Siemens would need an explicit ROUND, same result.
      else if (def.type === 'INT') this.values.set(name, Math.round(Number(value)));
      else this.values.set(name, Number(value));
      return;
    }
    const key = 'tt' in v ? TIMER_MEMBERS[member] : COUNTER_MEMBERS[member];
    if (!key) throw new Error(`${name} has no member ${member}`);
    (v as unknown as Record<string, boolean | number>)[key] = value;
  }
}

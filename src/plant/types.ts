import type { Memory } from '../plc/memory';

export type FieldValue = boolean | number;

export interface PlantContext {
  /** PLC tag memory: read outputs, write inputs. */
  io: Memory;
  /** Operator controls (pushbuttons, selector switches, sliders) by name. */
  field: Record<string, FieldValue>;
  /** Active injected faults by id. */
  faults: ReadonlySet<string>;
  /** Step size, ms. */
  dt: number;
}

/**
 * The simulated machine. Each step it reads PLC outputs and field controls,
 * updates its physics, then writes the PLC inputs (where faults are applied:
 * a stuck sensor or a dead contactor is just a different input value).
 */
export interface Plant<S = unknown> {
  state: S;
  step(ctx: PlantContext): void;
}

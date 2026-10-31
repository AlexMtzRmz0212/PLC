import type { Program } from '../plc/types';
import type { FieldValue, Plant } from '../plant/types';

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'neutral';

export type Control =
  | { kind: 'momentary'; field: string; label: string; tone?: Tone }
  | { kind: 'toggle'; field: string; label: string; on: string; off: string }
  | { kind: 'estop'; field: string; label: string }
  | { kind: 'slider'; field: string; label: string; min: number; max: number; unit: string };

export interface Indicator {
  tag: string;
  label: string;
  tone: Tone;
}

export interface AlarmDef {
  tag: string;
  message: string;
}

export interface FaultDef {
  id: string;
  label: string;
  detail: string;
}

export interface TrendDef {
  tag: string;
  label: string;
  min: number;
  max: number;
  unit: string;
  /** Horizontal reference lines, e.g. pump start/stop levels. */
  marks?: { value: number; label: string }[];
}

/** Everything about a scenario except its machine graphic (kept React-free for tests). */
export interface ScenarioLogic {
  id: string;
  number: number;
  title: string;
  tagline: string;
  skills: string[];
  /** Paragraphs describing the design. */
  about: string[];
  /** Guided steps for a visitor. */
  tryThis: string[];
  program: Program;
  createPlant(): Plant;
  initialField: Record<string, FieldValue>;
  controls: Control[];
  indicators: Indicator[];
  alarms: AlarmDef[];
  faults: FaultDef[];
  trend?: TrendDef[];
}

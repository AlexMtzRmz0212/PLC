import { Plc, SCAN_MS } from '../plc/scan';
import type { ScenarioLogic } from '../scenarios/types';
import type { FieldValue, Plant } from './types';

const TREND_SAMPLE_MS = 200;
const TREND_SAMPLES = 300; // 60 s window
const MAX_SCANS_PER_FRAME = 200;

/** Couples a PLC and its plant, and runs them in real time (or headless in tests). */
export class Sim {
  readonly plc: Plc;
  plant: Plant;
  field: Record<string, FieldValue>;
  faults = new Set<string>();
  running = false;
  speed = 1;
  /** Simulated time, ms. */
  time = 0;
  trend: number[][] = [];

  private version = 0;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private carry = 0;
  private sinceSample = 0;

  constructor(readonly scenario: ScenarioLogic) {
    this.plc = new Plc(scenario.program);
    this.plant = scenario.createPlant();
    this.field = { ...scenario.initialField };
    this.prime();
  }

  /** One PLC scan: plant writes inputs, then the CPU executes the program. */
  step(): void {
    this.plant.step({ io: this.plc.mem, field: this.field, faults: this.faults, dt: SCAN_MS });
    this.plc.scan(SCAN_MS);
    this.time += SCAN_MS;
    this.sinceSample += SCAN_MS;
    if (this.sinceSample >= TREND_SAMPLE_MS) {
      this.sinceSample = 0;
      this.sampleTrend();
    }
  }

  /** Run headless for `ms` of simulated time. */
  advance(ms: number): void {
    for (let t = 0; t < ms; t += SCAN_MS) this.step();
    this.notify();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.carry = 0;
    const frame = (now: number) => {
      if (!this.running) return;
      this.carry += Math.min(now - this.last, 250) * this.speed;
      this.last = now;
      let n = 0;
      while (this.carry >= SCAN_MS && n < MAX_SCANS_PER_FRAME) {
        this.step();
        this.carry -= SCAN_MS;
        n++;
      }
      this.notify();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.notify();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.notify();
  }

  /** Single scan while stopped. */
  singleScan(): void {
    this.step();
    this.notify();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.notify();
  }

  setField(name: string, value: FieldValue): void {
    this.field[name] = value;
    this.notify();
  }

  setFault(id: string, active: boolean): void {
    if (active) this.faults.add(id);
    else this.faults.delete(id);
    this.notify();
  }

  /** Power-cycle: clear memory, rebuild the machine, keep the run state. */
  reset(): void {
    this.plc.reset();
    this.plant = this.scenario.createPlant();
    this.field = { ...this.scenario.initialField };
    this.faults.clear();
    this.time = 0;
    this.trend = [];
    this.prime();
    this.notify();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** First scan so the ladder shows real power flow before Run is pressed. */
  private prime(): void {
    this.step();
    this.time = 0;
  }

  private sampleTrend(): void {
    const defs = this.scenario.trend;
    if (!defs) return;
    this.trend.push(defs.map((d) => this.plc.mem.getNum(d.tag)));
    if (this.trend.length > TREND_SAMPLES) this.trend.shift();
  }
}

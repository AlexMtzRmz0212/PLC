import { BR, GEQ, GRT, LES, ONS, OTE, OTL, OTU, SCP, TON, XIC, XIO, bit, input, output, real, rung, timer } from '../../plc/build';
import type { Plant } from '../../plant/types';
import type { ScenarioLogic } from '../types';

// ---------------------------------------------------------------------------
// Program: duplex lift station (two pumps empty a sump that fills from a process)
// ---------------------------------------------------------------------------

/** Siemens analog input: 0..27648 = 0..100 %, 32767 (7FFFh) = wire break / overflow. */
const RAW_FULL = 27648;
const RAW_FAULT = 29000;

const tags = [
  input('Auto_Sel', '%I0.0', 'Auto / Off selector'),
  input('Reset_PB', '%I0.1', 'Fault reset'),
  input('LSHH_Float', '%I0.2', 'High-high float switch (independent backup)'),
  input('P1_FB', '%I0.3', 'Pump 1 running feedback'),
  input('P2_FB', '%I0.4', 'Pump 2 running feedback'),
  input('Level_Raw', '%IW64', 'Level transmitter, raw counts', 'INT'),
  output('Pump1', '%Q0.0', 'Pump 1 starter'),
  output('Pump2', '%Q0.1', 'Pump 2 starter'),
  output('Alarm_Lamp', '%Q0.2', 'Common alarm beacon'),
  real('Level_Pct', '%MD20', 'Level, % of span'),
  bit('Lead_Demand', '%M0.0', 'Lead pump call (70 % on / 30 % off)'),
  bit('Lag_Demand', '%M0.1', 'Lag pump call (85 % on / 50 % off)'),
  bit('Lead_Is_P2', '%M0.2', 'Alternation: TRUE = pump 2 leads'),
  bit('Alt_ONS', '%M0.3', 'One-shot storage for alternation'),
  bit('Alt_Pulse', '%M0.4', 'One-scan pulse at end of pump cycle'),
  bit('Alm_LT_Fail', '%M10.0', 'Alarm: level transmitter failed'),
  bit('Alm_HiHi', '%M10.1', 'Alarm: high-high level'),
  bit('Alm_P1_Fail', '%M10.2', 'Alarm: pump 1 failed to run'),
  bit('Alm_P2_Fail', '%M10.3', 'Alarm: pump 2 failed to run'),
  timer('P1_FB_TMR', 2000, 'Pump 1 feedback supervision'),
  timer('P2_FB_TMR', 2000, 'Pump 2 feedback supervision'),
];

const rungs = [
  rung('Scale raw counts to %. (Siemens: NORM_X + SCALE_X)', SCP('Level_Raw', 0, RAW_FULL, 0, 100, 'Level_Pct')),
  rung('Transmitter failed: signal above range (wire break reads 32767).', GRT('Level_Raw', RAW_FAULT), OTL('Alm_LT_Fail')),
  rung(
    'Lead pump call with hysteresis: on at 70 %, off at 30 %. If the transmitter fails, the float switch still calls both pumps.',
    XIC('Auto_Sel'),
    BR([XIO('Alm_LT_Fail'), BR([GEQ('Level_Pct', 70)], [XIC('Lead_Demand'), GRT('Level_Pct', 30)])], [XIC('LSHH_Float')]),
    OTE('Lead_Demand'),
  ),
  rung(
    'Lag pump call: on at 85 %, off at 50 %.',
    XIC('Auto_Sel'),
    BR([XIO('Alm_LT_Fail'), BR([GEQ('Level_Pct', 85)], [XIC('Lag_Demand'), GRT('Level_Pct', 50)])], [XIC('LSHH_Float')]),
    OTE('Lag_Demand'),
  ),
  rung('End of a pump cycle: one-scan pulse.', XIO('Lead_Demand'), ONS('Alt_ONS'), OTE('Alt_Pulse')),
  rung(
    'Alternate lead pump each cycle (toggle = XOR) to share wear.',
    BR([XIC('Alt_Pulse'), XIO('Lead_Is_P2')], [XIO('Alt_Pulse'), XIC('Lead_Is_P2')]),
    OTE('Lead_Is_P2'),
  ),
  rung(
    'Pump 1: when it leads, on lag call, or when pump 2 has failed. Never if failed itself.',
    BR([XIC('Lead_Demand'), XIO('Lead_Is_P2')], [XIC('Lag_Demand')], [XIC('Lead_Demand'), XIC('Alm_P2_Fail')]),
    XIO('Alm_P1_Fail'),
    OTE('Pump1'),
  ),
  rung(
    'Pump 2: mirror of pump 1.',
    BR([XIC('Lead_Demand'), XIC('Lead_Is_P2')], [XIC('Lag_Demand')], [XIC('Lead_Demand'), XIC('Alm_P1_Fail')]),
    XIO('Alm_P2_Fail'),
    OTE('Pump2'),
  ),
  rung('Pump 1 feedback supervision.', XIC('Pump1'), XIO('P1_FB'), TON('P1_FB_TMR')),
  rung('Latch pump 1 fail: pump 2 takes over automatically.', XIC('P1_FB_TMR.DN'), OTL('Alm_P1_Fail')),
  rung('Pump 2 feedback supervision.', XIC('Pump2'), XIO('P2_FB'), TON('P2_FB_TMR')),
  rung('Latch pump 2 fail.', XIC('P2_FB_TMR.DN'), OTL('Alm_P2_Fail')),
  rung('High-high level from the transmitter or the independent float.', BR([GEQ('Level_Pct', 95)], [XIC('LSHH_Float')]), OTL('Alm_HiHi')),
  rung(
    'Reset alarms whose cause has cleared.',
    XIC('Reset_PB'),
    BR([OTU('Alm_P1_Fail')], [OTU('Alm_P2_Fail')], [LES('Level_Raw', RAW_FAULT), OTU('Alm_LT_Fail')], [LES('Level_Pct', 90), XIO('LSHH_Float'), OTU('Alm_HiHi')]),
  ),
  rung(
    'Common alarm beacon.',
    BR([XIC('Alm_LT_Fail')], [XIC('Alm_HiHi')], [XIC('Alm_P1_Fail')], [XIC('Alm_P2_Fail')]),
    OTE('Alarm_Lamp'),
  ),
];

// ---------------------------------------------------------------------------
// Plant: sump level, pumps with feedback, float switch, 4-20 mA transmitter
// ---------------------------------------------------------------------------

export interface TankState {
  level: number; // %
  p1: number; // pump speed 0..1
  p2: number;
  p1Delay: number;
  p2Delay: number;
}

const MAX_INFLOW = 7; // %/s at 100 % slider
const PUMP_RATE = 5; // %/s per pump
const FLOAT_LEVEL = 92;

function createPlant(): Plant<TankState> {
  const state: TankState = { level: 45, p1: 0, p2: 0, p1Delay: 0, p2Delay: 0 };
  return {
    state,
    step({ io, field, faults, dt }) {
      const s = state;
      const run1 = io.getBool('Pump1') && !faults.has('p1_fail');
      const run2 = io.getBool('Pump2');
      s.p1 += ((run1 ? 1 : 0) - s.p1) * Math.min(1, dt / 400);
      s.p2 += ((run2 ? 1 : 0) - s.p2) * Math.min(1, dt / 400);
      s.p1Delay = run1 ? s.p1Delay + dt : 0;
      s.p2Delay = run2 ? s.p2Delay + dt : 0;

      const inflow = (Number(field.inflow) / 100) * MAX_INFLOW;
      const outflow = PUMP_RATE * (s.p1 + s.p2) * (s.level > 2 ? 1 : 0);
      s.level = Math.max(0, Math.min(100, s.level + ((inflow - outflow) * dt) / 1000));

      const raw = faults.has('lt_break') ? 32767 : Math.round((s.level / 100) * RAW_FULL);
      io.set('Auto_Sel', Boolean(field.auto));
      io.set('Reset_PB', Boolean(field.reset));
      io.set('LSHH_Float', s.level >= FLOAT_LEVEL);
      io.set('P1_FB', s.p1Delay > 300);
      io.set('P2_FB', s.p2Delay > 300);
      io.set('Level_Raw', raw);
    },
  };
}

export const tank: ScenarioLogic = {
  id: 'tank',
  number: 4,
  title: 'Duplex Lift Station',
  tagline: 'Analog scaling, hysteresis control, lead/lag alternation and redundant level sensing.',
  skills: ['Analog scaling', 'Hysteresis', 'Lead/lag alternation', 'Redundancy'],
  about: [
    'A sump fills from a process and two pumps empty it. The level transmitter is read as raw counts (0–27648, the Siemens analog range) and scaled to % with SCP / NORM_X + SCALE_X.',
    'The lead pump starts at 70 % and stops at 30 %; that gap is the hysteresis that stops the pump from short-cycling. If inflow beats one pump, the lag pump joins at 85 %. At the end of each cycle the lead pump alternates so both share the wear.',
    'Redundancy is layered: a failed pump is detected by missing run feedback and the other pump takes over, and if the transmitter fails (wire break reads 32767) an independent float switch still calls both pumps before the sump overflows.',
  ],
  tryThis: [
    'Press Run and set speed to x5. Watch the level cycle between 30 % and 70 % on the trend, and the lead pump alternate.',
    'Raise inflow above 75 %: one pump can’t keep up, so the lag pump starts at 85 %.',
    'Inject "Pump 1 won’t start": after 2 s the alarm latches and pump 2 takes over.',
    'Inject "Transmitter wire break": the level reading is lost, yet the float switch keeps the sump from overflowing.',
  ],
  program: { tags, rungs },
  createPlant,
  initialField: { auto: true, reset: false, inflow: 45 },
  controls: [
    { kind: 'toggle', field: 'auto', label: 'Mode', on: 'Auto', off: 'Off' },
    { kind: 'momentary', field: 'reset', label: 'Reset', tone: 'blue' },
    { kind: 'slider', field: 'inflow', label: 'Inflow', min: 0, max: 100, unit: '%' },
  ],
  indicators: [
    { tag: 'Pump1', label: 'Pump 1', tone: 'green' },
    { tag: 'Pump2', label: 'Pump 2', tone: 'green' },
    { tag: 'Lead_Is_P2', label: 'P2 leads', tone: 'blue' },
    { tag: 'Alarm_Lamp', label: 'Alarm', tone: 'red' },
  ],
  alarms: [
    { tag: 'Alm_HiHi', message: 'High-high level' },
    { tag: 'Alm_LT_Fail', message: 'Level transmitter failure (signal out of range)' },
    { tag: 'Alm_P1_Fail', message: 'Pump 1 failed to run' },
    { tag: 'Alm_P2_Fail', message: 'Pump 2 failed to run' },
  ],
  faults: [
    { id: 'p1_fail', label: 'Pump 1 won’t start', detail: 'Starter tripped: pump 1 does not run when called.' },
    { id: 'lt_break', label: 'Transmitter wire break', detail: '4–20 mA loop open: input reads 32767.' },
  ],
  trend: [
    {
      tag: 'Level_Pct',
      label: 'Level',
      min: 0,
      max: 100,
      unit: '%',
      marks: [
        { value: 70, label: 'Lead on' },
        { value: 30, label: 'Lead off' },
        { value: 85, label: 'Lag on' },
      ],
    },
  ],
};

import { BR, EQU, GEQ, LES, MOV, NEQ, ONS, OTE, OTL, OTU, TON, XIC, XIO, bit, input, int, output, rung, timer } from '../../plc/build';
import type { Plant } from '../../plant/types';
import type { ScenarioLogic } from '../types';

// ---------------------------------------------------------------------------
// Program: step-sequencer state machine (Step = 0..4) driven by timers
// ---------------------------------------------------------------------------

const tags = [
  input('Ped_PB', '%I0.0', 'Pedestrian request button'),
  input('Night_Mode', '%I0.1', 'Night mode selector (flashing amber)'),
  input('Red_Lamp_OK', '%I0.2', 'Red lamp current sensor'),
  input('Reset_PB', '%I0.3', 'Fault reset'),
  output('Car_Red', '%Q0.0', 'Vehicle red'),
  output('Car_Amber', '%Q0.1', 'Vehicle amber'),
  output('Car_Green', '%Q0.2', 'Vehicle green'),
  output('Ped_Walk', '%Q0.3', 'Pedestrian walk'),
  output('Ped_DontWalk', '%Q0.4', 'Pedestrian don’t walk'),
  output('Ped_Wait', '%Q0.5', 'Pedestrian "wait" lamp'),
  int('Step', '%MW10', 'Sequencer step'),
  bit('Ped_Req', '%M0.0', 'Latched pedestrian request'),
  bit('Ped_ONS', '%M0.1', 'One-shot storage for Ped_PB'),
  bit('Flash', '%M0.2', '1 Hz flasher bit'),
  bit('Flash_Mode', '%M0.3', 'Flashing amber active'),
  bit('Alm_RedLamp', '%M10.0', 'Alarm: red lamp failed'),
  timer('Flash_TMR', 1000, '1 Hz flasher base'),
  timer('Green_TMR', 5000, 'Minimum green'),
  timer('Amber_TMR', 3000, 'Amber time'),
  timer('AllRed_TMR', 1500, 'All-red clearance'),
  timer('Walk_TMR', 6000, 'Walk time'),
  timer('Clear_TMR', 4000, 'Flashing don’t walk'),
  timer('LampChk_TMR', 300, 'Red lamp current check'),
];

const rungs = [
  rung('1 Hz flasher: self-resetting timer.', XIO('Flash_TMR.DN'), TON('Flash_TMR')),
  rung('Flash is ON for the first half of each second.', LES('Flash_TMR.ACC', 500), OTE('Flash')),
  rung('Red lamp check: if red is commanded but draws no current for 300 ms, the bulb is out.', XIC('Car_Red'), XIO('Red_Lamp_OK'), TON('LampChk_TMR')),
  rung('Latch red lamp alarm.', XIC('LampChk_TMR.DN'), OTL('Alm_RedLamp')),
  rung('Reset alarm.', XIC('Reset_PB'), OTU('Alm_RedLamp')),
  rung('Fail-safe: no red lamp means no safe stop signal, so go to flashing amber.', BR([XIC('Night_Mode')], [XIC('Alm_RedLamp')]), OTE('Flash_Mode')),
  rung('Latch pedestrian request on the rising edge only (a held or stuck button counts once).', XIC('Ped_PB'), ONS('Ped_ONS'), OTL('Ped_Req')),
  rung('Step 0 – Green: minimum green time.', EQU('Step', 0), XIO('Flash_Mode'), TON('Green_TMR')),
  rung('Step 0 → 1 after minimum green, only if a pedestrian is waiting.', EQU('Step', 0), XIC('Green_TMR.DN'), XIC('Ped_Req'), MOV(1, 'Step')),
  rung('Step 1 – Amber.', EQU('Step', 1), TON('Amber_TMR')),
  rung('Step 1 → 2', EQU('Step', 1), XIC('Amber_TMR.DN'), MOV(2, 'Step')),
  rung('Step 2 – All red clearance.', EQU('Step', 2), TON('AllRed_TMR')),
  rung('Step 2 → 3', EQU('Step', 2), XIC('AllRed_TMR.DN'), MOV(3, 'Step')),
  rung('Step 3 – Walk.', EQU('Step', 3), TON('Walk_TMR')),
  rung('Step 3 → 4', EQU('Step', 3), XIC('Walk_TMR.DN'), MOV(4, 'Step')),
  rung('Step 4 – Flashing don’t walk.', EQU('Step', 4), TON('Clear_TMR')),
  rung('Step 4 → 0 and clear the request.', EQU('Step', 4), XIC('Clear_TMR.DN'), BR([MOV(0, 'Step')], [OTU('Ped_Req')])),
  rung('Flash mode parks the sequence at step 0.', XIC('Flash_Mode'), MOV(0, 'Step')),
  rung('Vehicle green.', EQU('Step', 0), XIO('Flash_Mode'), OTE('Car_Green')),
  rung('Vehicle amber: step 1, or flashing in flash mode.', BR([EQU('Step', 1), XIO('Flash_Mode')], [XIC('Flash_Mode'), XIC('Flash')]), OTE('Car_Amber')),
  rung('Vehicle red: steps 2–4.', GEQ('Step', 2), XIO('Flash_Mode'), OTE('Car_Red')),
  rung('Pedestrian walk.', EQU('Step', 3), OTE('Ped_Walk')),
  rung("Don't walk: solid except steps 3–4, flashing in step 4.", BR([NEQ('Step', 3), NEQ('Step', 4)], [EQU('Step', 4), XIC('Flash')]), OTE('Ped_DontWalk')),
  rung('Wait lamp while a request is pending.', XIC('Ped_Req'), LES('Step', 3), OTE('Ped_Wait')),
];

// ---------------------------------------------------------------------------
// Plant: lamps with a current sensor on the red lamp
// ---------------------------------------------------------------------------

export interface TrafficState {
  carRed: boolean;
  carAmber: boolean;
  carGreen: boolean;
  walk: boolean;
  dontWalk: boolean;
  wait: boolean;
  redBulbOk: boolean;
}

function createPlant(): Plant<TrafficState> {
  const state: TrafficState = { carRed: false, carAmber: false, carGreen: false, walk: false, dontWalk: false, wait: false, redBulbOk: true };
  return {
    state,
    step({ io, field, faults }) {
      const s = state;
      s.redBulbOk = !faults.has('red_lamp');
      s.carRed = io.getBool('Car_Red') && s.redBulbOk;
      s.carAmber = io.getBool('Car_Amber');
      s.carGreen = io.getBool('Car_Green');
      s.walk = io.getBool('Ped_Walk');
      s.dontWalk = io.getBool('Ped_DontWalk');
      s.wait = io.getBool('Ped_Wait');

      io.set('Ped_PB', Boolean(field.ped) || faults.has('ped_stuck'));
      io.set('Night_Mode', Boolean(field.night));
      io.set('Red_Lamp_OK', s.carRed);
      io.set('Reset_PB', Boolean(field.reset));
    },
  };
}

export const traffic: ScenarioLogic = {
  id: 'traffic',
  number: 2,
  title: 'Pedestrian Crossing',
  tagline: 'Timer-driven step sequencer with edge-detected requests and a fail-safe lamp check.',
  skills: ['State machines', 'Timers', 'One-shots', 'Fail-safe design'],
  about: [
    'A pedestrian crossing written as a step sequencer: an INT Step tag holds the state, each step has its own timer, and each transition is one rung (EQU Step + timer DN → MOV next step). This is the ladder equivalent of a CASE statement and scales to real machine sequences.',
    'The pedestrian button is edge-detected with a one-shot, so holding it or a stuck contact only places one request.',
    'The red lamp has a current sensor. If red is commanded but no current flows, the controller can no longer show a safe stop, so it latches an alarm and drops to flashing amber.',
  ],
  tryThis: [
    'Press Run, then the pedestrian button. Green holds for its 5 s minimum, then the sequence runs.',
    'Watch the Step tag in the Tags tab change as each transition rung fires.',
    'Inject "Red lamp burnt out" and wait for the next red phase: the lamp check trips and the signal goes to flashing amber.',
    'Inject "Pedestrian button stuck": only one request is placed per press, thanks to the ONS.',
  ],
  program: { tags, rungs },
  createPlant,
  initialField: { ped: false, night: false, reset: false },
  controls: [
    { kind: 'momentary', field: 'ped', label: 'Ped. button', tone: 'amber' },
    { kind: 'toggle', field: 'night', label: 'Mode', on: 'Night', off: 'Day' },
    { kind: 'momentary', field: 'reset', label: 'Reset', tone: 'blue' },
  ],
  indicators: [
    { tag: 'Ped_Req', label: 'Request', tone: 'amber' },
    { tag: 'Flash_Mode', label: 'Flash mode', tone: 'amber' },
  ],
  alarms: [{ tag: 'Alm_RedLamp', message: 'Vehicle red lamp failed – flashing amber' }],
  faults: [
    { id: 'red_lamp', label: 'Red lamp burnt out', detail: 'Red bulb open circuit: no current when commanded.' },
    { id: 'ped_stuck', label: 'Pedestrian button stuck', detail: 'The button contact is welded closed.' },
  ],
};

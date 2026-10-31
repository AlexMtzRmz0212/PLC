import { BR, OTE, OTL, OTU, TON, XIC, XIO, bit, input, output, rung, timer } from '../../plc/build';
import type { Plant } from '../../plant/types';
import type { ScenarioLogic } from '../types';

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const tags = [
  input('Start_PB', '%I0.0', 'Start pushbutton (NO)'),
  input('Stop_PB', '%I0.1', 'Stop pushbutton, NC contact: TRUE = not pressed'),
  input('EStop_OK', '%I0.2', 'E-stop safety relay status, TRUE = healthy'),
  input('OL_OK', '%I0.3', 'Overload relay aux (NC), TRUE = not tripped'),
  input('Motor_Aux', '%I0.4', 'Contactor auxiliary contact (run feedback)'),
  input('Reset_PB', '%I0.5', 'Fault reset pushbutton'),
  output('Motor_Run', '%Q0.0', 'Motor contactor coil K1'),
  output('Run_Lamp', '%Q0.1', 'Green running lamp'),
  output('Fault_Lamp', '%Q0.2', 'Red fault lamp'),
  bit('Run_Cmd', '%M0.0', 'Sealed-in run command'),
  bit('Fault_Active', '%M0.1', 'Any alarm active'),
  bit('Alm_Overload', '%M10.0', 'Alarm: motor overload tripped'),
  bit('Alm_NoFeedback', '%M10.1', 'Alarm: contactor did not confirm'),
  bit('Alm_EStop', '%M10.2', 'Alarm: emergency stop'),
  timer('FB_TMR', 1000, 'Contactor feedback supervision'),
];

const rungs = [
  rung(
    'Start/stop seal-in. Stop and E-stop are NC (fail-safe): a broken wire stops the motor.',
    BR([XIC('Start_PB')], [XIC('Run_Cmd')]),
    XIC('Stop_PB'),
    XIC('EStop_OK'),
    XIO('Fault_Active'),
    OTE('Run_Cmd'),
  ),
  rung('Drive the contactor coil.', XIC('Run_Cmd'), OTE('Motor_Run')),
  rung('Feedback supervision: contactor aux must close within 1 s of the run command.', XIC('Run_Cmd'), XIO('Motor_Aux'), TON('FB_TMR')),
  rung('Latch: no run feedback.', XIC('FB_TMR.DN'), OTL('Alm_NoFeedback')),
  rung('Latch: overload relay tripped.', XIO('OL_OK'), OTL('Alm_Overload')),
  rung('Latch: emergency stop pressed.', XIO('EStop_OK'), OTL('Alm_EStop')),
  rung(
    'Reset clears each alarm only once its cause is gone.',
    XIC('Reset_PB'),
    BR([XIC('OL_OK'), OTU('Alm_Overload')], [XIC('EStop_OK'), OTU('Alm_EStop')], [OTU('Alm_NoFeedback')]),
  ),
  rung('Fault summary.', BR([XIC('Alm_Overload')], [XIC('Alm_NoFeedback')], [XIC('Alm_EStop')]), OTE('Fault_Active')),
  rung('Running lamp follows real feedback, not the command.', XIC('Motor_Aux'), OTE('Run_Lamp')),
  rung('Fault lamp.', XIC('Fault_Active'), OTE('Fault_Lamp')),
];

// ---------------------------------------------------------------------------
// Plant: contactor, motor speed and current, overload relay
// ---------------------------------------------------------------------------

export interface MotorState {
  contactor: boolean;
  contactorDelay: number;
  speed: number; // 0..1
  current: number; // A
  olTripped: boolean;
  olHeat: number; // 0..1
  angle: number; // shaft angle, degrees (for the graphic)
}

function createPlant(): Plant<MotorState> {
  const state: MotorState = { contactor: false, contactorDelay: 0, speed: 0, current: 0, olTripped: false, olHeat: 0, angle: 0 };
  return {
    state,
    step({ io, field, faults, dt }) {
      const s = state;
      const coil = io.getBool('Motor_Run') && !faults.has('contactor_fail');
      // Contactor pulls in ~40 ms after the coil is energized.
      s.contactorDelay = coil ? s.contactorDelay + dt : 0;
      s.contactor = coil && s.contactorDelay >= 40;

      const powered = s.contactor && !s.olTripped;
      const jammed = faults.has('overload');
      const target = powered ? (jammed ? 0.35 : 1) : 0;
      s.speed += (target - s.speed) * Math.min(1, dt / (powered ? 600 : 1200));
      s.angle = (s.angle + s.speed * dt * 0.9) % 360;
      s.current = powered ? (jammed ? 38 : 9.5 + 20 * Math.max(0, 0.9 - s.speed)) : 0;

      // Thermal overload: heats above 12 A, trips at full heat, cools when off.
      s.olHeat = Math.max(0, Math.min(1, s.olHeat + (s.current > 12 ? dt / 1500 : -dt / 4000)));
      if (s.olHeat >= 1) s.olTripped = true;
      if (s.olTripped && s.olHeat < 0.5 && !jammed) s.olTripped = false; // auto-reset relay once cool

      io.set('Start_PB', Boolean(field.start));
      io.set('Stop_PB', !field.stop && !faults.has('stop_wire'));
      io.set('EStop_OK', !field.estop);
      io.set('OL_OK', !s.olTripped);
      io.set('Motor_Aux', s.contactor);
      io.set('Reset_PB', Boolean(field.reset));
    },
  };
}

export const motor: ScenarioLogic = {
  id: 'motor',
  number: 1,
  title: 'Motor Start / Stop',
  tagline: 'Three-wire control with seal-in, E-stop, overload and contactor feedback supervision.',
  skills: ['Seal-in circuits', 'Fail-safe NC wiring', 'Alarm latching', 'Feedback supervision'],
  about: [
    'The classic three-wire start/stop circuit, written the way it would be on a real machine. Stop and E-stop are wired normally-closed, so the PLC sees TRUE when healthy and a cut wire stops the motor instead of disabling the stop button.',
    'The program does not trust its own output. After commanding the contactor it waits up to 1 s for the auxiliary contact to confirm. If it never closes, a latched alarm stops the run command and holds the fault until an operator resets it.',
    'Alarms latch and reset only when their cause is gone: pressing Reset while the E-stop is still pressed leaves that alarm active.',
  ],
  tryThis: [
    'Press Run, then Start. The seal-in rung keeps the motor running after you release Start.',
    'Inject "Motor jammed": current climbs, the overload relay trips, and the overload alarm latches.',
    'Inject "Contactor fails to close", then press Start: watch FB_TMR time out and latch the feedback alarm.',
    'Inject "Stop wire cut": the motor stops, because the NC stop circuit is fail-safe.',
  ],
  program: { tags, rungs },
  createPlant,
  initialField: { start: false, stop: false, estop: false, reset: false },
  controls: [
    { kind: 'momentary', field: 'start', label: 'Start', tone: 'green' },
    { kind: 'momentary', field: 'stop', label: 'Stop', tone: 'red' },
    { kind: 'momentary', field: 'reset', label: 'Reset', tone: 'blue' },
    { kind: 'estop', field: 'estop', label: 'E-Stop' },
  ],
  indicators: [
    { tag: 'Run_Lamp', label: 'Running', tone: 'green' },
    { tag: 'Fault_Lamp', label: 'Fault', tone: 'red' },
  ],
  alarms: [
    { tag: 'Alm_Overload', message: 'Motor overload tripped' },
    { tag: 'Alm_NoFeedback', message: 'Contactor K1 did not confirm (no aux feedback)' },
    { tag: 'Alm_EStop', message: 'Emergency stop activated' },
  ],
  faults: [
    { id: 'overload', label: 'Motor jammed', detail: 'Mechanical jam: current rises until the thermal overload trips.' },
    { id: 'contactor_fail', label: 'Contactor fails to close', detail: 'Coil open circuit: K1 never pulls in.' },
    { id: 'stop_wire', label: 'Stop wire cut', detail: 'Broken wire on the NC stop circuit.' },
  ],
};

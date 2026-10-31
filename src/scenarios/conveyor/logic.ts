import { BR, CTU, ONS, OTE, OTL, OTU, RES, TON, XIC, XIO, bit, counter, input, output, rung, timer } from '../../plc/build';
import type { Plant } from '../../plant/types';
import type { ScenarioLogic } from '../types';

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const tags = [
  input('Start_PB', '%I0.0', 'Start pushbutton'),
  input('Stop_PB', '%I0.1', 'Stop pushbutton (NC)'),
  input('Reset_PB', '%I0.2', 'Fault reset'),
  input('PE_Entry', '%I0.3', 'Photo-eye at infeed'),
  input('PE_Height', '%I0.4', 'Height photo-eye, only blocked by tall boxes'),
  input('PE_Divert', '%I0.5', 'Photo-eye at the diverter'),
  input('Belt_Motion', '%I0.6', 'Zero-speed switch, TRUE = belt moving'),
  output('Conv_Motor', '%Q0.0', 'Conveyor motor contactor'),
  output('Divert_Sol', '%Q0.1', 'Diverter pusher solenoid'),
  output('Feeder_En', '%Q0.2', 'Enable upstream box feeder'),
  output('Batch_Lamp', '%Q0.3', 'Batch complete lamp'),
  output('Fault_Lamp', '%Q0.4', 'Fault lamp'),
  bit('Conv_Run', '%M0.0', 'Conveyor run command'),
  bit('Tall_Pending', '%M0.1', 'A tall box is between height eye and diverter'),
  bit('Divert_Cmd', '%M0.2', 'Diverter stroke active'),
  bit('Div_ONS', '%M0.3', 'One-shot storage for PE_Divert (diverter)'),
  bit('Cnt_ONS', '%M0.5', 'One-shot storage for PE_Divert (counting)'),
  bit('Fault_Active', '%M0.4', 'Any alarm active'),
  bit('Alm_Jam', '%M10.0', 'Alarm: box jam'),
  bit('Alm_NoMotion', '%M10.1', 'Alarm: belt not moving'),
  timer('Jam_TMR', 3000, 'Photo-eye blocked too long'),
  timer('Motion_TMR', 1500, 'Belt motion supervision'),
  timer('Divert_TMR', 800, 'Diverter stroke time'),
  counter('Batch_CTR', 10, 'Boxes per batch'),
  counter('Tall_CTR', 9999, 'Tall boxes diverted'),
];

const rungs = [
  rung('Acknowledge a completed batch with Start: reset the batch counter.', XIC('Start_PB'), XIC('Batch_CTR.DN'), RES('Batch_CTR')),
  rung(
    'Run command: seal-in, stops on fault or batch complete.',
    BR([XIC('Start_PB')], [XIC('Conv_Run')]),
    XIC('Stop_PB'),
    XIO('Fault_Active'),
    XIO('Batch_CTR.DN'),
    OTE('Conv_Run'),
  ),
  rung('Conveyor motor.', XIC('Conv_Run'), OTE('Conv_Motor')),
  rung('Feed boxes only while the belt is actually moving.', XIC('Conv_Run'), XIC('Belt_Motion'), OTE('Feeder_En')),
  rung('Height eye sees a tall box: remember it until it reaches the diverter.', XIC('PE_Height'), XIC('Conv_Run'), OTL('Tall_Pending')),
  rung('Count every box that reaches the diverter. The ONS stops a box parked on the eye from being counted twice after a reset.', XIC('PE_Divert'), ONS('Cnt_ONS'), CTU('Batch_CTR')),
  rung(
    'Box arrives at diverter: if it was tall, fire the pusher and count it.',
    XIC('PE_Divert'),
    ONS('Div_ONS'),
    XIC('Tall_Pending'),
    BR([OTL('Divert_Cmd')], [OTU('Tall_Pending')], [CTU('Tall_CTR')]),
  ),
  rung('Pusher stroke time.', XIC('Divert_Cmd'), TON('Divert_TMR')),
  rung('Retract after the stroke.', XIC('Divert_TMR.DN'), OTU('Divert_Cmd')),
  rung('Diverter solenoid.', XIC('Divert_Cmd'), OTE('Divert_Sol')),
  rung('Jam detection: a photo-eye blocked for 3 s while running.', XIC('Conv_Run'), BR([XIC('PE_Entry')], [XIC('PE_Divert')]), TON('Jam_TMR')),
  rung('Latch jam alarm.', XIC('Jam_TMR.DN'), OTL('Alm_Jam')),
  rung('Motion supervision: motor commanded but zero-speed switch says stopped.', XIC('Conv_Motor'), XIO('Belt_Motion'), TON('Motion_TMR')),
  rung('Latch no-motion alarm.', XIC('Motion_TMR.DN'), OTL('Alm_NoMotion')),
  rung('Reset alarms.', XIC('Reset_PB'), BR([OTU('Alm_Jam')], [OTU('Alm_NoMotion')])),
  rung('Fault summary.', BR([XIC('Alm_Jam')], [XIC('Alm_NoMotion')]), OTE('Fault_Active')),
  rung('Batch complete lamp.', XIC('Batch_CTR.DN'), OTE('Batch_Lamp')),
  rung('Fault lamp.', XIC('Fault_Active'), OTE('Fault_Lamp')),
];

// ---------------------------------------------------------------------------
// Plant: belt, boxes, photo-eyes, pusher
// ---------------------------------------------------------------------------

/** Positions along the belt, 0..100. */
export const LAYOUT = { entry: 6, height: 35, divert: 65, end: 100, boxHalf: 3.5 };

export interface Box {
  id: number;
  x: number;
  tall: boolean;
  /** 0 on the belt, rising to 1 as the pusher shoves it into the reject lane. */
  push: number;
}

export interface ConveyorState {
  boxes: Box[];
  speed: number; // 0..1
  pusher: number; // 0..1 extension
  feedTimer: number;
  nextId: number;
  delivered: number;
  rejected: number;
}

const BELT_SPEED = 22; // units/s at full speed
const FEED_INTERVAL = 2600; // ms
const PATTERN = [false, true, false, false, true, false, true, false, false, false, true, true];

function createPlant(): Plant<ConveyorState> {
  const state: ConveyorState = { boxes: [], speed: 0, pusher: 0, feedTimer: FEED_INTERVAL - 400, nextId: 0, delivered: 0, rejected: 0 };
  const near = (x: number, at: number) => Math.abs(x - at) <= LAYOUT.boxHalf;

  return {
    state,
    step({ io, field, faults, dt }) {
      const s = state;
      const motorOn = io.getBool('Conv_Motor') && !faults.has('motor_fail');
      s.speed += ((motorOn ? 1 : 0) - s.speed) * Math.min(1, dt / 300);
      const moving = s.speed > 0.05;

      // Pusher extends while solenoid is on.
      const sol = io.getBool('Divert_Sol');
      s.pusher = Math.max(0, Math.min(1, s.pusher + (sol ? dt / 250 : -dt / 250)));

      // Move boxes; a box being pushed leaves the belt.
      const dx = (BELT_SPEED * s.speed * dt) / 1000;
      for (const b of s.boxes) {
        if (b.push > 0 || (s.pusher > 0.3 && near(b.x, LAYOUT.divert))) {
          b.push = Math.min(1, b.push + dt / 300);
        } else {
          // Boxes do not overlap: stop behind the one in front.
          const ahead = s.boxes.filter((o) => o !== b && o.push === 0 && o.x > b.x).reduce((m, o) => Math.min(m, o.x), Infinity);
          b.x = Math.min(b.x + dx, ahead - LAYOUT.boxHalf * 2 - 0.5);
        }
      }
      s.rejected += s.boxes.filter((b) => b.push >= 1).length;
      s.delivered += s.boxes.filter((b) => b.x > LAYOUT.end + LAYOUT.boxHalf).length;
      s.boxes = s.boxes.filter((b) => b.push < 1 && b.x <= LAYOUT.end + LAYOUT.boxHalf);

      // Feeder places a box when enabled and the infeed is clear.
      if (io.getBool('Feeder_En')) {
        s.feedTimer += dt;
        const clear = s.boxes.every((b) => b.x > LAYOUT.boxHalf * 3);
        if (s.feedTimer >= FEED_INTERVAL && clear) {
          s.feedTimer = 0;
          s.boxes.push({ id: s.nextId, x: -LAYOUT.boxHalf, tall: PATTERN[s.nextId % PATTERN.length], push: 0 });
          s.nextId++;
        }
      }

      const onBelt = s.boxes.filter((b) => b.push < 0.4);
      io.set('Start_PB', Boolean(field.start));
      io.set('Stop_PB', !field.stop);
      io.set('Reset_PB', Boolean(field.reset));
      io.set('PE_Entry', onBelt.some((b) => near(b.x, LAYOUT.entry)));
      io.set('PE_Height', onBelt.some((b) => b.tall && near(b.x, LAYOUT.height)));
      io.set('PE_Divert', faults.has('pe_stuck') || onBelt.some((b) => near(b.x, LAYOUT.divert)));
      io.set('Belt_Motion', moving);
    },
  };
}

export const conveyor: ScenarioLogic = {
  id: 'conveyor',
  number: 3,
  title: 'Conveyor Sorting',
  tagline: 'Photo-eyes, product tracking, a timed diverter, batch counting and jam detection.',
  skills: ['Counters', 'Product tracking', 'Jam detection', 'Motion supervision'],
  about: [
    'Boxes ride a belt past three photo-eyes. The height eye sits high, so only tall boxes block it. The program remembers a tall box until it reaches the diverter, then fires the pusher for a timed 800 ms stroke.',
    'Every box at the diverter is counted with CTU. At 10 boxes the line stops and the batch lamp lights; Start acknowledges and resets the counter.',
    'Two supervisory checks protect the line: a photo-eye blocked for 3 s means a jam, and a motor that is commanded on while the zero-speed switch reports no motion means a broken belt, coupling or motor.',
  ],
  tryThis: [
    'Press Run, then Start. Tall boxes are pushed into the reject lane, short boxes continue.',
    'Watch Batch_CTR count up in the ladder; the line stops itself at 10.',
    'Inject "Diverter eye blocked": the jam timer runs out and the line stops with an alarm.',
    'Inject "Motor not turning": motion supervision trips after 1.5 s.',
  ],
  program: { tags, rungs },
  createPlant,
  initialField: { start: false, stop: false, reset: false },
  controls: [
    { kind: 'momentary', field: 'start', label: 'Start', tone: 'green' },
    { kind: 'momentary', field: 'stop', label: 'Stop', tone: 'red' },
    { kind: 'momentary', field: 'reset', label: 'Reset', tone: 'blue' },
  ],
  indicators: [
    { tag: 'Conv_Motor', label: 'Running', tone: 'green' },
    { tag: 'Batch_Lamp', label: 'Batch done', tone: 'blue' },
    { tag: 'Fault_Lamp', label: 'Fault', tone: 'red' },
  ],
  alarms: [
    { tag: 'Alm_Jam', message: 'Box jam: photo-eye blocked > 3 s' },
    { tag: 'Alm_NoMotion', message: 'Belt not moving while motor is on' },
  ],
  faults: [
    { id: 'pe_stuck', label: 'Diverter eye blocked', detail: 'Dirt or a stuck box keeps PE_Divert blocked.' },
    { id: 'motor_fail', label: 'Motor not turning', detail: 'Broken coupling: the contactor closes but the belt does not move.' },
  ],
};

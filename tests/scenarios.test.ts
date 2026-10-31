import { describe, expect, it } from 'vitest';
import { Sim } from '../src/plant/sim';
import { conveyor, type ConveyorState } from '../src/scenarios/conveyor/logic';
import { motor } from '../src/scenarios/motor/logic';
import { tank } from '../src/scenarios/tank/logic';
import { traffic } from '../src/scenarios/traffic/logic';
import { scenarioLogic } from '../src/scenarios/logic';

function press(sim: Sim, field: string, holdMs = 100) {
  sim.setField(field, true);
  sim.advance(holdMs);
  sim.setField(field, false);
  sim.advance(50);
}

const tag = (sim: Sim, path: string) => sim.plc.mem.get(path);

describe('every scenario', () => {
  it.each(scenarioLogic.map((s) => [s.id, s] as const))('%s references only declared tags', (_, s) => {
    const sim = new Sim(s);
    sim.advance(1000); // throws on any unknown tag
    for (const a of s.alarms) expect(sim.plc.mem.has(a.tag)).toBe(true);
    for (const i of s.indicators) expect(() => sim.plc.mem.get(i.tag)).not.toThrow();
  });
});

describe('motor', () => {
  it('starts, seals in and stops', () => {
    const sim = new Sim(motor);
    press(sim, 'start');
    sim.advance(500);
    expect(tag(sim, 'Motor_Run')).toBe(true);
    expect(tag(sim, 'Run_Lamp')).toBe(true);
    press(sim, 'stop');
    expect(tag(sim, 'Motor_Run')).toBe(false);
  });

  it('overload trips and latches an alarm', () => {
    const sim = new Sim(motor);
    press(sim, 'start');
    sim.setFault('overload', true);
    sim.advance(3000);
    expect(tag(sim, 'Alm_Overload')).toBe(true);
    expect(tag(sim, 'Motor_Run')).toBe(false);
    press(sim, 'reset'); // relay still tripped, alarm must stay
    expect(tag(sim, 'Alm_Overload')).toBe(true);
    sim.setFault('overload', false);
    sim.advance(5000);
    press(sim, 'reset');
    expect(tag(sim, 'Alm_Overload')).toBe(false);
  });

  it('missing contactor feedback latches an alarm after 1 s', () => {
    const sim = new Sim(motor);
    sim.setFault('contactor_fail', true);
    press(sim, 'start');
    sim.advance(1200);
    expect(tag(sim, 'Alm_NoFeedback')).toBe(true);
    expect(tag(sim, 'Run_Cmd')).toBe(false);
  });

  it('a cut stop wire stops the motor (fail-safe)', () => {
    const sim = new Sim(motor);
    press(sim, 'start');
    sim.advance(500);
    sim.setFault('stop_wire', true);
    sim.advance(50);
    expect(tag(sim, 'Motor_Run')).toBe(false);
  });

  it('E-stop latches until released and reset', () => {
    const sim = new Sim(motor);
    press(sim, 'start');
    sim.setField('estop', true);
    sim.advance(50);
    expect(tag(sim, 'Motor_Run')).toBe(false);
    press(sim, 'reset');
    expect(tag(sim, 'Alm_EStop')).toBe(true);
    sim.setField('estop', false);
    press(sim, 'reset');
    expect(tag(sim, 'Alm_EStop')).toBe(false);
  });
});

describe('traffic', () => {
  it('stays green until a pedestrian asks, then runs the full cycle', () => {
    const sim = new Sim(traffic);
    sim.advance(10_000);
    expect(tag(sim, 'Car_Green')).toBe(true);
    press(sim, 'ped');
    expect(tag(sim, 'Ped_Wait')).toBe(true);
    sim.advance(3200);
    expect(tag(sim, 'Step')).toBe(2);
    expect(tag(sim, 'Car_Red')).toBe(true);
    sim.advance(1500);
    expect(tag(sim, 'Ped_Walk')).toBe(true);
    sim.advance(6000 + 4000 + 100);
    expect(tag(sim, 'Step')).toBe(0);
    expect(tag(sim, 'Ped_Req')).toBe(false);
  });

  it('red lamp failure forces flashing amber', () => {
    const sim = new Sim(traffic);
    sim.setFault('red_lamp', true);
    sim.advance(5000);
    press(sim, 'ped');
    sim.advance(3000 + 600);
    expect(tag(sim, 'Alm_RedLamp')).toBe(true);
    expect(tag(sim, 'Car_Red')).toBe(false);
    expect(tag(sim, 'Car_Green')).toBe(false);
    let amberSeen = false;
    for (let i = 0; i < 10; i++) {
      sim.advance(100);
      amberSeen ||= tag(sim, 'Car_Amber') as boolean;
    }
    expect(amberSeen).toBe(true);
  });

  it('a stuck pedestrian button places only one request', () => {
    const sim = new Sim(traffic);
    sim.setFault('ped_stuck', true);
    sim.advance(5000 + 3000 + 1500 + 6000 + 4000 + 200);
    expect(tag(sim, 'Step')).toBe(0);
    expect(tag(sim, 'Ped_Req')).toBe(false);
    sim.advance(10_000);
    expect(tag(sim, 'Step')).toBe(0);
  });
});

describe('conveyor', () => {
  it('diverts tall boxes and stops after a batch of 10', () => {
    const sim = new Sim(conveyor);
    press(sim, 'start');
    sim.advance(60_000);
    const s = sim.plant.state as ConveyorState;
    expect(tag(sim, 'Batch_CTR.ACC')).toBe(10);
    expect(tag(sim, 'Batch_Lamp')).toBe(true);
    expect(tag(sim, 'Conv_Motor')).toBe(false);
    expect(s.rejected).toBe(tag(sim, 'Tall_CTR.ACC'));
    expect(s.rejected).toBeGreaterThan(0);
    expect(tag(sim, 'Alm_Jam')).toBe(false);
  });

  it('start after a batch resets the counter and restarts without double counting', () => {
    const sim = new Sim(conveyor);
    press(sim, 'start');
    sim.advance(60_000);
    press(sim, 'start');
    sim.advance(100);
    expect(tag(sim, 'Batch_CTR.ACC')).toBe(0);
    expect(tag(sim, 'Conv_Motor')).toBe(true);
  });

  it('blocked diverter eye raises a jam alarm', () => {
    const sim = new Sim(conveyor);
    press(sim, 'start');
    sim.setFault('pe_stuck', true);
    sim.advance(3200);
    expect(tag(sim, 'Alm_Jam')).toBe(true);
    expect(tag(sim, 'Conv_Motor')).toBe(false);
  });

  it('motor not turning raises a no-motion alarm', () => {
    const sim = new Sim(conveyor);
    sim.setFault('motor_fail', true);
    press(sim, 'start');
    sim.advance(1600);
    expect(tag(sim, 'Alm_NoMotion')).toBe(true);
  });
});

describe('tank', () => {
  const level = (sim: Sim) => sim.plc.mem.getNum('Level_Pct');

  it('cycles between 30 % and 70 % and alternates the lead pump', () => {
    const sim = new Sim(tank);
    let min = 100;
    let max = 0;
    const leads = new Set<boolean>();
    for (let i = 0; i < 1200; i++) {
      sim.advance(100);
      if (sim.time > 20_000) {
        min = Math.min(min, level(sim));
        max = Math.max(max, level(sim));
      }
      if (tag(sim, 'Pump1') || tag(sim, 'Pump2')) leads.add(tag(sim, 'Pump2') as boolean);
    }
    expect(min).toBeGreaterThan(27);
    expect(min).toBeLessThan(33);
    expect(max).toBeGreaterThan(68);
    expect(max).toBeLessThan(74);
    expect(leads.size).toBe(2);
  });

  it('high inflow brings in the lag pump', () => {
    const sim = new Sim(tank);
    sim.setField('inflow', 95);
    let both = false;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      sim.advance(100);
      both ||= Boolean(tag(sim, 'Pump1') && tag(sim, 'Pump2'));
      max = Math.max(max, level(sim));
    }
    expect(both).toBe(true);
    expect(max).toBeLessThan(90);
  });

  it('pump 1 failure hands over to pump 2', () => {
    const sim = new Sim(tank);
    sim.setFault('p1_fail', true);
    sim.advance(60_000);
    expect(tag(sim, 'Alm_P1_Fail')).toBe(true);
    expect(level(sim)).toBeLessThan(80);
  });

  it('transmitter wire break: float switch prevents overflow', () => {
    const sim = new Sim(tank);
    sim.setFault('lt_break', true);
    sim.advance(60_000);
    expect(tag(sim, 'Alm_LT_Fail')).toBe(true);
    expect((sim.plant.state as { level: number }).level).toBeLessThan(98);
  });
});

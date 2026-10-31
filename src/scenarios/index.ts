import type { ComponentType } from 'react';
import type { Sim } from '../plant/sim';
import { ConveyorMachine } from './conveyor/Machine';
import { conveyor } from './conveyor/logic';
import { MotorMachine } from './motor/Machine';
import { motor } from './motor/logic';
import { TankMachine } from './tank/Machine';
import { tank } from './tank/logic';
import { TrafficMachine } from './traffic/Machine';
import { traffic } from './traffic/logic';
import type { ScenarioLogic } from './types';

export interface Scenario extends ScenarioLogic {
  Machine: ComponentType<{ sim: Sim }>;
}

export const scenarios: Scenario[] = [
  { ...motor, Machine: MotorMachine },
  { ...traffic, Machine: TrafficMachine },
  { ...conveyor, Machine: ConveyorMachine },
  { ...tank, Machine: TankMachine },
];

export const scenarioById = (id: string | undefined) => scenarios.find((s) => s.id === id);

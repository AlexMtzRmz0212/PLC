import { conveyor } from './conveyor/logic';
import { motor } from './motor/logic';
import { tank } from './tank/logic';
import { traffic } from './traffic/logic';
import type { ScenarioLogic } from './types';

export const scenarioLogic: ScenarioLogic[] = [motor, traffic, conveyor, tank];

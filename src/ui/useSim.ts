import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Sim } from '../plant/sim';
import type { ScenarioLogic } from '../scenarios/types';

/** One Sim per scenario; re-renders on every frame the sim notifies. */
export function useSim(scenario: ScenarioLogic, autoStart = false): Sim {
  const sim = useMemo(() => new Sim(scenario), [scenario]);
  useSyncExternalStore(sim.subscribe, sim.getVersion);
  useEffect(() => {
    if (autoStart) sim.start();
    return () => sim.stop();
  }, [sim, autoStart]);
  return sim;
}

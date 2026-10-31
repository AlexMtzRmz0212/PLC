import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { DIALECTS } from '../plc/dialects';
import { type Scenario, scenarioById, scenarios } from '../scenarios';
import { DialectSwitch } from '../ui/DialectSwitch';
import { useDialect } from '../ui/dialect';
import { LadderView } from '../ui/LadderView';
import { AlarmList, ControlStation, FaultPanel, SimControls } from '../ui/Panel';
import { TagMonitor, TextView, Trend } from '../ui/Views';
import { useSim } from '../ui/useSim';

type Tab = 'ladder' | 'text' | 'tags';

function Workbench({ scenario }: { scenario: Scenario }) {
  const sim = useSim(scenario);
  const dialect = useDialect();
  const [tab, setTab] = useState<Tab>('ladder');
  const info = DIALECTS[dialect];
  const tabs: [Tab, string][] = [
    ['ladder', dialect === 'ab' ? 'Ladder' : 'LAD'],
    ['text', info.text],
    ['tags', dialect === 'ab' ? 'Controller tags' : 'PLC tags'],
  ];
  const { Machine } = scenario;

  return (
    <>
      <SimControls sim={sim} />
      <div className="bench">
        <aside className="field" aria-label="Machine and operator panel">
          <div className="machine-frame">
            <Machine sim={sim} />
            {!sim.running && (
              <button type="button" className="paused" onClick={() => sim.start()}>
                CPU is stopped. Click to run
              </button>
            )}
          </div>
          {scenario.trend && <Trend data={sim.trend} defs={scenario.trend} />}
          <ControlStation sim={sim} controls={scenario.controls} indicators={scenario.indicators} />
          <AlarmList sim={sim} alarms={scenario.alarms} />
          <FaultPanel sim={sim} faults={scenario.faults} />
        </aside>

        <section className="editor" aria-label="Program">
          <div className="tabs" role="tablist">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="tab-body sheet" role="tabpanel">
            {tab === 'ladder' && <LadderView plc={sim.plc} program={scenario.program} dialect={dialect} />}
            {tab === 'text' && <TextView program={scenario.program} dialect={dialect} />}
            {tab === 'tags' && <TagMonitor plc={sim.plc} program={scenario.program} dialect={dialect} />}
          </div>
        </section>
      </div>
    </>
  );
}

export function ScenarioPage() {
  const { id } = useParams();
  const scenario = scenarioById(id);
  if (!scenario) return <Navigate to="/" replace />;
  const i = scenarios.indexOf(scenario);
  const next = scenarios[(i + 1) % scenarios.length];

  return (
    <div className="wrap scenario">
      <nav className="crumbs" aria-label="Programs">
        {scenarios.map((s) => (
          <Link key={s.id} to={`/sim/${s.id}`} className={s.id === scenario.id ? 'active' : ''} aria-current={s.id === scenario.id ? 'page' : undefined}>
            <span className="crumb-no">{s.number}</span> {s.title}
          </Link>
        ))}
      </nav>

      <header className="scenario-head">
        <div>
          <h1>{scenario.title}</h1>
          <p className="tagline">{scenario.tagline}</p>
        </div>
        <DialectSwitch />
      </header>

      {/* key: a fresh simulator per scenario */}
      <Workbench key={scenario.id} scenario={scenario} />

      <div className="notes">
        <section>
          <h2>Try this</h2>
          <ol className="steps">
            {scenario.tryThis.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </section>
        <section>
          <h2>How the program works</h2>
          {scenario.about.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <Link to={`/sim/${next.id}`} className="btn">
            Next program: {next.title}
          </Link>
        </section>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { profile } from '../content/profile';
import { BR, OTE, XIC, input, output, rung } from '../plc/build';
import { scenarios } from '../scenarios';
import type { ScenarioLogic } from '../scenarios/types';
import { DialectSwitch } from '../ui/DialectSwitch';
import { useDialect } from '../ui/dialect';
import { LadderView } from '../ui/LadderView';
import { ControlStation } from '../ui/Panel';
import { useSim } from '../ui/useSim';

// The hero: one seal-in rung, wired straight to two pushbuttons.
const hero: ScenarioLogic = {
  id: 'hero',
  number: 0,
  title: 'Seal-in',
  tagline: '',
  skills: [],
  about: [],
  tryThis: [],
  program: {
    tags: [
      input('Start_PB', '%I0.0', 'Start pushbutton (NO)'),
      input('Stop_PB', '%I0.1', 'Stop pushbutton (NC)'),
      output('Motor_Run', '%Q0.0', 'Motor contactor'),
    ],
    rungs: [rung('Start latches the motor on through its own contact; Stop (wired NC) breaks the seal.', BR([XIC('Start_PB')], [XIC('Motor_Run')]), XIC('Stop_PB'), OTE('Motor_Run'))],
  },
  createPlant: () => ({
    state: null,
    step({ io, field }) {
      io.set('Start_PB', Boolean(field.start));
      io.set('Stop_PB', !field.stop);
    },
  }),
  initialField: { start: false, stop: false },
  controls: [
    { kind: 'momentary', field: 'start', label: 'Start', tone: 'green' },
    { kind: 'momentary', field: 'stop', label: 'Stop', tone: 'red' },
  ],
  indicators: [{ tag: 'Motor_Run', label: 'Motor', tone: 'green' }],
  alarms: [],
  faults: [],
};

function HeroRung() {
  const sim = useSim(hero, true);
  const dialect = useDialect();
  return (
    <div className="hero-demo">
      <div className="hero-demo-top">
        <DialectSwitch />
      </div>
      <div className="sheet">
        <LadderView plc={sim.plc} program={hero.program} dialect={dialect} />
      </div>
      <div className="hero-station">
        <ControlStation sim={sim} controls={hero.controls} indicators={hero.indicators} />
        <p className="hint">Hold Start, let go. The rung keeps itself on. Press Stop to break it.</p>
      </div>
    </div>
  );
}

export function Home() {
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <h1>{profile.name}</h1>
          <p className="role">{profile.role}</p>
          <p className="intro">{profile.intro}</p>
          <div className="cta-row">
            <Link className="btn primary lg" to="/sim/motor">
              Open the simulator
            </Link>
            {profile.resume && (
              <a className="btn lg" href={profile.resume}>
                Download resume
              </a>
            )}
          </div>
        </div>
        <HeroRung />
      </section>

      <section className="wrap" aria-labelledby="programs">
        <h2 id="programs">Four programs, from basics to process control</h2>
        <p className="lede">
          Each one runs on a scan-cycle engine with a simulated machine attached. Press buttons, break sensors, and watch the logic respond in ladder, ST/SCL, or the live tag table.
        </p>
        <ol className="program-list">
          {scenarios.map((s) => (
            <li key={s.id}>
              <Link to={`/sim/${s.id}`} className="program">
                <span className="program-no">{s.number}</span>
                <span className="program-body">
                  <span className="program-title">{s.title}</span>
                  <span className="program-tag">{s.tagline}</span>
                  <span className="chips">
                    {s.skills.map((k) => (
                      <span key={k} className="chip">{k}</span>
                    ))}
                  </span>
                </span>
                <span className="program-go" aria-hidden>
                  Run
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap about" id="about" aria-labelledby="about-h">
        <h2 id="about-h">About me</h2>
        <div className="about-grid">
          <div>
            <h3>Tools I work with</h3>
            {profile.toolsNote && <p>{profile.toolsNote}</p>}
            <dl className="tools">
              {profile.platforms.map((p) => (
                <div key={p.name}>
                  <dt>{p.name}</dt>
                  {p.level && <dd>{p.level}</dd>}
                </div>
              ))}
            </dl>
            <h3>Education and certifications</h3>
            <ul className="plain">
              {profile.credentials.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Projects</h3>
            {profile.projects.map((p) => (
              <article key={p.title} className="project">
                <h4>{p.title}</h4>
                <p>{p.summary}</p>
                <span className="chips">
                  {p.tags.map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap contact" aria-labelledby="contact-h">
        <h2 id="contact-h">Contact</h2>
        <ul className="contact-list">
          <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
          <li><a href={profile.linkedin}>LinkedIn</a></li>
          <li><a href={profile.github}>GitHub</a></li>
          {profile.website && <li><a href={profile.website}>Website</a></li>}
          <li className="muted">{profile.location}</li>
        </ul>
      </section>
    </>
  );
}

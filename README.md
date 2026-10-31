# PLC Showcase

An interactive PLC programming portfolio. Four ladder programs run live in the browser on a scan-cycle engine, each wired to a simulated machine. Every program can be viewed as Allen-Bradley (Studio 5000) or Siemens (TIA Portal) ladder, as generated Structured Text / SCL, or as a live tag table. Visitors can press buttons and inject faults.

| # | Program | Shows |
|---|---------|-------|
| 1 | Motor start/stop | Seal-in, fail-safe NC wiring, alarm latching, contactor feedback supervision |
| 2 | Pedestrian crossing | Step sequencer, timers, one-shots, fail-safe lamp check |
| 3 | Conveyor sorting | Photo-eyes, product tracking, diverter, batch counter, jam and motion supervision |
| 4 | Duplex lift station | Analog scaling, hysteresis, lead/lag alternation, redundant level sensing |

## Run it

```bash
npm install
npm run dev
```

```bash
npm test
```

## Where things live

- `src/scenarios/*/logic.ts`: the ladder programs, tag tables and machine physics. Start here.
- `src/content/profile.ts`: your name, projects, links.
- `public/resume.pdf`: your resume (add it).
- `src/plc/`: the engine (`scan.ts`), vendor naming (`dialects.ts`), ST/SCL generator (`textgen.ts`).
- `src/ui/LadderView.tsx`: the ladder renderer for both vendor styles.

## Publish

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. One-time setup: repo Settings, Pages, Source: GitHub Actions.

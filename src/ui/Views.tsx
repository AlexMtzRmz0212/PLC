// Engineering-side views: tag monitor, generated text, trend.
import { useMemo } from 'react';
import { type Dialect, liveValue, timeLiteral } from '../plc/dialects';
import type { Plc } from '../plc/scan';
import { generateText } from '../plc/textgen';
import type { Program, TagDef } from '../plc/types';
import type { TrendDef } from '../scenarios/types';

const SI_TYPE: Record<TagDef['type'], string> = { BOOL: 'Bool', INT: 'Int', REAL: 'Real', TIMER: 'IEC_TIMER', COUNTER: 'IEC_COUNTER' };

function value(plc: Plc, d: Dialect, def: TagDef): string {
  if (def.type === 'TIMER') {
    const t = plc.mem.timer(def.name);
    return d === 'ab' ? `ACC ${Math.round(t.acc)} / ${t.pre}${t.dn ? '  DN' : ''}` : `ET ${liveValue(d, plc.mem, `${def.name}.ACC`)} / ${timeLiteral(t.pre)}${t.dn ? '  Q' : ''}`;
  }
  if (def.type === 'COUNTER') {
    const k = plc.mem.counter(def.name);
    return d === 'ab' ? `ACC ${k.acc} / ${k.pre}${k.dn ? '  DN' : ''}` : `CV ${k.acc} / ${k.pre}${k.dn ? '  QU' : ''}`;
  }
  return liveValue(d, plc.mem, def.name);
}

export function TagMonitor({ plc, program, dialect }: { plc: Plc; program: Program; dialect: Dialect }) {
  const groups: [string, TagDef[]][] = [
    ['Inputs', program.tags.filter((t) => t.io === 'input')],
    ['Outputs', program.tags.filter((t) => t.io === 'output')],
    ['Internal', program.tags.filter((t) => t.io !== 'input' && t.io !== 'output')],
  ];
  return (
    <div className="tag-table-wrap">
      <table className="tag-table">
        <thead>
          <tr>
            <th>Name</th>
            {dialect === 'siemens' && <th>Address</th>}
            <th>Type</th>
            <th>Value</th>
            <th className="hide-sm">Comment</th>
          </tr>
        </thead>
        {groups.map(([label, defs]) => (
          <tbody key={label}>
            <tr className="group">
              <th colSpan={5}>{label}</th>
            </tr>
            {defs.map((def) => {
              const v = value(plc, dialect, def);
              const on = def.type === 'BOOL' && plc.mem.getBool(def.name);
              return (
                <tr key={def.name}>
                  <td><code>{dialect === 'siemens' ? `"${def.name}"` : def.name}</code></td>
                  {dialect === 'siemens' && <td><code className="muted">{def.address ?? (def.type === 'TIMER' || def.type === 'COUNTER' ? 'Static' : '')}</code></td>}
                  <td className="muted">{dialect === 'siemens' ? SI_TYPE[def.type] : def.type}</td>
                  <td><code className={on ? 'val-on' : ''}>{v}</code></td>
                  <td className="muted hide-sm">{def.description}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Minimal highlighter: comments, keywords, quoted Siemens symbols, numbers/time literals. */
function highlight(line: string) {
  const i = line.indexOf('//');
  const code = i >= 0 ? line.slice(0, i) : line;
  const comment = i >= 0 ? line.slice(i) : '';
  const parts: { t: string; c?: string }[] = [];
  const re = /("[^"]*")|(T#\w+)|\b(IF|THEN|END_IF|AND|OR|NOT|TRUE|FALSE)\b|(\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  for (const m of code.matchAll(re)) {
    if (m.index! > last) parts.push({ t: code.slice(last, m.index) });
    parts.push({ t: m[0], c: m[1] ? 'sym' : m[2] ? 'num' : m[3] ? 'kw' : 'num' });
    last = m.index! + m[0].length;
  }
  parts.push({ t: code.slice(last) });
  if (comment) parts.push({ t: comment, c: 'cmt' });
  return parts.map((p, k) => (p.c ? <span key={k} className={`hl-${p.c}`}>{p.t}</span> : p.t));
}

export function TextView({ program, dialect }: { program: Program; dialect: Dialect }) {
  const text = useMemo(() => generateText(program, dialect), [program, dialect]);
  const lines = text.trimEnd().split('\n');
  return (
    <div className="code-wrap">
      <button type="button" className="btn copy" onClick={() => navigator.clipboard?.writeText(text)}>
        Copy
      </button>
      <pre className="code" tabIndex={0}>
        {lines.map((l, i) => (
          <div key={i} className="code-line">
            {highlight(l)}
            {'\n'}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function Trend({ data, defs }: { data: number[][]; defs: TrendDef[] }) {
  const W = 360;
  const H = 120;
  const pad = { l: 30, r: 6, t: 8, b: 16 };
  const def = defs[0];
  const n = 300;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * (i + n - data.length)) / (n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - def.min) / (def.max - def.min));
  const path = data.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(row[0]).toFixed(1)}`).join(' ');
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${def.label} trend, last 60 seconds`}>
        {[def.min, (def.min + def.max) / 2, def.max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {def.marks?.map((m) => (
          <g key={m.label}>
            <line x1={pad.l} x2={W - pad.r} y1={y(m.value)} y2={y(m.value)} className="mark" />
            <text x={W - pad.r - 2} y={y(m.value) - 3} textAnchor="end" className="axis">{m.label}</text>
          </g>
        ))}
        <text x={pad.l} y={H - 3} className="axis">-60 s</text>
        <text x={W - pad.r} y={H - 3} textAnchor="end" className="axis">now</text>
        {data.length > 1 && <path d={path} className="trace" />}
      </svg>
      <figcaption>
        {def.label} ({def.unit})
      </figcaption>
    </figure>
  );
}

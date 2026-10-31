import { DIALECTS, type Dialect } from '../plc/dialects';
import { setDialect, useDialect } from './dialect';

export function DialectSwitch() {
  const d = useDialect();
  return (
    <div className="dialect" role="radiogroup" aria-label="PLC vendor style">
      {(Object.keys(DIALECTS) as Dialect[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={d === k} className={d === k ? 'active' : ''} onClick={() => setDialect(k)}>
          <span className="dialect-vendor">{DIALECTS[k].vendor}</span>
          <span className="dialect-ide">{DIALECTS[k].ide}</span>
        </button>
      ))}
    </div>
  );
}

import { useState } from 'react';

const statements = ['A place to think in 3D.', 'From a single part to the whole.', 'Keep your ideas editable.'];

/** CSS owns the roll-up; no timers, runtime loading or live announcements. */
export function HeroStatements() {
  const [paused, setPaused] = useState(false);
  return <div className="hero-statements" data-paused={paused}>
    <div className="hero-statement-window" role="group" aria-label={statements.join(' ')}>
      <div className="hero-statement-track" aria-hidden="true">
        {[...statements, statements[0]].map((statement, index) => <span key={index}>{statement}</span>)}
      </div>
    </div>
    <button className="hero-statement-control" aria-label={paused ? 'Resume statements' : 'Pause statements'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>
      <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
    </button>
  </div>;
}

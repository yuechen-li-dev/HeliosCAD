import { useEffect, useState } from 'react';
import type { DraftConstruction, DraftElement, LanguageEditOperation } from '@aetheris/cad';
import { editGuide, guideValues } from './draftGuideEditing';

type Props = {
  element: DraftElement; construction: DraftConstruction; disabled: boolean;
  onApply(operations: LanguageEditOperation[]): Promise<unknown>; onPending(pending: boolean): void;
  onDiscard?(): void;
};

export function GuideInspector(props: Props) {
  const original = guideValues(props.element, props.construction);
  // History changes before its asynchronous projection arrives. Reset against the
  // resolved values, so an old projection cannot become the new field draft.
  return <GuideFields key={props.element.id + ':' + JSON.stringify(original)} {...props} original={original} />;
}

function GuideFields({ element, disabled, onApply, onPending, onDiscard, original, construction }: Props & { original: ReturnType<typeof guideValues> }) {
  const [values, setValues] = useState(original), [error, setError] = useState('');
  const dirty = !!original && !!values && Object.keys(original).some(key => values[key] !== original[key]);
  useEffect(() => { onPending(dirty); }, [dirty, onPending]);
  useEffect(() => () => onPending(false), [onPending]);
  return <section aria-label="Guide inspector" className="draft-guide-inspector"><h3>{element.name} · {element.kind}</h3>
    <small>Shared named points stay shared. Connected guides may change; invalid edits are refused.</small>
    {original && values ? <form onSubmit={event => { event.preventDefault(); try { setError(''); void onApply(editGuide(element, construction, values)); } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); } }}>
      {Object.keys(original).map(label => <label key={label}>{label} (mm)<input aria-label={`Guide ${label}`} type="number" step="any" required disabled={disabled}
        value={Number.isNaN(values[label]) ? '' : values[label]} onChange={event => setValues({ ...values, [label]: event.target.valueAsNumber })} /></label>)}
      {'Radius' in original && <small>Radius changes keep the center and endpoint angles fixed. The arc stays circular.</small>}
      <button disabled={disabled || !dirty}>Apply guide dimensions</button>
      {dirty && <button type="button" disabled={disabled} onClick={() => { setValues(original); setError(''); onDiscard?.(); }}>Discard guide edits</button>}
    </form> : <p>This guide has driven or unsupported inputs. Edit its defining points or source inputs.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

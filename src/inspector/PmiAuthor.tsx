import { useState } from 'react';
import type { LanguageEditOperation, LanguageOutline, SelectionDescription } from '@aetheris/cad';
import { bodyParent, uniqueName } from '../graph/graphAuthoring';

export function PmiAuthor({ selection, outline, disabled, onApply }: {
  selection: SelectionDescription; outline: LanguageOutline | null; disabled: boolean;
  onApply(operations: readonly LanguageEditOperation[], label: string): Promise<string | null>;
}) {
  const diameter = selection.surfaceKind === 'Cylinder';
  const [name, setName] = useState(uniqueName(diameter ? 'Diameter' : 'A', outline));
  const [nominal, setNominal] = useState(String(selection.diameterMm ?? ''));
  const [plus, setPlus] = useState(''), [minus, setMinus] = useState('');
  const [error, setError] = useState('');
  return <form className="pmi-author" aria-label="Add PMI" onSubmit={event => {
    event.preventDefault(); setError('');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { setError('Use a name starting with a letter or underscore.'); return; }
    if (outline?.nodes.some(node => node.name === name)) { setError('That name is already used.'); return; }
    if (diameter && (!nominal.trim() || !plus.trim() || !minus.trim() || ![nominal, plus, minus].every(v => Number.isFinite(Number(v))) || Number(nominal) <= 0 || Number(plus) < 0 || Number(minus) < 0)) {
      setError('Enter a positive nominal and explicit nonnegative upper/lower allowances (mm).'); return;
    }
    const pmi = outline?.nodes.find(node => node.kind === 'Pmi');
    const declaration = diameter
      ? `HoleDiameter ${name} { target: ${selection.selector} value: ${Number(nominal)}mm tolerance: PlusMinus(${Number(plus)}mm, ${Number(minus)}mm) }`
      : `Datum ${name} { target: ${selection.selector} }`;
    void onApply([{ kind: 'insertDeclaration', parent: pmi?.id ?? bodyParent(outline, null), source: pmi ? declaration : `Pmi { ${declaration} }` }],
      `Added ${diameter ? 'diameter' : 'datum'} ${name} on ${selection.selector}`).then(result => { if (result) setError(result); });
  }}>
    <strong>{diameter ? 'Add diameter requirement' : 'Add datum'}</strong>
    <p>Imported geometry is read-only. This adds an AP242 annotation.</p>
    <label>Name<input aria-label="PMI name" value={name} onChange={e => setName(e.target.value)} /></label>
    {diameter && <>
      <small>Measured diameter: {selection.diameterMm} mm. Enter the intended requirement below; tolerances are never inferred.</small>
      <label>Nominal (mm)<input aria-label="Nominal diameter (mm)" type="number" step="any" value={nominal} onChange={e => setNominal(e.target.value)} /></label>
      <label>Upper allowance + (mm)<input aria-label="Upper allowance (mm)" type="number" min="0" step="any" value={plus} onChange={e => setPlus(e.target.value)} /></label>
      <label>Lower allowance − (mm)<input aria-label="Lower allowance (mm)" type="number" min="0" step="any" value={minus} onChange={e => setMinus(e.target.value)} /></label>
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={disabled || !outline}>Add {diameter ? 'diameter' : 'datum'}</button>
  </form>;
}

import { useEffect, useRef, useState } from 'react';
import type { ExportFormat, ExportFormatOption } from '@aetheris/cad';

export function ExportPicker({ formats, disabled, open, onOpen, onExport }: {
  formats: readonly ExportFormatOption[]; disabled: boolean; open: boolean;
  onOpen(value: boolean): void; onExport(formats: readonly ExportFormat[]): Promise<void>;
}) {
  const [selected, setSelected] = useState<readonly ExportFormat[]>(['step']);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const available = selected.filter(f => formats.some(option => option.format === f && option.available));
  useEffect(() => {
    setSelected(previous => {
      if (!previous.length || previous.some(f => formats.some(o => o.format === f && o.available))) return previous;
      const first = formats.find(o => o.available);
      return first ? [first.format] : previous;
    });
  }, [formats]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { onOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, onOpen]);
  return <div className="export-picker" ref={root}>
    <button ref={trigger} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpen(!open)}>Export ▾</button>
    {open && <div className="export-popover" role="dialog" aria-label="Export formats">
      <strong>Export model</strong>
      <p>Choose formats. Multiple formats download as one ZIP.</p>
      <fieldset disabled={disabled}>
        <legend>Formats</legend>
        {formats.map(option => <label key={option.format} title={option.reason ?? undefined}>
          <input type="checkbox" checked={available.includes(option.format)} disabled={!option.available}
            onChange={event => setSelected(previous => event.target.checked ? [...previous, option.format] : previous.filter(f => f !== option.format))} />
          <span><b>{option.label}</b><small>{option.available ? option.description : option.reason}</small></span>
        </label>)}
      </fieldset>
      <p className="export-note">Drawings retain compiler checks and missing-requirement notices. No tolerances or approvals are invented.</p>
      <button className="export-download" disabled={disabled || !available.length} onClick={() => void onExport(available)}>Download {available.length > 1 ? `ZIP · ${available.length} formats` : 'selected format'}</button>
    </div>}
  </div>;
}

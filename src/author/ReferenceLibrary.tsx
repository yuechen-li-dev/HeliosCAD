import { useEffect, useRef, useState } from 'react';
import { request } from '../cloud/api';

interface Reference { id: string; name: string; sha256: string; sections: number; tables: string[] }
export function ReferenceLibrary({ selected, disabled, onChange, onBusyChange }: { selected: string[]; disabled: boolean; onChange(ids: string[]): void; onBusyChange(busy: boolean): void }) {
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const uploadAbort = useRef<AbortController | null>(null);
  async function refresh(signal?: AbortSignal) {
    const list = await request<Reference[]>('/api/helios/author/references', { signal });
    if (!Array.isArray(list)) throw new Error('Reference library unavailable. Update Leviathan.');
    setReferences(list);
  }
  useEffect(() => {
    const abort = new AbortController();
    void refresh(abort.signal).catch(() => { if (!abort.signal.aborted) setError('Connect and sign in to Leviathan to manage engineering references.'); });
    return () => { abort.abort(); uploadAbort.current?.abort(); };
  }, []);
  async function upload(file: File) {
    const abort = new AbortController(); uploadAbort.current = abort;
    setLoading(true); onBusyChange(true); setError('');
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('References are limited to 4 MiB per file.');
      const bytes = new Uint8Array(await file.arrayBuffer()); abort.signal.throwIfAborted(); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const saved = await request<Reference>('/api/helios/author/references', { method: 'POST', signal: abort.signal, body: JSON.stringify({ name: file.name, contentBase64: btoa(binary) }) });
      await refresh(abort.signal); abort.signal.throwIfAborted(); if (selected.length < 10) onChange([...selected, saved.id]);
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); onBusyChange(false); uploadAbort.current = null; }
  }
  return <section className="reference-library" aria-label="Engineering references">
    <div className="panel-heading">Engineering references</div>
    <div className="reference-body">
      <p>Attach evidence for the agent: specifications, datasheets, parts catalogs and parameter sheets.</p>
      <label>Add reference<input aria-label="Add engineering reference" type="file" accept=".txt,.md,.pdf,.docx,.csv,.xlsx" disabled={disabled || loading} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file);
      }} /></label>
      {loading && <p role="status">Importing reference…</p>}
      {error && <p role="alert">{error}</p>}
      {selected.filter(id => !references.some(r => r.id === id)).map(id => <p key={id} role="alert">Attached reference unavailable: {id}</p>)}
      {references.map(reference => <label key={reference.id} className="reference-item">
        <input type="checkbox" checked={selected.includes(reference.id)} disabled={disabled || loading || selected.length >= 10 && !selected.includes(reference.id)} onChange={e => onChange(e.target.checked ? [...selected, reference.id] : selected.filter(id => id !== reference.id))} />
        <span>{reference.name}<small>{reference.sections} sections · {reference.tables.length} tables · SHA-256 {reference.sha256.slice(0, 12)}</small></span>
      </label>)}
      <p>Up to 10 attached references. PDFs need selectable text; XLSX formulas are not recalculated. Original files stay in your server account. Checkpoints retain attachment IDs.</p>
    </div>
  </section>;
}

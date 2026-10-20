import type { Checkpoint } from './checkpoints';

export function VersionControlPanel({ checkpoints, busy, restoring, error, onSave, onRestore }: {
  checkpoints: Checkpoint[];
  busy: boolean;
  restoring: boolean;
  error: string;
  onSave(): void;
  onRestore(checkpoint: Checkpoint): void;
}) {
  return <section className="version-control-panel" aria-label="Version Control">
    <div className="panel-heading">Version Control</div>
    <div className="version-control-body">
      <p>Save a checkpoint of your project, or return to an earlier state.</p>
      <button disabled={busy} onClick={onSave}>Save checkpoint</button>
      {restoring && <p role="status">Restoring checkpoint…</p>}
      {error && <p role="alert">{error}</p>}
      <h2>Checkpoints</h2>
      {checkpoints.length === 0 && <p>No checkpoints yet. Save your first project state here.</p>}
      <ol className="checkpoint-list">{checkpoints.map(saved => <li key={saved.id}>
        <strong>{saved.title}</strong>
        <time dateTime={saved.createdAt}>{new Date(saved.createdAt).toLocaleString()}</time>
        <span>{saved.project.root} · {Object.keys(saved.project.documents).length} file(s)</span>
        <button disabled={busy} aria-label={'Restore ' + saved.title} onClick={() => onRestore(saved)}>Restore</button>
      </li>)}</ol>
      <p>Restoring keeps later checkpoints, so you can return to them. Saved drafts may fail to build.</p>
      <p>Stored in this browser, including automatic AI recovery checkpoints. Clearing browser storage removes this history. This is not a cloud backup.</p>
    </div>
  </section>;
}

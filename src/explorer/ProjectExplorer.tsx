interface Props {
  projectName: string;
  fileName: string;
  dirty: boolean;
  dirtyFiles?: ReadonlySet<string>;
  onOpen(): void;
  onNew(): void;
  onReveal(): void;
  documents?: readonly string[];
  onSelectFile?(name: string): void;
  cloud?: boolean;
}

/** Explicit browser-session documents; cloud projects retain their single-source contract. */
export function ProjectExplorer({ projectName, fileName, dirty, dirtyFiles, onOpen, onNew, onReveal, documents = [fileName], onSelectFile, cloud }: Props) {
  return <section className="panel project-explorer" aria-label="Project explorer">
    <div className="panel-heading"><span>PROJECT FILES</span><span className="panel-meta">{documents.length} FILE{documents.length === 1 ? '' : 'S'}</span></div>
    <div className="explorer-actions">
      <button onClick={onNew} title="New Firmament source">New</button>
      <button onClick={onOpen} title="Open Firmament source">Open</button>
      <button onClick={onReveal} title="Reveal active file">Reveal</button>
    </div>
    <div className="explorer-project" title={projectName}>▾ {projectName}</div>
    {documents.map(name => <button key={name} aria-label={name} className={`explorer-file ${name === fileName ? 'active' : ''}`} onClick={() => onSelectFile ? onSelectFile(name) : onReveal()} aria-current={name === fileName ? 'page' : undefined} title={name}>
      <span>◇</span><span>{name}</span>{(dirtyFiles?.has(name) ?? (dirty && name === fileName)) && <span aria-label="Unsaved">●</span>}
    </button>)}
    <p className="explorer-note">{cloud ? 'This saved project stores one source document.' : 'Files live in this browser session. Download source before leaving. Build always compiles the project root.'}</p>
  </section>;
}

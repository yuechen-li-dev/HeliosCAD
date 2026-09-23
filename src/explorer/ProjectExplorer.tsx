interface Props {
  projectName: string;
  fileName: string;
  dirty: boolean;
  onOpen(): void;
  onNew(): void;
  onReveal(): void;
}

/** The current project API stores exactly one Firmament source document. */
export function ProjectExplorer({ projectName, fileName, dirty, onOpen, onNew, onReveal }: Props) {
  return <section className="panel project-explorer" aria-label="Project explorer">
    <div className="panel-heading"><span>EXPLORER</span><span className="panel-meta">1 FILE</span></div>
    <div className="explorer-actions">
      <button onClick={onNew} title="New Firmament source">New</button>
      <button onClick={onOpen} title="Open Firmament source">Open</button>
      <button onClick={onReveal} title="Reveal active file">Reveal</button>
    </div>
    <div className="explorer-project" title={projectName}>▾ {projectName}</div>
    <button className="explorer-file active" onClick={onReveal} aria-current="page" title={fileName}>
      <span>◇</span><span>{fileName}</span>{dirty && <span aria-label="Unsaved">●</span>}
    </button>
    <p className="explorer-note">This project stores one source document. Its displayed filename is derived from the project name.</p>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { AuthorPanel } from '../author/AuthorPanel';
import { Checkpoints, type Checkpoint } from '../version-control/checkpoints';
import { VersionControlPanel } from '../version-control/VersionControlPanel';
import type { EditableWorkspace, ProjectSnapshot } from './projectSnapshot';
import { ReferenceLibrary } from '../author/ReferenceLibrary';

const history = new Checkpoints();
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Shared checkpoint ownership; both tabs stay mounted when inspecting other utilities. */
export function WorkspacePanels({ workspace, active }: { workspace: EditableWorkspace; active: string }) {
  const current = useRef(workspace);
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [requirements, setRequirements] = useState('');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [restoredRevision, setRestoredRevision] = useState(0);
  const busy = !!workspace.busy || agentBusy || referenceBusy || saving || restoring;
  current.current = { ...workspace, snapshot: () => {
    const snapshot = workspace.snapshot(); const project = { ...snapshot.project }; delete project.referenceIds;
    if (referenceIds.length) project.referenceIds = [...referenceIds];
    return { ...snapshot, project };
  }, apply: async (project, revision, label) => {
    const built = await workspace.apply(project, revision, label);
    setReferenceIds(project.referenceIds ?? []); return built;
  } };

  async function refresh() { setCheckpoints(await history.list(current.current.id)); }
  useEffect(() => { void refresh().catch(error => setError('Checkpoint storage unavailable: ' + errorText(error))); }, [workspace.id]);

  async function checkpoint(title: string, project: ProjectSnapshot) {
    await history.save(current.current.id, title, project, undefined, requirements);
    await refresh();
  }
  async function save() {
    if (busy) return;
    setSaving(true); setError('');
    try { await checkpoint('Manual checkpoint', current.current.snapshot().project); }
    catch (error) { setError('Checkpoint could not be stored: ' + errorText(error)); }
    finally { setSaving(false); }
  }
  async function restore(saved: Checkpoint) {
    if (busy) return;
    setRestoring(true); setError('');
    let sourceRestored = false;
    try {
      const before = current.current.snapshot();
      await checkpoint('Before restore', before.project);
      const built = await current.current.apply(saved.project, before.revision, 'Restored checkpoint');
      sourceRestored = true;
      setRequirements(saved.requirements ?? '');
      setRestoredRevision(revision => revision + 1);
      await history.save(current.current.id, 'Restored ' + saved.title, saved.project, saved.id, saved.requirements);
      await refresh();
      if (!built) setError('Checkpoint source restored. This draft does not build; the last valid geometry remains visible.');
    } catch (error) {
      setError((sourceRestored ? 'Source restored, but its new checkpoint could not be stored. The pre-restore checkpoint is retained. ' : 'Restore failed. ') + errorText(error));
    } finally { setRestoring(false); }
  }
  return <>
    <div hidden={active !== 'llm'}><AuthorPanel workspace={{ ...current.current, busy: !!workspace.busy || referenceBusy || saving || restoring }}
      requirements={requirements} onRequirementsChange={setRequirements} onCheckpoint={checkpoint}
      restoredRevision={restoredRevision} onBusyChange={setAgentBusy} /></div>
    <div hidden={active !== 'version-control'}><VersionControlPanel checkpoints={checkpoints} busy={busy}
      restoring={restoring} error={error} onSave={() => void save()} onRestore={saved => void restore(saved)} /></div>
    <div className="reference-library-container" hidden={active !== 'files'}><ReferenceLibrary selected={referenceIds} disabled={busy} onBusyChange={setReferenceBusy} onChange={ids => {
      setReferenceIds(ids); setRestoredRevision(revision => revision + 1);
    }} /></div>
  </>;
}

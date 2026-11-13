import { zipSync } from 'fflate';
import { artifactBuild } from './target';

/** The extensions a claude.ai artifact may offer for download; anything else is saved inside a .zip. */
const artifactExtensions = /\.(txt|json|md|zip|csv|svg|png|jpe?g|webp|gif|pdf|html|xlsx|docx|pptx)$/i;

interface ArtifactDownloads { save(request: { filename: string; data: Blob | Uint8Array }): Promise<unknown> }
type ClaudeHost = { use?(name: 'downloads'): Promise<ArtifactDownloads | null> };

/**
 * Saves a file the page generated. A normal deployment uses an anchor download. In the artifact
 * build the frame cannot download, so the viewer is asked through the artifact's `downloads`
 * capability; file types it does not offer (.step, .firmament) are wrapped in a .zip of the same name.
 */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  if (!artifactBuild) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const downloads = await (globalThis as { claude?: ClaudeHost }).claude?.use?.('downloads');
  if (!downloads) throw new Error('Saving files is not available in this view of Helios.');
  const zipped = !artifactExtensions.test(name);
  const data = zipped ? zipSync({ [name]: new Uint8Array(await blob.arrayBuffer()) }) : blob;
  try { await downloads.save({ filename: zipped ? `${name}.zip` : name, data }); }
  catch (error) {
    if ((error as { code?: string })?.code === 'declined') return; // the viewer said no
    throw error;
  }
}

import { cloneProject, type ProjectSnapshot } from '../app/projectSnapshot';

export interface Checkpoint { id: string; workspace: string; title: string; createdAt: string; project: ProjectSnapshot; requirements?: string; restoredFrom?: string }
/** Local immutable project checkpoints. Saving a draft does not assert that it builds. */
export class Checkpoints {
  private async database() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('helios-checkpoints', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('checkpoints', { keyPath: 'id' }).createIndex('workspace', 'workspace'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async save(workspace: string, title: string, project: ProjectSnapshot, restoredFrom?: string, requirements?: string) {
    const checkpoint: Checkpoint = { id: crypto.randomUUID(), workspace, title, createdAt: new Date().toISOString(), project: cloneProject(project), restoredFrom, requirements };
    const db = await this.database();
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('checkpoints', 'readwrite'); tx.objectStore('checkpoints').add(checkpoint); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
    return checkpoint;
  }
  async list(workspace: string): Promise<Checkpoint[]> {
    const db = await this.database();
    try { return await new Promise((resolve, reject) => {
      const request = db.transaction('checkpoints').objectStore('checkpoints').index('workspace').getAll(workspace);
      request.onsuccess = () => resolve((request.result as Checkpoint[]).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  }
}

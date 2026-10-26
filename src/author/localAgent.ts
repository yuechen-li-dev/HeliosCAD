import { request } from '../cloud/api';
import { projectHashes } from './engineeringEvidence';
import { executeAgentTool, type AgentGateway, type AgentWorkspace } from './agentWorkspace';

/** Helios task channel. Vendor protocols and authentication stay in the local host. */
export async function runLocalAgent(gateway: AgentGateway, workspace: AgentWorkspace, model: string,
  requirements: string, input: unknown[], signal: AbortSignal, activity: (text: string) => void, text: (value: string) => void,
  connection: { agent: string; pairingToken?: string; applyMode?: 'auto' | 'review'; budgetMinutes?: number } = { agent: 'codex' }) {
  const { ticket } = await request<{ ticket: string }>('/api/helios/author/local/ticket', { method: 'POST', body: '{}', signal });
  const hashes = await projectHashes(workspace.project); signal.throwIfAborted();
  const url = new URL('/api/helios/author/local/run', location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', ticket);
  return new Promise<{ text: string; transcript: unknown[]; tokens: null }>((resolve, reject) => {
    const socket = new WebSocket(url);
    let finished = false, streamed = '', queue = Promise.resolve();
    const transcript = [...input];
    function finish(error?: unknown, answer?: string) {
      if (finished) return; finished = true;
      signal.removeEventListener('abort', abort);
      socket.close();
      if (error) reject(error);
      else resolve({ text: answer ?? '', transcript: [...transcript, { role: 'assistant', content: answer ?? '' }], tokens: null });
    }
    function abort() {
      // The reason reaches a desktop agent's next tool call, so it can tell the user what happened.
      const reason = signal.reason instanceof DOMException && signal.reason.name === 'AbortError' ? 'Helios closed the task (the page reloaded or the panel closed). Candidate changes were not applied.'
        : signal.reason instanceof Error ? signal.reason.message : typeof signal.reason === 'string' ? signal.reason : undefined;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel', ...(reason ? { reason } : {}) }));
      finish(signal.reason ?? new Error('Agent cancelled.'));
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    socket.onopen = () => {
      activity(connection.agent === 'codex' ? 'Connecting to Codex · ChatGPT subscription…' : 'Waiting for the connected desktop client…');
      socket.send(JSON.stringify({ model, root: workspace.project.root, documents: Object.keys(workspace.project.documents),
        documentHashes: hashes, requirements, input, referenceIds: workspace.project.referenceIds ?? [], agent: connection.agent, pairingToken: connection.pairingToken,
        applyMode: connection.applyMode, budgetMinutes: connection.budgetMinutes }));
    };
    socket.onmessage = event => {
      queue = queue.then(async () => {
        if (finished) return;
        signal.throwIfAborted();
        const message = JSON.parse(String(event.data));
        if (message.type === 'text') { streamed += message.text; text(streamed); activity('The connected agent is working…'); }
        else if (message.type === 'activity') activity(message.text);
        else if (message.type === 'tool') {
          activity(message.name);
          const output = await executeAgentTool(gateway, workspace, requirements, message.name, message.arguments, signal);
          signal.throwIfAborted();
          transcript.push({ role: 'assistant', content: `Tool ${message.name}: ${JSON.stringify(output)}` });
          socket.send(JSON.stringify({ type: 'tool_result', id: message.id, output }));
        } else if (message.type === 'complete') finish(undefined, message.text);
        else if (message.type === 'error') finish(new Error(message.message));
        else finish(new Error('Unsupported local agent message.'));
      }).catch(finish);
    };
    socket.onerror = () => finish(new Error('Could not connect to the local agent. Check AI connection settings.'));
    socket.onclose = () => { void queue.then(() => { if (!finished) finish(new Error('Agent disconnected before completing the task. Candidate changes were not applied.')); }); };
  });
}

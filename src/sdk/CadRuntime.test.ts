import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeModel } from '../test/fakes';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@aetheris/cad', () => ({ Aetheris: { create } }));
import { WebSdkCadRuntime } from './CadRuntime';

const cad = () => ({ info: vi.fn(async () => ({ packageVersion: 'test' })), compile: vi.fn(), terminate: vi.fn(), language: { outline: vi.fn() } });
describe('workspace runtime ownership', () => {
  beforeEach(() => create.mockReset());
  it('compiles preview handles without replacing or disposing the accepted model', async () => {
    const engine = cad(), live = fakeModel({ dispose: vi.fn(async () => {}) }), candidate = fakeModel();
    engine.compile.mockResolvedValueOnce({ model: live, diagnostics: [] }).mockResolvedValueOnce({ model: candidate, diagnostics: [] });
    create.mockResolvedValue(engine); const runtime = new WebSdkCadRuntime();
    await runtime.open('accepted', 'part.firmament', 1);
    const result = await runtime.preview('candidate', 'part.firmament', 1);
    expect(result.model).toBe(candidate); expect(runtime.session()).toBe(live); expect(live.dispose).not.toHaveBeenCalled();
    await runtime.dispose(); expect(engine.terminate).toHaveBeenCalled();
  });
  it('terminates a late language initialization without installing it into a restarted workspace', async () => {
    let finish!: (value: ReturnType<typeof cad>) => void;
    const old = cad(), fresh = cad();
    create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(fresh);
    const runtime = new WebSdkCadRuntime();
    const pending = runtime.outline('source', 'part.firmament', '0');
    const refused = expect(pending).rejects.toThrow('closed');
    await runtime.restart(); finish(old); await refused;
    expect(old.terminate).toHaveBeenCalled(); expect(fresh.terminate).not.toHaveBeenCalled();
    await runtime.dispose();
  });
  it('cannot revive a runtime after its host was disposed during restart', async () => {
    const runtime = new WebSdkCadRuntime(); const restart = runtime.restart();
    await runtime.dispose(); await expect(restart).rejects.toThrow('closed'); expect(create).not.toHaveBeenCalled();
  });
  it('rejects stale inspector queries as promises rather than throwing from React effects', async () => {
    const runtime = new WebSdkCadRuntime();
    await expect(runtime.describeConstruct('old-selection')).rejects.toThrow('No Firmament model is open');
  });
});

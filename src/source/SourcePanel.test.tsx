import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourcePanel } from './SourcePanel';

describe('source and diagnostics', () => {
  it('keeps local edits through stale React snapshots and accepts newer external edits', () => {
    const changed = vi.fn(() => 2);
    const props = { diagnostics: [], fileName: 'part.firmament', onSourceChange: changed, onRebuild() {}, onDiagnosticClick() {} };
    const view = render(<SourcePanel {...props} source="Model original {}" sourceRevision={1} />);
    fireEvent.change(screen.getByLabelText('Firmament source'), { target: { value: 'Model typed {}' } });
    view.rerender(<SourcePanel {...props} source="Model stale {}" sourceRevision={1} />);
    expect(screen.getByLabelText('Firmament source')).toHaveValue('Model typed {}');
    view.rerender(<SourcePanel {...props} source="Model external {}" sourceRevision={3} />);
    expect(screen.getByLabelText('Firmament source')).toHaveValue('Model external {}');
    expect(changed).toHaveBeenCalledOnce();
  });
  it('publishes line-ending normalization so requests and project snapshots share offsets', () => {
    const changed = vi.fn();
    render(<SourcePanel source={'// first\nModel demo {\r\n}\r\n'} diagnostics={[]} onSourceChange={changed} onRebuild={() => {}} onDiagnosticClick={() => {}} />);
    expect(changed).toHaveBeenCalledWith('// first\r\nModel demo {\r\n}\r\n');
    expect(screen.getByLabelText('Firmament source')).toHaveValue('// first\nModel demo {\n}\n');
  });
  it('exposes authoritative source with line numbers', () => { render(<SourcePanel source={'Model A {\n}'} diagnostics={[]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={() => {}} />); expect(screen.getByLabelText('Firmament source')).toHaveValue('Model A {\n}'); });
  it('routes a diagnostic click', () => { const click = vi.fn(); const diagnostic = { severity: 'error' as const, code: 'F001', message: 'Invalid size' }; render(<SourcePanel source="" diagnostics={[diagnostic]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={click} />); fireEvent.click(screen.getByText(/^Problems/)); fireEvent.click(screen.getByText('F001')); expect(click).toHaveBeenCalledWith(diagnostic); });
  it('returns a located diagnostic to the source editor', () => { const diagnostic = { severity: 'error' as const, code: 'F002', message: 'Bad token', source: { source: 'model.firmament', line: 2, column: 2, start: 11, length: 1 } }; render(<SourcePanel source={'Model A {\n bad\n}'} diagnostics={[diagnostic]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={() => {}} />); fireEvent.click(screen.getByText(/^Problems/)); fireEvent.click(screen.getByText('F002')); expect(screen.getByLabelText('Firmament source')).toBeVisible(); });
});

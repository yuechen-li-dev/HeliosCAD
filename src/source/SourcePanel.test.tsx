import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourcePanel } from './SourcePanel';

describe('source and diagnostics', () => {
  it('exposes authoritative source with line numbers', () => { render(<SourcePanel source={'Model A {\n}'} diagnostics={[]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={() => {}} />); expect(screen.getByLabelText('Firmament source')).toHaveValue('Model A {\n}'); });
  it('routes a diagnostic click', () => { const click = vi.fn(); const diagnostic = { severity: 'error' as const, code: 'F001', message: 'Invalid size' }; render(<SourcePanel source="" diagnostics={[diagnostic]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={click} />); fireEvent.click(screen.getByText(/PROBLEMS/)); fireEvent.click(screen.getByText('F001')); expect(click).toHaveBeenCalledWith(diagnostic); });
  it('returns a located diagnostic to the source editor', () => { const diagnostic = { severity: 'error' as const, code: 'F002', message: 'Bad token', source: { source: 'model.firmament', line: 2, column: 2, start: 11, length: 1 } }; render(<SourcePanel source={'Model A {\n bad\n}'} diagnostics={[diagnostic]} onSourceChange={() => {}} onRebuild={() => {}} onDiagnosticClick={() => {}} />); fireEvent.click(screen.getByText(/PROBLEMS/)); fireEvent.click(screen.getByText('F002')); expect(screen.getByLabelText('Firmament source')).toBeVisible(); });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '@aetheris/cad';
import { BottomDock } from './BottomDock';
import { WorkspaceStatus } from './WorkspaceStatus';
import { fakeModel } from '../test/fakes';

const info: Diagnostic = { severity: 'info', code: 'planner', message: 'Selected strategy' };
const error: Diagnostic = { severity: 'error', code: 'overlap', message: 'Hole overlaps CenterMount',
  source: { source: 'part.firmament', line: 1, column: 1, start: 0, length: 5 } };

describe('compiler diagnostic presentation', () => {
  it('puts errors before planner information and preserves the navigation diagnostic', () => {
    const onDiagnosticClick = vi.fn();
    render(<BottomDock diagnostics={[info, error]} busy={null} sourceName="part.firmament" sourceRevision={2}
      displayRevision={1} lastTiming={null} events={[]} onDiagnosticClick={onDiagnosticClick} />);
    const messages = document.querySelectorAll('.dock-errors button');
    expect(messages[0]).toHaveTextContent(error.message);
    expect(messages[1]).toHaveTextContent(info.message);
    expect(screen.getByRole('tab', { name: 'Problems' })).toHaveTextContent('Problems1');
    fireEvent.click(messages[0]); expect(onDiagnosticClick).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole('tab', { name: 'Output' }));
    expect(screen.getByText('Build failed · part.firmament')).toBeVisible();
  });

  it('shows failed admission instead of Ready while retaining the last model', () => {
    const props = { busy: null, elapsed: 0, runtimeName: 'Worker', model: fakeModel(), sourceRevision: 2, displayRevision: 1,
      diagnostics: [error], timing: null, theme: 'apollonia' as const, viewMode: 'perspective' as const, onRestart: vi.fn() };
    const view = render(<WorkspaceStatus {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Build failed');
    view.rerender(<WorkspaceStatus {...props} busy="Building" />);
    expect(screen.getByRole('status')).toHaveTextContent('Building');
    view.rerender(<WorkspaceStatus {...props} diagnostics={[info]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
    expect(screen.getByText('No problems')).toBeVisible();
    expect(screen.getByText('1 info')).toBeVisible();
    view.rerender(<WorkspaceStatus {...props} displayRevision={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Needs attention');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MotionClip, MotionPose } from '@aetheris/cad';
import { MotionStrip } from './MotionStrip';

const clip: MotionClip = { name: 'Wave', durationSeconds: 2, repeat: 'Loop', tracks: [{ name: 'Lift', mateStableId: 'mate:shoulder', jointName: 'Shoulder', valueDimension: 'Angle' }] };
const pose = (t: number): MotionPose => ({ revision: 3, motion: 'Wave', timeSeconds: t, state: { Shoulder: t * 20 }, transforms: [] });

describe('motion strip', () => {
  it('samples the scrubbed time, shows joint values in their units and resets to the built pose', async () => {
    const sample = vi.fn(async (_: string, t: number) => pose(t));
    const onPose = vi.fn();
    render(<MotionStrip clips={[clip]} revision={3} sample={sample} onPose={onPose} coverage={() => 1} />);
    fireEvent.change(screen.getByLabelText('Motion time'), { target: { value: '1.5' } });
    await waitFor(() => expect(screen.getByLabelText('Joint values')).toHaveTextContent('Shoulder 30 deg'));
    expect(sample).toHaveBeenCalledWith('Wave', 1.5);
    expect(onPose).toHaveBeenLastCalledWith(pose(1.5));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onPose).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('0.00 / 2.00 s · loop')).toBeVisible();
  });

  it('reports a sampling failure instead of playing on', async () => {
    render(<MotionStrip clips={[clip]} revision={1} sample={async () => { throw new Error('The sampled Motion belongs to a different build revision.'); }} onPose={vi.fn()} coverage={() => 0} />);
    fireEvent.change(screen.getByLabelText('Motion time'), { target: { value: '1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('different build revision');
  });
});

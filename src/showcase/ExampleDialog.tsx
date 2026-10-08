import { useEffect, useRef, type ReactNode } from 'react';

export function ExampleDialog({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="gallery-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="gallery-dialog" role="dialog" aria-modal="true" aria-label="Open an example" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []);
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) { event.preventDefault(); target?.focus(); }
    }}>
      <button className="dialog-close" aria-label="Close examples" onClick={onClose}>×</button>
      {children}
    </div>
  </div>;
}

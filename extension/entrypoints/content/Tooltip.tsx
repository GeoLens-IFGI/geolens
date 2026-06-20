import { useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

// A lightweight, non-intrusive hover/focus tooltip. Renders its trigger inline
// and a small bubble on hover. Used for the category boxes and the per-verifier
// info icons. For top/bottom placement it flips to whichever side has room, so a
// box near the top edge of the modal isn't clipped.
const FLIP_MARGIN = 88; // px of vertical room a top/bottom bubble needs

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left';
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<'top' | 'bottom' | 'left'>(side);

  const show = () => {
    const el = ref.current;
    if (el && side !== 'left') {
      const rect = el.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (side === 'top') setResolved(spaceAbove < FLIP_MARGIN && spaceBelow > spaceAbove ? 'bottom' : 'top');
      else setResolved(spaceBelow < FLIP_MARGIN && spaceAbove > spaceBelow ? 'top' : 'bottom');
    } else {
      setResolved(side);
    }
    setOpen(true);
  };

  const pos =
    resolved === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2'
      : resolved === 'left'
        ? 'right-full mr-2 top-1/2 -translate-y-1/2'
        : 'bottom-full mb-2 left-1/2 -translate-x-1/2';

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5',
          'text-xs font-normal leading-snug text-white shadow-xl transition-opacity duration-150',
          pos,
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {content}
      </span>
    </span>
  );
}

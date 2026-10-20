'use client';

import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icons';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: traps focus, restores it on close, closes on Esc and backdrop click
 * (unless `dismissable` is false), and makes the rest of the app inert while open.
 */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  dismissable = true,
  className = '',
  hideTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  dismissable?: boolean;
  className?: string;
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const app = document.querySelector('.stage');
    app?.setAttribute('inert', '');
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const firstEl = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      app?.removeAttribute('inert');
      prev?.focus?.();
    };
  }, [onClose, dismissable]);
  return (
    <div className="modal-backdrop" onClick={dismissable ? onClose : undefined}>
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`modal-head ${hideTitle ? 'sr-only-head' : ''}`}>
          <h2 id={titleId}>{title}</h2>
          {dismissable ? (
            <button type="button" className="icon-btn small ghost" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

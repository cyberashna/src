import { useEffect, useRef, type PointerEvent, type MouseEvent } from 'react';

export function useItemLongPress(onOpen?: () => void, ignoreControls = false) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; start.current = null; };
  useEffect(() => cancel, []);
  return {
    cancel,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      cancel(); fired.current = false;
      if (!onOpen || event.button !== 0 || event.isPrimary === false || !['touch', 'pen'].includes(event.pointerType)) return;
      if (ignoreControls && (event.target as HTMLElement).closest?.('button,input,select,textarea,a')) return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; start.current = null; onOpen(); }, 500);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp(event: PointerEvent<HTMLElement>) { cancel(); if (fired.current && event.cancelable) event.preventDefault(); },
    onPointerCancel() { cancel(); fired.current = false; },
    onPointerLeave: cancel,
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (!onOpen || (ignoreControls && (event.target as HTMLElement).closest?.('input,select,textarea'))) return;
      event.preventDefault(); event.stopPropagation(); cancel();
      if (!fired.current) { fired.current = true; onOpen(); }
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (fired.current) { event.preventDefault(); event.stopPropagation(); fired.current = false; }
    },
  };
}

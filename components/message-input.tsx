'use client';

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { messageInputSize } from '@/lib/message-input-size';

/** Shared by admin/client conversations; changes only textarea geometry. */
export function MessageInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const form = input.form;
    const pane = input.closest<HTMLElement>('.messages-pane-body');
    let frame = 0;
    let disposed = false;
    const resize = () => {
      if (!input.isConnected || input.clientWidth === 0) return;
      const style = getComputedStyle(input);
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const minimum = Math.max(parseFloat(style.minHeight) || 0, (parseFloat(style.lineHeight) || 24) + padding + border);
      const chrome = form ? form.getBoundingClientRect().height - input.getBoundingClientRect().height : 0;
      // Reset before measuring so deletion and narrower/wider wrapping can shrink too.
      input.style.height = '0px';
      input.style.overflowY = 'hidden';
      const size = messageInputSize(input.scrollHeight + border, minimum,
        window.visualViewport?.height ?? window.innerHeight,
        window.matchMedia('(min-width: 1024px)').matches, pane?.clientHeight, chrome);
      input.style.height = `${size.height}px`;
      input.style.overflowY = size.overflow;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    resizeRef.current = resize;
    let width = -1, height = -1;
    const observer = new ResizeObserver(() => {
      const nextWidth = input.clientWidth, nextHeight = pane?.clientHeight ?? 0;
      // Ignore height notifications caused by our own textarea writes.
      if (nextWidth !== width || nextHeight !== height) {
        width = nextWidth; height = nextHeight; schedule();
      }
    });
    observer.observe(input);
    if (pane) observer.observe(pane);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    void document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      resizeRef.current = null;
    };
  }, []);

  useLayoutEffect(() => { resizeRef.current?.(); }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} />;
}

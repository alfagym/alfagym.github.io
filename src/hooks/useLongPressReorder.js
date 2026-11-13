import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';

let uidCounter = 1;
const fallbackWeakMap = new WeakMap();

export function createExerciseUid() {
  return `exu-${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function ensureExerciseUid(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  if (ex._uid) return ex;
  return { ...ex, _uid: createExerciseUid() };
}

export function ensureExercisesUids(list) {
  return Array.isArray(list) ? list.map(ensureExerciseUid) : [];
}

export function stripExerciseUid(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  const { _uid, ...clean } = ex;
  return clean;
}

export function getExerciseItemKey(ex, fallbackIdx = 0) {
  if (ex && typeof ex === 'object') {
    if (ex._uid) return ex._uid;
    let cached = fallbackWeakMap.get(ex);
    if (!cached) {
      cached = createExerciseUid();
      fallbackWeakMap.set(ex, cached);
    }
    return cached;
  }
  return `idx-${fallbackIdx}`;
}

function isInteractiveSubTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest(
      'button, select, input, textarea, a, .thumb-zoom-btn, .draft-ex-swap-pill'
    )
  );
}

function findScrollParent(el) {
  let node = el?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 2
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function computeFollowerCoords(el, clientX, clientY, pointerType) {
  const vw = window.innerWidth || 390;
  const vh = window.innerHeight || 844;
  const rect = el ? el.getBoundingClientRect() : null;
  const width = rect?.width || 240;
  const height = rect?.height || 44;

  const rawX = clientX - width * 0.5;
  const clampedX = Math.max(12, Math.min(vw - width - 12, rawX));

  const verticalOffset = pointerType === 'touch' ? 54 : 26;
  const rawY = clientY - verticalOffset;
  const clampedY = Math.max(10, Math.min(vh - height - 10, rawY));

  return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

export function useLongPressReorder({
  items,
  onReorder,
  onDragStart,
  holdMs = 260,
  mouseHoldMs = 170,
  getItemLabel,
  getItemThumb,
}) {
  const containerRef = useRef(null);
  const followerRef = useRef(null);
  const latestRef = useRef({
    items,
    onReorder,
    onDragStart,
    getItemLabel,
    getItemThumb,
  });
  latestRef.current = {
    items,
    onReorder,
    onDragStart,
    getItemLabel,
    getItemThumb,
  };

  const sessionRef = useRef(null);
  const justDraggedRef = useRef(false);
  const clearJustDraggedTimerRef = useRef(null);
  const [dragState, setDragState] = useState(null);

  const positionFollower = useCallback((clientX, clientY, pointerType) => {
    const el = followerRef.current;
    if (!el) return;
    const { x, y } = computeFollowerCoords(el, clientX, clientY, pointerType);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const evaluateLiveSwap = useCallback((pointerY) => {
    const s = sessionRef.current;
    const container = containerRef.current;
    if (!s || s.phase !== 'dragging' || !container) return;

    const nodes = Array.from(container.children).filter(
      (n) => n.getAttribute('data-reorder-item') === 'true'
    );
    const idx = s.currentIdx;
    if (idx < 0 || idx >= nodes.length) return;

    let targetIdx = null;
    if (idx > 0) {
      const prevRect = nodes[idx - 1]?.getBoundingClientRect();
      if (prevRect && pointerY < prevRect.top + prevRect.height * 0.5) {
        targetIdx = idx - 1;
      }
    }
    if (targetIdx === null && idx < nodes.length - 1) {
      const nextRect = nodes[idx + 1]?.getBoundingClientRect();
      if (nextRect && pointerY > nextRect.top + nextRect.height * 0.5) {
        targetIdx = idx + 1;
      }
    }

    if (targetIdx !== null && targetIdx !== idx) {
      const fromIdx = idx;
      s.currentIdx = targetIdx;
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore if unsupported
      }
      latestRef.current.onReorder?.(fromIdx, targetIdx);
      setDragState((prev) =>
        prev ? { ...prev, activeIdx: targetIdx } : prev
      );
    }
  }, []);

  const cleanupSession = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      if (s.holdTimer) {
        window.clearTimeout(s.holdTimer);
        s.holdTimer = null;
      }
      if (s.rafId) {
        window.cancelAnimationFrame(s.rafId);
        s.rafId = null;
      }
      if (Array.isArray(s.cleanupFns)) {
        for (const fn of s.cleanupFns) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
      }
      sessionRef.current = null;
    }
    document.body.classList.remove('alfa-dragging-active');
    setDragState(null);
  }, []);

  const finishSession = useCallback(() => {
    const wasDragging = sessionRef.current?.phase === 'dragging';
    cleanupSession();
    if (wasDragging) {
      if (clearJustDraggedTimerRef.current) {
        window.clearTimeout(clearJustDraggedTimerRef.current);
      }
      clearJustDraggedTimerRef.current = window.setTimeout(() => {
        justDraggedRef.current = false;
        clearJustDraggedTimerRef.current = null;
      }, 120);
    }
  }, [cleanupSession]);

  const startAutoScroll = useCallback(() => {
    let lastFrameTime = performance.now();

    const tick = (now) => {
      const s = sessionRef.current;
      if (!s || s.phase !== 'dragging') return;

      const dtFactor = Math.min(2.2, Math.max(0.4, (now - lastFrameTime) / 16.67));
      lastFrameTime = now;

      const scrollParent = s.scrollParent || window;
      let topBound = 62;
      let bottomBound = window.innerHeight || 844;

      if (scrollParent !== window && scrollParent instanceof Element) {
        const sr = scrollParent.getBoundingClientRect();
        topBound = Math.max(0, sr.top);
        bottomBound = Math.min(window.innerHeight || 844, sr.bottom);
      }

      const mobNav = document.querySelector('.alfa-mobile-bottom-nav');
      if (mobNav && window.getComputedStyle(mobNav).display !== 'none') {
        bottomBound = Math.min(bottomBound, mobNav.getBoundingClientRect().top);
      }
      const restBar = document.querySelector('.floating-rest-timer-bar');
      if (restBar && window.getComputedStyle(restBar).display !== 'none') {
        bottomBound = Math.min(bottomBound, restBar.getBoundingClientRect().top);
      }

      const EDGE_ZONE = 74;
      let step = 0;

      if (bottomBound - topBound > 120) {
        if (s.lastY < topBound + EDGE_ZONE) {
          const ratio = Math.min(
            1,
            Math.max(0, (topBound + EDGE_ZONE - s.lastY) / EDGE_ZONE)
          );
          step = -(2.5 + 12.5 * ratio * ratio) * dtFactor;
        } else if (s.lastY > bottomBound - EDGE_ZONE) {
          const ratio = Math.min(
            1,
            Math.max(0, (s.lastY - (bottomBound - EDGE_ZONE)) / EDGE_ZONE)
          );
          step = (2.5 + 12.5 * ratio * ratio) * dtFactor;
        }
      }

      if (step !== 0) {
        const roundedStep = step > 0 ? Math.ceil(step) : Math.floor(step);
        if (scrollParent === window) {
          const prevY = window.scrollY;
          window.scrollBy(0, roundedStep);
          if (window.scrollY !== prevY) {
            evaluateLiveSwap(s.lastY);
          }
        } else if (scrollParent instanceof Element) {
          const prevTop = scrollParent.scrollTop;
          scrollParent.scrollTop += roundedStep;
          if (scrollParent.scrollTop !== prevTop) {
            evaluateLiveSwap(s.lastY);
          }
        }
      }

      s.rafId = window.requestAnimationFrame(tick);
    };

    const s = sessionRef.current;
    if (s) {
      s.rafId = window.requestAnimationFrame(tick);
    }
  }, [evaluateLiveSwap]);

  const activateDragging = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.phase !== 'pressing') return;

    s.phase = 'dragging';
    s.holdTimer = null;
    s.scrollParent = findScrollParent(containerRef.current);

    justDraggedRef.current = true;
    try {
      window.getSelection?.()?.removeAllRanges?.();
    } catch {
      // ignore
    }
    if (
      document.activeElement &&
      typeof document.activeElement.blur === 'function'
    ) {
      document.activeElement.blur();
    }
    document.body.classList.add('alfa-dragging-active');

    try {
      navigator.vibrate?.(18);
    } catch {
      // ignore
    }

    latestRef.current.onDragStart?.(s.currentIdx);

    const item = latestRef.current.items?.[s.currentIdx];
    const label =
      latestRef.current.getItemLabel?.(item, s.currentIdx) || 'Ejercicio';
    const thumbUrl = latestRef.current.getItemThumb?.(item, s.currentIdx) || null;

    setDragState({
      activeIdx: s.currentIdx,
      originIdx: s.currentIdx,
      pointerType: s.pointerType,
      label,
      thumbUrl,
      initialX: s.lastX,
      initialY: s.lastY,
    });

    startAutoScroll();
  }, [startAutoScroll]);

  useEffect(() => {
    return () => {
      cleanupSession();
      if (clearJustDraggedTimerRef.current) {
        window.clearTimeout(clearJustDraggedTimerRef.current);
      }
    };
  }, [cleanupSession]);

  const getHandleProps = useCallback(
    (index) => ({
      onTouchStart: (e) => {
        if ((latestRef.current.items?.length || 0) < 2) return;
        if (!e.touches || e.touches.length !== 1) return;
        if (isInteractiveSubTarget(e.target)) return;

        cleanupSession();

        const touch = e.touches[0];
        const session = {
          phase: 'pressing',
          pointerType: 'touch',
          touchId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          currentIdx: index,
          holdTimer: null,
          rafId: null,
          scrollParent: null,
          cleanupFns: [],
        };
        sessionRef.current = session;

        const onWindowTouchMove = (ev) => {
          const s = sessionRef.current;
          if (!s || s.pointerType !== 'touch') return;
          let matchedTouch = null;
          for (let i = 0; i < ev.touches.length; i++) {
            if (ev.touches[i].identifier === s.touchId) {
              matchedTouch = ev.touches[i];
              break;
            }
          }
          if (!matchedTouch) return;

          if (s.phase === 'pressing') {
            const dx = matchedTouch.clientX - s.startX;
            const dy = matchedTouch.clientY - s.startY;
            if (Math.hypot(dx, dy) > 8) {
              cleanupSession();
              return;
            }
            s.lastX = matchedTouch.clientX;
            s.lastY = matchedTouch.clientY;
          } else if (s.phase === 'dragging') {
            if (ev.cancelable) ev.preventDefault();
            s.lastX = matchedTouch.clientX;
            s.lastY = matchedTouch.clientY;
            positionFollower(matchedTouch.clientX, matchedTouch.clientY, 'touch');
            evaluateLiveSwap(matchedTouch.clientY);
          }
        };

        const onWindowTouchEnd = (ev) => {
          const s = sessionRef.current;
          if (!s || s.pointerType !== 'touch') return;
          let stillActive = false;
          for (let i = 0; i < (ev.touches?.length || 0); i++) {
            if (ev.touches[i].identifier === s.touchId) {
              stillActive = true;
              break;
            }
          }
          if (!stillActive) {
            finishSession();
          }
        };

        const onWindowScroll = () => {
          const s = sessionRef.current;
          if (s && s.phase === 'pressing') {
            cleanupSession();
          }
        };

        const onInterrupt = () => {
          finishSession();
        };

        const onVisibility = () => {
          if (document.visibilityState !== 'visible') {
            finishSession();
          }
        };

        window.addEventListener('touchmove', onWindowTouchMove, {
          passive: false,
        });
        window.addEventListener('touchend', onWindowTouchEnd);
        window.addEventListener('touchcancel', onWindowTouchEnd);
        window.addEventListener('scroll', onWindowScroll, {
          capture: true,
          passive: true,
        });
        window.addEventListener('blur', onInterrupt);
        document.addEventListener('visibilitychange', onVisibility);

        session.cleanupFns.push(
          () =>
            window.removeEventListener('touchmove', onWindowTouchMove, {
              passive: false,
            }),
          () => window.removeEventListener('touchend', onWindowTouchEnd),
          () => window.removeEventListener('touchcancel', onWindowTouchEnd),
          () =>
            window.removeEventListener('scroll', onWindowScroll, {
              capture: true,
            }),
          () => window.removeEventListener('blur', onInterrupt),
          () => document.removeEventListener('visibilitychange', onVisibility)
        );

        session.holdTimer = window.setTimeout(activateDragging, holdMs);
      },

      onMouseDown: (e) => {
        if (e.button !== 0) return;
        if ((latestRef.current.items?.length || 0) < 2) return;
        if (isInteractiveSubTarget(e.target)) return;

        cleanupSession();

        const isInstantGrip = Boolean(
          e.target?.closest?.('[data-instant-grip="true"]')
        );
        const delay = isInstantGrip ? 60 : mouseHoldMs;

        const session = {
          phase: 'pressing',
          pointerType: 'mouse',
          touchId: null,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          currentIdx: index,
          holdTimer: null,
          rafId: null,
          scrollParent: null,
          cleanupFns: [],
        };
        sessionRef.current = session;

        const onWindowMouseMove = (ev) => {
          const s = sessionRef.current;
          if (!s || s.pointerType !== 'mouse') return;

          if (s.phase === 'pressing') {
            const dx = ev.clientX - s.startX;
            const dy = ev.clientY - s.startY;
            if (Math.hypot(dx, dy) > 8) {
              cleanupSession();
              return;
            }
            s.lastX = ev.clientX;
            s.lastY = ev.clientY;
          } else if (s.phase === 'dragging') {
            ev.preventDefault();
            s.lastX = ev.clientX;
            s.lastY = ev.clientY;
            positionFollower(ev.clientX, ev.clientY, 'mouse');
            evaluateLiveSwap(ev.clientY);
          }
        };

        const onWindowMouseUp = () => {
          finishSession();
        };

        const onInterrupt = () => {
          finishSession();
        };

        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        window.addEventListener('blur', onInterrupt);

        session.cleanupFns.push(
          () => window.removeEventListener('mousemove', onWindowMouseMove),
          () => window.removeEventListener('mouseup', onWindowMouseUp),
          () => window.removeEventListener('blur', onInterrupt)
        );

        session.holdTimer = window.setTimeout(activateDragging, delay);
      },

      onClickCapture: (e) => {
        if (justDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          justDraggedRef.current = false;
        }
      },

      onContextMenu: (e) => {
        if (sessionRef.current) {
          e.preventDefault();
        }
      },
    }),
    [
      activateDragging,
      cleanupSession,
      evaluateLiveSwap,
      finishSession,
      holdMs,
      mouseHoldMs,
      positionFollower,
    ]
  );

  return {
    containerRef,
    followerRef,
    dragState,
    getHandleProps,
  };
}

export function DragFollowerPortal({ dragState, followerRef, lang }) {
  useLayoutEffect(() => {
    if (!dragState || !followerRef?.current) return;
    const el = followerRef.current;
    const { x, y } = computeFollowerCoords(
      el,
      dragState.initialX,
      dragState.initialY,
      dragState.pointerType
    );
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [dragState, followerRef]);

  if (!dragState || typeof document === 'undefined') return null;

  return createPortal(
    React.createElement(
      'div',
      {
        ref: followerRef,
        className: 'alfa-drag-follower-portal',
        'aria-hidden': 'true',
      },
      React.createElement(GripVertical, {
        size: 15,
        className: 'text-blue shrink-0',
      }),
      React.createElement(
        'span',
        { className: 'drag-follower-idx' },
        `#${dragState.activeIdx + 1}`
      ),
      dragState.thumbUrl
        ? React.createElement('img', {
            src: dragState.thumbUrl,
            alt: '',
            className: 'drag-follower-thumb',
          })
        : null,
      React.createElement(
        'strong',
        { className: 'drag-follower-title' },
        dragState.label
      ),
      React.createElement(
        'span',
        { className: 'drag-follower-hint' },
        lang === 'es' ? 'Arrastrando' : 'Dragging'
      )
    ),
    document.body
  );
}

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

function isEditableElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

function isInteractiveSubTarget(target, currentTarget, ignoreSelector) {
  if (!target || typeof target.closest !== 'function') return false;
  if (
    target.closest(
      'button, select, input, textarea, a, .thumb-zoom-btn, .draft-ex-swap-pill, .clickable-chip, .ex-preview-chip, .ex-rest-selector, .live-ex-controls, .draft-ex-Order-actions'
    )
  ) {
    return true;
  }
  if (ignoreSelector) {
    const ignoredEl = target.closest(ignoreSelector);
    if (ignoredEl && ignoredEl !== currentTarget) {
      return true;
    }
  }
  if (currentTarget) {
    const closestHandle = target.closest('[data-drag-handle="true"]');
    if (closestHandle && closestHandle !== currentTarget) {
      return true;
    }
  }
  return false;
}

function findScrollParent(el) {
  let node = el?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function getVisibleScrollBounds(scrollParent) {
  let topBound = 62;
  let bottomBound = window.innerHeight || 844;

  if (scrollParent !== window && scrollParent instanceof Element) {
    const sr = scrollParent.getBoundingClientRect();
    topBound = Math.max(0, sr.top);
    bottomBound = Math.min(window.innerHeight || 844, sr.bottom);

    const stickyHeader = scrollParent.querySelector(
      '.modal-header, .live-workout-header, .live-header'
    );
    if (stickyHeader) {
      const shStyle = window.getComputedStyle(stickyHeader);
      if (
        shStyle.display !== 'none' &&
        (shStyle.position === 'sticky' || shStyle.position === 'fixed')
      ) {
        topBound = Math.max(topBound, stickyHeader.getBoundingClientRect().bottom);
      }
    }

    const stickyFooter = scrollParent.querySelector(
      '.modal-sticky-footer, .modal-footer'
    );
    if (stickyFooter) {
      const sfStyle = window.getComputedStyle(stickyFooter);
      if (
        sfStyle.display !== 'none' &&
        (sfStyle.position === 'sticky' || sfStyle.position === 'fixed')
      ) {
        bottomBound = Math.min(
          bottomBound,
          stickyFooter.getBoundingClientRect().top
        );
      }
    }
  } else {
    let dynamicTop = 0;
    const headerEl = document.querySelector('.alfa-header');
    if (headerEl && window.getComputedStyle(headerEl).display !== 'none') {
      dynamicTop = Math.max(dynamicTop, headerEl.getBoundingClientRect().bottom);
    }
    const miniBannerEl = document.querySelector('.active-workout-mini-banner');
    if (
      miniBannerEl &&
      window.getComputedStyle(miniBannerEl).display !== 'none'
    ) {
      dynamicTop = Math.max(
        dynamicTop,
        miniBannerEl.getBoundingClientRect().bottom
      );
    }
    if (dynamicTop > 0) {
      topBound = dynamicTop;
    }
  }

  const mobNav = document.querySelector('.alfa-mobile-bottom-nav');
  if (mobNav && window.getComputedStyle(mobNav).display !== 'none') {
    if (
      scrollParent === window ||
      !(scrollParent instanceof Element) ||
      !scrollParent.closest('.modal-backdrop, .modal-overlay')
    ) {
      bottomBound = Math.min(bottomBound, mobNav.getBoundingClientRect().top);
    }
  }

  const restBar = document.querySelector('.floating-rest-timer-bar');
  if (restBar && window.getComputedStyle(restBar).display !== 'none') {
    bottomBound = Math.min(bottomBound, restBar.getBoundingClientRect().top);
  }

  return { topBound, bottomBound };
}

function computeFollowerCoords(el, clientX, clientY, pointerType) {
  const vw = window.innerWidth || 390;
  const vh = window.innerHeight || 844;
  const rect = el ? el.getBoundingClientRect() : null;
  const width = rect?.width || 240;
  const height = rect?.height || 44;

  const rawX = clientX - width * 0.5;
  const clampedX = Math.max(12, Math.min(vw - width - 12, rawX));

  const verticalOffset = pointerType === 'touch' ? 58 : 26;
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
  ignoreSelector = null,
  compactOnDrag = false,
}) {
  const containerRef = useRef(null);
  const followerRef = useRef(null);
  const latestRef = useRef({
    items,
    onReorder,
    onDragStart,
    getItemLabel,
    getItemThumb,
    ignoreSelector,
    compactOnDrag,
  });
  latestRef.current = {
    items,
    onReorder,
    onDragStart,
    getItemLabel,
    getItemThumb,
    ignoreSelector,
    compactOnDrag,
  };

  const sessionRef = useRef(null);
  const pendingRestoreRef = useRef(null);
  const justDraggedRef = useRef(false);
  const clearJustDraggedTimerRef = useRef(null);
  const [dragState, setDragState] = useState(null);

  const clearContainerDragPadding = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.style.paddingTop = '';
      container.style.paddingBottom = '';
    }
  }, []);

  const positionFollower = useCallback((clientX, clientY, pointerType) => {
    const el = followerRef.current;
    if (!el) return;
    const { x, y } = computeFollowerCoords(el, clientX, clientY, pointerType);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const evaluateLiveSwap = useCallback((pointerX, pointerY) => {
    const s = sessionRef.current;
    const container = containerRef.current;
    if (
      !s ||
      s.phase !== 'dragging' ||
      !s.isAnchored ||
      !s.hasMovedAfterActivate ||
      !container
    ) {
      return;
    }

    const nodes = Array.from(container.children).filter(
      (n) => n.getAttribute('data-reorder-item') === 'true'
    );
    const idx = s.currentIdx;
    if (idx < 0 || idx >= nodes.length || nodes.length < 2) return;

    const rects = nodes.map((n) => n.getBoundingClientRect());
    const curRect = rects[idx];
    if (!curRect) return;

    const isSingleColumn = rects.every(
      (r) => Math.abs(r.left - rects[0].left) < 20
    );

    const HYST = 16;
    const canSwapWith = (candIdx) => {
      const last = s.lastSwap;
      if (!last || last.displacedNode !== nodes[candIdx]) return true;
      return Math.hypot(pointerX - last.x, pointerY - last.y) >= HYST;
    };

    let targetIdx = null;

    if (isSingleColumn) {
      if (idx > 0) {
        const prevRect = rects[idx - 1];
        if (
          prevRect &&
          canSwapWith(idx - 1) &&
          pointerY < prevRect.top + prevRect.height * 0.5
        ) {
          targetIdx = idx - 1;
        }
      }
      if (targetIdx === null && idx < nodes.length - 1) {
        const nextRect = rects[idx + 1];
        if (
          nextRect &&
          canSwapWith(idx + 1) &&
          pointerY > nextRect.top + nextRect.height * 0.5
        ) {
          targetIdx = idx + 1;
        }
      }
    } else {
      let bestDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        if (i === idx) continue;
        const r = rects[i];
        if (!canSwapWith(i)) continue;

        const sameRow =
          Math.abs(r.top - curRect.top) <
          Math.min(r.height, curRect.height) * 0.5;

        let crossed = false;
        if (sameRow) {
          const midX = r.left + r.width * 0.5;
          const inVerticalBand =
            pointerY >= r.top - 12 && pointerY <= r.bottom + 12;
          if (inVerticalBand) {
            if (i < idx && pointerX < midX) crossed = true;
            if (i > idx && pointerX > midX) crossed = true;
          }
        } else {
          const midY = r.top + r.height * 0.5;
          const inHorizontalBand =
            pointerX >= r.left - 16 && pointerX <= r.right + 16;
          if (i < idx) {
            if ((inHorizontalBand && pointerY < midY) || pointerY < r.top) {
              crossed = true;
            }
          } else {
            if ((inHorizontalBand && pointerY > midY) || pointerY > r.bottom) {
              crossed = true;
            }
          }
        }

        if (crossed) {
          const cx = r.left + r.width * 0.5;
          const cy = r.top + r.height * 0.5;
          const dist = Math.hypot(pointerX - cx, pointerY - cy);
          if (dist < bestDist) {
            bestDist = dist;
            targetIdx = i;
          }
        }
      }
    }

    if (targetIdx !== null && targetIdx !== idx) {
      const fromIdx = idx;
      s.currentIdx = targetIdx;
      s.lastSwap = {
        displacedNode: nodes[targetIdx],
        x: pointerX,
        y: pointerY,
      };
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore if unsupported
      }
      latestRef.current.onReorder?.(fromIdx, targetIdx);
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              activeIdx: targetIdx,
              initialX: s.lastX,
              initialY: s.lastY,
            }
          : prev
      );
    }
  }, []);

  const cleanupSession = useCallback(() => {
    const s = sessionRef.current;
    const wasDragging = s?.phase === 'dragging';
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
    if (!wasDragging) {
      clearContainerDragPadding();
    }
    document.body.classList.remove('alfa-dragging-active');
    setDragState(null);
  }, [clearContainerDragPadding]);

  const finishSession = useCallback(() => {
    const s = sessionRef.current;
    const wasDragging = s?.phase === 'dragging';
    if (wasDragging && latestRef.current.compactOnDrag) {
      pendingRestoreRef.current = {
        idx: s.currentIdx,
        targetY: s.lastY,
        scrollParent: s.scrollParent,
      };
    }
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

      if (!s.isAnchored || !s.hasMovedAfterActivate) {
        s.rafId = window.requestAnimationFrame(tick);
        return;
      }

      const scrollParent = s.scrollParent || window;
      const { topBound, bottomBound } = getVisibleScrollBounds(scrollParent);

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
            evaluateLiveSwap(s.lastX, s.lastY);
          }
        } else if (scrollParent instanceof Element) {
          const prevTop = scrollParent.scrollTop;
          scrollParent.scrollTop += roundedStep;
          if (scrollParent.scrollTop !== prevTop) {
            evaluateLiveSwap(s.lastX, s.lastY);
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

    const isCompact = Boolean(latestRef.current.compactOnDrag);
    s.phase = 'dragging';
    s.holdTimer = null;
    s.activateX = s.lastX;
    s.activateY = s.lastY;
    s.hasMovedAfterActivate = false;
    s.isAnchored = !isCompact;
    s.scrollParent = findScrollParent(containerRef.current);
    s.pendingAnchor = isCompact
      ? { idx: s.currentIdx, targetY: s.lastY }
      : null;

    justDraggedRef.current = true;
    if (!isEditableElement(document.activeElement)) {
      try {
        window.getSelection?.()?.removeAllRanges?.();
      } catch {
        // ignore
      }
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
      compactOnDrag: isCompact,
    });

    startAutoScroll();
  }, [startAutoScroll]);

  const isDraggingActive = Boolean(dragState);

  useLayoutEffect(() => {
    if (isDraggingActive) {
      const s = sessionRef.current;
      const container = containerRef.current;
      if (!s || !s.pendingAnchor || !container) {
        if (s) s.isAnchored = true;
        return;
      }

      const { idx, targetY } = s.pendingAnchor;
      const sp = s.scrollParent || findScrollParent(container);
      s.scrollParent = sp;

      container.style.paddingBottom = '55vh';
      container.style.paddingTop = '0px';

      const nodes = Array.from(container.children).filter(
        (n) => n.getAttribute('data-reorder-item') === 'true'
      );
      const activeNode = nodes[idx];

      if (activeNode) {
        const newRect = activeNode.getBoundingClientRect();
        const newCenterY = newRect.top + newRect.height * 0.5;
        const rawDelta = newCenterY - targetY;

        if (Math.abs(rawDelta) > 1) {
          if (sp === window) {
            window.scrollTo(0, Math.max(0, window.scrollY + rawDelta));
          } else if (sp instanceof Element) {
            sp.scrollTop = Math.max(0, sp.scrollTop + rawDelta);
          }
        }

        const afterRect = activeNode.getBoundingClientRect();
        const afterCenterY = afterRect.top + afterRect.height * 0.5;
        const deficitTop = targetY - afterCenterY;
        if (deficitTop > 2) {
          container.style.paddingTop = `${Math.round(deficitTop)}px`;
        }
      }

      s.pendingAnchor = null;
      s.isAnchored = true;
      positionFollower(s.lastX, s.lastY, s.pointerType);
      return;
    }

    clearContainerDragPadding();
    const restore = pendingRestoreRef.current;
    if (!restore) return;
    pendingRestoreRef.current = null;

    const container = containerRef.current;
    if (!container) return;

    const nodes = Array.from(container.children).filter(
      (n) => n.getAttribute('data-reorder-item') === 'true'
    );
    const targetNode = nodes[restore.idx];
    if (!targetNode) return;

    const sp = restore.scrollParent || findScrollParent(container);
    const { topBound, bottomBound } = getVisibleScrollBounds(sp);
    const minHeaderY = topBound + 32;
    const maxHeaderY = Math.max(minHeaderY, bottomBound - 80);
    const clampedTargetY = Math.max(
      minHeaderY,
      Math.min(maxHeaderY, restore.targetY)
    );

    const expandedRect = targetNode.getBoundingClientRect();
    const deltaY = expandedRect.top + 28 - clampedTargetY;
    if (Math.abs(deltaY) > 2) {
      if (sp === window) {
        window.scrollTo(0, Math.max(0, window.scrollY + deltaY));
      } else if (sp instanceof Element) {
        sp.scrollTop = Math.max(0, sp.scrollTop + deltaY);
      }
    }
  }, [isDraggingActive, clearContainerDragPadding, positionFollower]);

  useEffect(() => {
    return () => {
      pendingRestoreRef.current = null;
      cleanupSession();
      clearContainerDragPadding();
      if (clearJustDraggedTimerRef.current) {
        window.clearTimeout(clearJustDraggedTimerRef.current);
      }
    };
  }, [cleanupSession, clearContainerDragPadding]);

  const getHandleProps = useCallback(
    (index) => ({
      'data-drag-handle': 'true',
      onTouchStart: (e) => {
        if ((latestRef.current.items?.length || 0) < 2) return;
        if (!e.touches || e.touches.length !== 1) return;
        if (
          isInteractiveSubTarget(
            e.target,
            e.currentTarget,
            latestRef.current.ignoreSelector
          )
        ) {
          return;
        }

        cleanupSession();

        if (!isEditableElement(document.activeElement)) {
          try {
            window.getSelection?.()?.removeAllRanges?.();
          } catch {
            // ignore
          }
        }

        const touch = e.touches[0];
        const session = {
          phase: 'pressing',
          pointerType: 'touch',
          touchId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          activateX: touch.clientX,
          activateY: touch.clientY,
          hasMovedAfterActivate: false,
          isAnchored: true,
          pendingAnchor: null,
          currentIdx: index,
          lastSwap: null,
          holdTimer: null,
          rafId: null,
          scrollParent: null,
          cleanupFns: [],
        };
        sessionRef.current = session;

        const onSelectStart = (ev) => {
          if (ev.cancelable) {
            ev.preventDefault();
          }
        };

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
            if (
              !s.hasMovedAfterActivate &&
              Math.hypot(
                matchedTouch.clientX - s.activateX,
                matchedTouch.clientY - s.activateY
              ) >= 6
            ) {
              s.hasMovedAfterActivate = true;
            }
            positionFollower(matchedTouch.clientX, matchedTouch.clientY, 'touch');
            evaluateLiveSwap(matchedTouch.clientX, matchedTouch.clientY);
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

        document.addEventListener('selectstart', onSelectStart, {
          capture: true,
        });
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
            document.removeEventListener('selectstart', onSelectStart, {
              capture: true,
            }),
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
        if (
          isInteractiveSubTarget(
            e.target,
            e.currentTarget,
            latestRef.current.ignoreSelector
          )
        ) {
          return;
        }

        cleanupSession();

        if (!isEditableElement(document.activeElement)) {
          try {
            window.getSelection?.()?.removeAllRanges?.();
          } catch {
            // ignore
          }
        }

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
          activateX: e.clientX,
          activateY: e.clientY,
          hasMovedAfterActivate: false,
          isAnchored: true,
          pendingAnchor: null,
          currentIdx: index,
          lastSwap: null,
          holdTimer: null,
          rafId: null,
          scrollParent: null,
          cleanupFns: [],
        };
        sessionRef.current = session;

        const onSelectStart = (ev) => {
          if (ev.cancelable) {
            ev.preventDefault();
          }
        };

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
            if (
              !s.hasMovedAfterActivate &&
              Math.hypot(
                ev.clientX - s.activateX,
                ev.clientY - s.activateY
              ) >= 6
            ) {
              s.hasMovedAfterActivate = true;
            }
            positionFollower(ev.clientX, ev.clientY, 'mouse');
            evaluateLiveSwap(ev.clientX, ev.clientY);
          }
        };

        const onWindowMouseUp = () => {
          finishSession();
        };

        const onInterrupt = () => {
          finishSession();
        };

        document.addEventListener('selectstart', onSelectStart, {
          capture: true,
        });
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        window.addEventListener('blur', onInterrupt);

        session.cleanupFns.push(
          () =>
            document.removeEventListener('selectstart', onSelectStart, {
              capture: true,
            }),
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

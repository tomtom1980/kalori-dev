'use client';

import { useRouter } from 'next/navigation';
import { type JSX, useEffect, useRef, useState } from 'react';

import { t } from '@/lib/i18n/en';

const PULL_THRESHOLD_PX = 80;
const HORIZONTAL_CANCEL_RATIO = 1.15;
const REFRESH_LOCK_MS = 1200;
const HARD_RELOAD_FEEDBACK_MS = 300;

function currentDocumentScrollTop(): number {
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
}

function isAppleTouchSafari(): boolean {
  const nav = window.navigator;
  const ua = nav.userAgent;
  const platform = nav.platform;
  const isIosLike =
    /iPad|iPhone|iPod/u.test(ua) || (platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isSafari = /Safari/u.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium|Android/u.test(ua);

  return isIosLike && isSafari;
}

function refreshCurrentPage(
  isAppleSafari: boolean,
  routerRefresh: () => void,
): ReturnType<typeof setTimeout> | null {
  if (isAppleSafari) {
    const reload = window.location.reload.bind(window.location);
    return globalThis.setTimeout(() => {
      reload();
    }, HARD_RELOAD_FEEDBACK_MS);
  }
  routerRefresh();
  return null;
}

function targetShouldIgnorePull(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (
    target.closest(
      [
        'a',
        'button',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="dialog"]',
        '[data-radix-portal]',
        '[data-pull-to-refresh-ignore]',
      ].join(','),
    )
  ) {
    return true;
  }

  for (
    let node: Element | null = target;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const style = window.getComputedStyle(node);
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      node.scrollWidth > node.clientWidth;
    if (canScrollX) return true;
  }

  return false;
}

export function PullToRefresh(): JSX.Element | null {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const routerRefreshRef = useRef(router.refresh);
  const gestureRef = useRef({
    active: false,
    eligible: false,
    startX: 0,
    startY: 0,
    refreshing: false,
  });
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    routerRefreshRef.current = router.refresh;
  }, [router.refresh]);

  useEffect(() => {
    const appleTouchSafari = isAppleTouchSafari();

    const resetGesture = () => {
      gestureRef.current.active = false;
      gestureRef.current.eligible = false;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        currentDocumentScrollTop() > 0 ||
        targetShouldIgnorePull(event.target)
      ) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      gestureRef.current.active = true;
      gestureRef.current.eligible = false;
      gestureRef.current.startX = touch.clientX;
      gestureRef.current.startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.active) return;
      if (event.touches.length !== 1 || currentDocumentScrollTop() > 0) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      const deltaX = Math.abs(touch.clientX - gesture.startX);
      const deltaY = touch.clientY - gesture.startY;

      if (deltaY <= 0 || deltaX > deltaY * HORIZONTAL_CANCEL_RATIO) {
        resetGesture();
        return;
      }

      if (deltaY >= PULL_THRESHOLD_PX && event.cancelable) {
        event.preventDefault();
      }
      gesture.eligible = deltaY >= PULL_THRESHOLD_PX;
    };

    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      const shouldRefresh = gesture.active && gesture.eligible && !gesture.refreshing;
      resetGesture();
      if (!shouldRefresh) return;

      gesture.refreshing = true;
      setIsRefreshing(true);
      reloadTimerRef.current = refreshCurrentPage(appleTouchSafari, routerRefreshRef.current);
      unlockTimerRef.current = globalThis.setTimeout(() => {
        gestureRef.current.refreshing = false;
        setIsRefreshing(false);
        unlockTimerRef.current = null;
      }, REFRESH_LOCK_MS);
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', resetGesture, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', resetGesture);
      if (unlockTimerRef.current !== null) {
        globalThis.clearTimeout(unlockTimerRef.current);
      }
      if (reloadTimerRef.current !== null) {
        globalThis.clearTimeout(reloadTimerRef.current);
      }
    };
  }, []);

  return isRefreshing ? (
    <div
      aria-live="assertive"
      aria-atomic="true"
      role="status"
      data-testid="pull-to-refresh-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(8, 7, 6, 0.58)',
        backdropFilter: 'grayscale(1) brightness(0.72)',
        WebkitBackdropFilter: 'grayscale(1) brightness(0.72)',
        pointerEvents: 'auto',
        opacity: 1,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          border: '1px solid var(--color-rule)',
          background: 'var(--color-bg-1)',
          color: 'var(--color-ivory)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            border: '2px solid var(--color-rule)',
            borderTopColor: 'var(--color-ivory)',
            borderRadius: '50%',
            animation: isReducedMotion ? 'none' : 'kalori-pull-refresh-spin 760ms linear infinite',
          }}
        />
        {t.nav.pullToRefresh.refreshing}
      </div>
    </div>
  ) : null;
}

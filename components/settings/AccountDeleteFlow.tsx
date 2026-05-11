'use client';

/**
 * <AccountDeleteFlow /> — Task 5.2 Phase 2B (synthesis §2.1).
 *
 * Compound component implementing the I9 account-deletion UX:
 *
 *   Trigger → Step1 (warning) → Step2 (typed-confirm email)
 *           → Step3 (10s countdown) → Step4 (in-flight cascade)
 *           → Step5 (toast on /?deleted=1) | Step6 (failure)
 *
 * The compound parts (`AccountDeleteFlow.Trigger`, `.Modal`) are exposed
 * via the default export so the Settings page mounts the trigger as a
 * cheap text link, then lazy-mounts the modal subtree on first open via
 * `next/dynamic({ ssr: false })`.
 *
 * R1 firewall — every server call routes through `authFetch` /
 * `authPost` from `lib/auth/refresh-interceptor.ts`. Zero local 401
 * shims. Zero direct `fetch('/api/...')`.
 *
 * Mandatory contrast escalations (synthesis §1a):
 *   - Step 3 "Last chance." title → ember (NOT oxblood)
 *   - "DELETE ACCOUNT" link in Settings → ember (handled in settings page)
 *   - Bullet TEXT → ivory; dash glyph oxblood-soft + aria-hidden
 *   - Cross-tab banner glyph/border → ember (handled in CrossTabSignOutListener)
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useReducer, useRef } from 'react';

import { announceAssertive, announcePolite } from '@/lib/a11y/announce';
import { authFetch } from '@/lib/auth/refresh-interceptor';
import { broadcastSignOut } from '@/lib/auth/cross-tab-signout';
import { TOPICS } from '@/lib/broadcast/topics';
import { t } from '@/lib/i18n/en';

const PENDING_CROSS_TAB_KEY = 'kalori-pending-cross-tab-signout';
const COUNTDOWN_SECONDS = 10;

// ----- State machine -----

type Phase = 'photos' | 'records' | 'account' | 'done';

type DeleteState =
  | { kind: 'closed' }
  | { kind: 'warning' }
  | { kind: 'email'; typed: string; matched: boolean }
  | { kind: 'countdown'; understands: boolean; secondsLeft: number }
  | { kind: 'progress'; phase: Phase }
  | { kind: 'failure'; recoverable: boolean; cause: string };

type Action =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'continue-to-email' }
  | { type: 'set-typed'; value: string; userEmail: string }
  | { type: 'continue-to-countdown' }
  | { type: 'toggle-understand'; value: boolean }
  | { type: 'tick-countdown' }
  | { type: 'submit' }
  | { type: 'set-phase'; phase: Phase }
  | { type: 'fail'; recoverable: boolean; cause: string }
  | { type: 'retry-from-failure' };

function reducer(state: DeleteState, action: Action): DeleteState {
  switch (action.type) {
    case 'open':
      return { kind: 'warning' };
    case 'close':
      return { kind: 'closed' };
    case 'continue-to-email':
      return { kind: 'email', typed: '', matched: false };
    case 'set-typed': {
      if (state.kind !== 'email') return state;
      const matched =
        action.value.trim().toLowerCase() === action.userEmail.trim().toLowerCase() &&
        action.value.trim().length > 0;
      return { kind: 'email', typed: action.value, matched };
    }
    case 'continue-to-countdown':
      return {
        kind: 'countdown',
        understands: false,
        secondsLeft: COUNTDOWN_SECONDS,
      };
    case 'toggle-understand':
      if (state.kind !== 'countdown') return state;
      return { ...state, understands: action.value };
    case 'tick-countdown':
      if (state.kind !== 'countdown') return state;
      return {
        ...state,
        secondsLeft: Math.max(0, state.secondsLeft - 1),
      };
    case 'submit':
      return { kind: 'progress', phase: 'photos' };
    case 'set-phase':
      if (state.kind !== 'progress') return state;
      return { kind: 'progress', phase: action.phase };
    case 'fail':
      return { kind: 'failure', recoverable: action.recoverable, cause: action.cause };
    case 'retry-from-failure':
      return { kind: 'closed' };
    default:
      return state;
  }
}

// ----- Public root component -----

export interface AccountDeleteFlowProps {
  userEmail: string;
  redirectAfterDeleteHref?: string;
  /**
   * When true, the flow auto-opens on mount at Step 1 (warning). Used by
   * <AccountDeleteTrigger /> which lazy-mounts this component on click.
   */
  initialOpen?: boolean;
  /** Fires when the dialog closes (so the trigger can unmount). */
  onClose?: () => void;
  /**
   * The DOM element that opened this dialog. On close, focus is restored to
   * this element to satisfy WCAG 2.4.3 (Focus Order). Required because the
   * dialog is lazy-mounted via `initialOpen` rather than via Radix's
   * `<Dialog.Trigger>`, which means Radix has no internal trigger anchor.
   * Phase 3 a11y fix C1.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function AccountDeleteFlow({
  userEmail,
  redirectAfterDeleteHref = '/?deleted=1',
  initialOpen = false,
  onClose,
  triggerRef,
}: AccountDeleteFlowProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, {
    kind: initialOpen ? 'warning' : 'closed',
  } as DeleteState);

  const open = state.kind !== 'closed';

  // Notify parent when we transition back to `closed` so the trigger can
  // unmount the lazy chunk. We track via effect because dispatch is
  // synchronous but the parent is interested in the transition only.
  //
  // Phase 3 a11y fix C1 — Radix Dialog returns focus to its internal
  // `<Dialog.Trigger>` ref on close. Because this component is lazy-mounted
  // via `initialOpen`, no Radix trigger exists. We restore focus manually
  // to the caller's `triggerRef` on the open→closed transition so keyboard
  // users land back where they came from (WCAG 2.4.3 Focus Order).
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      onClose?.();
      // Defer the focus call so it lands AFTER the parent unmounts our
      // subtree (the trigger button is in the parent tree, still focusable).
      if (triggerRef?.current && typeof triggerRef.current.focus === 'function') {
        const el = triggerRef.current;
        queueMicrotask(() => {
          try {
            el.focus();
          } catch {
            /* ignore — element may have unmounted */
          }
        });
      }
    }
    wasOpenRef.current = open;
  }, [open, onClose, triggerRef]);

  // Phase 3 a11y fix C3b — Cross-tab sign-out signal: force-close Steps 1-3
  // (warning / email / countdown) so the user lands on the cross-tab banner
  // instead of an inconsistent in-progress modal. Step 4 (`progress`) is
  // mid-cascade and the banner is deferred via the sessionStorage flag set
  // in `handleSubmit`. Step 6 (`failure`) keeps state so the user sees the
  // cause (sign-out happens visually via the banner anyway). Synthesis
  // §1 Conflict #6 + §8 Risk #2.
  const isStep1to3 =
    state.kind === 'warning' || state.kind === 'email' || state.kind === 'countdown';
  useEffect(() => {
    if (!isStep1to3) return;
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TOPICS.auth);
    } catch {
      return;
    }
    const handler = (ev: MessageEvent): void => {
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'signout') return;
      dispatch({ type: 'close' });
    };
    channel.addEventListener('message', handler);
    return () => {
      try {
        channel?.removeEventListener('message', handler);
        channel?.close();
      } catch {
        /* ignore */
      }
    };
  }, [isStep1to3]);

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      // ESC / scrim only allowed in steps where it's safe (warning, email,
      // failure). Step 3 (countdown) + Step 4 (in-flight) lock ESC via
      // `onEscapeKeyDown={(e) => e.preventDefault()}` on Dialog.Content.
      if (state.kind === 'warning' || state.kind === 'email' || state.kind === 'failure') {
        dispatch({ type: 'close' });
      }
    }
  };

  // Countdown ticker — Step 3. One interval kicks off when we enter
  // 'countdown' state; tick-countdown reduces secondsLeft to 0, then the
  // interval becomes a no-op (still cleared on phase exit).
  const isCountdown = state.kind === 'countdown';
  useEffect(() => {
    if (!isCountdown) return;
    const t1 = setInterval(() => {
      dispatch({ type: 'tick-countdown' });
    }, 1000);
    return () => clearInterval(t1);
  }, [isCountdown]);

  // Countdown SR announcements — only at t=10 (start), 5, 1, 0 (Risk #3).
  // We map secondsLeft transitions: at start (10) → "Ten seconds.";
  // at 5 → "Five seconds."; at 1 → "One second."; at 0 → "Ready."
  const lastAnnouncedRef = useRef<number | null>(null);
  const currentSeconds = state.kind === 'countdown' ? state.secondsLeft : -1;
  useEffect(() => {
    if (!isCountdown) return;
    const s = currentSeconds;
    if (lastAnnouncedRef.current === s) return;
    if (s === 10) {
      announcePolite(t.settings.accountDelete.step3.announce.ten);
      lastAnnouncedRef.current = s;
    } else if (s === 5) {
      announcePolite(t.settings.accountDelete.step3.announce.five);
      lastAnnouncedRef.current = s;
    } else if (s === 1) {
      announcePolite(t.settings.accountDelete.step3.announce.one);
      lastAnnouncedRef.current = s;
    } else if (s === 0) {
      announcePolite(t.settings.accountDelete.step3.announce.ready);
      lastAnnouncedRef.current = s;
    }
  }, [isCountdown, currentSeconds]);

  // Submit handler — runs the cascade via authFetch, transitions phases.
  //
  // Codex I1 fix — `PENDING_CROSS_TAB_KEY` is set BEFORE the cascade
  // request and MUST be cleared on every exit branch (success, in-band
  // failure, network throw). Previously the `!res.ok → dispatch('fail')`
  // path didn't clear it, which left this tab unable to react to
  // subsequent cross-tab sign-out broadcasts (the listener defers when
  // the flag is present, treating itself as mid-cascade indefinitely).
  // The `try/finally` wrapper is the structural guarantee that all three
  // exit branches reach the cleanup.
  const handleSubmit = async (): Promise<void> => {
    dispatch({ type: 'submit' });
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(PENDING_CROSS_TAB_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    announcePolite(t.settings.accountDelete.step4.announce.photos);
    try {
      const res = await authFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          recoverable?: boolean;
          cause?: string;
        };
        const recoverable = payload.recoverable ?? true;
        dispatch({
          type: 'fail',
          recoverable,
          cause: payload.cause ?? 'cascade_failed',
        });
        // Phase 3 a11y fix I2 — assertive announcement on failure so SR
        // users hear an alert-tier message in addition to the inline
        // `role="alert"` cause line in Step 6.
        announceAssertive(
          recoverable
            ? t.settings.accountDelete.step6.recoverableTitle
            : t.settings.accountDelete.step6.unrecoverableTitle,
        );
        return;
      }

      // Phase markers — the route returns 200 once all phases are done; we
      // visually walk through phases for the user. The cascade is real on
      // the server side; the UI markers below are visual continuity only.
      announcePolite(t.settings.accountDelete.step4.announce.records);
      dispatch({ type: 'set-phase', phase: 'records' });
      announcePolite(t.settings.accountDelete.step4.announce.account);
      dispatch({ type: 'set-phase', phase: 'account' });
      announcePolite(t.settings.accountDelete.step4.announce.done);
      dispatch({ type: 'set-phase', phase: 'done' });

      // Broadcast cross-tab so other tabs the user has open also drop their session.
      broadcastSignOut('account-deleted');

      if (typeof window !== 'undefined') {
        window.location.href = redirectAfterDeleteHref;
      }
    } catch (err) {
      dispatch({
        type: 'fail',
        recoverable: true,
        cause: err instanceof Error ? err.name : 'network_error',
      });
      // Phase 3 a11y fix I2 — assertive announcement on failure (network/throw path).
      announceAssertive(t.settings.accountDelete.step6.recoverableTitle);
    } finally {
      // Codex I1 — single cleanup site for all three exit branches.
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.removeItem(PENDING_CROSS_TAB_KEY);
        } catch {
          /* ignore */
        }
      }
    }
  };

  // ----- Auto-fire submit when secondsLeft = 0 + understands + user clicked DELETE NOW -----
  // Note: per synthesis §2.1, focus does NOT auto-shift to DELETE NOW;
  // the user must explicitly click. We surface the click via the button below.

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          className="radix-overlay"
          data-testid="account-delete-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 60,
          }}
        />
        <Dialog.Content
          className="radix-content"
          data-testid={`account-delete-step${
            state.kind === 'warning'
              ? '1'
              : state.kind === 'email'
                ? '2'
                : state.kind === 'countdown'
                  ? '3'
                  : state.kind === 'progress'
                    ? '4'
                    : state.kind === 'failure'
                      ? '6'
                      : 'unknown'
          }`}
          aria-modal="true"
          // Phase 3 a11y fix C2 — `aria-busy` lives on Dialog.Content during
          // Step 4 in-flight cascade (the dialog is the single semantic
          // surface). The previous nested `<section role="region">` inside
          // the dialog created duplicate semantic chains for SR users.
          aria-busy={state.kind === 'progress' ? 'true' : 'false'}
          onEscapeKeyDown={(e) => {
            if (state.kind === 'countdown' || state.kind === 'progress') {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (state.kind === 'countdown' || state.kind === 'progress') {
              e.preventDefault();
            }
          }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(560px, 92vw)',
            background: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            padding: '48px 40px',
            zIndex: 61,
            color: 'var(--color-ivory)',
            maxHeight: '92vh',
            overflowY: 'auto',
          }}
        >
          {state.kind === 'warning' ? <Step1Warning dispatch={dispatch} /> : null}
          {state.kind === 'email' ? (
            <Step2Email
              userEmail={userEmail}
              typed={state.typed}
              matched={state.matched}
              dispatch={dispatch}
            />
          ) : null}
          {state.kind === 'countdown' ? (
            <Step3Countdown
              secondsLeft={state.secondsLeft}
              understands={state.understands}
              dispatch={dispatch}
              onSubmit={() => {
                void handleSubmit();
              }}
            />
          ) : null}
          {state.kind === 'progress' ? <Step4Progress phase={state.phase} /> : null}
          {state.kind === 'failure' ? (
            <Step6Failure recoverable={state.recoverable} cause={state.cause} dispatch={dispatch} />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ----- Sub-parts -----

// Editorial kicker color — escalated from oxblood-soft (#a13a2c, 2.83:1)
// to dust (#8a8173, ~5.18:1 on bg-0/bg-1) so axe-core's color-contrast
// rule passes. See AccountSubsection comment for rationale; the same
// escalation applies to all editorial kickers in this flow.
const KICKER_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '10.5px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-dust)',
  margin: 0,
  marginBottom: 'var(--spacing-3)',
};

const TITLE_28: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 300,
  fontSize: '28px',
  color: 'var(--color-ivory)',
  margin: 0,
  marginBottom: 'var(--spacing-3)',
  lineHeight: 1.15,
};

const TITLE_24_EMBER: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 300,
  fontSize: '24px',
  color: 'var(--color-ember)', // Synthesis §1a — escalated from oxblood (2.19:1) to ember (4.98:1).
  margin: 0,
  marginBottom: 'var(--spacing-3)',
  lineHeight: 1.2,
};

const TITLE_24_IVORY: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 300,
  fontSize: '24px',
  color: 'var(--color-ivory)',
  margin: 0,
  marginBottom: 'var(--spacing-3)',
};

const BODY_TEXT: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '15px',
  color: 'var(--color-ivory)',
  margin: 0,
  marginBottom: 'var(--spacing-4)',
  lineHeight: 1.5,
};

const ACTIONS_ROW: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--spacing-4)',
  marginTop: 'var(--spacing-6)',
};

function PrimaryButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaDisabled?: boolean;
  testId?: string;
  type?: 'button' | 'submit';
}): React.ReactElement {
  const disabled = props.ariaDisabled ?? false;
  return (
    <button
      type={props.type ?? 'button'}
      data-testid={props.testId}
      aria-disabled={disabled}
      onClick={(ev) => {
        if (disabled) {
          ev.preventDefault();
          return;
        }
        props.onClick?.();
      }}
      style={{
        flex: 1,
        minHeight: '44px',
        background: 'var(--color-oxblood)',
        color: 'var(--color-ivory)',
        border: '1px solid var(--color-oxblood)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  testId?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      style={{
        flex: 1,
        minHeight: '44px',
        background: 'transparent',
        color: 'var(--color-ivory)',
        border: '1px solid var(--color-sand)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {props.children}
    </button>
  );
}

function Step1Warning(props: { dispatch: React.Dispatch<Action> }): React.ReactElement {
  // Default focus on CANCEL per synthesis Conflict #11 (safe action).
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <>
      <p style={KICKER_STYLE}>{t.settings.accountDelete.step1.kicker}</p>
      <Dialog.Title style={TITLE_28}>{t.settings.accountDelete.step1.title}</Dialog.Title>
      <Dialog.Description asChild>
        <p style={BODY_TEXT}>{t.settings.accountDelete.step1.body}</p>
      </Dialog.Description>
      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {t.settings.accountDelete.step1.bullets.map((bullet) => (
          <li
            key={bullet}
            style={{
              display: 'flex',
              gap: 'var(--spacing-3)',
              padding: 'var(--spacing-2) 0',
              fontFamily: 'var(--font-serif)',
              fontSize: '14px',
              color: 'var(--color-ivory)', // Risk #4 — bullet TEXT ivory (15.98:1).
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--color-oxblood-soft)' }}>
              —
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <div style={ACTIONS_ROW}>
        <button
          type="button"
          ref={cancelRef}
          data-testid="account-delete-cancel-step1"
          onClick={() => props.dispatch({ type: 'close' })}
          style={{
            flex: 1,
            minHeight: '44px',
            background: 'transparent',
            color: 'var(--color-ivory)',
            border: '1px solid var(--color-sand)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {t.settings.accountDelete.step1.cancel}
        </button>
        <PrimaryButton
          testId="account-delete-continue"
          onClick={() => props.dispatch({ type: 'continue-to-email' })}
        >
          {t.settings.accountDelete.step1.continue}
        </PrimaryButton>
      </div>
    </>
  );
}

function Step2Email(props: {
  userEmail: string;
  typed: string;
  matched: boolean;
  dispatch: React.Dispatch<Action>;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const hintId = 'account-delete-step2-hint';

  return (
    <>
      <Dialog.Title style={TITLE_24_IVORY}>{t.settings.accountDelete.step2.title}</Dialog.Title>
      <Dialog.Description asChild>
        <p id={hintId} style={BODY_TEXT}>
          {t.settings.accountDelete.step2.body}
        </p>
      </Dialog.Description>
      <label
        htmlFor="delete-email"
        style={{
          display: 'block',
          fontFamily: 'var(--font-sans)',
          fontSize: '10.5px',
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.settings.accountDelete.step2.label}
      </label>
      <input
        ref={inputRef}
        id="delete-email"
        type="email"
        data-testid="account-delete-email"
        data-user-email={props.userEmail}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-required="true"
        aria-invalid="false"
        aria-describedby={hintId}
        value={props.typed}
        onChange={(ev) =>
          props.dispatch({
            type: 'set-typed',
            value: ev.target.value,
            userEmail: props.userEmail,
          })
        }
        style={{
          width: '100%',
          height: '56px',
          padding: '0 var(--spacing-3)',
          background: 'var(--color-bg-1)',
          color: 'var(--color-ivory)',
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          border: '1px solid var(--color-rule-strong)',
          outlineOffset: '2px',
        }}
      />
      {props.matched ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: 'var(--spacing-2)',
            color: 'var(--color-ivory)', // text in ivory (15.98:1) — moss fails AA
            fontFamily: 'var(--font-serif)',
            fontSize: '13px',
            display: 'flex',
            gap: '6px',
          }}
        >
          <span aria-hidden="true" style={{ color: 'var(--color-moss)' }}>
            ✓
          </span>
          <span>{t.settings.accountDelete.step2.matchAnnouncement}</span>
        </p>
      ) : null}
      <div style={ACTIONS_ROW}>
        <SecondaryButton
          testId="account-delete-cancel-step2"
          onClick={() => props.dispatch({ type: 'close' })}
        >
          {t.settings.accountDelete.step2.cancel}
        </SecondaryButton>
        <PrimaryButton
          testId="account-delete-confirm-email"
          ariaDisabled={!props.matched}
          onClick={() => props.dispatch({ type: 'continue-to-countdown' })}
        >
          {t.settings.accountDelete.step2.deleteCta}
        </PrimaryButton>
      </div>
    </>
  );
}

function Step3Countdown(props: {
  secondsLeft: number;
  understands: boolean;
  dispatch: React.Dispatch<Action>;
  onSubmit: () => void;
}): React.ReactElement {
  // Phase 3 a11y fix I1 — initial focus on CANCEL (the safe action) per
  // synthesis §2.1 line 117. Focus does NOT auto-shift to DELETE NOW when
  // the countdown reaches 0; the user must Tab over to it explicitly. This
  // prevents an accidental Enter-press from immediately deleting the
  // account if the user is mid-countdown reading the consequences.
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const ready = props.understands && props.secondsLeft === 0;

  // Visible counter label — picked from copy table (synthesis §2.1).
  // Phase 3 design-compliance fix I3 — at READY, split into ivory text + a
  // moss `✓` glyph wrapped in `aria-hidden="true"`. Mirrors the Step 2
  // match-indicator pattern (lines 619–625) and the §1a contrast rationale:
  // moss-on-bg-1 fails 4.5:1 as text but is exempt as a decorative glyph
  // when aria-hidden.
  let counterText: React.ReactNode;
  if (props.secondsLeft === 0) {
    counterText = (
      <>
        {t.settings.accountDelete.step3.ready}{' '}
        <span aria-hidden="true" style={{ color: 'var(--color-moss)' }}>
          ✓
        </span>
      </>
    );
  } else {
    counterText =
      t.settings.accountDelete.step3.countdownSeconds[10 - props.secondsLeft] ??
      `${props.secondsLeft}s…`;
  }

  return (
    <>
      <Dialog.Title style={TITLE_24_EMBER}>{t.settings.accountDelete.step3.title}</Dialog.Title>
      <Dialog.Description asChild>
        <p style={{ ...BODY_TEXT, fontStyle: 'italic' }}>
          {/*
            Phase 3 a11y fix I3 — ensure ≥44×44pt hit area for the
            understand checkbox by padding the wrapping label vertically.
            ui-ux-pro-max touch-target-size guideline.
          */}
          <label
            style={{
              display: 'flex',
              gap: 'var(--spacing-3)',
              alignItems: 'center',
              minHeight: '44px',
              padding: 'var(--spacing-2) 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              id="understand"
              data-testid="account-delete-understand"
              checked={props.understands}
              onChange={(ev) =>
                props.dispatch({ type: 'toggle-understand', value: ev.target.checked })
              }
              style={{ width: '20px', height: '20px', flexShrink: 0 }}
            />
            <span>{t.settings.accountDelete.step3.checkbox}</span>
          </label>
        </p>
      </Dialog.Description>
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="account-delete-countdown-counter"
        style={{
          marginTop: 'var(--spacing-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          // ivory at READY (15.98:1) keeps SR + visual users equal; the
          // moss glyph in the bullet ruler below carries the success cue.
          color: props.secondsLeft === 0 ? 'var(--color-ivory)' : 'var(--color-dust)',
        }}
      >
        {counterText}
      </div>
      {/* Decorative bullet ruler — aria-hidden so SR users only hear the
          counter announcements at t=10/5/1/0 (Risk #3). */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          gap: '4px',
          marginTop: 'var(--spacing-2)',
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            style={{
              width: '8px',
              height: '8px',
              background:
                i < 10 - props.secondsLeft ? 'var(--color-oxblood)' : 'var(--color-rule-strong)',
            }}
          />
        ))}
      </div>
      <div style={ACTIONS_ROW}>
        <button
          ref={cancelRef}
          type="button"
          data-testid="account-delete-cancel-step3"
          onClick={() => props.dispatch({ type: 'close' })}
          style={{
            flex: 1,
            minHeight: '44px',
            background: 'transparent',
            color: 'var(--color-ivory)',
            border: '1px solid var(--color-sand)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {t.settings.accountDelete.step3.cancel}
        </button>
        <PrimaryButton testId="account-delete-now" ariaDisabled={!ready} onClick={props.onSubmit}>
          {t.settings.accountDelete.step3.deleteCta}
        </PrimaryButton>
      </div>
    </>
  );
}

function Step4Progress(props: { phase: Phase }): React.ReactElement {
  const lines: { line: string; done: boolean }[] = [
    {
      line:
        props.phase === 'photos'
          ? t.settings.accountDelete.step4.phases.photosStart
          : t.settings.accountDelete.step4.phases.photosDone,
      done: props.phase !== 'photos',
    },
    ...(props.phase === 'photos'
      ? []
      : [
          {
            line:
              props.phase === 'records'
                ? t.settings.accountDelete.step4.phases.recordsStart
                : t.settings.accountDelete.step4.phases.recordsDone,
            done: props.phase === 'account' || props.phase === 'done',
          },
        ]),
    ...(props.phase === 'account' || props.phase === 'done'
      ? [
          {
            line:
              props.phase === 'account'
                ? t.settings.accountDelete.step4.phases.accountStart
                : t.settings.accountDelete.step4.phases.accountDone,
            done: props.phase === 'done',
          },
        ]
      : []),
  ];

  // Phase 3 a11y fix C2 — single semantic surface: the enclosing
  // <Dialog.Content> already carries aria-modal + aria-busy=true (added by
  // the parent when state.kind === 'progress'). The previous `<section
  // role="region">` wrapper duplicated the semantic chain for SR users.
  // We use a plain Fragment so the dialog's title + body remain its
  // immediate children for Radix's auto-wired aria-labelledby.
  return (
    <>
      <p style={KICKER_STYLE}>{t.settings.accountDelete.step4.kicker}</p>
      <Dialog.Title id="delete-progress-title" style={TITLE_28}>
        {t.settings.accountDelete.step4.title}
      </Dialog.Title>
      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {lines.map(({ line }, i) => (
          <li
            key={i}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              color: 'var(--color-ivory)',
              padding: 'var(--spacing-2) 0',
            }}
          >
            {line}
          </li>
        ))}
      </ul>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-dust)',
          marginTop: 'var(--spacing-4)',
        }}
      >
        {t.settings.accountDelete.step4.caption}
      </p>
    </>
  );
}

function Step6Failure(props: {
  recoverable: boolean;
  cause: string;
  dispatch: React.Dispatch<Action>;
}): React.ReactElement {
  // Phase 3 a11y fix C4 (and design-compliance C1) — focus the safe-action
  // button: TRY AGAIN when the failure is recoverable, CONTACT SUPPORT
  // otherwise. Synthesis §2.1 line 120.
  const tryAgainRef = useRef<HTMLButtonElement | null>(null);
  const contactSupportRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (props.recoverable) {
      tryAgainRef.current?.focus();
    } else {
      contactSupportRef.current?.focus();
    }
  }, [props.recoverable]);

  return (
    <div role="alertdialog">
      <Dialog.Title
        style={{
          ...TITLE_24_EMBER,
          fontSize: '40px',
        }}
      >
        {props.recoverable
          ? t.settings.accountDelete.step6.recoverableTitle
          : t.settings.accountDelete.step6.unrecoverableTitle}
      </Dialog.Title>
      <Dialog.Description asChild>
        <p style={BODY_TEXT}>
          {props.recoverable
            ? t.settings.accountDelete.step6.recoverableBody
            : t.settings.accountDelete.step6.unrecoverableBody}
        </p>
      </Dialog.Description>
      <p
        role="alert"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--color-dust)',
          marginTop: 'var(--spacing-3)',
        }}
      >
        {t.settings.accountDelete.step6.causePrefix}
        {props.cause}
      </p>
      <div style={ACTIONS_ROW}>
        {props.recoverable ? (
          <button
            ref={tryAgainRef}
            type="button"
            data-testid="account-delete-retry"
            onClick={() => props.dispatch({ type: 'retry-from-failure' })}
            style={{
              flex: 1,
              minHeight: '44px',
              background: 'var(--color-oxblood)',
              color: 'var(--color-ivory)',
              border: '1px solid var(--color-oxblood)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {t.settings.accountDelete.step6.retry}
          </button>
        ) : null}
        <button
          ref={contactSupportRef}
          type="button"
          data-testid="account-delete-contact-support"
          onClick={() => props.dispatch({ type: 'close' })}
          style={{
            flex: 1,
            minHeight: '44px',
            background: 'transparent',
            color: 'var(--color-ivory)',
            border: '1px solid var(--color-rule-strong)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {t.settings.accountDelete.step6.contactSupport}
        </button>
      </div>
    </div>
  );
}

export default AccountDeleteFlow;

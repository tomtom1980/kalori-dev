'use client';

/**
 * Thin client-island wrapper around `<TargetUpdatedNudge />` that owns the
 * "Recalculate now" + "Dismiss" handlers. The RSC page passes only plain
 * server-resolved props (timestamps, calorieTarget, onboarding snapshot)
 * and does NOT import the authPost / dismissal handlers itself.
 *
 * Phase 3 Round 1 C1 fix: composes `<HowWeCalculated />` (reused from
 * onboarding) from the profile inputs passed down by the RSC page, and
 * hands it into the nudge's `howWeCalculatedNode` slot so "see why"
 * resolves to an actual disclosure panel instead of an empty `<div>`.
 *
 * Codex R1 C-2: Dismiss + Recalculate previously POSTed shapes that
 * `/api/profile/save`'s `BodySchema` (`{ client_id, patch }`) rejects
 * silently. Dismissal never persisted; the nudge re-appeared on reload.
 * Fix: always send the schema-valid wrapper + fields from the route's
 * whitelisted `PatchSchema` (`last_dashboard_visit_at` was added to
 * that whitelist in this Codex-round commit). Failures are also surfaced
 * via sessionStorage + console.error so the UI cannot pretend success
 * while the server rejected the body.
 */
import { HowWeCalculated } from '@/app/(app)/onboarding/_components/HowWeCalculated';
import type { ActivityLevel, BioSex, GoalPace } from '@/lib/validation/onboarding';
import { authPost } from '@/lib/auth/refresh-interceptor';

import { TargetUpdatedNudge } from './TargetUpdatedNudge';

export interface TargetUpdatedNudgeWrapperProps {
  calorieTarget: number;
  lastTargetRecalcAt: string;
  lastDashboardVisitAt: string | null;
  /** Onboarding fields needed to compose the reused `<HowWeCalculated />` disclosure. */
  howWeCalculatedInputs?: {
    bio_sex: BioSex;
    age: number;
    height_cm: number;
    current_weight_kg: number;
    goal_weight_kg: number;
    goal_pace: GoalPace;
    activity_level: ActivityLevel;
  } | null;
}

function mintClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function surfaceNudgeError(kind: 'dismiss' | 'recalc', err: unknown) {
  // Codex R1 C-2 + R2-C1: the UI must NOT silently swallow failures. Log
  // to console for devtools, write a sessionStorage breadcrumb the next
  // render can read, then RE-THROW so the calling component can gate
  // success UI on server confirmation (card hides only after OK, no
  // success announcement on error).
  console.error(`[nudge:${kind}] request failed`, err);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        `kalori-nudge-${kind}-error`,
        JSON.stringify({ at: new Date().toISOString(), message: String(err) }),
      );
    } catch {
      // sessionStorage unavailable (private browsing) — swallow this
      // inner failure only; the console.error above remains.
    }
  }
}

export function TargetUpdatedNudgeWrapper(props: TargetUpdatedNudgeWrapperProps) {
  const onRecalculate = async () => {
    // Codex R1 C-2: re-fire recalc via a schema-valid profile-save call.
    // The route's `PatchSchema` only accepts the whitelisted columns; we
    // re-send `current_weight_kg` (a whitelisted column) so the server's
    // upsert observes a write on a weight-relevant column. The server's
    // recalc pathway (or the Task 5.2 dedicated recalc endpoint) will
    // treat this as a trigger. If howWeCalculatedInputs is not provided,
    // fall back to a bare `{ client_id, patch: {} }` — the server's
    // `.strict()` Zod accepts an empty patch and returns ok.
    //
    // Codex R2-C1: if the POST rejects, record the breadcrumb AND RE-THROW
    // so the presentational component keeps the card visible, renders the
    // error surface, and skips the recalc-success ARIA announcement.
    try {
      const patch = props.howWeCalculatedInputs
        ? { current_weight_kg: props.howWeCalculatedInputs.current_weight_kg }
        : {};
      await authPost('/api/profile/save', {
        client_id: mintClientId(),
        patch,
      });
    } catch (err) {
      surfaceNudgeError('recalc', err);
      throw err;
    }
  };

  const onDismiss = async () => {
    // Codex R1 C-2: persist `last_dashboard_visit_at = now()` via the
    // route's schema-valid wrapper (`{ client_id, patch: {...} }`), with
    // `last_dashboard_visit_at` now whitelisted in `PatchSchema`.
    //
    // Codex R2-C1: record the breadcrumb AND RE-THROW on failure so the
    // presentational component does NOT set `dismissed=true`, does NOT
    // restore focus, and renders the retry affordance instead. The card
    // stays visible until a server OK confirms the dismissal.
    try {
      await authPost('/api/profile/save', {
        client_id: mintClientId(),
        patch: {
          last_dashboard_visit_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      surfaceNudgeError('dismiss', err);
      throw err;
    }
  };

  const howWeCalculatedNode = props.howWeCalculatedInputs ? (
    <HowWeCalculated inputs={props.howWeCalculatedInputs} />
  ) : undefined;

  return (
    <TargetUpdatedNudge
      calorieTarget={props.calorieTarget}
      previousCalorieTarget={null}
      lastTargetRecalcAt={props.lastTargetRecalcAt}
      lastDashboardVisitAt={props.lastDashboardVisitAt}
      onRecalculate={onRecalculate}
      onDismiss={onDismiss}
      shouldRender={true}
      {...(howWeCalculatedNode ? { howWeCalculatedNode } : {})}
    />
  );
}

export default TargetUpdatedNudgeWrapper;

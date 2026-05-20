'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

interface Recipe {
  title: string;
  servings: number;
  total_time_minutes?: number | null;
  ingredients: string[];
  steps: string[];
  nutrition_note?: string | undefined;
  confidence: number;
}

interface RecipeResponse {
  recipe: Recipe;
  source: 'saved' | 'cache' | 'generated';
  persisted: true;
}

export interface LibraryCreateRecipeDialogProps {
  open: boolean;
  item: LibraryItem | null;
  onOpenChange: (open: boolean) => void;
}

type RecipeState =
  | { status: 'loading'; recipe: null; error: null }
  | { status: 'success'; recipe: Recipe; error: null }
  | { status: 'error'; recipe: null; error: string };

function mintClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16)).toString(16),
  );
}

export function LibraryCreateRecipeDialog({
  open,
  item,
  onOpenChange,
}: LibraryCreateRecipeDialogProps) {
  const descriptionId = useId();
  const requestSeq = useRef(0);
  const [state, setState] = useState<RecipeState>({
    status: 'loading',
    recipe: null,
    error: null,
  });

  const loadRecipe = useCallback(async (itemId: string) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setState({ status: 'loading', recipe: null, error: null });
    try {
      const response = await authPost<RecipeResponse>(`/api/library/${itemId}/recipe`, {
        client_id: mintClientId(),
      });
      if (requestSeq.current !== requestId) return;
      setState({ status: 'success', recipe: response.recipe, error: null });
    } catch (err) {
      if (requestSeq.current !== requestId) return;
      if (err instanceof SessionExpiredError) return;
      setState({
        status: 'error',
        recipe: null,
        error: t.library.createRecipeError,
      });
    }
  }, []);

  useEffect(() => {
    if (!open || !item) {
      requestSeq.current += 1;
      return;
    }
    let cancelled = false;
    const itemId = item.id;
    queueMicrotask(() => {
      if (!cancelled) void loadRecipe(itemId);
    });
    return () => {
      cancelled = true;
      requestSeq.current += 1;
    };
  }, [item, loadRecipe, open]);

  const title =
    state.status === 'success' ? state.recipe.title : t.library.createRecipeLoadingTitle;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kalori-library-dialog-overlay" />
        <Dialog.Content
          className="kalori-library-dialog-content"
          data-testid="library-create-recipe-dialog"
          aria-describedby={descriptionId}
          aria-busy={state.status === 'loading' ? 'true' : undefined}
        >
          <p className="kalori-library-dialog-kicker">{t.library.createRecipeKicker}</p>
          <Dialog.Title className="kalori-library-dialog-title">{title}</Dialog.Title>

          {state.status === 'loading' ? (
            <Dialog.Description asChild>
              <div
                id={descriptionId}
                className="kalori-library-dialog-loading"
                role="status"
                aria-live="polite"
              >
                <span
                  className="kalori-library-dialog-spinner"
                  data-testid="library-create-recipe-spinner"
                  aria-hidden="true"
                />
                <span>{t.library.createRecipeLoadingBody}</span>
              </div>
            </Dialog.Description>
          ) : null}

          {state.status === 'error' ? (
            <>
              <Dialog.Description asChild>
                <p id={descriptionId} className="kalori-library-dialog-body" role="alert">
                  {state.error}
                </p>
              </Dialog.Description>
              <div className="kalori-library-dialog-actions">
                <button
                  type="button"
                  className="kalori-library-pill"
                  onClick={() => {
                    if (item) void loadRecipe(item.id);
                  }}
                >
                  {t.library.createRecipeRetry}
                </button>
                <Dialog.Close asChild>
                  <button type="button" className="kalori-library-pill">
                    {t.library.createRecipeClose}
                  </button>
                </Dialog.Close>
              </div>
            </>
          ) : null}

          {state.status === 'success' ? (
            <RecipeBody recipe={state.recipe} descriptionId={descriptionId} />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RecipeBody({ recipe, descriptionId }: { recipe: Recipe; descriptionId: string }) {
  return (
    <>
      <Dialog.Description asChild>
        <p id={descriptionId} className="kalori-library-recipe-meta">
          <span>{t.library.createRecipeServings.replace('{N}', String(recipe.servings))}</span>
          {typeof recipe.total_time_minutes === 'number' ? (
            <>
              <span aria-hidden="true">/</span>
              <span>
                {t.library.createRecipeTime.replace('{N}', String(recipe.total_time_minutes))}
              </span>
            </>
          ) : null}
        </p>
      </Dialog.Description>
      <section className="kalori-library-recipe-section">
        <h3 className="kalori-library-recipe-heading">{t.library.createRecipeIngredientsTitle}</h3>
        <ul className="kalori-library-dialog-list">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient}>{ingredient}</li>
          ))}
        </ul>
      </section>
      <section className="kalori-library-recipe-section">
        <h3 className="kalori-library-recipe-heading">{t.library.createRecipeStepsTitle}</h3>
        <ol className="kalori-library-recipe-steps">
          {recipe.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <div className="kalori-library-dialog-actions">
        <Dialog.Close asChild>
          <button type="button" className="kalori-library-pill">
            {t.library.createRecipeClose}
          </button>
        </Dialog.Close>
      </div>
    </>
  );
}

export default LibraryCreateRecipeDialog;

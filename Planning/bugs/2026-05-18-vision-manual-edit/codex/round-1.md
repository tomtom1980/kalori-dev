# Codex Adversarial Review Round 1

Batch: `2026-05-18-vision-manual-edit`  
Scope: changed files for Bug 1/Bug 2 plus `proposals/` and `outputs/` artifacts. Generated screenshots, `next-env.d.ts`, `public/sw.js`, and `.codex/` were treated as out-of-scope local/generated artifacts except for commit-hygiene notes.

Tooling:
- CodeRabbit CLI: not installed.
- Codex CLI: available; `codex review --uncommitted` was run and returned two P2 findings plus one P3 hygiene note.
- Manual review completed against the current diff/source and batch proposals/outputs.

Official docs checked:
- Google AI image understanding: image inputs use image parts/inline data and examples target `gemini-2.5-flash`.
  https://ai.google.dev/gemini-api/docs/image-understanding
- Google AI structured output: JSON mode uses `responseMimeType: application/json` with schema config, and `gemini-2.5-flash` is listed among supported models.
  https://ai.google.dev/gemini-api/docs/structured-output
- Gemini `generateContent` API reference: `generationConfig` accepts `responseMimeType`, `responseSchema`, and related schema fields.
  https://ai.google.dev/api/generate-content

## Findings

### Improvement 1 - Mobile wheel can commit a stale quantity after the unit changes

File: `app/(app)/log/_components/ManualEntryFallback.tsx:342`

On mobile, the wheel trigger seeds `wheelDraft` from the current `portion` whenever it is a positive number:

```tsx
const current = isValidPositiveNumber(portion)
  ? Number(portion)
  : unit === 'g'
    ? 100
    : 1;
setWheelDraft(current);
```

The unit radio handler resets only `wheelDraft`, not the visible/submitted `portion`:

```tsx
setUnit(item);
setWheelDraft(item === 'g' ? 100 : 1);
```

Reproduction path:
1. On mobile, select `250 g` in the wheel.
2. Change unit to `piece` or `serving`.
3. Open the wheel and tap `Done` without selecting a new row.

The visible wheel options are count-style values, but `onDone` commits the stale `wheelDraft`/`portion` path and can save `250 piece` or `250 serving`. This is exactly in the mobile manual recovery surface the user reported as broken.

Required fix:
- When unit changes, either clear `portion` or set it to a valid default for the new unit.
- When opening the wheel, clamp/normalize `current` to an option in `wheelOptions`; if not present, use `100` for grams and `1` for count-style units.
- Add a component test that switches from grams to a count unit after selecting a large gram amount and confirms `Done` cannot submit the stale gram value.

### Improvement 2 - Retry CTA says "TRY PHOTO AGAIN" for non-photo failures

Files:
- `lib/i18n/en.ts:558`
- `app/(app)/log/_components/ManualEntryFallback.tsx:569`

`fallbackRetryCTA` was changed globally to `TRY PHOTO AGAIN`, but `ManualEntryFallback` is reused for type, snap, and library modes. In Add Food/type or library-save failures, the inline retry button and shared retry copy now announce the wrong action.

Required fix:
- Make the retry label mode-specific, for example snap = `TRY PHOTO AGAIN`, type/library = `TRY AGAIN`, or revert the shared copy to neutral text.
- Add a regression test for the type fallback mode so the retry button does not mention photo/camera.

### Improvement 3 - Invalid optional macro fields have no visible error message or focus target

File: `app/(app)/log/_components/ManualEntryFallback.tsx:207`

The submit handler sets `errors.protein`, `errors.carbs`, `errors.fat`, and `errors.fiber` when optional macros are invalid, but the macro inputs only receive `aria-invalid`; they do not render error text, do not set `aria-errormessage`, and the first-invalid focus logic never moves focus to the invalid macro field.

Impact:
- A user can type a negative or non-numeric macro value, press submit, and see only the generic summary. The specific macro problem is not visible or programmatically associated with the field.
- On mobile this is especially likely to feel like the save button is broken, because optional macros are lower in the recovery panel.

Required fix:
- Render inline error spans for each macro field, mirroring the name/quantity/kcal fields.
- Add `aria-errormessage` where errors are present.
- Extend first-invalid focus handling to protein/carbs/fat/fiber.
- Add a component test for an invalid macro value.

### Minor 1 - Keep local `.codex/` artifacts out of the commit

Path: `.codex/`

The current worktree has untracked local Codex artifacts. Codex review identified `.codex/dev-server.log` containing local paths, localhost/network addresses, and transient dev output. This is not a source-code blocker and appears intentionally local, but it must remain unstaged/uncommitted.

## Non-Findings

- Gemini model choice is reasonable: `gemini-2.5-flash` is an official multimodal model and is appropriate for image understanding.
- The request still sends image content as a native `inlineData` part rather than embedding base64 in text.
- `generationConfig.responseMimeType = application/json` plus `responseSchema` is aligned with the official structured-output API surface.
- No changed source path logs `imageBase64`, `thumbnailDataUrl`, `photoDataUrl`, API keys, cookies, or authorization headers.
- Vision parse failures return the existing manual fallback envelope instead of a hard error, which is appropriate for the user flow.

## Blocking Status

Blocking findings: none Critical, but the three Improvement findings should be fixed before moving to the final verification gate because they affect the manual recovery path users see when recognition fails.

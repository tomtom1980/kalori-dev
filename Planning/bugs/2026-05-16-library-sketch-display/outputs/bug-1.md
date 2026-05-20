# Bug 1 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\image-client.test.ts`

## Tests Added/Modified
- Modified: existing test `'makes a real fetch when fixture env is unset and parses inlineData'` (test #2 in the `describe('callGeminiImage')` block at line ~50–79). Added a one-line negative-match assertion + 4-line explanatory comment immediately after the existing positive `expect(calledUrl).toContain('gemini-2.5-flash-image:generateContent')` assertion.
- New assertion: `expect(calledUrl).not.toContain('gemini-3-pro-image-preview');`
- Purpose: regression-lock to prevent silent upgrade to the expensive Pro variant (Nano Banana Pro). Belt-and-suspenders on top of the existing positive assertion at line 77.

## Test Run Result
- Command: `npx vitest run tests/unit/lib/ai/image-client.test.ts`
- Result: **16 passed / 0 failed / 0 skipped**
- Duration: 721ms
- The negative-match assertion passes immediately because production code is already using the cheap flash variant (`gemini-2.5-flash-image`). The Pro identifier never appears in the constructed URL.

## Deviations from Proposal
- None. The assertion was added inline in the existing test (same test that asserts the positive cheap-variant URL fragment), exactly as the proposal's preferred path (line 39: "add ONE new test case that asserts the URL contains `gemini-2.5-flash-image` AND does NOT contain `gemini-3-pro-image-preview`"). Chose the inline approach rather than a sibling test because the variable `calledUrl` is already in scope and the assertion is a one-liner — surgical-change principle favors the smaller diff over a new test scaffold.
- Skipped the optional `DEFAULT_MODEL` cost-warning comment in `lib/ai/image-client.ts` per surgical-change principle (proposal §1, "Optional doc-only ... omit if surgical-change principle is preferred"). No production code change.

## Status
implemented

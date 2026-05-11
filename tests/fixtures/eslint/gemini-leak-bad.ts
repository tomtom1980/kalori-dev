// Fixture: client-bundled code that MUST be blocked by the no-gemini-leak rule.
// Path pattern matches the scope: `^components/` — this file lives at
// tests/fixtures/eslint/... but the ESLint rule test rewrites the filename
// to a scope-matching path when running RuleTester.
const key = process.env.GEMINI_API_KEY;
export default key;

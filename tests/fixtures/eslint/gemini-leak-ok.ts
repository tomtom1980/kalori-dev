// Fixture: server-only AI path — the rule MUST allow GEMINI_API_KEY here.
// The ESLint rule test rewrites the filename to `lib/ai/<name>.ts` when running
// RuleTester so the allowlist pattern matches.
const key = process.env.GEMINI_API_KEY;
export default key;

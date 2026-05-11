# Pass 2 Enrichment — design-lead perspective

**Reviewer role:** design-lead (frontend-design skill lens)
**Target:** Six Pass-1 fragments for Kalori "The Ledger" PWA (agent-1 through agent-6)
**Charter:** Adversarial review for aesthetic coherence, anti-generic-AI rigor, visual metaphor enforcement, color/typography/layout characterfulness, and motion orchestration.
**Skills invoked:** `frontend-design:frontend-design` + `ui-design` (web-ui-guide.md loaded).
**Tone:** Adversarial-but-constructive. No rubber-stamps. Fragments are strong; this delta pushes them from "very good spec" to "unforgettable product."

Every Change recommendation is concrete and actionable (CSS value, token name, layout shift). Main agent applies during assembly. I do NOT rewrite fragments — I key every note by section address (e.g., `agent-3 §Chronometer Ring`).

---

## 1. Aesthetic Coherence Audit

### 1.1 Does "The Ledger" hold across all six fragments?

**Mostly yes, with three drift points.** The fragments demonstrate strong aesthetic discipline — the oxblood/ivory palette, zero-radii shape language, Newsreader/Inter/JetBrains-Mono pairing, and hairline-rule hierarchy propagate coherently. The visual metaphor (archival newspaper / printer's ledger / turn-of-century broadsheet) is invoked consistently in editorial voice ("the day's entries," "the water column," "the minor elements," "from the editor," "the almanac"). Kickers `§ 01 · …` with mono-seq prefixes are a load-bearing characterful signature used across all surfaces.

frontend-design guidance cited: *"Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity."* The fragment set demonstrates intentionality.

**However, three drift zones warrant correction:**

**Drift A — agent-4 §Portion Picker stepper (log flow).** The stepper uses a `−` / value / `+` row with two 44×44 buttons flanking a Newsreader 32px value. This is a generic numeric-stepper pattern that appears in every fitness/e-commerce app since iOS 13. `frontend-design` explicitly warns against *"predictable layouts and component patterns"* and *"cookie-cutter design that lacks context-specific character."* No editorial flourish here — no hairline-ruled columns, no italic serif descriptor, nothing that says "you are turning a page of a ledger." It reads as Material-Design-with-rebrand.

**Drift B — agent-4 §Confirmation Screen "Meal slot picker" (4-chip row Breakfast/Lunch/Dinner/Snack).** Oxblood-fill active state on rectangular chips is the shadcn/ui default toggle-group pattern. No differentiation from every dark-mode SaaS settings page. frontend-design's "Distinctive Interfaces" guidance explicitly calls out *"predictable layouts"* as an AI-slop signal.

**Drift C — agent-6 §Login Form.** Vertical-stacked email + password + primary-button layout with centered wordmark above and "OR" divider is the most generic auth pattern in existence. This is the single most important "first impression" surface in the product, and it is currently reading like a Next.js starter template with a color palette swap. The form block (lines 882-903) could be lifted from any shadcn/ui auth example on the internet.

### 1.2 Where is the visual metaphor (archival newspaper / printer's ledger) strongest?

- **agent-3 §Meals Bulletin:** excellent — 5 ruled columns with kickers, italic-serif food names, mono timestamps, dotted-rule entry dividers. This is the metaphor made operational.
- **agent-3 §Chronometer Ring:** excellent — Roman hour numerals, now-indicator triangle, dashed-ember projection, 82px serif calorie hero. The one-and-only signature moment done right.
- **agent-6 §Micronutrient Heatmap:** excellent — italic-serif row names, month-band headers in sans caps, monospace day numerals, editorial footer note. Reads like a financial broadsheet tearsheet.
- **agent-5 §Ruled Library Grid:** very good — `gap: 0` + drawn rules is a disciplined decision; it IS the printer's column ruling. Kudos.
- **agent-3 §Weekly Insight Card:** very good — drop cap, italic pull-quote body, byline ("Penned by Kalori, resident model"), oxblood left rule. Canonical "From the Editor" execution.

### 1.3 Where is the metaphor weakened or abandoned?

- **agent-4 §TAB 3 Library picker grid** (log modal): 1-col/2-col/3-col `160×120` rectangular cards inside the modal with thumbnail + text column — this regresses to a generic "product card grid." No drawn column rules (the fragment even notes this explicitly as a divergence from `/library`). The mini-picker grid should still carry at least vertical column hairlines between cards, even if not the full ruled-grid treatment.
- **agent-4 §Portion Picker unit selector** ("PORTION / G / ML" segmented control with oxblood underline) is solid, but the surrounding stepper is generic.
- **agent-6 §PWA Install Prompt** has zero editorial flourish — generic "title + body + two buttons" modal. Ideal opportunity missed: a dotted-rule tear-off line, a fold mark, a stamp, SOMETHING that says this is a ledger page.
- **agent-6 §Settings subsections** are structurally clean but visually dry. Could carry more mono/serif juxtaposition; reads like a plain admin form.

---

## 2. Anti-Generic-AI Check

**frontend-design skill guidance cited:** *"Avoid generic AI aesthetics — no default Inter/Roboto, no cliche purple gradients, no cookie-cutter layouts… Interpret creatively and make unexpected choices that feel genuinely designed for the context."*

Per-fragment patterns flagged as "would read as AI-generated generic":

### 2.1 agent-1 (Foundations)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | `.focus-editorial` utility — `outline: 2px solid oxblood; outline-offset: 2px` (§7.2) | Uniform thickness + uniform offset across all controls — this is the Tailwind default focus recipe. Every AI-generated dark-mode site looks like this. | Vary: keep 2px oxblood for buttons/inputs, but for **cards** use inset `outline-offset: -2px` (so the ring lives inside the hairline frame — printer-correct). For **FAB** use a doubled ring: 1px oxblood inner + 1px ivory outer at 3px offset (telegraphs print-register-mark). For **heatmap cells** `outline-offset: -2px` (already noted in agent-6 §5 — good). Document 3 variants in §7.2. |
| 2 | Motion tokens `micro 120 / standard 180 / expressive 320 / chrono 600` (§6.1) | Four perfect-power-of-two-ish durations is the Material Motion playbook. | Add **one intentionally-awkward duration**: `motion-page-turn: 480ms` for page transitions. Not 500, not 400. 480 reads like a printing-press stroke rather than an iOS spring. Use it on `page-settle`. |
| 3 | Spacing scale (0,1,2,3,4,6,8,12,16,24) (§5.1) | Standard Tailwind 8px scale — universal AI-gen baseline. | Add one editorial token: `--spacing-gutter-editorial: 28px` (exactly what the mockup uses as `--col-gutter: 28px`). This is the "column gutter of a broadsheet" measurement — different from the 24/32 jump because broadsheets traditionally use ~7px-multiple gutters, not 8px. Use it in Dashboard 3-col and Progress 2-col grid `gap`. |

### 2.2 agent-2 (Navigation)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | Desktop sidebar 240px wide with icon+label rows (§Desktop Sidebar) | Standard Linear/Notion/Supabase pattern. | Add a **"§ NAVIGATION" kicker** above the nav list (Inter 10.5px UPPERCASE tracking 0.22em `color: dust`, padding-left 16px, margin-top 8px / margin-bottom 12px). Divides the masthead from the nav the way a print-journal divides masthead from table of contents. This is what the design-doc §9 ASCII sketch shows (`§ NAVIGATION`) but agent-2's spec DROPS it. |
| 2 | Sidebar icons Phosphor regular 24×24 (§Nav list) | Every modern app uses Phosphor 24px icons; indistinguishable. | Downsize icons to **18×18** and shift them RIGHT so they sit at the right edge of the nav-row (not the left). Left-align the labels flush. This inverts the "icon-first" pattern that every AI-gen sidebar produces — labels become primary (editorial-print-correct), icons become secondary annotations. Radical and cheap. |
| 3 | Mobile tab bar with icon-above-label slots (§Mobile Bottom Tab Bar) | iOS/Material default. | Replace icons with **Mono JetBrains 14px letter-mnemonics**: `D · L · P · S` centered above the label. One-letter typographic tab markers read print-historical (footnote-marker style), tap-efficient, and utterly different from emoji/Phosphor tab bars. Keeps 44×44 hit box. Pairs with the editorial voice. |
| 4 | FAB custom-SVG `+` glyph (§Center FAB) | Custom stroke is better than Phosphor but still a generic `+`. | Use a **typographic `†`** (dagger glyph from Newsreader 300 24px, `color: ivory`) or a `§` (section mark) instead of `+`. The dagger is a print-journal annotation mark; it maps to "make a new entry." The `+` reads fitness-app. ALTERNATIVELY: a 2-part mark — hairline horizontal rule + oxblood vertical — that reads as "open a new page" rather than "add a thing." |
| 5 | Top mobile strip `WEEKDAY · MON D` left + `EDITION N` right (§Mobile top strip) | Functional but predictable. | Add an **oxblood bullet glyph between the two** (6px square zero-radius `background: oxblood`, vertical-centered) to echo the masthead wordmark-bullet. And on the **right side** use the Newsreader italic format: `— No. 142` (em-dash prefix, italic serif, sand color). Mixes sans date + serif edition — characterful pair per frontend-design: *"Pair a distinctive display font with a refined body font."* |

### 2.3 agent-3 (Dashboard)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | Masthead kicker `THE LEDGER · KALORI · VOL. [Roman(volume)] · EDITION [editionNumber]` (§Dashboard Masthead) | 4-part middot-separated caps row is a Vercel/Linear kicker pattern. | Split into **two rows** with asymmetric layout: Row 1 left-aligned `THE LEDGER — KALORI` (em-dash, `color: dust`), Row 1 right-aligned `VOL. IV · Nº 142` (note: `Nº` not `NO.` — typographic superior-letter; Newsreader italic). Row 2 is the wordmark. This introduces asymmetry + typographic detail. frontend-design: *"Asymmetry. Overlap. Diagonal flow. Grid-breaking elements."* |
| 2 | Macro Bars row layout `m-head | m-val | m-bar` at desktop (§Macro Bars) | Same-pattern-three-times is uniform and dull. | Vary by macro. Protein row: standard. **Carbs row: invert — bar on LEFT, value on right.** **Fat row: value split — current/target fraction with a vertical 1px rule between.** Call this the "three takes on the same metric" pattern — different compositions reinforce newspaper-column variety. |
| 3 | Water bullets `16px circle` row (§Water Tracker) | Row of 8 identical circles is a generic hydration UI — MyFitnessPal/Apple Water. | Mix shapes per mockup intent: **odd-index bullets as circles, even-index as zero-radius 16×16 squares** — reads "glass then bottle then glass then bottle" typographic rhythm AND reinforces the shape-language binarity (circles are water, squares are everything else). OR: give each filled bullet an **italic serif numeral 1..N** in ivory at 11px centered — makes each glass a numbered entry, like footnote markers. |
| 4 | Delta copy `plenty of room / a measured margin / past the mark` (§Chronometer ring §Visual spec, Delta line) | Already strong literary voice — KEEP. No change needed. | — |
| 5 | Weekly Insight footer link `"VIEW FULL REVIEW →"` (§Weekly Insight Card) | Arrow + caps is standard CTA pattern. | Replace the `→` with a typographic **`⟶ read the full account`** (longer arrow glyph U+27F6, italic serif sand trailing phrase) — reads print-article-byline rather than SaaS-button. |

### 2.4 agent-4 (Log Flow)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | Modal tab switcher `TYPE · SNAP · LIBRARY` with 2px oxblood underline active (§Tab switcher) | Standard segmented-tab pattern. | Replace active-state underline with a **hand-ruled squiggle-free 2px oxblood bar with 1px ivory "serif" end-caps** (tiny 2px-tall vertical ivory ticks on either end) — reads like a draftsman's underline, print-correct. Non-active tabs get a 1px `rule` hairline above them so the tablist row reads as a complete ruled header. |
| 2 | Portion Picker stepper (§Portion Picker Controls) | Generic iOS-style stepper. | See Drift A above. Replace with: **a single row with oxblood `−` glyph on the far left, Newsreader 32px value flush left next to it, italic-serif unit suffix (Newsreader italic 18px sand) flush right, `+` glyph in oxblood on far-right.** Eliminate the boxed stepper frame. Step indication: italic-serif sub-row below — *`one half portion · 140 g`* — changes content as user steps. Reads like marginalia, not like a dial. |
| 3 | Meal slot chips (Breakfast/Lunch/Dinner/Snack) (§Confirmation Screen) | 4 rectangular chips w/ oxblood fill active = shadcn/ui default. | Replace with **4 kickers stacked vertically** (each row: mono `§ 01` / `§ 02` / `§ 03` / `§ 04` + Inter caps label `BREAKFAST` etc.), where the ACTIVE row gets a 2px oxblood LEFT border (same visual grammar as the sidebar nav active state). Radio-group-as-kickers. Reads like a table-of-contents selection. |
| 4 | Save-to-library toggle (48×24 track with 20×20 knob) (§Save-to-library toggle) | Stock toggle switch pattern. | Keep the visual but add **a typographic ligature flourish** on the label row: `FILE UNDER` followed by an oxblood `⟶` then the normalized-name in italic serif — `FILE UNDER ⟶ yoghurt with walnuts and honey`. Reads as an archivist filing an entry, not as toggling a feature flag. |
| 5 | Undo Toast — 1px countdown bar along bottom edge (§Undo Toast §Auto-dismiss) | Standard toast-progress pattern. | Replace the horizontal countdown bar with a **5-bullet countdown series** top-right: `● ● ● ● ●` dots in oxblood that fade to dust one at a time per second. Reads like a film leader countdown or a printer's bullet-counter. Reduced-motion fallback: same dots, fade via 5 discrete steps (already specified). |
| 6 | "Why these numbers?" expandable with ▸/▾ caret (§Confirmation Screen) | Standard disclosure pattern. | Replace `▸` caret with **a typographic `⟨…⟩`** (angle-brackets with ellipsis, Newsreader 400 italic 18px oxblood) when collapsed; `⟨unfolded⟩` (or just a 2px oxblood underscore rule 48px wide) when expanded. Reads "footnote expansion," not "dropdown toggle." |

### 2.5 agent-5 (Library)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | Tools-rail layout (search `2fr` + filter `1fr` + sort `1fr` + SELECT) (§3.1) | 3-cell filter bar is every SaaS admin pattern. | Introduce **asymmetric column widths**: search `3fr`, filter `1fr`, sort `1fr`, SELECT floating inline after sort (no cell). Add a **mono-sequenced kicker above search**: `§ FIND` in JetBrains Mono 10.5px with `color: dust` and 28px margin-right from the search field. Reads like a newspaper classifieds header. |
| 2 | Library card "logged Nx" count-badge (`sand` serif in rgba(14,10,8,0.8) bg) (§5.2 mono-tag & count-badge) | Generic overlay-pill pattern. | Replace count-badge with a **typographic stamp**: text `× 47` (×-mark at Newsreader 400 italic 15px sand, number at .num mono 13px ivory), NO background, NO border, printed directly onto bottom-left of thumbnail with 0.8 opacity — reads like a rubber-stamped ledger entry. Also: rotate the whole mark by **-3° transform** (very subtle non-zero rotation only on this stamp) — telegraphs "hand-stamped." Only applies to items `log_count ≥ 10`; below 10 no stamp. |
| 3 | Selection checkbox chip 16×16 square with 1px oxblood border (§5.5) | Standard checkbox pattern. | Replace with an **oxblood "edition letterpress" mark**: when selected, a 2px oxblood uppercase letter `K` (Newsreader 700 italic, 14px) renders inside the checkbox — user's own wordmark-initial stamped on each selected card. Reads like a collector marking books with their initial. Unselected = empty square. |
| 4 | Drill-in sheet top-bar "«« BACK TO LIBRARY" (§7.3) | Standard back-affordance. | Keep concept, refine glyph: use **`← ${INDEX}`** where `${INDEX}` is literally the word "INDEX" (the library is the index). Reads print-navigation. Arrow is a single `←` (U+2190) not double-caret. Right side close button: use **italic-serif lowercase `close`** (not `×`), Newsreader 400 italic 13px sand. |
| 5 | Merge dialog per-field row (§8.4) | Radio-button A/B pattern is unavoidable but currently reads as a generic form. | Add a **kicker to each field** in mono: `§ NAME` / `§ THUMB` / `§ KCAL` etc., plus a hairline divider between fields. Transform the dialog from "form" to "broadsheet article with ruled sections." Live preview section already has a `§ MERGED RESULT` kicker — good; propagate the kicker grammar uphill. |
| 6 | Bulk delete confirm dialog title "DELETE {N} ITEMS?" (§9.3) | Standard destructive-confirm pattern. | Replace with **print-journal-correct** phrasing: Newsreader 300 28px `Strike {N} titles from the record?` (ivory), subline italic serif 16px sand: *This cannot be undone after five seconds.* Button: `STRIKE {N}` instead of `DELETE`. This reframes deletion as an editorial act (striking-through), which matches the metaphor. |

### 2.6 agent-6 (Progress + Remainder)

| # | Pattern | Read as AI-slop because… | Concrete strengthening |
|---|---|---|---|
| 1 | Range toolbar chip group `7D · 30D · 90D · 1Y` (§Progress Range Toolbar) | Standard segmented-control. | Keep chip group but change labels to **mono-sequenced italic-serif spellings**: `seven d. · thirty d. · ninety d. · one y.` — lowercase italic serif with period-abbreviation, NOT uppercase. Looks like a newspaper's date-range caption, not an SaaS control. Active state: ivory fill with bg-0 text (already specified — fine). |
| 2 | Chart card `.chart-card` — header with title-left + meta-right (§Calorie Adherence, §Macro Distribution, etc.) | Uniform-header-for-all-charts reads as "Recharts template with skin." | Vary per section: §Calorie Adherence uses the standard pattern. §Macro Distribution gets a **3-column header** (title · mono-sequence `§ 06` · meta) because it's a 3-macro chart. §Weight Trajectory gets an inline quick-add button `+ LOG WEIGHT TODAY` on same header row (already specified — good). §Micronutrient Heatmap gets the 3-column grid header (already specified — signature). Propagate variety; resist the urge to make every chart header identical. |
| 3 | Chart tooltip — `bg-1` with 1px `rule-strong` border (§Bar hover, all sections) | Standard dark-mode tooltip shell. | Add a **2px oxblood left rule** to every chart tooltip (same treatment as `editor-card` in the mockup). Becomes the app's signature "annotation chrome" — any tonal card with a 2px oxblood left bar = "commentary on the data beside it." Unifies tooltip + weekly-insight + undo-toast visually. |
| 4 | Onboarding Step 1 welcome (§Step 1 — Welcome) | Vertical-centered wordmark + tagline + body + CTA is starter-template layout. | Introduce **off-center composition**: wordmark at top-LEFT (not centered), tagline aligned to a second column beneath (indented 104px to align with wordmark's underbaseline), body paragraph indented further (like a pull-quote). BEGIN button flush-right on its own row, with a 1px hairline rule spanning full width above it. Reads like the opening page of a broadsheet. frontend-design: *"Asymmetry. Overlap. Diagonal flow. Grid-breaking elements."* |
| 5 | Onboarding Step 8 live-computed calorie (82px centered) (§Step 8 — Your Target) | Big-number-centered is the Stripe-dashboard pattern. | Surround the 82px number with **typographic ornamentation**: `— 2,180 —` with italic-serif em-dashes in sand at 48px flanking. Reads print-headline style. Below, add an italic-serif 15px sand caption *"your daily budget, by the equation of Mifflin & St Jeor"* — gives the number an attribution, like a citation. |
| 6 | Login form layout (§Login / Signup Page) | Most generic surface in the product. | See Drift C above. Restructure: (a) wordmark flush LEFT at 72px (desktop), (b) a **1px horizontal hairline-strong rule** spanning full page-width at y=240px, (c) form block flush LEFT below rule (not centered) max-width 420px, (d) italic-serif tagline flush RIGHT of rule at y=240px as a pull-quote, and (e) footer *"Private. Owner-only. No ads, no tracking."* as a centered italic-serif in sand at bottom-margin. Reads like the cover of a broadsheet, not a SaaS signup form. |
| 7 | Account Delete Flow Step 3 countdown (00:10 → 00:00) (§Step 3) | Stopwatch countdown is cinematic-security-pattern. | Replace with **a typographic 10-bullet horizontal ruler** that fills from left to right, one dot per second (oxblood). Paired with italic-serif counter *"ten seconds…"* *"nine seconds…"* underneath as text ticks — reads like a church-bell count (10 tolls). Far more elegiac than a digit-clock countdown; matches the gravity of account deletion better. |
| 8 | PWA Install Modal (§PWA Install Prompt) | Generic "title + body + button" modal. | Redesign as a **folded-letter visual metaphor**: the modal's top edge has a 2px dotted `rule` that reads as a perforated tear-line, the body has a 3px indent on left-side that reads as a typewriter left-margin, and the install button is styled as a **ribbon-tab** (inset 6px on right side where an old library-card pocket would be). This is editorial flourish worth the fragment's one-and-only moment. |

---

## 3. Color Dominance + Accent Rigor

### 3.1 Is oxblood a DOMINANT signature or has it diffused?

**Verdict:** Oxblood is ~70% correctly dominant but has diffused into "yet another accent" in three places:

**Correctly dominant usages (KEEP):**
- Chronometer ring consumed arc (10px stroke oxblood) — signature.
- Weekly Insight Card 2px-tall oxblood LEFT rule on `bg-quote` card — signature annotation.
- Drop cap at 48–56px oxblood — the app's single most characterful glyph.
- FAB fill and primary CTA buttons (Inter ivory on oxblood) — signature action.
- Active-nav left bar — signature state.
- Wordmark bullet — signature mark.

**Diffused usages (BOUND DOWN):**
- **agent-4 §Undo Toast 2px oxblood left rule:** competes with Weekly Insight Card's 2px oxblood rule. Both are annotation-cards; but Undo-Toast is transient and should read distinctly. **Change:** Undo Toast gets a 2px **ember** left rule (not oxblood). Ember is the "approaching / warning" color — matches "undoable within 5s" semantics better than oxblood's finality. Reserves 2px-oxblood-left-rule for the Weekly Insight / editor-voice card only. (agent-4 even notes `ember` is used for the Why-panel border — ember should be the "editor-commentary" color; oxblood should be the "primary-signature-only" color.)
- **agent-5 §5.2 letter-mark fallback `background: oxblood`:** when library is empty of photos, EVERY card goes oxblood. At scale this floods the grid with oxblood and kills its signature. **Change:** letter-mark background should be **`bg-2`** (per design-doc §10.6) with a 2px oxblood TOP rule only; letter glyph stays ivory but drops to `color: sand`. Keeps the accent but doesn't tile oxblood across a 4-col grid. agent-5's own §14.2 flags this as a divergence from design-doc; I side with design-doc.
- **agent-6 §Water Adherence bar `fill: oxblood`:** reserves oxblood for "water actual" — but water is NOT the signature content. **Change:** water adherence fill should be `slate` (per Agent 1 §2.2), keeping oxblood reserved for consumed-calorie and signature-accent use. Agent-6 §4 explicitly flags this as a divergence — I side against agent-6 here. Slate is the canonical water color; progress-page water bars should match dashboard water bullets for cross-screen consistency.

### 3.2 Are the 13 tokens genuinely used, or is the set collapsing?

**Collapse check (scanning fragments):**

| Token | Usage spread | Assessment |
|---|---|---|
| `bg-0` / `bg-1` / `bg-2` | All fragments | Correctly used as tonal-depth stack |
| `bg-quote` | agent-3 Weekly Insight only | **Underused.** Should also appear in: Confirmation Screen's "Why these numbers?" expandable body, Account Delete Flow warning card, Onboarding Step 8 "How we calculated this" expandable. All three are "commentary / footnote" surfaces — give them `bg-quote` distinction. |
| `rule` / `rule-strong` | All fragments | Correctly used |
| `ivory` | All fragments | Canonical primary text |
| `sand` | All fragments | Canonical secondary text — well distributed |
| `dust` | All fragments | Canonical metadata — well distributed |
| `dust-2` | Rarely | Ledger-correct — reserved for "de-emphasized decorative" |
| `oxblood` | All fragments | See §3.1 above for diffusion concerns |
| `oxblood-soft` | All fragments | Used as hover — correct |
| `ember` | agent-3, agent-6 (projections, warning) | **Underused.** Should appear as: Undo-Toast left rule (§3.1 above), onboarding "auto-recalc triggered" banner in Settings, any "pending / approaching / in-flight" state. frontend-design: *"Dominant colors with sharp accents outperform timid, evenly-distributed palettes"* — ember is the second-tier accent and should carry more weight. |
| `ochre` | agent-3 (carbs, fiber arc), agent-6 (under-target) | Appropriately reserved |
| `moss` | agent-3, agent-6 (on-target, supportive) | Appropriately reserved |
| `slate` | agent-3 water bullet only | **Should also carry** agent-6 water adherence bar (see §3.1). |
| `plum` | Not referenced by any fragment except agent-1's declaration | **Unused token.** Assign to: 5th data series in any comparative chart (e.g., Weight Trajectory "projected beyond goal line" segment, or a library drill-in "similar items" decorative accent), OR drop it from the canonical palette to avoid false-advertising a 13th color that's never rendered. Lean: ASSIGN to the Weight Trajectory "projection-beyond-goal" segment in agent-6 §Section 3, instead of leaving it ambient. |

### 3.3 Suggested places to push color harder

- **agent-3 §Meals Bulletin entry rows:** currently all ivory+sand+dust. Push: the RIGHT-aligned `{kcal} kcal` value should carry a subtle oxblood-soft accent for the single largest-kcal entry per column (a "heaviest meal" typographic marker). One per column; quiet differentiation.
- **agent-3 §Micronutrient Panel:** the row-order is priority-sorted (protein > iron > vitamin D > vitamin C > calcium > fiber > rest). Push: the TOP 3 rows get a slightly larger `micro-name` type (Newsreader italic 15px instead of 14px). Weight-by-priority typographically, not just by order. Feels editorial rather than data-driven.
- **agent-5 §7.6 Food Detail "Nutrition" kcal hero:** 48px Newsreader on `bg-2` is fine but DRY. Push: wrap the number in a hairline-rule frame on all 4 sides (like a print tearsheet — `82 kcal` becomes a framed "numeric plate"), with `ember` labels in the 4 corners (`source`, `recorded`, `portion`, `date`) — all Inter 500 8px UPPERCASE in dust. Turns a number into a nutrition-label tearsheet.

---

## 4. Typography Characterful-Pair Enforcement

**frontend-design skill guidance cited:** *"Typography: Choose fonts that are beautiful, unique, and interesting. Pair a distinctive display font with a refined body font."*

The Ledger chooses a bold three-way pairing — **Newsreader (serif display + numerals), Inter (sans labels), JetBrains Mono (timestamps).** This is a strong, characterful, **non-generic** choice (Inter is widespread but Newsreader+JetBrains is not, and the roles are rigorously assigned). frontend-design warns against Inter as a DEFAULT body font — here it's correctly demoted to labels-only, which keeps the typography distinctive. **KEEP the three-way pairing; do NOT substitute.**

### 4.1 Is Newsreader used BOLDLY, or downscaled timidly?

**BOLD usages (KEEP):**
- agent-3 calorie hero 82px (240×240 ring center) — hero moment.
- agent-3 wordmark 104px desktop — masthead hero.
- agent-3 section titles 44px — sectional.
- agent-6 heatmap title 32px — signature-view header.
- agent-6 onboarding Step 8 target display 82px — big reveal.
- agent-5 Food Detail name 32px — drill-in hero.
- agent-3 / agent-4 italic serif 18–22px body (food names, pull-quotes, entries) — editorial voice.

**Timid usages (PUSH UP):**
- **agent-2 §Desktop Sidebar masthead wordmark 28px:** downscaled from the 104px canonical. Sidebar has 240px width — 28px is generous but it's LOSING the wordmark's punch. **Change:** increase sidebar wordmark to **36px Newsreader 300 weight**, letter-spacing -0.035em. 240px width accommodates it. Also: shift the wordmark's y-position so `li`-nes-up with the nav list's second item's baseline (asymmetric placement) — reinforces editorial layout.
- **agent-3 §Chronometer Ring fraction label "of {target} kcal" at 14px:** fine, but **center delta line "plenty of room / a measured margin / past the mark" at 13px is TOO SMALL.** This is one of the app's most literary touches; it should be 15–16px Newsreader italic. Never dwindle the editor's voice.
- **agent-5 §5.3 Food name on library card at 16px (desktop):** the library card is 240×240 content area; 16px is thin against that area. **Change:** increase food name to **Newsreader 400 18px** on desktop (14px mobile stays). Gives the card its editorial weight; the whole library reads more textured.

### 4.2 Is Inter at uppercase-labels role or drifting to body duty?

**Correct usages (KEEP):**
- All `T9` label specs (10.5px UPPERCASE tracking 0.18–0.22em `color: dust` or `sand`).
- Nav items at 11px UPPERCASE 0.18em.
- Section kickers at 10.5px UPPERCASE 0.22em.

**Drift usages (PUSH TO SERIF):**
- **agent-4 §Tab 1 PARSE button helper copy "ENTER = PARSE · SHIFT + ENTER = NEW LINE":** this is helper/onboarding content, shown at default weight. Inter-UPPERCASE at 10.5px is functionally correct but reads like generic "keyboard hints" — every SaaS has this. **Change:** render as **italic serif 13px sand**: *"Enter parses · shift+enter for a new line."* — reads literary, not shortcut-panel. Keep the kbd-style JetBrains Mono for the literal key glyphs only.
- **agent-5 §9.3 Bulk Delete body "This will remove N items from your library… This cannot be undone after the 5-second grace window":** this is Inter 14px sand per spec. **Change:** render as **Newsreader 400 italic 15px `color: sand`** — destructive copy reads more gravely in serif italic than in sans. frontend-design principle: right font-weight for the emotional register.
- **agent-6 §Onboarding Step 8 "How we calculated this" formula block:** currently "serif 14px sand with mono numerals." This is the kind of surface that should be **ALL mono** — it's literal math. **Change:** render the entire formula block in **JetBrains Mono 400 13px `color: sand`** with `ivory` for the operators and `oxblood-soft` for the equals sign `=`. Reads like a printed almanac reference page. Never mix serif with literal formulae.
- **agent-6 §Weekly Review Skeleton shimmer caption:** currently not a clear text spec; ensure any skeleton text uses **italic-serif dust** not Inter dust.

### 4.3 Is JetBrains Mono doing real work?

**Real work (KEEP):**
- Timestamps (`06:42`, `APR 17 22:03`) — canonical mono-for-timestamps usage.
- "Edition N" numerals — print-reference mono.
- Macro values in chart tooltips — aligns columns.
- Portion units (`280 g`, `240 ml`) — canonical mono-for-measurements.
- Heatmap day-numbers — dense-grid alignment.
- Hotkey chip `/` in search input — kbd-glyph convention.
- Footnote-style `P · C · F` labels — annotation mono.

**Ornamental (REDUCE):**
- **agent-3 §Macro Bars `m-pct` "{pct}%" in Inter at 10.5px w/ tabular-nums:** the `%` values here are numeric but used as labels. Currently Inter tabular-nums which is fine; but since they're already getting tabular treatment, they'd feel more "ledger-correct" in **JetBrains Mono 10.5px**. Converting `m-pct` to mono strengthens the numerical-row reading.
- **agent-3 §Footer annotations "{entryCount} entries · {pctOfTarget}% of daily target · {lastLoggedAt} last logged":** currently Inter 500 10.5px UPPERCASE. The numeric portions (`5 entries`, `73%`, `18:42`) are numerics dressed as labels. **Change:** render the whole row in **JetBrains Mono 400 10.5px** (not UPPERCASE, not Inter) — reads as a true footnote row, not as a CAP row pretending to be data. Three mono sub-values separated by middot.

### 4.4 Missed typographic opportunities

- **Ligatures:** none of the fragments explicitly opt-in to **Newsreader's discretionary ligatures** (`font-variant-ligatures: discretionary-ligatures;`). Add to `.serif` utility in agent-1 §3.3 — free editorial flourish (st/ct/ffi ligatures render beautifully in body copy).
- **Small caps:** Newsreader supports `font-variant-caps: small-caps;`. Currently unused. Assign to: **agent-3 §Weekly Insight Card byline "Penned by Kalori, resident model"** — render "KALORI" in Newsreader small-caps. Reads printed-attribution.
- **Optical sizing:** Newsreader has `opsz` axis 6..72 (noted in agent-1 §3.1). Fragments don't explicitly set `font-optical-sizing: auto;` on the global `.serif` utility. Add to agent-1's `@theme` or global.css — this is free quality at every size tier.
- **Oldstyle figures:** agent-1 mandates tabular+lining figures via `.num`. Consider a **second utility** `.num-editorial { font-variant-numeric: oldstyle-nums proportional-nums; }` for inline serif-body prose — e.g., in the Weekly Insight Card bullets ("Your protein is up 12% over last week"), the `12` should be oldstyle (proportional) to flow with the serif body, not tabular-lining (that's for columns). Currently agent-3 mandates `.num` everywhere — refine the rule: `.num` for tables/charts/values, `.num-editorial` for inline body prose.

---

## 5. Layout + Composition Audit

**frontend-design skill guidance cited:** *"Spatial Composition: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density."*

### 5.1 Where do fragments defer to safe symmetrical 12-col grids?

| Location | Current | Editorial alternative |
|---|---|---|
| **agent-3 §Dashboard desktop composition** — 3-column `[sidebar 240 | center flex | right-panel 320]` with Masthead spanning full content width | Safe-symmetrical. | Introduce **asymmetric column widths**: `[sidebar 240 | chronometer+macros 7-col | water+micros 4-col | insight 3-col]` using a 14-col inner grid (not 12). Masthead spans 11 cols of the 14, leaving 3 cols on right for a **"Today's weather / day's mood"** italic-serif marginalia column (a small typographic flourish — the weekday's characterful tagline). Breaks the symmetric SaaS dashboard and creates visual rhythm. |
| **agent-4 §Confirmation Screen items list** — single-column stacked rows: `[name+sub | stepper | macros-strip | kcal]` | Safe-horizontal. | Break 1 row out of every N into a **"featured entry"** format: name on its own row at 22px, portion sub on a second row flush-right, stepper + macros + kcal on a third row. Gives the list variation; reads like a bulletin with featured articles. |
| **agent-5 §Library Grid 4-col desktop** | Ruled grid is already characterful — KEEP. | One refinement: **every 5th cell** (or: cells corresponding to items with `log_count ≥ 20`) gets a 1px oxblood LEFT rule inside the cell, at `left: 12px`. Reads as a "marginalia highlight" — like a reader's underline. Quiet, editorial. |
| **agent-6 §Progress 2-col grid (desktop)** — charts pair-stacked | Safe. | Break the grid at the heatmap: Calorie Adherence + Macro Distribution as 2-col row 1; Weight Trajectory + Water as 2-col row 2; **Heatmap spans full-width row 3** (already specified — good); Weekly Review spans full-width row 4 (already specified — good). KEEP. |
| **agent-6 §Onboarding Step 4 Biological Sex** — two chips side-by-side | Binary choice, symmetric. | Re-lay as **two columns with a serif-rule between**: `[FEMALE block — full description + button]` *hairline vertical rule* `[MALE block — full description + button]`. Makes the choice feel like two pages of a reference book, not two mobile-UX buttons. |
| **agent-6 §Settings subsection layout — 220px left rail + content** | Standard admin dual-pane. | Introduce **an italic-serif marginalia column on the right**: 2-col content area becomes 3-col `[220px rail | 1fr content | 180px marginalia]`. The marginalia carries contextual notes per subsection (e.g., on §TARGET: *"Auto-recalc uses Mifflin & St Jeor — an equation dating to 1990."*). Reads like a textbook margin. |

### 5.2 Where are there missed opportunities for controlled density?

**frontend-design guidance:** *"the 'printed page' feel of many small elements in one grid."*

- **agent-3 §Dashboard right-panel stack (Water + Micros):** currently just two vertically-stacked cards. Could be DENSER. **Add:** between them, a 1-line editorial annotation strip: *"the minor elements have been running warm, vitamin D especially"* (italic serif 14px sand, single line with a 1px top + 1px bottom rule framing it). Reads like a newspaper's "editor's note" column separator.
- **agent-6 §Heatmap card (§5):** the card contains header + table + footer. There's a "meta" block top-right with *"A signature view."* + "hover a cell for the exact figure" mono instruction. Could be denser. **Add:** a 3rd-column meta stack: `LAST SCAN` (mono date), `NEXT RECALC` (mono date), `DATA POINTS` (N count). Fills the top-right dead zone with ledger-correct metadata.
- **agent-5 §Library grid card text zone:** at 240×240 the text zone has 45% = ~108px. Currently shows name (2 lines) + portion + dotted rule + kcal + P·C·F. Could be DENSER. **Add:** above the dotted rule, a mono `first filed · MAR 14` date stamp (8.5px JetBrains Mono `dust`). Four data points in one card reads like an archival index-card.

### 5.3 Where does whitespace feel wasted vs earned?

**Earned whitespace (KEEP):**
- agent-3 Dashboard Masthead's vertical rhythm (22px→18px→104px→hairline).
- agent-6 Weekly Review's `padding: 40px 32px` — generous for editorial breathing room.
- agent-5 Library drill-in 56px top bar + generous hero thumbnail zone.

**Wasted whitespace (TIGHTEN):**
- **agent-6 §Onboarding each step's `padding: 48px` + `max-width: 640px` + vertically centered:** each step is currently a SEA of empty space with a single input + two buttons. **Change:** bring the visible content upward to the top-third of viewport (aligned to a masthead-like kicker strip), not vertically-centered. Empty-centered-form is the most generic onboarding pattern on the web.
- **agent-5 §7 Food Detail Sheet mobile full-sheet:** the 48px top drag-handle zone + generous spacing between sections leaves a lot of air. Some is earned; but consider **tightening section-to-section margin from 32px to 20px** on mobile to fit more content above the fold.
- **agent-4 §Undo Toast on desktop — 480px wide, 56px tall:** fixed-width toast looks thin against a 1280px viewport. **Consider:** toast width scales to content, min 360px max 640px. Centered. Tighter and more characterful.

### 5.4 Grid-breaking opportunities

- **agent-3 Dashboard weekly-insight card:** currently "sits below the right panel on standard desktop, spans full center width." Consider **overlapping**: the card's oxblood left-rule extends 12px up INTO the chronometer row above, visually linking "today's figure" to "the week's editorial." Diagonal/overlap reads characterful per frontend-design.
- **agent-5 Library drill-in sheet on desktop:** currently "640px right-side overlay." Consider: the hero thumbnail **bleeds past the right edge** of the main content area (overflow-x: visible) by 24px into the sidebar gutter. Single detail, reads print-design (bleed-past-margin).
- **agent-6 Heatmap mobile transposed layout (480–767px with range=30d):** currently transposes axes. Consider: the transposed grid's nutrient column headers rotate **-90°** so the names read vertically. Reads print-table-correct rather than app-table-correct.

---

## 6. Motion Orchestration

### 6.1 Does the motion system feel curated or scattered?

**Verdict: Curated in the foundations (agent-1 §6), but scattered in execution across fragments.**

The motion **tokens** (`micro 120 / standard 180 / expressive 320 / chrono 600`) are disciplined. But each fragment defines its own mini-vocabulary of motion moments, and some don't match the ink-settling philosophy from the brief.

**Scattered executions flagged:**
- **agent-4 §Undo Toast enter = "180ms slide-up + fade":** slide-up is a Material Motion pattern (Snackbar). **Change:** replace slide-up with a **draw-in from right** — toast's left edge grows from 0 to full width over 180ms, reading as a hairline rule being drawn across the page. Matches `rule-draw` motion. No slide. Ink, not bounce.
- **agent-4 §Log modal mobile entry "180ms slide-up from bottom":** also Material. **Change:** replace with **180ms opacity-0→1 + bg-scrim darken** (no translate). The modal "materializes" on the page like a section of a journal appearing when you turn the page. More Ledger-correct.
- **agent-5 §7.1 drill-in sheet shared-element transition:** currently "320ms Framer Motion layout animation." Good direction but **ensure the thumbnail scales without rotation, and that the card's hairline rules appear to REDRAW (via rule-draw) at the sheet's new frame position** rather than magically appearing. Explicit call in the spec: the sheet's surrounding hairlines should animate in with `rule-draw` 320ms, staggered 60ms after the thumbnail reaches its hero slot. Telegraphs "the page is being typeset."
- **agent-6 §Range-chip active swap:** currently "PPR re-render streams per Suspense." But the chip-visual swap (bg-transparent → bg-ivory) should use the NAMED `ink-fade` token (120ms) explicitly. Scattered fragment-level timings — enforce the global token names.

### 6.2 Identify a signature motion moment

**The chronometer ring's 600ms stroke-dashoffset draw IS the signature** — correctly specified in agent-3 §Chronometer Ring Motion spec. **KEEP EXACTLY.**

Surrounding motion should CHOREOGRAPH around the chronometer, not compete with it. Proposed Dashboard page-load choreography (insert into agent-3 §Dashboard Page Composition):

```
t=0       page-settle begins (320ms opacity fade on main content)
t=80ms    masthead typography settled (opacity 1)
t=120ms   section kicker `§ 01` inks in (ink-fade 120ms on kicker text)
t=180ms   chronometer compass circle + tick marks appear (inherited from RSC paint)
t=200ms   chrono-draw begins (600ms stroke-dashoffset on consumed arc)
t=400ms   macro bars begin rule-draw in parallel (320ms each, 40ms stagger)
t=560ms   meals bulletin entries fade in (220ms, 40ms stagger, capped at 20)
t=800ms   chronometer projection arc fades in (ink-fade 120ms) — the dashed ember layer
t=1000ms  water tracker + micros panel complete
t=1200ms  weekly insight card renders (PPR-deferred; may be later)
```

This creates **one orchestrated moment, not N independent moments.** Document as `lib/motion/dashboard-choreography.ts` exporting `getDashboardStaggerDelay(element)`. Reduced-motion: all stages collapse to instant-paint.

frontend-design principle cited: *"Use animations for effects and micro-interactions… Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions."* This section implements that exactly.

### 6.3 Motion decisions that feel generic vs editorial

**Generic (REPLACE):**
- **agent-6 §Onboarding progress dashes "rule-draw 320ms scaleX 0→1 with transform-origin: left":** CORRECT — this is editorial. KEEP as-is. Agent-6 got this right.
- **agent-6 §Weekly Review "bullets stagger in at 60ms intervals after hero":** generic staggered-fade pattern, but in context (literary pull-quote with bullets as sub-points) it reads editorial enough. KEEP but ensure each bullet's em-dash prefix `—` fades in SEPARATELY 60ms before the bullet text — reads as the editor writing each dash then filling in the sentence. Sequenced ink.
- **agent-2 §Tablet rail expand "180ms width" transition:** generic animate-width pattern. **Change:** replace with `motion-page-turn: 480ms` + ease-editorial, AND have the labels ink-fade from opacity 0 at 40% progress — creates an illusion of "turning to a new page" where the rail is the spine unfolding. Not just a panel expanding.
- **agent-4 §Capture button press "120ms scale 1→0.96→1":** scale is generic. **Change:** replace with 120ms opacity (1→0.85→1) + a 2px ivory inner stroke that briefly appears for 120ms. Feels like a shutter clicking, not a button scaling. Matches camera metaphor.
- **agent-5 §Library card press "scale(0.97) / motion-micro 120ms":** generic press-pattern. **Change:** replace with `background: bg-0 → bg-2 → bg-1` tonal ripple over 180ms (3 tonal steps). "Paper depresses slightly darker, then recovers" — matches Ledger's tonal-only hover philosophy (no scale).

**Editorial (KEEP):**
- Chronometer `chrono-draw` 600ms — gold-standard signature.
- Heatmap row-by-row fade-in with 40ms stagger — "cells inking in."
- Drop cap fade-in 120ms AFTER body text — "the letter lands last."
- `rule-draw` on section boundaries — "the hairline draws."
- `ember-pulse` on save confirmation — "a warm mark of acknowledgement."

### 6.4 Missing motion moments worth adding

- **Route change between Dashboard → Library → Progress:** currently "page-settle opacity crossfade." Add: the masthead's double-hairline rule **redraws** on every route change (rule-draw 320ms). Cheap, characterful, unifies every page-transition.
- **Save-to-Ledger button press (agent-4 §Save action):** currently not specified. Add: button's `+` mark on press-down transforms into a `✓` (both Newsreader 400) via 120ms ink-fade. A literal "file-it" gesture.
- **Merge dialog per-field radio change (agent-5 §8.9):** currently "ink-fade 120ms on the radio dot." Good. Enhance: also trigger an `ink-fade` 120ms on the live preview's corresponding field. Sequenced: dot fades → preview re-renders 60ms later. Users see cause-and-effect.
- **Weight entry save (agent-6 §Weight Trajectory click-to-edit):** currently pessimistic save with no distinct motion. Add: the new dot on the line chart **materializes** via `ember-pulse` (opacity 0→1 + scale 0.8→1) 180ms — one quiet mark of acknowledgement.
- **Account delete Step 3 countdown:** per §2.6 item 7 above, replace digit-clock with tolling bullets. Each bullet fills with a 1000ms `ember-pulse` (opacity 0.4→1.0 on toll, hold, then lock at 1.0). Aural metaphor in visual form.

---

## 7. Specific Overrides + Recommendations — per fragment

### 7.1 agent-1 (Foundations)

**Keep:**
1. Three-typeface pairing (Newsreader + Inter + JetBrains Mono) — characterful, non-generic, well-role-defined. frontend-design compliance: ✓
2. Zero-radius default + documented circle-exception list (§4.2) — disciplined, preserves visual identity.
3. Single easing curve `cubic-bezier(0.2, 0.8, 0.2, 1)` — consistent ink-settling motion philosophy.

**Change:**
1. **§3.3 `.num` utility:** split into `.num` (tabular-lining for columns) and `.num-editorial` (oldstyle-proportional for inline body). Rationale in §4.4 above.
2. **§6.1 Motion tokens:** add `--motion-page-turn: 480ms` for page transitions. Rationale in §2.1 item 2 above.
3. **§5.1 Spacing scale:** add `--spacing-gutter-editorial: 28px` token for broadsheet gutters. Rationale in §2.1 item 3 above.

**Add:**
1. **§3.x new subsection "Discretionary OpenType features"** — global opt-in: `.serif { font-variant-ligatures: discretionary-ligatures; font-optical-sizing: auto; }` on the serif utility. Free editorial polish.
2. **§4.x new subsection "Print-register motion vocabulary"** — catalog of named motion moments the app uses (rule-draw, ink-fade, chrono-draw, ember-pulse, page-turn) with CSS variable timings.

### 7.2 agent-2 (Navigation)

**Keep:**
1. Desktop sidebar with masthead-inside-sidebar architecture — gives the content column full-width canvas. Characterful layout choice.
2. FAB as zero-radius square with custom SVG glyph (not Phosphor) — correct per Ledger rule and preserves identity.
3. Vim-style `g d / g l / g p` leader shortcuts — distinctive and editorial (the g-prefix reads like a "goto" marginal annotation).

**Change:**
1. **§Desktop Sidebar Nav list:** downsize icons to 18×18 and right-align them within each row (labels flush left). Rationale in §2.2 item 2 above.
2. **§Mobile Center FAB glyph:** replace `+` with typographic `§` or a hairline-rule-plus-vertical mark. Rationale in §2.2 item 4 above.
3. **§Mobile Bottom Tab Bar:** replace Phosphor icons with JetBrains Mono single-letter mnemonics `D L P S`. Rationale in §2.2 item 3 above.

**Add:**
1. **§Desktop Sidebar: `§ NAVIGATION` kicker** above the nav list. Rationale in §2.2 item 1 above. Matches design-doc §9 ASCII sketch.
2. **§Mobile top strip:** oxblood bullet between date + edition + serif italic `— No. 142`. Rationale in §2.2 item 5 above.

### 7.3 agent-3 (Dashboard)

**Keep:**
1. Chronometer ring spec with Roman numerals, now-indicator triangle, dual-arc (consumed + projection), 82px center. Signature moment — gold.
2. Meals Bulletin as 5-column ruled grid with kickers and italic serif food names. Metaphor operational.
3. Weekly Insight Card with drop cap + 2px oxblood LEFT rule + byline. Editorial voice made concrete.

**Change:**
1. **§Macro Bars composition:** vary the three rows (protein standard, carbs inverted, fat split). Rationale in §2.3 item 2 above.
2. **§Footer annotations under chronometer:** render in JetBrains Mono 10.5px (not Inter UPPERCASE). Rationale in §4.3 item "Ornamental" above.
3. **§Water Tracker bullets:** alternate circle/square shapes OR add italic serif numerals inside each filled bullet. Rationale in §2.3 item 3 above.

**Add:**
1. **§Dashboard Page Composition — orchestrated page-load choreography:** document the t=0 through t=1200ms stagger sequence. Rationale in §6.2 above.
2. **§Weekly Insight Card:** change `"VIEW FULL REVIEW →"` link to typographic `⟶ read the full account`. Rationale in §2.3 item 5 above.

### 7.4 agent-4 (Log Flow)

**Keep:**
1. Three-tab modal (Type / Snap / Library) with shared Confirmation Screen — correct information architecture, characterful grouping.
2. "Why these numbers?" expandable panel with `bg-2` inset + 1px ember left border + italic serif body. Editor's-voice moment.
3. LIFO undo-toast stack with 5-second grace window. Load-bearing cross-cutting pattern; documented well.

**Change:**
1. **§Portion Picker stepper layout:** replace boxed-stepper with flush-left-serif-and-italic-sub-row pattern. Rationale in §2.4 item 2 above.
2. **§Confirmation Screen Meal slot picker:** replace 4 chips with 4 kicker-rows with active-state 2px oxblood left border. Rationale in §2.4 item 3 above.
3. **§Undo Toast left rule:** change from 2px `oxblood` to 2px `ember` (preserves signature for editor's-voice only). Rationale in §3.1 above.
4. **§Undo Toast countdown bar:** replace horizontal bar with 5-bullet countdown series. Rationale in §2.4 item 5 above.
5. **§Tab switcher active-state:** add serif-end-caps to the oxblood underline; add 1px rule above non-active tabs. Rationale in §2.4 item 1 above.

**Add:**
1. **§Save-to-library toggle:** add `FILE UNDER ⟶ {normalized-name}` typographic flourish. Rationale in §2.4 item 4 above.
2. **§Save-to-Ledger button press motion:** `+` mark ink-fades to `✓`. Rationale in §6.4 above.

### 7.5 agent-5 (Library)

**Keep:**
1. `gap: 0` ruled-grid aesthetic — disciplined decision, print-correct, distinctive.
2. Letter-mark algorithm for non-photo items — covers Vietnamese/Polish/diacritics edge cases characterfully.
3. Shared-element transition on card-to-drill-in (desktop/tablet) — editorial-print "spread" feel.

**Change:**
1. **§5.2 Letter-mark background:** revert to `bg-2` with 2px oxblood TOP rule + `sand` letter. Rationale in §3.1 above (agent-5's own §14 flags this).
2. **§5.5 Selection checkbox chip:** replace generic square with user's wordmark-initial `K` stamp. Rationale in §2.5 item 3 above.
3. **§7.3 Drill-in sheet back affordance:** replace `«« BACK TO LIBRARY` with `← INDEX` and italic-serif `close`. Rationale in §2.5 item 4 above.
4. **§9.3 Bulk Delete dialog copy:** replace `DELETE {N} ITEMS?` with `Strike {N} titles from the record?` in Newsreader italic serif. Rationale in §2.5 item 6 above.
5. **§5.2 count-badge:** replace pill with typographic `× 47` stamp at -3° rotation, only for `log_count ≥ 10`. Rationale in §2.5 item 2 above.

**Add:**
1. **§5.3 text zone:** add a mono `first filed · MAR 14` date stamp above the dotted rule. Rationale in §5.2 item "Library grid card" above.
2. **§7.4 Food Detail kcal hero:** wrap in a 4-sided hairline frame with 4 ember corner labels (`source`, `recorded`, `portion`, `date`). Rationale in §3.3 item above.

### 7.6 agent-6 (Progress + Remainder)

**Keep:**
1. Micronutrient heatmap 7×N grid with warm-ramp color ladder (c0-c9), editorial footer note template, italic-serif row names. Signature analytical view.
2. PPR Suspense boundary on Weekly Review Island — correct architecture-meets-design decision (Gemini latency is decoupled from progress-page first paint).
3. Weekly Review drop cap at 82px oxblood (used ONCE in the app) — preserves the mockup's single-drop-cap rule.

**Change:**
1. **§Water Adherence bar fill:** change from `oxblood` to `slate` to match dashboard water-bullet + reserve oxblood. Rationale in §3.1 above.
2. **§Range toolbar chip labels:** replace uppercase `7D / 30D / 90D / 1Y` with lowercase italic-serif `seven d. · thirty d. · ninety d. · one y.`. Rationale in §2.6 item 1 above.
3. **§Onboarding Step 1 composition:** replace vertical-centered with asymmetric top-left wordmark + indented tagline + flush-right button + horizontal-rule divider. Rationale in §2.6 item 4 above.
4. **§Account Delete Step 3 countdown:** replace digit-clock with 10-bullet tolling ruler + italic-serif text ticks. Rationale in §2.6 item 7 above.
5. **§Login form layout:** restructure with asymmetric wordmark + horizontal rule + flush-left form + flush-right tagline. Rationale in §2.6 item 6 above.
6. **§Weight Trajectory projection segment color:** assign `plum` (currently unused). Rationale in §3.2 above.

**Add:**
1. **§Onboarding Step 8 calorie display:** add em-dash flankers + italic-serif citation `by the equation of Mifflin & St Jeor`. Rationale in §2.6 item 5 above.
2. **§PWA Install Prompt:** redesign with folded-letter visual metaphor (dotted tear-line, left-indent, ribbon-tab button). Rationale in §2.6 item 8 above.
3. **§Chart tooltips (all sections):** add 2px oxblood left rule to tooltip container — unifies with Weekly Insight + Undo Toast as the "commentary chrome" signature. Rationale in §2.6 item 3 above.
4. **§Weekly Review bullets:** em-dash `—` prefix fades in 60ms BEFORE bullet text. Rationale in §6.3 above.

---

## 8. Stack + Library Concerns

### 8.1 Does the design depend on any library from "Stacks to Avoid"?

**Reviewed against the `ui-design` skill's "Stacks to Avoid" list (MUI, Ant Design, Bootstrap-heavy, NativeBase, Magnus UI):**

**Clean.** No fragment specifies MUI, Ant, Bootstrap, NativeBase, or Magnus UI. The fragments correctly depend on **shadcn/ui primitives** (Radix-based) for a11y-critical components: `DropdownMenu` (agent-5 §3.3), `ContextMenu` (agent-5 §5.7), `Tooltip` (agent-5 §6.3), `Dialog` (agent-5 §8 merge, §9 bulk delete), `Tabs` (agent-4 §Tab switcher). This is the `web-ui-guide.md` Quick-Pick canonical foundation.

### 8.2 Does it leverage shadcn/ui primitives appropriately?

**Yes, with one caveat.** shadcn/ui primitives are used for state/a11y-primitives, and the fragments consistently override Ledger's visual identity (zero-radius, oxblood accents, custom typography). This is exactly the intended shadcn usage: primitives for plumbing, custom CSS for aesthetic.

**Caveat — note about Radix maintenance (per web-ui-guide.md §3):** *"Radix UI maintenance concern as of late 2025; React Aria and Base UI emerging as alternative primitives."* The fragments lean heavily on Radix (`Radix DropdownMenu`, `Radix Tooltip`, `Radix ContextMenu`). If shadcn/ui migrates to Base UI or React Aria in the MVP timeline, a small primitive-layer swap may be needed. **Recommendation to main agent:** add a one-line note in agent-1 §Component Primitives acknowledging the dependency on Radix via shadcn and documenting the migration path if shadcn swaps primitives pre-launch.

### 8.3 Animation library choices — citing web-ui-guide.md Quick-Pick Decision Table?

**Review per fragment:**

| Fragment | Animation need | Library choice | web-ui-guide.md table cite? |
|---|---|---|---|
| agent-1 §6.5 | Page transitions, component enter/exit | Framer Motion (`lib/motion/defaults.ts`) | Page/route transitions + layout animations → **Motion (Framer Motion)** — table correct. ✓ |
| agent-3 §Chronometer Motion | SVG stroke-dashoffset draw (600ms) | CSS transition on SVG stroke-dashoffset | NOT in decision table; but correct — a named pattern "scroll-triggered SVG draw" per Codrops pattern source (§18 of web-ui-guide). Uses **0 KB extra** (pure CSS-SVG). ✓ |
| agent-3 §Meals Bulletin "entries fade in sequentially 220ms with 40ms stagger" | Staggered list reveal | Framer Motion (already imported) OR Motion `whileInView` | Table: Scroll-triggered reveals (simple) → **Motion `whileInView` ⚛, 0 KB extra.** ✓ |
| agent-3 §Water Tracker "bullet fill animation" | Single-element fill animation | Framer Motion | Tab-wiki: use Motion for single elements — ✓ |
| agent-5 §7.1 Drill-in shared-element transition | layout-id shared-element animation | Framer Motion `layoutId` | Table: Page/route transitions + layout animations → **Motion (Framer Motion) layoutId** — table correct. ✓ |
| agent-6 §Heatmap row-by-row fade-in with 40ms stagger | Staggered list reveal | Framer Motion / CSS `@keyframes` + `animation-delay` | Either works; CSS `@keyframes` with `calc(var(--row-index) * 40ms)` (as agent-6 §5 Motion specifies) — **0 KB bundle cost, Claude Code excels at this pattern** per web-ui-guide §8. ✓ |
| agent-6 §Weekly Review Skeleton shimmer | Skeleton pulse | CSS `@keyframes shimmer 1.6s infinite ease-in-out` | Also 0-KB pure-CSS. ✓ |
| All fragments `prefers-reduced-motion` fallback | Reduced-motion | `MotionConfig reducedMotion="user"` (Framer) + CSS media-query | Table §12: Motion → `<MotionConfig reducedMotion="user">`. ✓ |

**No animation library choice deviates from web-ui-guide.md Quick-Pick recommendations.** No heavier libraries (GSAP, Lottie, Rive, React Three Fiber, Vanta) are invoked — correct for a broadsheet-editorial aesthetic where motion is "ink settling" and does not need GPU-intensive WebGL.

**One potential upgrade flagged (not a bug):** If the team wants a **scroll-driven chronometer re-draw** (e.g., the chronometer arc re-animates when user scrolls it back into view on a long dashboard), that would need GSAP ScrollTrigger (per Quick-Pick table: "Scroll-triggered reveals (advanced) → GSAP ScrollTrigger, ~25 KB"). Not specified in any fragment; not needed for MVP. Noted for post-MVP if requested.

### 8.4 Smooth scrolling

**None of the fragments specify Lenis** (industry-standard smooth scroll per web-ui-guide §7). For a broadsheet-editorial app, **smooth scrolling is appropriate** — it reinforces the "turning a page" feel. **Recommendation:** add Lenis (~8 KB, framework-agnostic) to the global app shell in agent-2 or agent-1 foundations. One-line `<ReactLenis root>` wrapper in `app/layout.tsx`. Respects `prefers-reduced-motion: reduce`. Cheap and on-brand.

---

## 9. Aesthetic Risks for This Project

Places where "The Ledger" aesthetic could collapse during implementation if a dev is lazy or misreads the spec:

### 9.1 Risk — "The oxblood flood"

**Risk:** A junior developer interprets "oxblood is the signature accent" as "use oxblood liberally for anything that needs to pop" — and suddenly the active-state nav bar, the CTA button fill, the Weekly Insight left rule, the Undo Toast left rule, the library letter-mark background, the progress-page water adherence bar, the section kickers, and more are all oxblood. The signature diffuses into noise.

**Preempt in design doc:** Add a binding rule to agent-1 §2.1 under the `oxblood` row: *"Oxblood is the SIGNATURE. It appears on at most 2–3 non-transient elements per screen. Secondary accents (oxblood-soft, ember, ochre, moss, slate, plum) carry the remaining weight. If a design spec calls for more than 3 oxblood surfaces on a single screen, push one to ember or oxblood-soft."* Back with a lint-rule suggestion: count `--color-oxblood` references in a page's rendered CSS and warn at > 4.

### 9.2 Risk — "The radius creep"

**Risk:** Developers adding a new surface (a new modal, a new chip, a new banner) reach for "it should match the platform, let's add a small radius — 2px, 4px, won't hurt." Zero-radius discipline erodes 1 component at a time.

**Preempt:** agent-1 §9.3 already specifies `no-radius-other-than-zero-or-full` ESLint rule. Make sure this rule ships in Task 1.1 (foundation task). Also document in CLAUDE.md / ui-design.md a short "Ledger Inviolables" section: (1) no radii except circle exceptions, (2) no shadows, (3) no backdrop-blur, (4) no gradient structure, (5) no Material-style ripple, (6) no bouncing spring physics. 6 hard prohibitions.

### 9.3 Risk — "The Inter creep"

**Risk:** Newsreader is heavier to hint-render than Inter; developers notice a tiny FOUT or CLS on some screens and "temporarily" swap a body-copy surface to Inter "until Newsreader loads." That surface stays Inter. Over time the serif identity erodes.

**Preempt:** agent-1 §3.4 specifies `next/font` loader with `display: "swap"` — confirm this is documented as NON-negotiable. Add a note: *"Never fall back to Inter for Newsreader body copy surfaces. If Newsreader fails to load, rely on the font stack (Tiempos Display → Georgia → serif). Do NOT substitute with Inter — it breaks the visual metaphor."* Back with a visual regression test that flags any `<p>` or pull-quote rendering Inter.

### 9.4 Risk — "The safe-symmetric grid relapse"

**Risk:** A developer implementing the asymmetric dashboard layout (per §5.1 recommendation) finds CSS Grid with 14 columns finicky, simplifies to a 12-col Tailwind standard, and the dashboard visually collapses to the same SaaS symmetry as every other dark dashboard.

**Preempt:** Document the asymmetric composition explicitly in agent-3's final spec (not just as a suggestion). Commit to the 14-col inner grid or a CSS-Grid template-areas approach that's hard to accidentally "simplify." Include a Playwright visual regression test that compares the Dashboard rendered composition against a reference screenshot from the mockup.

---

## 10. Summary for main-agent assembly

**Top 3 findings that warrant main-agent attention during assembly:**

1. **Reclaim oxblood's signature via discipline** — agent-5 letter-mark bg, agent-6 water adherence bar, agent-4 undo toast left rule should each lose oxblood in favor of `bg-2` (+ oxblood top rule), `slate`, and `ember` respectively. Every fragment's author diffused oxblood independently; main-agent consolidation is the gate. See §3.1.

2. **The Log Flow's Portion Picker + Meal slot chips + Undo Toast countdown are the three biggest "AI-slop drift" surfaces** — and they're in the most-frequently-used flow (log food). Fixing all three (serif-stepper, kicker-rows, 5-dot countdown) per §2.4 is high-impact characterfulness work. Do not let this flow ship as the most generic surface in the product.

3. **Orchestrate the Dashboard page-load as a single signature moment** — per §6.2, the 0ms → 1200ms staggered choreography (masthead → kicker → chronometer `chrono-draw` → macro bars `rule-draw` → meals bulletin ink-fade → projection arc → rest) IS the product's most-experienced motion event. It should be codified as `lib/motion/dashboard-choreography.ts` and documented in agent-3's final spec, not left as per-component independent motion that may or may not align in practice.

Additionally, four strategic adds that will elevate characterfulness with minimal implementation cost:
- **Add Lenis smooth scrolling** globally (§8.4) — ~8 KB, on-brand.
- **Add `font-variant-ligatures: discretionary-ligatures`** to the serif utility (§4.4) — 0 KB, editorial flourish.
- **Add `--motion-page-turn: 480ms`** as an intentionally-non-power-of-2 duration (§2.1) — anti-generic.
- **Add the `§ NAVIGATION` kicker** in agent-2's sidebar (§2.2) — free editorial grammar, design-doc §9 supports it.

---

*End of Pass 2 design-lead enrichment delta.*

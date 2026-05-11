# Design Brief: Calorie & Nutrition Tracking Web App (Working Name: *Kalori*)

Design a **fully responsive web app** that works seamlessly on mobile (375px), tablet (768–1024px), and desktop (1280px+). I need high-fidelity mockups for every breakpoint of every screen, a full design system, and motion specs I can hand directly to Claude Code for implementation in Next.js + React + Tailwind.

**Important**: This is a web app, not a native mobile app. Use web-native controls, patterns, and interactions. Hover states matter on desktop. Keyboard navigation matters. But every interaction must also work with touch.

> **Inspiration references**: [User will attach 2–3 inspiration images separately. Treat them as directional only — pull a color move, a chart style, a layout rhythm if it fits, but don't replicate. The identity below is the source of truth.]

---

## 1. Product Vision

A premium, AI-first nutrition tracker accessed through the browser. Users set a goal once, then log food three ways: **natural-language text**, **photo upload with AI recognition**, or **one-click re-add from their personal food history**. The app tracks not just calories and macros but also micronutrients — vitamins, minerals, fiber, sodium — whatever the AI can extract. Progress lives in a data-rich dashboard with daily / weekly / monthly views.

**Positioning**: What Linear is to project management, this is to nutrition tracking. Professional, confident, fast — not cutesy, not gamified with cartoon broccoli.

**Key differentiator — no global food database**: We deliberately don't ship a 10-million-item food database users have to search through. Instead, the AI parses whatever the user enters (text or photo) and the app builds a **personal food library** over time. Re-logging "my usual lunch" becomes one click.

---

## 2. Target User

Health-conscious adults (25–45) who've tried MyFitnessPal and Lose It and found them slow, ugly, or ad-bloated. They pay for quality. They use the app across devices — phone during meals, laptop for weekly review.

---

## 3. Responsive Strategy

Design three breakpoints in full for every screen:

| Breakpoint | Width | Layout Pattern |
|---|---|---|
| Mobile | 375–767px | Single column, bottom tab bar (5 tabs), full-width cards, FAB for logging |
| Tablet | 768–1279px | Collapsible left rail nav, 2-column where appropriate, no bottom bar |
| Desktop | 1280px+ | Persistent left sidebar nav, 3-column dashboard, hover states, keyboard shortcuts |

**Desktop-specific patterns** to design:
- Left sidebar nav with icon + label, collapsible to icon-only
- Optional right-side detail panel (e.g., for food detail without leaving dashboard)
- Keyboard shortcuts: `N` to log food, `/` to search personal library, `D/W/M` to switch progress views, `?` to open shortcut help
- Hover reveals for secondary actions (edit, delete, duplicate meal)
- Drag-and-drop for photo upload anywhere on the app

**Mobile-specific patterns**:
- Bottom tab bar: Dashboard / Log / Library / Progress / Profile
- FAB (floating action button) bottom-right for quick photo capture
- Swipe-left-to-delete on entries
- Pull-to-refresh on dashboard

**Tablet**: Bridge between the two — collapsible rail, no FAB (use a header button instead), 2-column dashboard.

---

## 4. Visual Direction

### Theme
Dark mode only. Commit fully — don't design a dark theme that looks like an inverted light theme.

### Palette
- **Base**: Near-black with a slight warm bias (`#0A0B0E` → `#14161B` gradient base). Not pure black.
- **Surface layers**: 3-tier elevation system using subtle translucency and hairline borders (`rgba(255,255,255,0.06)`).
- **Primary accent**: Electric green (`#00E676`-ish) — reserved for "under calorie budget" states and primary CTAs.
- **Secondary accent**: Warm amber (`#FFB020`) — for "approaching limit" and warnings.
- **Danger**: Saturated coral (`#FF5C5C`) — for "over budget."
- **Data viz palette**: 6-color categorical palette tuned for dark backgrounds — teal, violet, coral, amber, sky, lime. Include hex codes in the design system.
- **Glow / ambient lighting**: Soft radial gradients behind hero numbers so accent colors bleed into the background. This is the signature visual move.

### Typography
- **Display / numbers**: Geometric variable sans with tabular numerals (Inter Display, Geist, or SF Pro Display). Hero calorie numbers 56–72px desktop / 44–56px mobile, weight 600, tight tracking.
- **Body**: Same family, 15px desktop / 14px mobile, weight 400.
- **Monospace**: JetBrains Mono or Geist Mono for timestamps, macro breakdowns.

### Iconography
Stroke icons at 1.5px weight. Lucide or Phosphor (Duotone variant).

### Shape language
- Border radius: 16px cards, 12px inputs, 999px pills, 24px modals.
- Hairline dividers only — no heavy borders.
- Depth through blur + translucency, not drop shadows.

---

## 5. Motion & Animation

Core product value, not decoration. Spec every interaction.

### Libraries to design for (web stack)
- **Framer Motion** — component animations, layout animations, shared element transitions.
- **GSAP** — orchestrated sequences (onboarding reveals, dashboard load choreography).
- **Lottie** — celebratory moments, empty states, loading states.
- **React Spring** — physics-based interactions (optional; use Framer's spring config instead if cleaner).
- **Recharts** or **Visx** — animated charts. Custom SVG for the calorie ring.

### Required motion moments
1. **First paint of dashboard** — Orchestrated reveal: ring draws from 0 to value (spring, ~1.2s), macro bars fill left-to-right with 80ms stagger, meal cards fade up with 60ms stagger.
2. **Calorie ring** — Animated SVG ring filling from 0. Numbers count up in sync using tabular nums.
3. **Logging a meal** — New entry slides into its meal group, day total ticks up, ring redraws, micro-toast confirms. Orchestrated with staggered delays (0, 80ms, 160ms).
4. **Photo upload → AI analysis** — Image docks into a preview card with a shimmer/scan line effect passing over it. Detected items appear as labeled chips popping in one by one. Lottie loader for the analyzing state.
5. **Swipe / hover delete** — Mobile: swipe left with rubber-band. Desktop: hover reveals trash icon with fade.
6. **Progress chart transitions** — Switching daily/weekly/monthly morphs the chart with spring physics, not a hard swap. Line paths animate between states.
7. **Page transitions** — Shared element transitions (Framer Motion `layoutId`) between food cards and food detail views.
8. **Empty states** — Lottie illustrations looping subtly. No static empty states.
9. **Keyboard shortcut overlay** — Slides up from bottom with blur backdrop.
10. **Drag-over photo upload** — Entire app dims slightly, a dashed drop zone appears center-screen with a bouncing upload icon.

### Motion principles
- Spring physics by default (damping 18, stiffness 180). No linear eases except for shimmer/skeleton states.
- Every number change animates. Never snap.
- Respect `prefers-reduced-motion` — design the fallback (crossfades only, no transforms).
- 60fps minimum on mid-tier hardware.

---

## 6. Screen Inventory

Design every screen at all three breakpoints (mobile / tablet / desktop), in both empty and populated states unless noted.

### 6.1 Marketing / Landing (desktop-first, responsive)
Single scroll page:
- Hero: product name, one-line value prop, "Start free" CTA, animated hero visual (gradient orb morphing, or a looping dashboard preview).
- Three-feature section: "Snap, don't type", "Goals that adapt", "Progress you can feel" — each with a Lottie.
- Live dashboard preview (fake data, animated).
- Pricing (if applicable — free / pro toggle).
- Footer.

### 6.2 Auth
- Sign up / Log in with Email / Google / Apple.
- Clean centered card on desktop, full-screen on mobile.
- Magic-link option emphasized.

### 6.3 Profile Setup Wizard
Multi-step wizard with progress indicator. Collect in this order:
1. **Biological sex** (needed for BMR — include "prefer not to say")
2. **Age** — number input with stepper
3. **Height** — unit toggle (cm / ft-in), slider + number input
4. **Current weight** — unit toggle (kg / lb), number input with stepper
5. **Goal weight** — same pattern, show delta in real time
6. **Timeline / pace** — three cards: Relaxed (0.25kg/wk), Steady (0.5kg/wk), Aggressive (0.75kg/wk). Show calculated target date for each.
7. **Activity level** — 4 options (sedentary → very active) with illustrations
8. **Results screen** — AI-calculated daily calorie target displayed huge. Shown underneath: BMR, TDEE, recommended macro split (protein/carbs/fat) as a segmented bar, recommended daily targets for key micronutrients (fiber, sodium, water). "Start tracking" CTA.

**Calculation logic to surface in the UI**:
- BMR: Mifflin-St Jeor
- TDEE = BMR × activity multiplier
- Calorie target = TDEE − (weekly deficit ÷ 7), where 1 kg ≈ 7700 kcal
- Macro split: default 30% protein / 40% carbs / 30% fat, adjustable
- Include a collapsible "How we calculated this" panel — transparency builds trust.

**Responsive**: Wizard is full-screen centered card on desktop, full-page on mobile. Use the same step progression across breakpoints.

### 6.4 Dashboard (home / primary screen)
The hero screen. Most visual investment goes here.

**Desktop layout (3-column):**
- **Left sidebar** (240px): Logo, nav items (Dashboard, Log, Library, Progress, Profile), user avatar at bottom.
- **Center column** (flex): Greeting + date + streak counter at top. Hero calorie ring. Macro bars (protein, carbs, fat) with gram counts and target. Today's meals grouped by Breakfast / Lunch / Dinner / Snacks / Drinks.
- **Right panel** (320px): Micronutrient breakdown (vitamins A, C, D, B12, iron, calcium, fiber, sodium, etc. — whichever the AI returned). Insights card at bottom ("You've averaged 180g protein this week").

**Tablet**: Collapse right panel into a tab above the meals list. Keep left rail collapsible.

**Mobile**: Single column, bottom tab bar. Hero ring at top, macros below, meals below that, micronutrients in a horizontally-scrolling card row. FAB bottom-right for quick log.

**Components on this screen:**
- **Hero calorie ring**: Circular progress. Center: big number (remaining), subtitle (consumed / budget). Ring color shifts green → amber → coral as it fills.
- **Macro bars**: Three thin horizontal bars (protein, carbs, fat) with current / target gram counts.
- **Meal groups**: Breakfast, Lunch, Dinner, Snacks, Drinks. Empty meal slots show "+ Add" affordance. Entries show thumbnail (if photo), name, time, kcal, quick macro chips.
- **Micronutrient panel** (desktop) / card row (mobile): Each nutrient shows name, consumed / target, progress bar. Click for detail.
- **Quick-add FAB** (mobile) or **"+ Log food" button** (desktop): Opens the log flow.

### 6.5 Log Food — Unified Entry Screen
Single flow with three tabs at top: **Type it** / **Snap it** / **From library**.

**Tab 1 — Type it:**
- Large multiline input: "What did you eat? e.g. '2 eggs and avocado toast'"
- Optional time picker below — defaults to now. Date picker for backfilling past days.
- Optional meal category selector (Breakfast / Lunch / Dinner / Snack / Drink) — app guesses based on time.
- As user types, AI-suggested parsed items appear as chips in real-time (debounced).
- Submit → Confirmation screen.

**Tab 2 — Snap it:**
- Desktop: Large drag-and-drop zone + "Browse files" button. Preview after selection.
- Mobile: "Take photo" button (opens camera) + "Upload from gallery" button.
- After upload: image displays, "Analyzing…" state with Lottie shimmer.
- Results: detected items as editable cards (name, portion stepper, kcal, confidence indicator). User can add/remove items manually. Collapsible "Why these numbers?" panel showing AI reasoning.
- Submit → Confirmation screen.

**Tab 3 — From library:**
- Search bar at top.
- Grid/list of user's previously-logged foods, sorted by frequency (most-logged first), with a "Recent" filter toggle.
- Each card shows photo (if any), name, default portion, kcal.
- Click to add to today — quantity stepper appears inline.
- Multi-select mode: tap multiple items, batch-add.

**Confirmation screen (shared by all three tabs):**
- Full breakdown: each item listed with editable quantity, kcal, macros, micronutrient contribution.
- Total for this meal: big number at top.
- Meal category selector if not already set.
- Time editor.
- "Save to my library" toggle (default on) — this is how the personal library grows.
- Confirm button.

### 6.6 Food Library (Personal)
Grid/list view of every food the user has logged, ever. This is the substitute for a global database.
- Search bar with fuzzy matching.
- Filters: Most frequent / Recent / Highest protein / etc.
- Sort: frequency / last used / alphabetical.
- Each card: photo, name, default portion, kcal, macros, "logged X times" badge.
- Click → detail view with edit capability (user can correct AI-generated nutrition data).
- Bulk actions: delete, merge duplicates.

**Desktop**: 4-column grid. **Tablet**: 3-column. **Mobile**: 2-column or list.

### 6.7 Food Detail View
Full nutrition breakdown for a single food item.
- Hero photo (if present).
- Name (editable).
- Default portion with unit picker.
- Full nutrition table: calories, macros (protein/carbs/fat/fiber/sugar), all micronutrients the AI returned, sodium, cholesterol, etc.
- "Logged X times" with a mini chart showing log history.
- "Log now" button.
- Edit / Delete actions.

**Desktop**: Opens as a right-side panel overlay on dashboard. **Mobile**: Full-screen.

### 6.8 Progress / Analytics
Top toggle: **Day / Week / Month**. All charts respond to this selection.

**Sections:**
- **Calorie adherence**: Bar chart, each bar = one day (or one week/month aggregate). Color-coded by whether user hit target. Target line overlaid.
- **Weight trajectory**: Line chart. User's weight entries as dots, trend line smoothed, goal line horizontal, projected trajectory as dashed continuation.
- **Macro distribution over time**: Stacked area chart (protein / carbs / fat).
- **Micronutrient heatmap**: Rows = nutrients, columns = days. Cell color = % of target hit. Reveals deficiencies at a glance. This is a signature view.
- **Streak calendar**: GitHub-style heatmap of logging consistency.
- **Milestones timeline**: First week logged, 1kg lost, 30-day streak, etc. Lottie celebration on tap.

**Desktop**: 2-column layout, charts larger. **Mobile**: Single column, stacked, charts scale down with simplified axes.

### 6.9 Profile / Settings
Grouped list: Profile info, Goals (editable — recalculates target), Preferences (units, theme, language), Notifications, Privacy & Data export, Account, About.

### 6.10 Weight log (lightweight)
Quick screen to log today's weight. Number input, date (defaults to today), save. Accessible from profile and from the weight chart on progress.

---

## 7. Design System Page

Deliver a components page showing every reusable piece at all three breakpoints:

- **Buttons**: primary / secondary / ghost / destructive × 3 sizes × 5 states (default, hover, active, focus, disabled)
- **Inputs**: text, number with stepper, unit-toggleable, textarea, search, with keyboard focus states
- **Selects / comboboxes** with keyboard navigation
- **Cards**: meal card, food library card, insight card, stat card
- **Chips**: selected / unselected / removable
- **Progress ring**: variants (small / medium / hero)
- **Charts**: line, bar, donut, stacked area, heatmap — all dark-mode tuned with subtle gridlines
- **Modals / dialogs** with backdrop blur
- **Toasts** (success, warning, error)
- **Tab bars** (mobile bottom + in-page top tabs)
- **Segmented controls** (for D/W/M toggle)
- **Sliders** (single and range)
- **Data tables** for food library (sortable columns, desktop)
- **Sidebar nav** (expanded + collapsed states)
- **Command palette** (cmd+K) — shows shortcuts, navigation, quick actions
- **Loading states** — skeleton screens + Lottie
- **Empty states** — one for each major screen

---

## 8. Accessibility

- WCAG AA minimum for every color combination.
- Minimum tap target 44×44px on mobile.
- Every interactive element keyboard-navigable with visible focus rings.
- `prefers-reduced-motion` fallback designed (crossfades only).
- Every icon has a text label or `aria-label`.
- Don't rely on color alone for state — pair with iconography.
- Charts must have text alternatives / data tables for screen readers.

---

## 9. Deliverables

1. Figma file (or equivalent) with every screen above at **three breakpoints** (mobile 375px, tablet 768px, desktop 1440px), in empty and populated states.
2. Design system page with all components and their states.
3. Motion spec document — which library, which easing, which duration, per interaction.
4. A written handoff doc for Claude Code including:
   - Recommended tech stack (suggest: Next.js App Router + React + Tailwind + shadcn/ui + Framer Motion + Recharts)
   - Folder structure
   - State management recommendation (suggest: Zustand for client state, TanStack Query for server state, Supabase or Neon for DB)
   - API contract sketches for: AI text parsing endpoint, AI image analysis endpoint, personal food library CRUD
   - List of third-party services (auth, photo storage, LLM vision API — Claude's vision capability or GPT-4V)
   - Authentication flow recommendation (suggest: Clerk, Auth.js, or Supabase Auth)

---

## 10. What I don't want

- Stock "fitness app" tropes: no orange/blue gradients, no stock salad photos, no cartoon mascots.
- Cluttered dashboards with ten widgets fighting for attention.
- Ads or ad space.
- Animation for animation's sake — every motion must communicate state or affordance.
- Light mode. Don't sketch it.
- A generic CRUD admin-panel feel. This is a premium consumer product.

---

## 11. Inspiration anchors

Pull from: Linear (density + restraint), Arc Browser (motion delight), Robinhood (data viz on dark), Cron / Notion Calendar (polish), Vercel dashboard (dark + data). Do not copy — synthesize. The user will supply additional inspiration images — treat those as directional references, not blueprints.

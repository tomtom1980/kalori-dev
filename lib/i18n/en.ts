/**
 * Typed i18n constants — English source of truth (Task 1.3 AC; design-doc.md
 * §12).
 *
 * MVP strategy: compile-time typed object, no runtime lookup helper. All
 * user-facing copy addressed via `t.namespace.key`. Missing keys fail at
 * compile time; accidental empty leaves fail at `i18n-shape.test.ts`.
 *
 * Post-MVP the `next-intl` library can wrap this module to add locale
 * switching without changing any consumer — consumers always address
 * `t.namespace.key`, a runtime adapter just picks which language file `t`
 * resolves to.
 *
 * Coverage required by Task 1.3 AC + briefing §6:
 *   - 11 top-level namespaces: brand, nav, masthead, dashboard, log, library,
 *     progress, settings, errors, weight, water, onboarding (+ fab, user,
 *     shortcutsOverlay for the Task 1.2 nav-components delta)
 *   - 8 onboarding step labels
 *   - Every key referenced by Task 1.2 nav components / route stubs / Task
 *     1.3 JSX-literal audit
 *
 * Future tasks extend specific namespaces:
 *   - Task 2.x:  errors.auth.*, onboarding.*, settings.*
 *   - Task 3.x:  log.*, library.*, dashboard.*, water.*
 *   - Task 4.x:  progress.*, weight.*
 *   - Task 5.x:  errors.system.*
 */
export const t = {
  brand: {
    wordmark: 'KALORI',
    name: 'Kalori',
    // Single-letter glyph used by the favicon (`app/icon.tsx`).
    iconGlyph: 'K',
  },

  nav: {
    // Primary destination labels shown in the sidebar.
    dashboard: 'Dashboard',
    log: 'Log',
    library: 'Library',
    progress: 'Progress',
    settings: 'Settings',
    // Sidebar section heading above the destination list.
    sectionHeading: 'Navigation',
    // Visible label for the (app)/loading.tsx route-group skeleton.
    loadingLabel: 'Loading',
    // Accessibility labels shared across sidebar + bottom tab bar.
    a11y: {
      primary: 'Primary',
      // aria-label on the (app)/loading.tsx fallback container.
      pageLoading: 'Loading page',
    },
    // Bottom-tab-bar labels (full words per ui-design.md §6.4; Inter 10.5px
    // 0.18em — CSS textTransform: 'uppercase' on the link element handles
    // the visual uppercasing, so the underlying string is mixed-case).
    // Key name `shortLabel` retained to avoid rippling renames; the value
    // semantics changed from abbreviation → full word per Bug #2 fix
    // (2026-05-08-mobile-ui-overhaul).
    shortLabel: {
      dashboard: 'Dashboard',
      library: 'Library',
      progress: 'Progress',
      settings: 'Settings',
    },
    // Task 4.1 Phase 3 fix (C5): WCAG SC 2.4.1 skip link rendered at the
    // top of the nav shell. Visible only on :focus-visible; jumps focus
    // past the nav chrome into the page `<main>`.
    skipToMain: 'Skip to main content',
    pullToRefresh: {
      refreshing: 'Refreshing',
    },
  },

  masthead: {
    // Fallback brand name when section-kicker map doesn't know the route.
    brandFallback: 'Kalori',
    // Stub edition line (NavShell uses this until Task 2.x wires a real date).
    editionStub: 'No. 142 · Thu 18 Apr 2026',
    // Section kicker strings shown left-aligned in the top app bar.
    sectionKicker: {
      dashboard: '§ 01 · Dashboard',
      library: '§ 02 · Library',
      progress: '§ 03 · Progress',
      settings: '§ 04 · Settings',
      log: '§ 00 · Log',
    },

    // --- Task 3.5 Dashboard Masthead extensions ---
    tagline: 'A record of what you eat, kept like a journal.',
    editionPrefix: 'No.',
    editionFormat: 'No. {n} · {weekday}, {day} {month} {year}',
    todayDateLabel: "Today's date is:",
    welcomeFirstVisit: 'First entry. Welcome to the ledger.',
    dailyInspiration: 'A clear record makes the next meal easier to choose.',
    offlineBanner: 'Offline. Today’s ledger is held locally.',
  },

  dashboard: {
    heading: 'Dashboard',
    // Task 1.2 placeholder heading + body — Task 2.2 ships the real chronometer.
    stubHeading: '§ 01 · Today\u2019s Chronometer',
    stubBody: 'The masthead and chronometer land with Task 2.2.',
    // Task 2.2+ chronometer keys (retained from design-doc.md §12 canonical shape).
    todayKicker: '§ 01 · TODAY',
    mealsKicker: '§ 02 · THE DAY\u2019S ENTRIES',
    addEmpty: '+ Add',
    date: {
      pickerA11y: 'Choose dashboard date',
      todayBadge: 'Viewing today',
      pastBadge: 'Viewing past day',
      todayButton: 'Today',
      resetTodayA11y: 'Return dashboard to today',
      viewedDateLabel: 'Ledger date',
      futureBlocked: 'Future dates cannot be selected.',
      loadingDay: 'Loading day',
    },
    targetUpdated: 'Target updated to {kcal} kcal · see why',

    // --- Task 3.5 Chronometer Ring ---
    ring: {
      ariaLabel:
        '{consumed} of {target} calories logged today, {pct} percent of target, status {status}',
      dataTableSummary: 'View as data table',
      dataTableCaption: 'Daily calorie data table',
      dataTableHeadMetric: 'Metric',
      dataTableHeadValue: 'Value',
      dataTableRowConsumed: 'Calories, logged today',
      dataTableRowTarget: 'Daily target',
      dataTableRowRemaining: 'Remaining',
      dataTableRowPercent: 'Percent of target',
      dataTableRowFiber: 'Fiber, grams',
      dataTableRowEntries: 'Entries logged',
      dataTableRowLastLogged: 'Last logged',
      subLabel: 'calories, logged today',
      fractionOfTarget: 'of {target} kcal',
      remainUnder: '{remain} remain · plenty of room',
      remainApproaching: '{remain} remain · a measured margin',
      remainOnTarget: 'on target · the measure holds',
      remainOver: '{over} past the mark',
      remainWayOver: '{over} past the mark · a heavy day',
      footerAnnotations: '{entries} entries · {pct}% of daily target · last logged {time}',
      footerLastLoggedNever: 'nothing yet today',
      statusDefault: 'tracking',
      statusApproaching: 'approaching target',
      statusOnTarget: 'on target',
      statusOverTarget: 'over target',
      statusWayOver: 'well past target',
      emptyCTA: 'Log your first entry',
      emptyCaption: '— no entries yet today —',
      loadingCaption: 'Drawing the day’s measure…',
      errorCaption: 'The measure could not be drawn.',
      errorRetry: 'Try again',
      // Simple unit suffixes used in the data-table drawer + center stack.
      kcalUnit: 'kcal',
      gramsUnit: 'g',
    },

    // --- Task 3.5 Macro Bars ---
    macros: {
      protein: 'PROTEIN',
      carbs: 'CARBS',
      fat: 'FAT',
      fiber: 'FIBER',
      // Phase 2A (2026-05-16) — cholesterol 5th macro row. Tracked in mg
      // (not g) per USDA/FDA Daily Value reference (300mg/day).
      cholesterol: 'CHOLESTEROL',
      proteinTitle: 'Protein',
      carbsTitle: 'Carbs',
      fatTitle: 'Fat',
      fiberTitle: 'Fiber',
      cholesterolTitle: 'Cholesterol',
      valueFormat: '{consumed}g',
      targetSuffix: '/ {target}g',
      pctFormat: '{pct}%',
      pctOverFormat: '!{pct}%',
      overSuffix: 'OVER',
      emptyValue: '—',
      emptyPct: '—',
      ariaLabel: '{macro}, {consumed} grams of {target} target, {pct} percent',
      ariaLabelOver: '{macro}, {consumed} grams, over {target} target by {over} grams',
      ariaLabelEmpty: '{macro}, no data yet',
      // Codex R1 F3 fix — unit-aware aria siblings for cholesterol (mg)
      // and any future non-grams macros. The grams variants above are
      // kept intact for any external string-equality test that may pin
      // to the literal grams variant; the mg variants are used by
      // buildAriaValueText() when row.unit === 'mg'.
      ariaLabelMg: '{macro}, {consumed} milligrams of {target} milligram target, {pct} percent',
      ariaLabelOverMg:
        '{macro}, {consumed} milligrams, over {target} milligram target by {over} milligrams',
      detailsCue: 'Details',
      breakdownTriggerA11y: 'Show {macro} breakdown. {summary}',
      breakdownHoverEmpty: 'No {macro} entries yet.',
      breakdownHoverTop: 'Top contributors: {items}.',
      breakdownKicker: 'Macro breakdown',
      breakdownTitle: '{macro} breakdown',
      breakdownTargetLine: '{consumed}g logged of {target}g target',
      // Phase 2A (2026-05-16) — unit-aware sibling for cholesterol (mg)
      // and any future non-grams macros. `breakdownTargetLine` is kept
      // intact for any external string-equality test that may pin to
      // the literal grams variant.
      breakdownTargetLineUnit: '{consumed}{unit} logged of {target}{unit} target',
      breakdownClose: 'Close macro breakdown',
      breakdownEmpty: 'No entries contributed to {macro} yet.',
      breakdownPctOfTotal: '{pct}% of total',
    },

    // --- Task 3.5 Meals Bulletin ---
    meals: {
      bulletinHeading: 'The day’s entries',
      bulletinHeadingItalicWord: 'entries',
      bulletinSubheading: '— five meals, in order of their taking —',
      bulletinDateRangeFormat: '{date}',
      kicker: {
        breakfast: '§ 01 · BREAKFAST',
        lunch: '§ 02 · LUNCH',
        dinner: '§ 03 · DINNER',
        snack: '§ 04 · SNACK',
        drink: '§ 05 · DRINK',
      },
      columnHeadFormat: '{label}  {kcal} kcal',
      timeRange: {
        breakfast: '7:00 — 10:59',
        lunch: '11:00 — 14:59',
        dinner: '17:00 — 21:59',
        snack: 'anytime',
        drink: 'anytime',
      },
      empty: {
        breakfast: '— none —',
        lunch: '— none —',
        dinner: '— none —',
        snack: '— none —',
        drink: '— none —',
      },
      suggested: {
        breakfast: 'a light opener',
        lunch: 'the midday mark',
        dinner: 'the evening plate',
        snack: 'an interlude',
        drink: 'water, tea, coffee',
      },
      addAction: '+ ADD',
      addActionA11y: 'Add {mealCategory} entry',
      firstTimeBannerHeading: 'NO ENTRIES YET',
      firstTimeBannerCTADesktop: 'Press N or click LOG',
      firstTimeBannerCTAMobile: 'Tap + to log',
      entryAriaLabel: '{name}, {portion}, {kcal} kilocalories, logged at {time}',
      entryMenuA11y: 'Entry actions',
      heaviestMealNoteSr: 'heaviest of the day',
      menuEdit: 'Edit entry',
      menuDelete: 'Delete entry',
      menuCopyToToday: 'Copy to today',
      menuCopyToTomorrow: 'Copy to tomorrow',
      categoryLabel: {
        breakfast: 'Breakfast',
        lunch: 'Lunch',
        dinner: 'Dinner',
        snack: 'Snack',
        drink: 'Drink',
      },
    },

    // --- Task 3.5 Water Tracker ---
    water: {
      eyebrowLeft: 'the water column',
      eyebrowRightFormat: '{bulletsFilled} of {bulletCount}',
      displayLitreFormat: '{litres}',
      displayLitreUnit: 'L',
      mlUnit: 'ml',
      mlLitreSeparator: ' · ',
      goalFormat: 'goal · {goalL} L',
      glass: '+ GLASS',
      glassSublabel: '250ml',
      bottle: '+ BOTTLE',
      bottleSublabel: '500ml',
      correct: 'CORRECT',
      groupA11y: 'Water intake, {consumedMl} millilitres of {targetMl}',
      glassA11y: 'Add 250 millilitres of water',
      bottleA11y: 'Add 500 millilitres of water',
      correctA11y: 'Correct latest water entry',
      // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — third chip
      // re-purposed from "CORRECT" stub to a custom-amount EDIT surface.
      // Mobile renders a `MobileWheelSheet` + `MobileWheelPicker`; desktop
      // renders a Radix popover with a numeric input. The chosen value
      // REPLACES today's total (SET semantics) — the chip POSTs the
      // delta = entered - currentTotalMl. Per Phase-2 user gate the EDIT
      // surface only allows INCREASING the daily total in this batch
      // (Option A — server endpoint rejects negative deltas). Step is
      // 50 ml; range is [currentTotalMl rounded UP to next 50, 5000].
      editButtonLabel: 'EDIT',
      editButtonA11y: 'Edit total water amount',
      editPopoverTitle: 'Set water total',
      editPopoverHint: 'Replace today’s total with a custom amount.',
      editWheelTitle: 'Set water total',
      editWheelDescription: 'Step 50 ml · 0 to 5 L',
      editWheelA11y: 'Set total water amount in millilitres',
      editInputA11y: 'Total water amount in millilitres',
      editSaveLabel: 'Save',
      editCancelLabel: 'Cancel',
      editOutOfRange: 'Enter a value between {lower} and 5000 ml',
      editDisabledAtCap: 'Daily limit reached',
      bulletFilledA11y: 'filled',
      bulletEmptyA11y: 'empty',
      emptyCaption: '— no water yet today —',
      errorToast: 'Couldn’t log water — try again',
      correctedToastFormat: 'Removed {amount} {unit}',
      liveAddedFormat: '{amount} {unit} logged · {consumedMl} millilitres total',
      liveCorrectedFormat: '{amount} {unit} removed · {consumedMl} millilitres total',
      // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — daily cap
      // (5 L) reached. Surfaced via `useUndoQueueStore.pushToast` with
      // `kind: 'delete-failed'` (non-undoable) when either the chip's
      // pre-emptive guard or the server 409 OVER_DAILY_LIMIT response
      // fires. Mirror SR copy is more verbose for a11y.
      capReachedToast: 'Daily water limit reached (5 L)',
      capReachedAnnounce: 'Daily water limit of 5 litres reached. Cannot add more today.',
    },

    // --- Task 3.5 Micronutrient Panel ---
    micro: {
      headerLeft: 'Minor elements',
      headerRight: 'a daily audit',
      pctFormat: '{pct}%',
      pctUnderFormat: '{pct}% of RDA',
      pctOverFormat: '!{pct}%',
      // Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
      // Placeholder rendered in the percent slot when a row has no canonical
      // RDA reference (sugar, caffeine, orphan keys). Distinct from "0%"
      // (which would imply a measured deficit) so the row does not read as
      // a low-RDA meter.
      pctUnknownLabel: '—',
      overLabel: 'over upper limit',
      overflowMoreFormat: '+ {n} MORE ELEMENTS',
      overflowLess: '— FEWER —',
      emptyHeading: '— nothing to audit yet —',
      emptyCaption: 'Log a few meals and the minor elements will surface here.',
      rowAriaLabel: '{name}, {pct} percent of daily reference, status {status}',
      rowAriaLabelOver: '{name}, {pct} percent, over upper limit',
      // Codex R2 I2 — aria template for RDA-unknown rows. No percent token;
      // the row carries amount + unit so screen readers announce a useful
      // value (e.g. "sugar, 25 grams, no daily reference") rather than the
      // misleading "0 percent of daily reference, below reference" phrase
      // the row used to share with measurable-low rows.
      rowAriaLabelUnknown: '{name}, {amount}{unit}, no daily reference',
      statusLow: 'below reference',
      statusMid: 'below reference',
      statusGood: 'at reference',
      statusOver: 'over upper limit',
      // Codex R2 I2 — used by the row aria-label substitution path when
      // status === 'unknown'. Not displayed visually; the visual surface
      // uses `pctUnknownLabel` ("—") instead.
      statusUnknown: 'no daily reference',
      detailsCue: 'Details',
      // Phase 2B (2026-05-16) — hover + click breakdown parity with macros.
      breakdownTriggerA11y: 'Open {name} contributors breakdown. {summary}',
      breakdownHoverEmpty: 'No {name} entries yet.',
      breakdownHoverTop: 'Top contributors: {items}.',
      breakdownKicker: 'Element breakdown',
      breakdownTitle: '{name} breakdown',
      breakdownTargetLineWithRda: '{consumed}{unit} logged of {target}{unit} target',
      breakdownTargetLineNoRda: '{consumed}{unit} logged · no reference',
      breakdownClose: 'Close element breakdown',
      breakdownEmpty: 'No entries contributed to {name} yet.',
      breakdownPctOfTotal: '{pct}% of total',
      breakdownAmountFormat: '{amount}{unit}',
    },
    // Task C.1 (US-STAB-C1) — Micros + RDA panel eyebrow labels + chip aria
    // template. Distinct namespace from the existing 7-day-union `micro` block
    // so neither component can accidentally pick up the other's copy.
    microsRda: {
      headerLeft: 'MICROS',
      headerRight: '30 ELEMENTS',
      rowAriaLabel: '{name}, {pct} percent of daily reference',
    },

    // --- Task 3.5 Weekly Insight (shell only; Task 4.3a owns content) ---
    insight: {
      weeklyKicker: '§ THE WEEK IN REVIEW',
      weeklyTitle: 'This week, by the measure',
      weeklySkeletonLine1: 'The editor is still reading the week’s entries.',
      weeklySkeletonLine2: 'A note will be set within the hour.',
      weeklyEmptyHeading: 'No entries this week yet',
      weeklyEmptyCaption: 'Log seven days and the ledger will offer a review.',
      weeklyErrorHeading: 'The note could not be set',
      weeklyErrorRetry: 'Try again',
    },

    dailyEditorsNote: {
      kicker: "Â§ THE EDITOR'S NOTE",
      emptyBody:
        'Nothing is logged for {day} yet; log food for this day before the editor can review it.',
      body: '{day} has {entries} {entryWord} at {consumed} of {target} kcal, so this note is scoped to the current day.',
      entrySingular: 'entry',
      entryPlural: 'entries',
      outcomeLabel: 'Outcome',
      recommendationLabel: 'Recommendation',
      goodLabel: 'Good',
      needsAttentionLabel: 'Needs attention',
      outcomeUnder: '{delta} kcal remain against the daily target.',
      outcomeOver: '{delta} kcal over the daily target.',
      outcomeOnTarget: 'Right on the daily target.',
      recommendUnder: 'Use the remaining room for a steady, protein-forward choice.',
      recommendApproaching: 'Keep the next choice measured and avoid calorie-dense extras.',
      recommendOnTarget: 'Hold the pace and keep the rest of the day simple.',
      recommendOver: 'Make the next choice lighter and prioritize water or fiber.',
      signalWater: 'Water is still below the halfway mark.',
      signalFiber: 'Fiber is still behind the daily reference.',
      signalMicro: '{name} is below reference today.',
      signalGoodMacro: '{name} is carrying the day well.',
      signalGoodWater: 'Water is already at target.',
      signalGoodLogged: 'The day has enough logged data to guide the next choice.',
      updating: 'Updating summary',
      aiFailedTitle: 'AI parsing failed.',
      aiFailedBody:
        'The latest AI summary could not be generated and no previous summary is available.',
      retryAiSummary: 'Retry AI summary',
    },

    bac: {
      headerLeft: 'BAC estimate',
      headerRight: 'alcohol',
      description: 'Current estimated BAC',
      refreshA11y: 'Refresh BAC',
      // Accessible label for the refresh button while a refresh is in
      // flight (`isPending === true`). Mirrors the loading affordance
      // (icon spin + value fade) for screen-reader users.
      refreshingA11y: 'Refreshing BAC',
      asOfFormat: 'As of {time}',
      emptyAsOf: 'As of now',
    },

    // --- Task 3.5 undo dashboard-specific copy ---
    undo: {
      deleteFailedToast: 'Couldn’t remove entry — it’ll be here when the page reloads',
    },

    // --- Task 3.5 live-region announcement templates ---
    live: {
      entryAdded: '{name} added to {mealCategory}',
      entryRemoved: '{name} removed',
      entryRestored: '{name} restored',
      waterAdded: '{amount} {unit} logged',
      waterRemoved: '{amount} {unit} removed',
      undoAvailable: 'Undo available for 5 seconds',
      undoWindowClosed: 'Undo window closed',
    },

    // --- Task 3.5 error states ---
    errors: {
      dashboardFetchHeading: 'The ledger could not be opened',
      dashboardFetchCaption: 'Something interrupted the read. The data is safe.',
      dashboardFetchRetry: 'Try again',
      waterPostGenericCaption: 'Couldn’t log water — try again',
      entryDeleteGenericCaption: 'Couldn’t remove entry — it’ll be here when the page reloads',
    },
  },

  log: {
    // Task 1.2 placeholder heading + body — Task 3.3 ships the real modal.
    stubHeading: '§ 00 · Log',
    stubBody: 'Log flow arrives with Task 3.3 \u2014 the FAB will open it as a modal.',
    // Task 3.3+ log-flow keys.
    typePlaceholder: 'What did you eat? e.g. \u20182 eggs and avocado toast\u2019',
    whyNumbers: 'Why these numbers?',
    saveToLibrary: 'Save to library',
    confirmCTA: 'Confirm',
    aiFailureFallback: 'Couldn\u2019t reach the editor. Enter manually?',

    // --- Task 3.3 3-tab log flow modal ---
    modalTitle: 'Log a meal',
    modalSectionKicker: '\u00a7 LOG A MEAL',
    modalClose: 'Close',
    modalTabsLabel: 'Log entry method',
    tabTypeLabel: 'TYPE',
    tabTypeA11y: 'Log by typing',
    tabSnapLabel: 'SNAP',
    tabSnapA11y: 'Log by photo',
    tabLibraryLabel: 'LIBRARY',
    tabLibraryA11y: 'Log from library',

    // --- Add Food tab merge (Type + Library unified) ---
    tabAddFoodLabel: 'ADD FOOD',
    addNewItemAriaLabel: 'Add new food item',
    addNewItemCtaPrefix: 'Add',
    addNewItemCtaSuffix: 'as new item',
    libraryNoMatchWithCta: 'Nothing matches that search yet.',
    backToLibraryAriaLabel: 'Back to library',
    loadingLibraryA11y: 'Loading library',
    // Library card macro row — 5 abbreviated macros rendered below kcal.
    // Cholesterol uses mg; the rest use g — keep units explicit so the
    // numbers can't be misread across magnitudes.
    libraryCardMacroProtein: 'P {value}g',
    libraryCardMacroCarbs: 'C {value}g',
    libraryCardMacroFat: 'F {value}g',
    libraryCardMacroFiber: 'Fi {value}g',
    libraryCardMacroCholesterol: 'Ch {value}mg',

    // Type tab
    typeDescribeLabel: 'DESCRIBE YOUR MEAL',
    typeDescribePlaceholder: 'Describe what you ate \u2014 in any language',
    typeHelper: 'Supports Vietnamese, English, or any mix.',
    typeCharCountA11y: 'Characters entered',
    typeParseCTA: 'PARSE',
    typeParseLoadingCTA: 'PARSING\u2026',
    typeParsing: 'Parsing your meal description\u2026',
    typeStillLooking: 'Still looking\u2026',
    typeParseDisabledReason: 'Enter at least 3 characters',

    // Snap tab
    snapCaptureCaption: 'TAP TO CAPTURE A MEAL',
    snapCaptureDrop: 'DROP TO UPLOAD',
    snapCaptureA11y: 'Capture photo',
    snapUploadInstead: 'UPLOAD INSTEAD',
    snapUploadPicture: 'Upload picture',
    snapRetake: 'RE-TAKE',
    snapAnalyze: 'ANALYZE',
    snapCompressingLabel: 'Compressing image',
    snapAnalyzing: 'Gemini is reading your photo\u2026',
    snapAnalyzingStill: 'Still looking\u2026',
    snapUnsupportedMime: 'Unsupported image format. Use JPEG, PNG, or WEBP.',
    snapTooLarge: 'Image too large even after compression. Try a smaller photo.',
    snapNoFoodTitle: 'No recognizable food item is on this picture.',
    snapNoFoodBody: 'Try another photo or add the food item without a photo.',
    snapNoFoodAddItemCTA: 'Add food item',
    // Task 4.7.5 — inline warning when thumbnail upload fails post-parse.
    // Entry still saves (parsed items are load-bearing); thumbnail is
    // enrichment, so non-blocking surface only.
    snapThumbnailFailed: 'Photo saved without thumbnail',
    snapCompressingCaption: 'COMPRESSING {pct}%',
    snapCaptureSquareA11y: 'Take a photo of the meal',
    snapPhotoAttachedAlt: 'Captured meal photo',

    // Library tab
    librarySearchLabel: 'SEARCH LIBRARY',
    librarySearchPlaceholder: 'Search library',
    librarySortLabel: 'Sort library',
    librarySortNameAsc: 'NAME A-Z',
    librarySortFrequent: 'FREQUENT',
    librarySortRecent: 'RECENT',
    librarySortHighProtein: 'HIGH-PROTEIN',
    libraryEmpty: 'Your library is empty. Logged items will appear here.',
    libraryNoMatch: 'Nothing matches that search.',
    libraryCardUnit: 'KCAL',
    libraryAddItems: 'ADD {count} ITEMS',
    libraryAddSingle: 'ADD 1 ITEM',
    // Task 4.7.4 — bottom-anchor "LOG SELECTED" CTA on the LibraryTab.
    libraryLogSelected: 'LOG SELECTED ({count})',
    // Task 4.7.4 Codex Round 1 IMPROVEMENT — surfaced when `?item=<id>`
    // resolves null (tombstoned / RLS miss / unauthenticated). Without this,
    // the user lands on the empty library tab with no signal that the
    // deep-linked item was unreachable.
    libraryDeepLinkNotFound: 'Couldn’t find that library item — it may have been deleted.',
    libraryQuantityDecrease: 'Decrease quantity',
    libraryQuantityIncrease: 'Increase quantity',
    libraryQuantityWheelLabel: 'Quantity',
    libraryListA11y: 'Saved food library',

    // Validation errors (ManualEntryFallback inline error rendering)
    fallbackErrorFoodRequired: 'Enter a food name.',
    fallbackErrorPortionRequired: 'Enter the portion size in grams.',
    fallbackErrorQuantityRequired: 'Enter a quantity greater than 0.',
    fallbackErrorKcalRequired: 'Enter the calorie value.',
    fallbackErrorMacroRequired: 'Enter 0 or a positive number.',
    fallbackErrorSummary: 'Please correct the highlighted fields.',

    // Modal description (sr-only)
    modalDescription: 'Log a meal via text, photo, or saved library.',

    // Library result-count (sr-only live region)
    libraryResultCount: 'Showing {shown} of {total} saved foods',

    // Search input left-icon + `/` hotkey chip
    librarySearchIconA11y: 'Search icon',
    librarySearchKbdHint: '/',

    // Manual entry fallback
    fallbackHeadingType: 'AI couldn\u2019t parse \u2014 enter manually or try again',
    fallbackHeadingSnap: 'AI couldn\u2019t read the photo \u2014 describe it manually or try again',
    fallbackHeadingLibrary: 'Couldn\u2019t save selection \u2014 enter manually or try again',
    fallbackManualCTA: 'MANUAL ENTRY',
    fallbackManualNote: 'File the food manually, then review it before saving.',
    fallbackSnapNeedsReview:
      'Photo was kept. Add the food details manually or retry the photo analysis.',
    fallbackRetryCTA: 'TRY AGAIN',
    fallbackRetryPhotoCTA: 'TRY PHOTO AGAIN',
    fallbackFoodNameLabel: 'FOOD NAME',
    fallbackPortionLabel: 'PORTION (G)',
    fallbackQuantityLabel: 'QUANTITY / PORTION',
    fallbackQuantityChoose: 'CHOOSE QUANTITY',
    fallbackQuantityWheelTitle: 'QUANTITY',
    fallbackUnitGroupLabel: 'UNIT',
    fallbackUnitGram: 'g',
    fallbackUnitServing: 'serving',
    fallbackUnitPiece: 'piece',
    fallbackUnitBowl: 'bowl',
    fallbackUnitCup: 'cup',
    fallbackPresetGroupLabel: 'Preset amounts',
    fallbackKcalLabel: 'KCAL',
    fallbackMacrosToggle: 'OPTIONAL MACROS',
    fallbackProteinLabel: 'PROTEIN (G)',
    fallbackCarbsLabel: 'CARBS (G)',
    fallbackFatLabel: 'FAT (G)',
    fallbackFiberLabel: 'FIBER (G)',
    fallbackSubmitCTA: 'SAVE MANUALLY',

    // Discard prompt
    discardPromptTitle: 'DISCARD UNSAVED ENTRY?',
    discardPromptKeep: 'KEEP EDITING',
    discardPromptDiscard: 'DISCARD',
    // Task 3.4 — DiscardDraftAlertDialog description copy.
    discardPromptDescription: 'Your parsed entry and edits will be lost. This cannot be undone.',

    // Task 3.4 — ConfirmationScreen
    confirmationKicker: 'KALORI’S LEDGER READS:',
    confirmationSaveCTA: 'SAVE TO LEDGER',
    confirmationLibrarySaveCTA: 'ADD LIBRARY ITEM',
    confirmationDiscardCTA: 'DISCARD',
    confirmationEditInputCTA: '← EDIT INPUT',
    confirmationItemRemove: 'Remove {name}',
    confirmationItemNameLabel: 'Food name',
    confirmationItemPortionLabel: 'Portion',
    confirmationItemKcalLabel: 'Calories',
    confirmationItemKcalUnit: 'kcal',
    // Phase 2C — macros summary strip on each ConfirmationScreen row.
    // Surfaces the 5 macros (4 grams + cholesterol mg) so the user can
    // verify the AI-parsed / library-re-log values before save.
    confirmationItemMacroProtein: 'P',
    confirmationItemMacroCarbs: 'C',
    confirmationItemMacroFat: 'F',
    confirmationItemMacroFiber: 'Fb',
    confirmationItemMacroCholesterol: 'Chol',
    confirmationItemMacroUnitGrams: 'g',
    confirmationItemMacroUnitMg: 'mg',
    // Bug 1 (2026-05-17-library-micros) — library-only micros expander on
    // <ConfirmationScreen />. Shown only in library-only mode so the user
    // can adjust the AI-parsed micronutrient values before /api/library/create.
    confirmationItemMicrosExpandShow: 'Add micronutrient details',
    confirmationItemMicrosExpandHide: 'Hide micronutrient details',
    confirmationParsedMicrosExpandShow: 'Show all micronutrients',
    confirmationParsedMicrosExpandHide: 'Hide all micronutrients',
    confirmationMealLabel: 'Meal',
    confirmationMealBreakfast: 'BREAKFAST',
    confirmationMealLunch: 'LUNCH',
    confirmationMealDinner: 'DINNER',
    confirmationMealSnack: 'SNACK',
    // I1 — Server Zod + DB check-constraint accept a 5th meal_category
    // ('drink'). The UI must render it so copy-yesterday'd drink entries can
    // re-edit their meal slot.
    confirmationMealDrink: 'DRINK',
    // Bug A (bugfix-tomi 2026-05-19-bac-improvements) — the manual
    // AlcoholControls toggle / preset / inputs were removed. Gemini now
    // auto-detects alcoholic items via the AI prompt contract and emits
    // is_alcoholic + volume_ml + abv_percent per item. The confirmation
    // surface shows a one-line read-only "Detected" caption when
    // meal=drink AND at least one item is_alcoholic=true.
    //
    // Placeholders in `confirmationAlcoholDetectedFormat`:
    //   {volume} — volume_ml as integer (e.g. "355")
    //   {abv}    — abv_percent as displayed number (e.g. "5" or "6.5")
    //   {grams}  — alcohol_grams rounded to nearest int (e.g. "14")
    //
    // Visual style mirrors the ledger-editorial caption rhythm: kicker
    // label + middot-separated values, no fields, no toggle.
    confirmationAlcoholDetectedLabel: 'Detected',
    confirmationAlcoholDetectedFormat: '{volume} ml · {abv}% ABV · ~{grams} g',
    confirmationAlcoholDetectedA11y:
      'Alcoholic drink detected: {volume} milliliters at {abv} percent ABV, approximately {grams} grams of alcohol.',
    // RETAINED as a small fallback heading for the legacy DRINK fieldset
    // area. The toggle / preset / validation keys are gone — the Detected
    // label fully replaces the manual entry surface.
    confirmationAlcoholGroupLabel: 'Alcohol details',
    confirmationSaveToLibraryLabel: 'FILE UNDER',
    confirmationDedupHeader: 'A library entry with this name already exists.',
    confirmationDedupReuse: 'REUSE EXISTING',
    confirmationDedupCreate: 'CREATE NEW',
    confirmationSaveToLibraryNameLabel: 'Library name',
    confirmationSaveToLibraryNamePlaceholder: 'Library name',
    confirmationDuplicateNameError:
      'This name is already in your library. Pick a different name or reuse the existing entry below.',
    confirmationLibraryLimitReached:
      'You have reached the limit to add new items to the library. Maximum 20 new additions per day and 100 per month.',
    // E.CODEX Round-2 C2 — library-only mode duplicate banner. The standard
    // DedupBanner is hidden in library-only mode (no log entry to link), so
    // the user needs a dedicated surface explaining WHY Save is disabled and
    // how to resolve. Heading copy mirrors `confirmationDedupHeader`; the
    // hint instructs them to rename (there's no REUSE path in library-only
    // because we're creating, not logging).
    confirmationLibraryOnlyDedupHeader: 'A library entry with this name already exists.',
    confirmationLibraryOnlyDedupHint:
      'Rename this entry to something unique to add it to your library.',
    confirmationWhyHeader: 'WHY THESE NUMBERS?',
    confirmationWhyEstimate: 'estimate',
    confirmationWhySourcesHeading: 'SOURCES',
    confirmationWhyIngredientHeading: 'INGREDIENT',
    confirmationWhyConfidenceHeading: 'CONFIDENCE',
    confirmationWhyKcalHeading: 'KCAL',
    confirmationWhyTopMicroHeading: 'TOP MICRONUTRIENT',
    confirmationWhyShowAllMicros: 'SHOW ALL MICRONUTRIENTS ({count})',
    confirmationWhyHideAllMicros: 'HIDE MICRONUTRIENTS',
    confirmationWhyDvSuffix: '% DV',
    confirmationApproxGrams: 'approx. {grams} g',
    confirmationErrorBanner: 'Couldn’t save. Try again.',
    confirmationFutureTimeError: 'Choose a time that is not in the future.',
    duplicateFoodConfirmMessage:
      'You have already logged this item for this meal today. Are you sure you want to add another one?',
    duplicateFoodConfirmKicker: '§ Duplicate log',
    duplicateFoodConfirmTitle: 'Log this again?',
    duplicateFoodConfirmCancel: 'Cancel',
    duplicateFoodConfirmProceed: 'Log again',
    duplicateFoodCancelled: 'Duplicate log cancelled.',
    confirmationRetryCTA: 'TRY AGAIN',
    confirmationItemsCount: '{count} items to confirm.',
    confirmationItemNameError: 'Enter a food name.',
    confirmationItemPortionError: 'Enter a portion greater than 0.',
    confirmationItemKcalError: 'Enter calories greater than or equal to 0.',
    confirmationPortionStepperLabel: 'Portion stepper',
    // I2 — Zero-item save guard caption. Surfaces when the user has removed
    // every row so the Save CTA is aria-disabled instead of silently 400-ing.
    confirmationEmptyCaption: 'Add at least one item to save.',
    confirmationPortionDecrease: 'Decrease portion',
    confirmationPortionIncrease: 'Increase portion',
    // Task C.5 (F-VERIFY-203) — Confirmation.TimeEditor compound child.
    confirmationTimeEditorLabel: 'WHEN',
    confirmationTimeEditorHint: 'Backfill up to 30 days. Defaults to now.',
    confirmationTimeEditorOutsideWindow: 'Pick a date within the last 30 days.',
    confirmationTimeEditorCurrentTime: 'Current Time',
    // Codex R1 Finding #2 — readonly edit-path hint. PATCH body intentionally
    // omits logged_at (out of C.5 scope), so the TimeEditor is rendered
    // readonly on edit to prevent the silent-drop bug where edits to the time
    // field would not be persisted.
    confirmationTimeEditorEditDisabledHint:
      'Time cannot be changed when editing an existing entry — delete and re-add to change the time.',

    // Task 3.4 — UndoToast
    undoToastUndo: 'UNDO',
    undoToastSaved: 'Logged {label}',
    entryUpdatedToast: 'Updated {label}',
    undoToastDeleted: 'Removing {label}… (undo within 5s)',
    undoToastCopied: 'Copied {count} entries from yesterday',
    undoToastMoreSaved: '+{N} more saved',
    undoToastUndoing: 'Undoing…',
    undoToastRestored: 'Restored.',
    // F3 delete-recovery: surfaced when the user clicked UNDO on a save toast
    // but the server rejected the DELETE. The food_entries row is still
    // persisted, so from the user's POV the entry is restored (never removed).
    undoToastDeleteRestored: 'Couldn’t delete — restored',

    // Task 3.4 — Copy yesterday
    copyYesterdayHeading: 'Copy yesterday’s entries',
    copyYesterdayKicker: '§ COPY YESTERDAY',
    copyYesterdayConfirm: 'COPY {count} ENTRIES',
    copyYesterdaySubmitting: 'COPYING {count} ENTRIES',
    copyYesterdayCancel: 'CANCEL',
    copyYesterdayEmpty: 'No entries logged yesterday.',

    // Session expired toast
    sessionExpiredToast: 'Session expired \u2014 sign in again',

    // Keyboard shortcut
    keybindingLogA11y: 'Press N to open log',
  },

  library: {
    // Task 1.2 placeholder heading + body — Task 3.4 ships the real index.
    stubHeading: '§ 02 · Library',
    stubBody: 'Library index lands with Task 3.4.',

    // Task 4.1 sub-step 3 — /library route copy.
    kicker: 'Personal Library',
    title: 'The Library',
    summary:
      'Search, edit, and re-log the foods you have already recorded, with your portions and nutrition kept in one place.',

    // Bug 2 (library overhaul 2026-05-16) — loading boundary labels.
    loadingDetail: 'Loading food detail',
    loadingGrid: 'Loading library',

    // Tools rail.
    searchLabel: 'Library search',
    searchPlaceholder: 'Search library',
    searchClearLabel: 'Clear search',
    searchResults: '{N} results for {query}',
    filterLabel: 'Filter',
    filterAll: 'All',
    filterWithPhotos: 'With Photos',
    filterNoPhotos: 'No Photos',
    filterThisWeek: 'Logged This Week',
    sortLabel: 'Sort',
    sortMostLogged: 'Most Logged',
    sortLastUsed: 'Last Used',
    sortNameAsc: 'Name A-Z',
    sortNameDesc: 'Name Z-A',
    sortKcalAsc: 'Kcal Low-High',
    sortKcalDesc: 'Kcal High-Low',
    selectButton: 'Select',
    cancelButton: 'Cancel',

    // Grid + cards.
    gridLabel: 'Library items',
    cardAriaLabel: '{name}, {portion} {unit}, {kcal} calories, logged {count} times.',
    letterMarkLabel: 'Thumbnail placeholder',
    thumbnailPendingAriaLabel: 'Generating sketch for {name}',
    cardKcalSuffix: 'kcal',
    cardApproxGrams: 'approx. {grams} g',
    paginationLabel: 'Library pages',
    paginationPrevious: 'Previous',
    paginationNext: 'Next',
    cardMacrosFormat: 'P {p} · C {c} · F {f}',

    // Bug 3 (library overhaul 2026-05-16) — per-card quick-action menu.
    cardMenuAriaLabel: 'Actions for {name}',
    cardMenuEdit: 'Edit',
    cardMenuDelete: 'Delete',
    cardMenuQuickLog: 'Quick log',
    cardMenuCreateRecipe: 'Create recipe',
    // Quick-log per-card meal picker (mirrors bulk-log pattern).
    quickLogMealPickerTitle: 'Log as which meal?',
    quickLogMealPickerLoading: 'LOGGING',
    quickLogToastSuccess: 'Logged “{name}”',
    quickLogToastError: 'Couldn’t log “{name}” — try again',

    // Bug 6 (library overhaul 2026-05-16) — Add Item form.
    createRecipeKicker: 'Recipe',
    createRecipeLoadingTitle: 'Creating recipe',
    createRecipeLoadingBody: 'Reading the saved item and drafting a practical method.',
    createRecipeIngredientsTitle: 'Ingredients',
    createRecipeStepsTitle: 'How to make it',
    createRecipeServings: '{N} servings',
    createRecipeTime: '{N} min',
    createRecipeRetry: 'Retry',
    createRecipeClose: 'Close',
    createRecipeError: 'Could not create the recipe. Try again when ready.',

    addItemButton: 'Add Item',
    addItemChecking: 'CHECKING',
    addItemAriaLabel: 'Add a new library item',
    addItemDialogKicker: '§ 08 · New entry',
    addItemDialogTitle: 'File a new title',
    addItemDialogBody: 'Pre-populate the library without logging a meal.',
    addItemFieldName: 'Name',
    addItemFieldNamePlaceholder: 'e.g. Phở Bò',
    addItemFieldPortion: 'Default portion',
    addItemFieldUnit: 'Unit',
    addItemFieldUnitPlaceholder: 'piece',
    addItemFieldKcal: 'Calories',
    addItemFieldProtein: 'Protein (g)',
    addItemFieldCarbs: 'Carbs (g)',
    addItemFieldFat: 'Fat (g)',
    addItemFieldFiber: 'Fiber (g)',
    addItemSubmit: 'File entry',
    addItemSubmitPending: 'Filing…',
    addItemCancel: 'Cancel',
    addItemErrorRequired: 'Required',
    addItemErrorNonNegative: 'Must be ≥ 0',
    addItemErrorPositive: 'Must be > 0',
    addItemErrorNameLength: 'Up to 120 characters',
    addItemDuplicateBanner: 'Already in your library — open the existing entry instead.',
    addItemDuplicateLinkLabel: 'existing',
    addItemServerErrorBanner: 'Could not save. Retry when ready.',
    addItemSuccessToast: 'Filed new entry · sketch generating',
    addItemLimitReached:
      'Library addition limit reached. Maximum 20 new additions per day and 100 per month.',
    emptyAddCta: 'Add your first item',

    // Bug 5 (library overhaul 2026-05-16) — sketch backfill widget.
    sketchBackfillTitle: 'Sketch backfill',
    sketchBackfillPending: '{N} items pending sketch',
    sketchBackfillButton: 'Generate sketches',
    sketchBackfillRunning: 'Generating…',
    sketchBackfillDone: 'All caught up',
    sketchBackfillReport: '{generated} generated · {failed} failed · {remaining} remaining',

    // Empty states.
    emptyFirstTimeHeading: 'No library items yet.',
    emptyFilteredHeading: 'No titles match your current view.',
    emptyFilteredBody: 'Adjust the filter or clear the search to widen the page.',
    emptyFilteredReset: 'Clear filters',

    // Bulk actions bar + dialogs.
    bulkSelectedCount: '{N} selected',
    bulkHiddenBadge: '+{K} hidden',
    // Task 4.1 Phase 3 fix (C2): sr-only live region announcements for
    // SC 4.1.3 Status Messages. Empty string when no announcement is
    // active so screen readers don't speak on mount.
    selectionModeEntered: 'Selection mode enabled. Press escape to cancel.',
    selectionCountAnnouncement: '{N} items selected. Bulk actions available.',
    mergeButton: 'Merge',
    mergeDisabledTooltip: 'Select exactly 2 items to merge',
    // Bug 2 (library bulk overhaul 2026-05-17) — bulk "Log items" replaces
    // the bulk "Merge" CTA. Selecting N items + clicking opens a meal-slot
    // picker; on confirm, each item is logged as a separate food_entries
    // row via parallel calls to /api/library/[id]/log-now. Merge i18n keys
    // remain for the orphan MergeDuplicatesDialog code path.
    bulkLogButton: 'LOG',
    bulkLogButtonLoading: 'LOGGING',
    bulkLogAriaLabel: 'Log selected items as separate entries',
    bulkLogToastSuccess: 'Logged {N} items',
    bulkLogToastError: "Couldn't log {N} items — try again",
    bulkLogMealPickerTitle: 'Log as which meal?',
    bulkDeleteButton: 'Bulk delete',
    bulkDeleteKicker: '§ 07 · Delete',
    bulkDeleteTitlePlural: 'Strike {N} titles from the record?',
    bulkDeleteTitleSingular: 'Strike this title from the record?',
    bulkDeleteWarning: 'This cannot be undone after the 5-second grace window.',
    bulkDeleteStrike: 'Strike {N}',
    bulkDeleteMore: 'And {N} more',
    bulkDeleteToast: '{N} items deleted · undo 5s',
    // IF-2 (Codex adversarial round 1): inline role=alert banner that
    // surfaces inside the confirm dialog when the POST /api/library/
    // bulk-delete mutation fails. The dialog stays open so the user can
    // retry without re-selecting.
    bulkDeleteErrorBanner: 'Delete failed. Retry when ready.',
    // Task E.1.1 — F-CODEX-D-R2-03 — restore-conflict copy. Surfaced when the
    // POST /api/library/bulk-delete/undo route returns 409
    // restore_name_conflict because a same-name row was recreated
    // between the optimistic delete and the user's UNDO tap.
    bulkUndoConflictToast: "Couldn't undo: a matching item already exists.",

    // Merge dialog.
    mergeKicker: '§ 06 · Merge',
    mergeTitle: 'Merge two items',
    mergeBody:
      'Pick the surviving value for each field. Past entries will be repointed to the winner.',
    mergeFieldName: 'Name',
    mergeFieldThumb: 'Thumbnail',
    mergeFieldKcal: 'Kcal',
    mergeFieldProtein: 'Protein (g)',
    mergeFieldCarbs: 'Carbs (g)',
    mergeFieldFat: 'Fat (g)',
    // Codex R1 F1 fix — cholesterol picker label. Unit is `mg`, not `g`.
    mergeFieldCholesterol: 'Cholesterol (mg)',
    mergeFieldPortion: 'Default portion',
    mergeFieldUnit: 'Default unit',
    mergeOptionA: 'Option A',
    mergeOptionB: 'Option B',
    mergeOptionCustom: 'Custom',
    mergeThumbNone: 'No photo',
    mergeSubmit: 'Merge »',
    mergeConfirmKicker: '§ 06 · Confirm merge',
    mergeConfirmTitle: 'This cannot be undone.',
    mergeConfirmBody:
      'Past entries will be repointed to the surviving item. The losing item is removed from the ledger.',
    mergeConfirmProceed: 'Proceed with merge',
    mergeSuccessToast: 'Merged — no undo',
    mergeErrorBanner: 'Merge failed. Retry when ready.',
    mergeErrorRetry: 'Retry',

    // --- Task 4.2 detail panel ---
    detail: {
      // Top bar + chrome.
      backToIndex: '← Index',
      closeGlyph: 'close',
      closeLabel: 'Close detail view',
      backLabel: 'Back to library index',

      // Thumbnail frame + meta chip.
      metaChipFormat: 'Filed · {date}',
      cornerLabelSource: 'source',
      cornerLabelRecorded: 'recorded',
      cornerLabelPortion: 'portion',
      cornerLabelDate: 'date',
      sourcePhoto: 'photo',
      sourceText: 'text',

      // Section kickers.
      kickerNutrition: '§ 04 · Nutrition',
      kickerHistory: '§ 05 · History',

      // Kcal + macros.
      kcalSuffix: 'kcal',
      macroProtein: 'Protein',
      macroCarbs: 'Carbs',
      macroFat: 'Fat',
      macroFiber: 'Fiber',
      // Phase 2C — 5th macro label (unit: mg). Rendered alongside the
      // gram-keyed macros in `<FoodDetailMacros />`.
      macroCholesterol: 'Cholesterol',
      macroSugar: 'Sugar',
      microSodium: 'Sodium',
      macroUnitGrams: 'g',
      macroUnitMg: 'mg',
      portionFormat: 'Per {portion} {unit}',

      // Micros.
      noMicros: 'No micronutrients recorded.',
      showAllMicros: '* Show all micros',
      // Bug 8 — FDA DV % suffix on each macro row (library overhaul 2026-05-16).
      macroDvSuffix: '% DV',
      // Bug 9 — micros collapsed-by-default expand toggle.
      microsExpandShow: 'Show all nutrients',
      microsExpandHide: 'Hide nutrients',
      // Edit-mode micros collapsible. Default closed; expand reveals only
      // micro inputs whose saved value is non-zero. If everything is zero
      // the expanded panel renders the "no recorded micros" hint.
      editMicrosExpandShow: 'Add micronutrient details',
      editMicrosExpandHide: 'Hide micronutrient details',
      editMicrosEmpty: 'No recorded micros — add values via the AI parse flow.',
      // Bug 4 — mutation in-flight labels.
      deleting: 'Deleting…',

      // History.
      firstLoggedFormat: 'First logged · {date}',
      totalCountFormat: 'Logged {count}× total',
      neverLogged: 'Never logged — tap "Log this now" to begin',
      recentUsesHeading: 'Recent uses:',
      noRecentUses: 'No recent uses.',

      // Actions.
      logThisNow: 'Log this now',
      edit: 'Edit',
      save: 'Save changes',
      saving: 'Saving…',
      cancel: 'Cancel',
      deleteAriaLabel: 'Delete this item',
      editNameAriaLabel: 'Edit name',
      editPortionAriaLabel: 'Edit portion',

      // Edit-mode field labels.
      nameLabel: 'Name',
      portionLabel: 'Portion value',
      unitLabel: 'Unit',
      unitSelectPlaceholder: 'Select unit',
      kcalLabel: 'Kcal',
      sodiumLabel: 'Sodium',
      thumbnailUrlLabel: 'Thumbnail URL',

      // Validation error messages.
      errNameRequired: 'Name is required.',
      errNameTooLong: 'Name is too long (max 120 characters).',
      errPortionPositive: 'Portion must be greater than 0.',
      errPortionWhole: 'Portion must be a whole number for this unit.',
      errUnitTooLong: 'Unit label too long (max 16 characters).',
      errKcalInteger: 'Calories must be a whole number 0 or greater.',
      errMacroNonneg: 'Must be 0 or greater.',
      // Codex R3 I2-R2-1 (bugfix library-micros-parse 2026-05-17) — distinct
      // copy for NaN input on a generic micro (e.g. user typed 'abc'). The
      // macros nonneg key already covers negative + zero, so this key is
      // reserved for the non-finite case. Same surface as macro errors.
      errMicroNumber: 'Must be a number.',
      errUrlInvalid: 'Must be a valid URL.',

      // Toast + error UX.
      deletedToast: '1 item deleted · undo 5s',
      deleteFailedToast: 'Delete failed. Retry when ready.',
      saveFailedBanner: "Couldn't save changes. Try again.",
      undoFailedToast: 'Undo failed.',

      // 404 state.
      notFoundHeading: 'No ledger entry for this id',
      notFoundBody: 'Return to the index and pick another title.',
      notFoundLink: 'Return to index',

      // Task C.2 — Log Now atomic insert (AC4).
      logging: 'Logging…',
      logNowSuccessToast: 'Logged · view in today’s log',
      logNowDeeplinkLabel: 'View',
      logNowDeeplinkHref: '/dashboard',
      logNowErrorBanner: "Couldn't log — try again",
      duplicateLogConfirmMessage:
        'You have already logged this item for this meal today. Are you sure you want to add another one?',
      // Meal-slot picker that opens above the LOG THIS NOW button.
      // Replaces the previous immediate-log behavior — the server would
      // otherwise time-of-day-heuristic the meal slot, which guessed
      // wrong when re-logging last night's dinner from the morning.
      logNowMealPickerAriaLabel: 'Pick a meal slot for this log',
    },

    // Task C.2 — Recent Entries section (AC1).
    recentEntries: {
      kicker: '§ 04 · Recent Entries',
      title: 'Recent Entries',
      meta: 'Last 14 days · {N} entries',
      emptyHeadline: 'No entries logged yet.',
      emptyBody: 'Log a food to see it here.',
      groupToday: 'Today',
      groupYesterday: 'Yesterday',
      timeSrPrefix: 'logged at',
      mealBreakfast: 'Breakfast',
      mealLunch: 'Lunch',
      mealDinner: 'Dinner',
      mealSnack: 'Snack',
      kcalSuffix: 'kcal',
      rowAriaLabel: '{name}, {meal}, logged {time}, {kcal} calories',
      errorMessage: 'Couldn’t load recent entries. Refresh the page or try again in a moment.',
    },
  },

  progress: {
    // Task 1.2 placeholder heading + body — kept for any remaining Task 1.2
    // consumers during the 4.3a rollout. Task 4.3a ships the real charts.
    stubHeading: '§ 03 · Progress',
    stubBody: 'Progress charts arrive with Task 4.x.',
    dataTableClose: 'Close',

    // --- Task 4.3a Progress page ---
    masthead: {
      title: 'The progress ledger,',
      titleEm: 'bound volume.',
      issuePrefix: 'VOL. ∞',
    },
    toolbar: {
      kicker: '§ LEDGER RANGE',
      labels: {
        D: 'day.',
        W: 'week.',
        M: 'month.',
        last_7: 'Last 7 days',
        last_30: 'Last 30 days',
        custom: 'Custom',
      },
      ariaLabel: 'Progress date range',
      ariaDescD: 'Day — rolling 24 hours',
      ariaDescW: 'Week — rolling 7 days',
      ariaDescM: 'Month — rolling 30 days',
      ariaDesc: {
        last_7: 'Last 7 days',
        last_30: 'Last 30 days',
        custom: 'Custom date range',
      },
      startDateLabel: 'Start date',
      endDateLabel: 'End date',
      applyCustom: 'Apply custom range',
      loadingTitle: 'Refreshing range',
      loadingBody: (range: string) => `Loading ${range.toLowerCase()} data.`,
      errors: {
        required: 'Choose a start and end date.',
        startAfterEnd: 'Start date must be on or before end date.',
        futureEnd: 'End date cannot be in the future.',
        tooLong: 'Custom range cannot exceed 365 days.',
      },
    },
    sections: {
      adherence: { kicker: '§ 01', title: 'Adherence', subtitle: 'a tally of calories kept.' },
      minorElements: {
        kicker: '§ 02',
        title: 'Minor elements',
        subtitle: 'the trace-record, cell by cell.',
      },
      trends: {
        kicker: '§ 03',
        title: 'Trends',
        subtitle: 'the line, printed in italics.',
      },
      fromEditor: {
        kicker: '§ 04',
        title: 'From the editor',
        subtitle: 'a weekly note on the record.',
      },
    },
    calorieAdherence: {
      title: 'The balance, measured',
      sparseKicker: '§ SPARSE DATA',
      sparseBody: 'at least three days produces a reading.',
      zeroBody: 'Nothing to chart yet. Log a meal to begin the record.',
      zeroCta: 'BEGIN LOGGING →',
    },
    macroDistribution: {
      title: 'The four estates, stacked',
      legend: {
        ariaLabel: 'Macro legend',
        protein: 'protein',
        carbs: 'carbs',
        fat: 'fat',
        fiber: 'fiber',
        cholesterol: 'cholesterol (mg)',
      },
    },
    heatmap: {
      title: 'The',
      titleEm: 'minor elements',
      titleSuffix: ', {rangeWord}',
      rangeWord: {
        D: 'today',
        W: 'this week',
        M: 'in thirty',
      },
      scanMeta: {
        lastScan: 'LAST SCAN',
        nextRecalc: 'NEXT RECALC',
        dataPoints: 'DATA POINTS',
      },
      sparseCaption: 'Log three or more days to see the heatmap fill in.',
      legendUnder: 'under',
      legendOver: 'at target',
      viewAsTable: 'View heatmap as table',
      todayLabelSuffix: '· today, in progress',
      scrollAriaLabel: 'Micronutrient heatmap scrollable',
      showAllMicronutrients: 'Show all micronutrients',
      hideAllMicronutrients: 'Hide all micronutrients',
      closeDetail: 'Close nutrient detail',
    },
    trendSummary: {
      title: 'The line, printed',
      sparseCopy: 'At least three days are needed before the ledger can speak of trends.',
    },
    loggingConsistency: {
      title: 'The logging',
      titleEm: 'ledger',
      viewAsTable: 'View logging calendar as table',
      metaTemplate: '{logged} of {total} {unit} logged · {meals} meals in range',
      emptyCopy: 'No logs recorded in this window.',
    },
    weeklyReview: {
      kicker: '§ 10 · FROM THE EDITOR',
      masthead: 'WEEKLY REVIEW — WEEK OF',
      footerPrefix: 'generated',
      footerMid: 'via Gemini Flash',
      footerSuffix: 'cached until',
      regenerateLink: 'REGENERATE REVIEW',
      regenerateDisabledReason: 'Regenerates automatically each Monday.',
      sparse: {
        kickerLabel: '§ THE EDITOR’S NOTE',
        body: 'Too little logged this week for a full review.',
        emptyDaysBody: 'No days were logged in the past seven.',
      },
      period: {
        kicker: '§ PERIOD NOTE · FROM THE EDITOR',
        masthead: {
          D: 'DAILY NOTE',
          M: '30-DAY NOTE',
          custom: 'SELECTED RANGE NOTE',
        },
        sparse: {
          D: {
            kickerLabel: '§ THE EDITOR’S NOTE',
            body: 'Too little logged today for a period note.',
            emptyDaysBody: 'No logs recorded today.',
          },
          M: {
            kickerLabel: '§ THE EDITOR’S NOTE',
            body: 'Too little logged in this 30-day window for a period note.',
            emptyDaysBody: 'No logs recorded in this 30-day window.',
          },
          custom: {
            kickerLabel: '§ THE EDITOR’S NOTE',
            body: 'Too little logged in this selected range for a period note.',
            emptyDaysBody: 'No logs recorded in this selected range.',
          },
        },
      },
      error: {
        body: 'Insights unavailable at the moment. The chart record still stands.',
      },
      updating: 'Updating summary',
      summaryFallback: {
        body: 'The AI summary could not refresh. The charts above still show the selected range.',
        nextAction: 'Log another meal or water entry, then refresh this range.',
      },
      aiFailedTitle: 'AI parsing failed.',
      aiFailedBody:
        'The latest AI summary could not be generated and no previous summary is available.',
      retryAiSummary: 'Retry AI summary',
      viewAsTable: 'View weekly review as data table',
    },
    footer: {
      generatedPrefix: 'GENERATED',
      cachedPrefix: 'CACHED UNTIL',
      dataPointsSuffix: 'DATA POINTS',
      chartsSectionLabel: 'Progress charts',
    },
    errors: {
      chartUnavailable:
        'The chart record is temporarily unavailable. The ledger itself still stands.',
    },
  },

  settings: {
    // Task B.6 (US-STAB-B6) — page <h1>. Replaces the deleted Task 1.2 stub
    // heading/body keys; sourced by `app/(app)/settings/page.tsx`.
    heading: 'Settings',
    // Task 5.1.6 — Display section + Reduce Motion toggle copy
    // (ux-auditor §H + briefing §4c).
    displayHeading: 'Display',
    reduceMotionLabel: 'Reduce motion',
    reduceMotionDescription: 'Disable transitions and animations across the app.',
    aiSummary: {
      label: 'AI nutrition summaries',
      description:
        'Allow dashboard and progress summaries to send food, water, weight, and goal context to Gemini.',
      error: 'The setting could not be saved. Try again.',
    },
    profileHeading: 'Profile',
    birthdayLabel: 'Birthday',
    ageLabel: 'Age',
    profileMissingValue: '\u2014',

    // Task 5.2 — Settings § 04 DATA + § 05 ACCOUNT (synthesis §2.3).
    data: {
      kicker: '§ 04 · DATA',
      title: 'Your records',
      caption:
        'Includes all entries, library items, weight log, water log. ISO 8601 timestamps in UTC with your timezone column.',
      exportCsv: 'EXPORT AS CSV',
      exportJson: 'EXPORT AS JSON',
    },
    account: {
      kicker: '§ 05 · ACCOUNT',
      title: 'Credentials and closure',
      signedInPrefix: 'Signed in',
      signOutLabel: 'End this session.',
      signOutCta: 'SIGN OUT',
      dangerKicker: '§ DANGER',
      dangerSubtitle: 'Permanent closure of the ledger.',
      deleteLink: 'Delete account →',
      deleteAriaLabel: 'Delete account — opens a 3-step confirmation flow that cannot be undone',
    },
    // Task 5.2 — AccountDeleteFlow microcopy (synthesis §2.1).
    accountDelete: {
      step1: {
        kicker: '§ DANGER',
        title: 'This cannot be undone.',
        body: 'Deleting your account removes everything you have ever logged. There is no recovery. There is no export after the fact.',
        bullets: [
          'All food entries',
          'All library items and their thumbnails',
          'All weight log entries',
          'All water log entries',
          'Your profile — name, DOB, target, settings',
          'Your email and password',
          'Your weekly reviews and AI call logs',
        ],
        cancel: 'CANCEL',
        continue: 'I WANT TO CONTINUE',
      },
      step2: {
        title: 'Confirm by typing your email.',
        body: 'Enter the email you signed up with. Capital letters do not matter.',
        label: 'EMAIL TO CONFIRM',
        matchAnnouncement: 'Email confirmed.',
        cancel: 'CANCEL',
        deleteCta: 'DELETE MY ACCOUNT',
      },
      step3: {
        title: 'Last chance.',
        checkbox: 'I understand that my ledger and its entries will be permanently destroyed.',
        cancel: 'CANCEL',
        deleteCta: 'DELETE NOW',
        countdownSeconds: [
          'ten seconds…',
          'nine seconds…',
          'eight seconds…',
          'seven seconds…',
          'six seconds…',
          'five seconds…',
          'four seconds…',
          'three seconds…',
          'two seconds…',
          'one second…',
        ],
        ready: 'READY',
        // SR-only announcements (only fire at t=0, t=5, t=9, t=10 per Conflict #15).
        announce: {
          ten: 'Ten seconds.',
          five: 'Five seconds.',
          one: 'One second.',
          ready: 'Ready.',
        },
      },
      step4: {
        kicker: '§ DELETING',
        title: 'Destroying your ledger.',
        caption: 'please stay on this page until the ledger closes',
        phases: {
          photosStart: '→ Removing photos…',
          photosDone: '✓ Photos removed.',
          recordsStart: '→ Removing records…',
          recordsDone: '✓ Records removed.',
          accountStart: '→ Removing account…',
          accountDone: '✓ Account removed.',
        },
        announce: {
          photos: 'Storage.',
          records: 'Data.',
          account: 'Auth.',
          done: 'Sign out.',
        },
      },
      step5: {
        toast: 'Your account has been deleted.',
      },
      step6: {
        recoverableTitle: 'The ledger could not be closed.',
        recoverableBody: 'Some data may remain. We have logged the failure for support.',
        unrecoverableTitle: 'The ledger could not be closed.',
        unrecoverableBody:
          'Your data has been removed but the account record could not be closed. Please contact support to finish.',
        causePrefix: 'cause: ',
        retry: 'TRY AGAIN',
        contactSupport: 'CONTACT SUPPORT',
      },
    },
    // Task 5.2 — ExportModal (synthesis §2.2).
    exportModal: {
      kicker: '§ EXPORT',
      title: 'Preparing your archive.',
      bodyFormat:
        '{N} entries, {L} library items, {W} weight entries, {X} water entries. Your complete ledger.',
      phaseRead: 'reading records…',
      phaseSerialize: 'serializing…',
      phaseCompress: 'compressing…',
      phaseReady: 'ready',
      estimate: 'this usually takes 2–6 seconds',
      filenameCaptionFormat: 'kalori-export-{userId}-{YYYYMMDD}.{ext}',
      exportCta: 'EXPORT',
      downloadCta: 'DOWNLOAD',
      downloadComplete: 'DOWNLOAD COMPLETE',
      cancel: 'CANCEL',
      errorTitle: 'Export failed.',
      errorCausePrefix: 'cause: ',
      retry: 'RETRY',
      reducedMotionWait: '...please wait',
      slowWarning15s: 'Still working… large archives can take a moment.',
    },
    // Task 5.2 — Cross-tab sign-out banner (synthesis §2.4).
    crossTabBanner: {
      bodyFormat: 'You signed out in another tab. Redirecting in {seconds}s.',
      countdownFormat: '{seconds}s',
      signInCta: 'SIGN IN',
      glyph: '!',
    },
  },

  errors: {
    // Task 2.x / 5.x extend with auth, system, AI failure keys.
    // Minimum stubs so the namespace exists per Task 1.3 AC.
    generic: 'Something went wrong. Try again.',
    networkOffline: 'Offline. Changes will sync when you reconnect.',
  },

  auth: {
    // Task 2.1c sign-in surface (design-doc §6 + ui-design §7.8).
    // Magic-link path: email input + oxblood primary submit.
    // OAuth path: "Continue with Google" secondary button.
    // Ledger styling is owned by the component; these are copy-only keys.
    title: 'Sign in',
    tagline: 'A record of what you eat, kept like a journal.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    submitMagicLink: 'Send magic link',
    submitting: 'Sending\u2026',
    orDivider: 'or',
    continueWithGoogle: 'Continue with Google',
    googleIconA11y: 'Google',
    magicLinkSent: 'Magic link sent. Check your inbox to finish signing in.',
    privacyFooter: 'Private. Owner-only. No ads, no tracking.',
    errorGeneric: 'Couldn\u2019t send the magic link. Try again in a moment.',
    errorGoogle: 'Couldn\u2019t start Google sign-in. Try again in a moment.',
    errorCallback: 'Sign-in link was invalid or expired. Request a new one.',
    errorEmailRequired: 'Enter your email to receive a magic link.',
    errorEmailInvalid: 'That doesn\u2019t look like a valid email address.',
    deletedBanner: {
      title: 'Account deleted.',
      body: 'Your account and all associated data have been removed.',
    },
  },

  weight: {
    // Task 4.3b extends with full weight-tracking keys.
    kickerStub: '§ 04 · Weight',

    // --- /weight page masthead ---
    pageTitle: 'Weight,',
    pageSubtitle: 'a ledger of measurements',

    // --- quick-add form (inline + /weight full form) ---
    logKicker: 'LOG',
    logTodayFormat: 'TODAY · {date}',
    weightLabel: 'WEIGHT',
    dateLabel: 'DATE',
    unitChoiceLabel: 'UNIT',
    noteLabel: 'NOTE (OPTIONAL)',
    notePlaceholder: 'after morning coffee, pre-breakfast',
    saveEntryCta: 'SAVE ENTRY',
    saveEntryLoading: 'SAVING…',
    inlineLogCta: '+ LOG WEIGHT TODAY',
    backfillUnavailable: 'BACKFILL ≥ 30 DAYS UNAVAILABLE',
    unitKg: 'kg',
    unitLb: 'lb',

    // --- helper / error copy ---
    inputHelper: 'Kilograms, one decimal place.',
    errorOutOfRange: 'Enter a weight between 30 and 350 kilograms.',
    errorDateTooOld: 'Pick a date within the last 30 days.',
    errorRequired: "Today's weight is required.",

    // --- live region announcements (a11y) ---
    liveSubmitting: 'Entry recorded locally, saving.',
    liveSaveSuccessFormat: 'Weight saved. {weight} kilograms on {dateHuman}.',
    // Codex R2-I1: rollback ARIA-live is unit-aware — the formatter injects
    // either "kilograms" or "pounds" per the user's unitPref so imperial
    // users hear "Restored to 149.9 pounds" instead of "… kilograms".
    liveRollbackFormat:
      'Weight not saved. Restored to {previousWeight} {unitLabel}. Undo available.',
    liveRollbackUnitLabelKg: 'kilograms',
    liveRollbackUnitLabelLb: 'pounds',
    liveTargetUpdatedFormat:
      'Calorie target updated. New target {newTarget} kilocalories per day. Select see why for the calculation.',
    liveTargetRecalculatedFormat:
      'Target recalculated. {newTarget} kilocalories per day based on current weight.',

    // --- rollback toast ---
    // Codex R2-I1: visible toast body is unit-aware. `{unit}` renders "kg"
    // or "lb" (matches `unitKg` / `unitLb` above); `{previousWeight}` is
    // formatted in that unit by the caller.
    rollbackToastBodyFormat: 'Couldn’t save your weight. We’ve restored {previousWeight} {unit}.',
    rollbackToastUndo: 'UNDO',
    rollbackToastDismiss: 'DISMISS',
    rollbackToastUndoSr: 'Retry the save with the same weight you entered.',
    rollbackToastDismissSr: 'Dismiss this message.',

    // --- history list ---
    historyKicker: 'HISTORY',
    historyWindowLabel: 'LAST 30 DAYS',
    historyEmptyHeadline: 'Ledger empty.',
    historyEmptySubhead: 'A new entry opens the archive.',
    historyTodayAnnotation: '(today)',
    historyShowOlder: 'SHOW OLDER ENTRIES',
    deltaUnit: 'kg',
    deltaZeroGlyph: '—',

    // --- trajectory chart meta ---
    chartTitle: 'Weight,',
    chartSubtitle: 'a trajectory',
    chartEmptyState: 'The ledger begins with your first entry.',
    chartSingleMeasurement: 'One measurement logged. Two more and a trend emerges.',
    chartTrendAvailableAt: 'trend available at 5 entries',
    chartGapAnnotation: '{n}-day gap',
    chartMetaFormat: '{start} → {current} kg · {delta} over {range}',
    chartAxisWeightLabel: 'WEIGHT (KG)',
    chartAxisRange7d: 'LAST 7 DAYS',
    chartAxisRange30d: 'LAST 30 DAYS',
    chartAxisRange90d: 'LAST 90 DAYS',
    chartAxisRange1y: 'LAST YEAR',
    chartPointA11yFormat: '{date}, {weight} kilograms, {delta} from previous.',
    chartSrSummaryFormat:
      'Starting weight {start} kilograms, current weight {current} kilograms, change {delta} over {range}. {count} measurements logged.',
    chartFigCaption: 'Weight trajectory, last 30 days',
    chartGoalLineLabel: 'goal weight',

    // --- progress page section header ---
    progressSectionKicker: '§ 05 · WEIGHT',
    progressSectionTitle: 'Weight',
    progressSectionSubtitle: 'a trajectory',
  },

  targetNudge: {
    // Task 4.3b — Dashboard "Target updated to X kcal" nudge card (F9 mitigation).
    eyebrow: 'TARGET · UPDATED',
    headlineFormat: 'Target updated to {kcal} kcal',
    bodyDefault: 'From your latest weight entry.',
    bodyDecreasedFormat: 'From your latest weight entry. Target decreased by {delta} kcal.',
    bodyIncreasedFormat: 'From your latest weight entry. Target increased by {delta} kcal.',
    recalculateCta: 'RECALCULATE NOW',
    recalculateCtaLoading: 'RECALCULATING…',
    seeWhyCta: 'see why',
    dismissCta: 'DISMISS',
    dismissA11y: 'Dismiss target-updated notification',
    recalcDescSr: 'Re-run the target calculation from your current weight.',
    dismissDescSr: 'Mark this notification as seen.',
    regionA11y: 'Calorie target update',
    // Codex R2-C1: visible error surface when dismiss/recalc server POST
    // fails. The card stays visible, success is NOT announced, and the user
    // can retry via the retry CTA.
    errorDismissCopy: 'Couldn’t dismiss. Check your connection and try again.',
    errorRecalcCopy: 'Couldn’t recalculate. Check your connection and try again.',
    errorRetryCta: 'TRY AGAIN',
  },

  water: {
    // Task 3.5 extends with full water-tracking keys.
    kickerStub: '§ 05 · Water',
  },

  onboarding: {
    // 8-step labels per design-doc.md §10.3.
    stepBioSex: 'Bio sex',
    stepAge: 'Age',
    stepHeight: 'Height',
    stepWeight: 'Current weight',
    stepGoalWeight: 'Goal weight',
    stepPace: 'Pace',
    stepActivity: 'Activity level',
    stepResults: 'Results',
    // Task 2.1e stub copy — retained for backwards compatibility with the
    // Task 2.1e stub page (never shown now that Task 2.2 ships the wizard).
    stubHeading: '\u00A7 00 \u00B7 Welcome',
    stubBody: 'Onboarding wizard arrives with Task 2.2.',

    // --- step titles + subtitles (ux-specialist §1) ---
    step1Title: 'Biological sex',
    step1Subtitle: 'Used only for the metabolism equation. Choose what fits.',
    step2Title: 'Your birthday',
    step2Subtitle: 'Pick the date. We calculate your age from it.',
    step3Title: 'How tall are you?',
    step3Subtitle: 'We store metric. Switch if you prefer.',
    step4Title: "What's your current weight?",
    step4Subtitle: 'Today\u2019s number. Honest feels better than flattering.',
    step5Title: "What's your goal weight?",
    step5Subtitle: 'Where you want to be. Not forever \u2014 just your next checkpoint.',
    step6Title: 'How fast do you want to get there?',
    step6Subtitle: 'Each pace shows the date you\u2019d reach your goal.',
    step7Title: 'How active are you?',
    step7Subtitle: 'Day-to-day movement, not workouts.',
    step8Title: 'Your daily target',

    // --- eyebrows (design-lead §4 "STEP 03 \u00B7 HEIGHT") ---
    eyebrow1: 'STEP 01 \u00B7 BIO SEX',
    eyebrow2: 'STEP 02 \u00B7 BIRTHDAY',
    eyebrow3: 'STEP 03 \u00B7 HEIGHT',
    eyebrow4: 'STEP 04 \u00B7 WEIGHT',
    eyebrow5: 'STEP 05 \u00B7 GOAL',
    eyebrow6: 'STEP 06 \u00B7 PACE',
    eyebrow7: 'STEP 07 \u00B7 ACTIVITY',
    eyebrow8: 'STEP 08 \u00B7 YOUR DAILY TARGET',

    // --- field labels + placeholders ---
    ageLabel: 'AGE',
    birthdayLabel: 'BIRTHDAY',
    birthdayAgePreview: 'AGE {age}',
    agePlaceholder: '\u2014',
    heightLabel: 'HEIGHT',
    weightLabel: 'WEIGHT',
    goalWeightLabel: 'GOAL WEIGHT',

    // --- unit toggle ---
    unitToggleLabel: 'Measurement unit',
    unitCm: 'CM',
    unitIn: 'IN',
    unitKg: 'KG',
    unitLb: 'LB',

    // --- bio sex chips ---
    bioSexMale: 'Male',
    bioSexFemale: 'Female',
    bioSexOther: 'Other',
    bioSexGroupLabel: 'Biological sex',

    // --- pace chips + target-date ---
    paceRelaxed: 'Relaxed',
    paceRelaxedSub: 'Slow and steady.',
    paceSteady: 'Steady',
    paceSteadySub: 'The middle path.',
    paceAggressive: 'Aggressive',
    paceAggressiveSub: 'Bigger daily deficit.',
    paceTargetPrefix: 'TARGET',
    paceGroupLabel: 'Pace',

    // --- activity chips + italic subtitles ---
    activitySedentary: 'Sedentary',
    activitySedentarySub: 'Desk work, little walking.',
    activityLight: 'Light',
    activityLightSub: 'Light exercise 1\u20133 days/week.',
    activityModerate: 'Moderate',
    activityModerateSub: 'Moderate exercise 3\u20135 days/week.',
    activityActive: 'Active',
    activityActiveSub: 'Hard exercise 6\u20137 days/week.',
    activityVeryActive: 'Very active',
    activityVeryActiveSub: 'Physical job or twice-daily training.',
    activityGroupLabel: 'Activity level',

    // --- goal-weight delta chip (ux-specialist §4) ---
    goalWeightDeltaLose: 'YOU WANT TO LOSE {amount} {unit}',
    goalWeightDeltaGain: 'YOU WANT TO GAIN {amount} {unit}',
    goalWeightDeltaMaintain: 'YOU\u2019RE AT YOUR GOAL WEIGHT',

    // --- results screen (ux-specialist §6) ---
    resultsAttribution: 'your daily budget, by the equation of Mifflin & St Jeor',
    targetValueLabel: 'DAILY TARGET',
    kcalUnit: 'kcal',
    bmrLabel: 'BMR',
    tdeeLabel: 'TDEE',
    dailyDeltaLabel: 'DAILY DELTA',

    // --- how-we-calculated panel ---
    howWeCalculatedToggle: 'HOW WE CALCULATED THIS',
    howWeCalculatedHeading: 'How we calculated this',
    howWeCalculatedAttribution: 'Mifflin\u2013St Jeor 1990 \u2014 the standard clinical equation.',
    howWeCalculatedPlain:
      'Your target is your TDEE shifted by the daily calorie change needed to hit your goal weight at your chosen pace.',
    formulaBmr: 'BMR = 10 \u00D7 weight + 6.25 \u00D7 height \u2212 5 \u00D7 age + s',
    formulaBmrConstants: '(s = +5 male, \u2212161 female, \u221278 other)',
    formulaTdee: 'TDEE = BMR \u00D7 activity multiplier',
    formulaTdeeMultipliers:
      '(sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9)',
    formulaTarget: 'target = TDEE + (goal delta \u00D7 7700 / pace weeks / 7)',
    formulaTargetNote: '(rounded to nearest 10 kcal)',
    yourValuesHeading: 'YOUR VALUES',
    yourValuesLineBmr: 'BMR = {value} kcal',
    yourValuesLineTdee: 'TDEE = {value} kcal',
    yourValuesLineGoalDelta: 'goal delta = {value} kg',
    yourValuesLinePaceWeeks: 'pace weeks = {value}',
    yourValuesLineDailyDelta: 'daily delta = {value} kcal',
    yourValuesLineTarget: 'target = {value} kcal',

    // --- sub-1200 safety warning (DECIDED per ux-specialist §7) ---
    sub1200Warning:
      'This target sits below 1200 kcal \u2014 uncommon territory. Consider a gentler pace if you\u2019re not working with a clinician.',
    sub1200IconLabel: 'Caution',
    sub1200Heading: 'Daily target below 1200 kilocalories',

    // --- actions / buttons (ux-specialist §10) ---
    buttonBack: 'BACK',
    buttonNext: 'NEXT',
    buttonNextLoading: 'SAVING\u2026',
    buttonStartTracking: 'START TRACKING',
    buttonStartTrackingLoading: 'STARTING\u2026',

    // --- progress + a11y ---
    progressA11y: 'Onboarding, step {N} of 8',
    progressLabel: 'Onboarding progress',

    // --- validation errors (ux-specialist §1) ---
    errorBioSexRequired: 'Choose an option to continue.',
    errorAgeRange: 'Enter an age between 13 and 120.',
    errorBirthdayRange: 'Choose a birthday that makes your age 13 to 120.',
    errorHeightRange:
      'Enter a height between 100 and 250 cm (3\u20323\u2033 \u2013 8\u20322\u2033).',
    errorWeightRange: 'Enter a weight between 30 and 350 kg (66 \u2013 772 lb).',
    errorGoalWeightRange: 'Enter a goal weight between 30 and 350 kg (66 \u2013 772 lb).',
    errorPaceRequired: 'Choose a pace to continue.',
    errorActivityRequired: 'Choose one to continue.',

    // --- async save errors (ux-specialist §12) ---
    saveErrorGeneric: 'Couldn\u2019t save that step. Check your connection and try again.',
    saveErrorRetry: 'Save failed. Tap Next to try again.',
    startTrackingError: 'Couldn\u2019t save your profile. Try again in a moment.',

    // --- SR live-region step announcement (ux-auditor §5; 150ms-delayed
    // aria-live="polite" region in WizardShell). Template substitutions:
    // {N} = current step, {total} = 8, {title} = step title. Announces after
    // focus shift so SR queues "Step 2 of 8: Your age" without interrupting
    // the focus move itself.
    stepAnnouncement: 'Step {N} of {total}: {title}',
  },

  fab: {
    // 56-square oxblood FAB — aria-label per ui-design.md §6.4.
    // Pre-Bug-#5 alias retained so any out-of-tree consumer that imports
    // `t.fab.logA11y` keeps compiling during the rename round.
    logA11y: 'Log food',
    // Bug #5 (bugfix-tomi 2026-05-08-mobile-ui-overhaul, tiebreaker #24):
    // dual FAB pair — food primary, water secondary. Distinct aria-labels
    // so screen readers announce them as different actions.
    logFoodA11y: 'Log food',
    logWaterA11y: 'Log water',
    // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — water FAB now
    // POSTs `/api/water/log` directly with `{ unit:'glass', count:1 }`
    // (== 250 ml per `lib/dashboard/types.ts`). The terse 250 ml literal
    // is intentional — parallels `dashboard.water.liveAddedFormat`.
    waterLoggedToast: '250 ml logged',
    waterLoggedAnnounce: 'Logged 250 millilitres of water.',
    waterLoggedFailed: 'Could not log water. Try again.',
    // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — FAB-side
    // cap-reached strings. Same copy as the chip surface for visual
    // consistency in the toast carousel; separate keys so future copy
    // can diverge. Triggered when the server returns 409 OVER_DAILY_LIMIT.
    waterCapReached: 'Daily water limit reached (5 L)',
    waterCapReachedAnnounce: 'Daily water limit of 5 litres reached. Cannot add more today.',
  },

  user: {
    // Anonymous fallback shown when no user is authenticated (AC3, US-STAB-A2).
    // Rendered Inter 10.5 UPPERCASE per ui-design.md §6.2.
    anonymousLabel: 'GUEST',
    // AC4 / DT-9 terminal fallback when both email and full_name are empty.
    // Mirrored as a literal in `lib/auth/get-display-identity.ts`; the resolver
    // does NOT depend on this key (kept for future localization symmetry).
    accountFallback: 'Account',
    // Sidebar identity row aria-label fragments (US-STAB-A2 ux-style §5.1).
    // Composed at render time via `${signedInAs} ${displayName}`.
    signedInAs: 'Signed in as',
    notSignedIn: 'Not signed in',
    // Sign-out action labels (shared between sidebar + profile menu).
    signOutLabel: 'Sign out',
    signOutA11y: 'Sign out',
    // Profile-menu a11y + menu-item labels.
    menuA11y: 'Account menu',
    menuActionsA11y: 'Account actions',
    menuSettings: 'Settings',
    menuExport: 'Export',
  },

  shortcutsOverlay: {
    heading: 'Keyboard shortcuts',
    stubBody: 'Shortcuts coming soon.',
  },

  // Task 5.1.2 — offline fallback page (rendered by SW when navigation
  // fails AND nothing matching the route is in the runtime cache).
  // Copy contract: ux-specialist §H. Period, no exclamation, Ledger voice.
  offline: {
    headline: "You're offline.",
    body: "Kalori needs a connection to load this page. Your pending changes will sync when you're back online.",
    pendingSingular: '1 change pending.',
    /** {N} placeholder filled at render time. */
    pendingPlural: '{N} changes pending.',
    /**
     * F-PWA-OFFLINE-HYDRATION — server-rendered placeholder for the
     * pending-count line. When the offline document is served from cache
     * but the client island's JS chunk has not been runtime-cached, this
     * line stays visible (vs. silent absence) so the user has context.
     * The island replaces this once it hydrates with the live count.
     */
    pendingPlaceholder: 'Pending changes will appear when the app is back online.',
    retryLabel: 'Retry',
    retryAria: 'Retry loading this page',
  },

  // Task 5.1.4 — PWA install affordance + offline indicator UI.
  // Copy is verbatim from `Planning/.tmp/task-5.1-ui-ux-specialist.md` §A
  // (PWA install) + §B (offline bar) + §J (IDB-unavailable toast).
  pwa: {
    install: {
      kicker: '§ INSTALL',
      title: 'Keep Kalori close.',
      bodyAndroid:
        "Add Kalori to your home screen for offline-ready ledger access. No App Store, no installs — it's already here.",
      bodyIos:
        'Add Kalori to your home screen for offline-ready ledger access. iOS asks you to do it manually.',
      iosStepsHeading: 'Three steps:',
      iosStep1: 'Open this page in Safari.',
      iosStep2: 'Tap the share button at the bottom of the screen.',
      iosStep3: 'Choose "Add to home screen".',
      iosShareIllustrationAria: "Share sheet opened with 'Add to Home Screen' option highlighted",
      whatYouGetHeading: 'What you get:',
      whatYouGet1: 'Offline access to your library and last 7 days',
      whatYouGet2: 'Quick launch from home screen',
      whatYouGet3: 'Native-like photo capture',
      ctaInstall: 'INSTALL',
      ctaNotNow: 'NOT NOW',
      ctaGotIt: 'GOT IT',
      backdropDismissAria: 'Dismiss install prompt',
      titleId: 'pwa-install-title',
      bodyId: 'pwa-install-body',
    },

    bar: {
      // Note: copy is composed at render time so the {HH:mm} / {N} substitution
      // happens once. Keep the templates here for the i18n rule; consumers join
      // them with the live values.
      offlineCachedAtFormat: 'Offline · cached from {HH:mm}',
      offlineSingularFormat: 'Offline · 1 change pending · cached from {HH:mm}',
      offlinePluralFormat: 'Offline · {N} changes pending · cached from {HH:mm}',
      offlineCappedFormat: 'Offline · 99+ changes pending · cached from {HH:mm}',
      syncingSingular: 'Syncing 1 change',
      syncingPluralFormat: 'Syncing {N} changes',
      syncedSingularFormat: 'Synced · 1 change · {HH:mm}',
      syncedPluralFormat: 'Synced · {N} changes · {HH:mm}',
      errorSingular: "Couldn't sync 1 change. Tap to retry.",
      errorPluralFormat: "Couldn't sync {N} changes. Tap to retry.",
      // Pure announcement text — omits count so the polite live region does
      // NOT speak on every count tick. Per `task-5.1-ui-ux-specialist.md`
      // §B.4 + ux-auditor §D.
      announcementOffline: 'Offline.',
      announcementSyncing: 'Syncing.',
      announcementSynced: 'Synced.',
      announcementError: "Couldn't sync. Tap to retry.",
    },
    idbUnavailable: {
      message: 'Offline support unavailable in this browser.',
      dismissAria: 'Dismiss offline support notice',
    },
    // Task 5.1.5 — Replay status badge (composes into OfflineBar).
    badge: {
      idleSingular: 'Q · 1',
      idlePluralFormat: 'Q · {N}',
      replayingSingular: 'Q · 1 →',
      replayingPluralFormat: 'Q · {N} →',
      conflictSingular: 'Q · 1 ⚠',
      conflictPluralFormat: 'Q · {N} ⚠',
      errorSingular: 'Q · 1 !',
      errorPluralFormat: 'Q · {N} !',
      ariaIdleFormat: '{N} changes pending. Click to review.',
      ariaReplayingFormat: 'Syncing {N} changes.',
      ariaConflictFormat: '{N} changes need attention. Click to review.',
      ariaErrorFormat: '{N} changes failed. Click to review.',
    },
    // Task 5.1.5 — Replay drawer (Radix Dialog right-side sheet).
    drawer: {
      title: 'Pending changes',
      subtitleSingular: '1 change waiting',
      subtitlePluralFormat: '{N} changes waiting',
      closeAria: 'Close pending changes drawer',
      empty: "Nothing pending. You're up to date.",
      kindEntryCreate: 'Meal entry',
      kindEntryDelete: 'Meal entry (delete)',
      kindWaterLog: 'Water log',
      kindWeightLog: 'Weight log',
      kindLibraryUpdate: 'Library item',
      kindLibraryBulkDelete: 'Library bulk delete',
      kindGoalWeightUpdate: 'Goal weight',
      statusQueued: 'Queued',
      statusSyncing: 'Syncing',
      statusSyncedFormat: 'Synced {HH:mm}',
      statusFailedFormat: "Couldn't sync. {reason}",
      retryButton: 'Retry',
      retryAllButton: 'Retry all',
      discardButton: 'Discard',
      retryAriaFormat: 'Retry syncing {kindLabel}',
      retryAllAriaFormat: 'Retry syncing all {N} failed changes',
      discardAriaFormat: 'Discard {kindLabel}',
    },
    // Task 5.1.5 — F10 goal-weight conflict modal (Radix AlertDialog).
    conflict: {
      kicker: '§ CONFLICT',
      title: 'Goal weight changed.',
      bodyFormat:
        'Your goal weight changed to {localValue} kg while offline. The current value on the server is {serverValue} kg. Choose which to keep.',
      tableOfflineFormat: 'OFFLINE · {localValue} kg · set {YYYY-MM-DD} {HH:mm}',
      tableCurrentFormat: 'CURRENT · {serverValue} kg · set {YYYY-MM-DD} {HH:mm}',
      // Codex F2 — `useOfflineButton` was removed in Round 1. The previous
      // "USE OFFLINE VALUE" CTA called the same `'use-current'` resolution
      // as the right button, lying to the user. The deferred re-introduction
      // is tracked under `F-OFFLINE-5.1.5-KEEP-OFFLINE-DEFERRED`.
      cancelButton: 'CANCEL',
      useCurrentButton: 'USE CURRENT VALUE',
      titleId: 'conflict-title',
      bodyId: 'conflict-body',
    },
  },

  // Task B.5 (US-STAB-B5) — root canonical 404 page (`app/not-found.tsx`).
  // Surface is OUTSIDE the `(app)` shell so it must carry its own masthead
  // (wordmark + kicker) and editorial body copy. Voice mirrors the segment
  // 404 (`library.detail.notFound*`) — archival, sober, no apology theatre.
  notFound: {
    metaTitle: '404 — Kalori',
    metaDesc: 'The page is not in the ledger.',
    kicker: '§ THE LEDGER · ARCHIVE',
    glyph: '404',
    glyphA11y: 'Error 404',
    body: 'This page is not in the ledger. The archive holds no record of the address you visited.',
    ctaLabel: 'RETURN TO THE LEDGER',
  },
} as const;

export type TranslationKey = keyof typeof t;

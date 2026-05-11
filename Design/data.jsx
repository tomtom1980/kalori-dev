// data.jsx — mock data, calc helpers, animation hooks

// ── Targets / user profile (would come from onboarding wizard) ─────────────
const USER = {
  name: 'Rhea',
  streak: 17,
  targetKcal: 2180,
  bmr: 1560,
  tdee: 2380,
  targets: {
    protein: 160, // g
    carbs:   240,
    fat:     70,
    fiber:   32,
    sodium:  2300,
    water:   2500,
    vitA:    900,   // mcg
    vitC:    90,    // mg
    vitD:    20,    // mcg
    vitB12:  2.4,   // mcg
    iron:    18,    // mg
    calcium: 1000,  // mg
  },
};

// ── Food library (personal, built via AI) ──────────────────────────────────
const LIBRARY = [
  {
    id: 'f1', name: 'Greek yogurt + berries', portion: '1 bowl · 220g',
    kcal: 245, p: 22, c: 28, f: 5, loggedCount: 42, tag: 'Breakfast',
    swatch: 'violet', micro: { fiber: 5, vitC: 18, calcium: 240 },
  },
  {
    id: 'f2', name: 'Avocado toast, two eggs', portion: '1 serving', 
    kcal: 520, p: 24, c: 38, f: 32, loggedCount: 28, tag: 'Breakfast',
    swatch: 'lime', micro: { fiber: 9, vitA: 210, iron: 3.2 },
  },
  {
    id: 'f3', name: 'Chicken caesar salad', portion: '1 large bowl',
    kcal: 640, p: 48, c: 22, f: 38, loggedCount: 31, tag: 'Lunch',
    swatch: 'teal', micro: { fiber: 6, sodium: 1240, vitA: 380 },
  },
  {
    id: 'f4', name: 'Grilled salmon, rice, greens', portion: '1 plate',
    kcal: 680, p: 44, c: 62, f: 22, loggedCount: 19, tag: 'Dinner',
    swatch: 'coral', micro: { fiber: 4, vitD: 16, iron: 2.1 },
  },
  {
    id: 'f5', name: 'Cold brew, splash of oat', portion: '16 oz',
    kcal: 35, p: 1, c: 6, f: 1.5, loggedCount: 86, tag: 'Drink',
    swatch: 'amber', micro: { calcium: 60 },
  },
  {
    id: 'f6', name: 'Whey protein shake', portion: '1 scoop + milk',
    kcal: 220, p: 32, c: 12, f: 4, loggedCount: 54, tag: 'Snack',
    swatch: 'sky', micro: { calcium: 380, vitB12: 2.0 },
  },
  {
    id: 'f7', name: 'Apple + almond butter', portion: '1 medium + 1 tbsp',
    kcal: 200, p: 4, c: 26, f: 10, loggedCount: 22, tag: 'Snack',
    swatch: 'lime', micro: { fiber: 6, vitC: 8 },
  },
  {
    id: 'f8', name: 'Sourdough, cheddar, tomato', portion: '1 sandwich',
    kcal: 480, p: 22, c: 52, f: 18, loggedCount: 14, tag: 'Lunch',
    swatch: 'amber', micro: { fiber: 4, calcium: 310 },
  },
  {
    id: 'f9', name: 'Dark chocolate square', portion: '10g · 70%',
    kcal: 55, p: 0.8, c: 4, f: 4, loggedCount: 38, tag: 'Snack',
    swatch: 'coral', micro: { iron: 1.1 },
  },
  {
    id: 'f10', name: 'Spinach & feta omelette', portion: '3 eggs',
    kcal: 380, p: 28, c: 6, f: 26, loggedCount: 11, tag: 'Breakfast',
    swatch: 'teal', micro: { vitA: 640, iron: 3.8, calcium: 280 },
  },
  {
    id: 'f11', name: 'Banana', portion: '1 medium',
    kcal: 105, p: 1.3, c: 27, f: 0.4, loggedCount: 47, tag: 'Snack',
    swatch: 'lime', micro: { fiber: 3, vitC: 10 },
  },
  {
    id: 'f12', name: 'Miso-glazed cod, bok choy', portion: '1 plate',
    kcal: 520, p: 38, c: 28, f: 26, loggedCount: 7, tag: 'Dinner',
    swatch: 'sky', micro: { vitD: 12, iron: 1.8, sodium: 980 },
  },
];

// ── Today's entries — current consumed state ───────────────────────────────
const TODAYS_ENTRIES = [
  { id: 'e1', foodId: 'f1', meal: 'Breakfast', time: '07:42', qty: 1 },
  { id: 'e2', foodId: 'f5', meal: 'Breakfast', time: '08:10', qty: 1 },
  { id: 'e3', foodId: 'f3', meal: 'Lunch',     time: '12:55', qty: 1 },
  { id: 'e4', foodId: 'f7', meal: 'Snack',     time: '15:30', qty: 1 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const getFood = (id) => LIBRARY.find(f => f.id === id);

function sumEntries(entries) {
  const totals = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sodium: 0, vitA: 0, vitC: 0, vitD: 0, vitB12: 0, iron: 0, calcium: 0 };
  for (const e of entries) {
    const food = getFood(e.foodId);
    if (!food) continue;
    totals.kcal  += food.kcal  * e.qty;
    totals.p     += food.p     * e.qty;
    totals.c     += food.c     * e.qty;
    totals.f     += food.f     * e.qty;
    for (const k of ['fiber','sodium','vitA','vitC','vitD','vitB12','iron','calcium']) {
      totals[k] += (food.micro?.[k] || 0) * e.qty;
    }
  }
  return totals;
}

function entriesByMeal(entries) {
  const groups = { Breakfast: [], Lunch: [], Dinner: [], Snack: [], Drink: [] };
  for (const e of entries) {
    if (groups[e.meal]) groups[e.meal].push(e);
  }
  return groups;
}

// ── Weekly & monthly history (for Progress charts) ─────────────────────────
// 30 days. Each entry: {date, kcal, target, protein, carbs, fat, weight, logged}
function genHistory() {
  const days = [];
  const today = new Date('2026-04-18');
  let w = 74.8; // starting weight, in kg — trending down gently
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    // kcal noise
    const base = 2180;
    const noise = Math.sin(i * 0.8) * 180 + Math.cos(i * 0.35) * 120;
    const wkndBump = weekend ? 220 : 0;
    const kcal = Math.max(1200, Math.round(base + noise + wkndBump - (i * 3)));
    const protein = Math.round(130 + Math.sin(i * 0.6) * 25);
    const carbs   = Math.round(220 + Math.cos(i * 0.9) * 35 + wkndBump * 0.1);
    const fat     = Math.round(65 + Math.sin(i * 0.4) * 12);
    // weight drift
    w -= 0.04 + Math.sin(i * 0.3) * 0.06;
    const logged = i > 2 ? true : (i % 2 === 0);
    days.push({
      date: d, kcal, target: 2180, protein, carbs, fat,
      weight: Math.round(w * 10) / 10,
      logged,
      dow, weekend,
    });
  }
  return days;
}

const HISTORY = genHistory();

// Milestones
const MILESTONES = [
  { id: 'm1', day: -27, title: 'First week logged', icon: 'check' },
  { id: 'm2', day: -22, title: 'First 1kg down',    icon: 'arrow' },
  { id: 'm3', day: -11, title: '10-day streak',     icon: 'flame' },
  { id: 'm4', day:  -4, title: 'Hit protein target 5 days in a row', icon: 'bolt' },
  { id: 'm5', day:   0, title: '17-day streak — keep going', icon: 'target', upcoming: true },
];

// ── Micronutrient display config ───────────────────────────────────────────
const MICROS = [
  { key: 'fiber',   label: 'Fiber',      unit: 'g',   tgt: 32,  hue: 'lime' },
  { key: 'protein', label: 'Protein',    unit: 'g',   tgt: 160, hue: 'violet', isMacro: true },
  { key: 'vitA',    label: 'Vitamin A',  unit: 'mcg', tgt: 900, hue: 'amber' },
  { key: 'vitC',    label: 'Vitamin C',  unit: 'mg',  tgt: 90,  hue: 'coral' },
  { key: 'vitD',    label: 'Vitamin D',  unit: 'mcg', tgt: 20,  hue: 'sky' },
  { key: 'vitB12',  label: 'Vitamin B12',unit: 'mcg', tgt: 2.4, hue: 'teal' },
  { key: 'iron',    label: 'Iron',       unit: 'mg',  tgt: 18,  hue: 'coral' },
  { key: 'calcium', label: 'Calcium',    unit: 'mg',  tgt: 1000,hue: 'violet' },
  { key: 'sodium',  label: 'Sodium',     unit: 'mg',  tgt: 2300,hue: 'amber', inverse: true }, // less is better
];

// ── Count-up animation hook ────────────────────────────────────────────────
function useCountUp(target, duration = 900, trigger = 0) {
  const [value, setValue] = React.useState(target);
  React.useEffect(() => {
    let raf;
    const from = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [target, trigger]);
  return value;
}

// Delayed-mount: only render children after `delay` ms, then apply a "in" class.
function useMountDelay(delay) {
  const [mounted, setMounted] = React.useState(delay === 0);
  React.useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return mounted;
}

// ── Date utilities ─────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOW_SHORT = ['S','M','T','W','T','F','S'];

function fmtDate(d) {
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Swatch hues (for library card accents) ─────────────────────────────────
const SWATCH = {
  lime:   'var(--dv-lime)',
  violet: 'var(--dv-violet)',
  teal:   'var(--dv-teal)',
  coral:  'var(--dv-coral)',
  amber:  'var(--dv-amber)',
  sky:    'var(--dv-sky)',
};

Object.assign(window, {
  USER, LIBRARY, TODAYS_ENTRIES, MILESTONES, MICROS, HISTORY,
  getFood, sumEntries, entriesByMeal,
  useCountUp, useMountDelay,
  MONTHS, DOW, DOW_SHORT, fmtDate, SWATCH,
});

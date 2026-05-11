// components.jsx — shared visual primitives

// ── Calorie ring ────────────────────────────────────────────────────────────
function CalorieRing({ consumed, target, size = 320, stroke = 14, animate = true, trigger = 0 }) {
  const pct = Math.min(1.2, consumed / target);
  const remaining = Math.max(0, target - consumed);
  const over = consumed > target;
  const color = pct < 0.75 ? 'var(--lime)' : pct < 1 ? 'var(--lime)' : over ? 'var(--coral)' : 'var(--amber)';
  const glow  = pct < 0.75 ? 'var(--lime-glow)' : pct < 1 ? 'var(--lime-glow)' : over ? 'var(--coral-glow)' : 'var(--amber-glow)';

  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  const [rendered, setRendered] = React.useState(animate ? 0 : pct);
  React.useEffect(() => {
    if (!animate) { setRendered(pct); return; }
    let raf, start;
    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / 1200);
      // springy ease
      const eased = 1 - Math.pow(1 - t, 3);
      setRendered(pct * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct, animate, trigger]);

  const displayedRemain = useCountUp(remaining, 1100, trigger);
  const displayedConsumed = useCountUp(consumed, 1100, trigger);

  // Arc stop: clamp to 1 for visible stroke-dashoffset
  const visPct = Math.min(1, rendered);
  const offset = C * (1 - visPct);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      {/* ambient glow */}
      <div style={{
        position: 'absolute', inset: -size * 0.25,
        background: `radial-gradient(closest-side, ${glow}, transparent 70%)`,
        filter: 'blur(12px)',
        opacity: `calc(0.9 * var(--glow-mult))`,
        pointerEvents: 'none',
      }}/>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.6"/>
          </linearGradient>
        </defs>
        {/* track */}
        <circle cx={size/2} cy={size/2} r={R}
          stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} fill="none"/>
        {/* progress */}
        <circle cx={size/2} cy={size/2} r={R}
          stroke="url(#ringGrad)" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 12px ${glow})` }}
        />
        {/* over-budget tick */}
        {over && (
          <circle cx={size/2} cy={size/2} r={R}
            stroke="var(--coral)" strokeWidth={stroke + 2} fill="none"
            strokeDasharray={`${C * (pct - 1)} ${C}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div style={{ textAlign: 'center', zIndex: 1, position: 'relative' }}>
        <div className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          {over ? 'over by' : 'remaining'}
        </div>
        <div className="tnum" style={{
          fontSize: size * 0.22,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          marginTop: 6,
          color: over ? 'var(--coral)' : 'var(--text)',
        }}>
          {Math.round(over ? consumed - target : displayedRemain).toLocaleString()}
        </div>
        <div className="mono tnum" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          {Math.round(displayedConsumed).toLocaleString()} <span style={{ color: 'var(--text-faint)' }}>/</span> {target.toLocaleString()} kcal
        </div>
      </div>
    </div>
  );
}

// ── Macro bar ──────────────────────────────────────────────────────────────
function MacroBar({ label, value, target, color, delay = 0, trigger = 0 }) {
  const pct = Math.min(1, value / target);
  const [rendered, setRendered] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => {
      let raf, start;
      const tick = (now) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / 800);
        const eased = 1 - Math.pow(1 - p, 3);
        setRendered(pct * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [pct, trigger]);

  const displayed = useCountUp(value, 900, trigger);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}/>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>{label}</span>
        </div>
        <div className="mono tnum" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--text)' }}>{Math.round(displayed)}</span>
          <span style={{ color: 'var(--text-faint)' }}> / {target}g</span>
        </div>
      </div>
      <div style={{
        height: 6, borderRadius: 3,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${rendered * 100}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 3,
          transition: 'width 300ms ease',
          boxShadow: `0 0 10px ${color}55`,
        }}/>
      </div>
    </div>
  );
}

// ── Food thumbnail (placeholder — no AI-generated SVGs) ───────────────────
function FoodThumb({ food, size = 40 }) {
  const swatchColor = SWATCH[food.swatch] || 'var(--dv-lime)';
  // Initials-based placeholder with colored accent
  const initials = food.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: 10,
      background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))`,
      border: `1px solid var(--line)`,
      position: 'relative', overflow: 'hidden',
      display: 'grid', placeItems: 'center',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(closest-side at 30% 30%, ${swatchColor}33, transparent 60%)`,
      }}/>
      <span className="mono" style={{
        fontSize: size * 0.28,
        color: swatchColor,
        letterSpacing: '0.04em',
        fontWeight: 600,
        position: 'relative',
      }}>{initials}</span>
    </div>
  );
}

// ── Meal entry row ─────────────────────────────────────────────────────────
function MealEntry({ entry, onDelete, onClick, showHover = true }) {
  const food = getFood(entry.foodId);
  if (!food) return null;
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 120ms ease',
        background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        position: 'relative',
      }}
    >
      <FoodThumb food={food} size={36}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {food.name}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10 }}>
          <span>{entry.time}</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>{food.portion}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="tnum" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
          {Math.round(food.kcal * entry.qty)}
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>kcal</span>
        </div>
        <div className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--macro-protein)' }}>P {Math.round(food.p * entry.qty)}</span>
          <span style={{ color: 'var(--macro-carbs)' }}>C {Math.round(food.c * entry.qty)}</span>
          <span style={{ color: 'var(--macro-fat)' }}>F {Math.round(food.f * entry.qty)}</span>
        </div>
      </div>
      {showHover && hovered && onDelete && (
        <button
          className="icon-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
          style={{ marginLeft: 4 }}
          title="Remove entry"
        >
          <I.Trash size={14}/>
        </button>
      )}
    </div>
  );
}

// ── Micronutrient row ──────────────────────────────────────────────────────
function MicroRow({ label, value, target, hue, unit, inverse = false, delay = 0, trigger = 0 }) {
  const pct = Math.min(1.2, value / target);
  const ok = inverse ? pct < 0.9 : pct >= 0.8;
  const mid = inverse ? pct < 1.1 : pct >= 0.5;
  const color = ok ? 'var(--lime)' : mid ? 'var(--amber)' : 'var(--text-faint)';
  const hueColor = `var(--dv-${hue})`;

  const [rendered, setRendered] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => {
      let raf, start;
      const tick = (now) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / 700);
        setRendered((1 - Math.pow(1 - p, 3)) * pct);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [pct, delay, trigger]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text)' }}>{value < 10 ? value.toFixed(1) : Math.round(value)}</span>
          <span style={{ color: 'var(--text-faint)' }}>/{target}{unit}</span>
        </span>
      </div>
      <div style={{
        height: 3, borderRadius: 2,
        background: 'rgba(255,255,255,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(100, rendered * 100)}%`,
          background: hueColor,
          boxShadow: `0 0 6px ${hueColor}`,
          borderRadius: 2,
          transition: 'width 200ms ease',
        }}/>
      </div>
    </div>
  );
}

// ── Chip ───────────────────────────────────────────────────────────────────
function Chip({ children, onClick, selected, removable, onRemove, icon, tone = 'default', style }) {
  const [hover, setHover] = React.useState(false);
  const toneStyles = {
    default: { bg: selected ? 'rgba(158,255,90,0.1)' : 'rgba(255,255,255,0.03)',
               border: selected ? 'rgba(158,255,90,0.35)' : 'var(--line)',
               color: selected ? 'var(--lime)' : 'var(--text)' },
    lime:    { bg: 'rgba(158,255,90,0.08)', border: 'rgba(158,255,90,0.25)', color: 'var(--lime)' },
    dim:     { bg: 'rgba(255,255,255,0.02)', border: 'var(--line)', color: 'var(--text-dim)' },
  };
  const s = toneStyles[tone];
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        borderRadius: 999,
        background: hover && onClick ? 'rgba(255,255,255,0.06)' : s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: 12,
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 120ms ease',
        ...style,
      }}
    >
      {icon}
      {children}
      {removable && (
        <button
          className="icon-btn"
          style={{ width: 14, height: 14, padding: 0, marginLeft: 2, marginRight: -3 }}
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        >
          <I.X size={12}/>
        </button>
      )}
    </span>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, toast.duration || 3200);
    return () => clearTimeout(t);
  }, []);
  const color = toast.tone === 'success' ? 'var(--lime)' : toast.tone === 'warn' ? 'var(--amber)' : toast.tone === 'error' ? 'var(--coral)' : 'var(--text)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: 'rgba(20,22,27,0.92)',
      backdropFilter: 'blur(16px)',
      border: '1px solid var(--line-strong)',
      borderRadius: 12,
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      animation: 'rise 240ms cubic-bezier(0.2, 0.9, 0.2, 1) both',
      minWidth: 240,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{toast.title}</div>
        {toast.sub && <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{toast.sub}</div>}
      </div>
      <button className="icon-btn" onClick={onDismiss}><I.X size={14}/></button>
    </div>
  );
}

// ── Segmented control ─────────────────────────────────────────────────────
function Segmented({ options, value, onChange, size = 'md' }) {
  const [rect, setRect] = React.useState(null);
  const refs = React.useRef({});
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const el = refs.current[value];
    const container = containerRef.current;
    if (el && container) {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      setRect({ left: eRect.left - cRect.left, width: eRect.width });
    }
  }, [value, options.length]);

  const pad = size === 'sm' ? 2 : 3;
  const hei = size === 'sm' ? 28 : 36;
  const fs  = size === 'sm' ? 12 : 13;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        padding: pad,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--line)',
        borderRadius: 999,
        gap: 0,
      }}
    >
      {rect && (
        <div style={{
          position: 'absolute',
          top: pad,
          bottom: pad,
          left: rect.left,
          width: rect.width,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
          border: '1px solid var(--line-strong)',
          borderRadius: 999,
          transition: 'left 260ms cubic-bezier(0.2, 0.9, 0.2, 1), width 260ms cubic-bezier(0.2, 0.9, 0.2, 1)',
        }}/>
      )}
      {options.map(o => (
        <button
          key={o.value}
          ref={el => refs.current[o.value] = el}
          onClick={() => onChange(o.value)}
          style={{
            position: 'relative',
            height: hei,
            padding: `0 ${size === 'sm' ? 12 : 16}px`,
            background: 'transparent',
            border: 'none',
            color: value === o.value ? 'var(--text)' : 'var(--text-muted)',
            fontSize: fs,
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            transition: 'color 200ms ease',
            zIndex: 1,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { CalorieRing, MacroBar, FoodThumb, MealEntry, MicroRow, Chip, Toast, Segmented });

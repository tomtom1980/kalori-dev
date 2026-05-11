// dashboard.jsx — Dashboard screen, desktop + mobile

function Sidebar({ current, onNav, collapsed, setCollapsed, onOpenLog }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: I.Home, shortcut: 'D' },
    { id: 'log',       label: 'Log food',  icon: I.Plus, shortcut: 'N', primary: true },
    { id: 'library',   label: 'Library',   icon: I.Library, shortcut: 'L' },
    { id: 'progress',  label: 'Progress',  icon: I.Progress, shortcut: 'P' },
    { id: 'profile',   label: 'Profile',   icon: I.User },
  ];
  return (
    <aside style={{
      width: collapsed ? 64 : 240,
      flexShrink: 0,
      background: 'rgba(14,16,20,0.6)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 12px',
      transition: 'width 240ms cubic-bezier(0.2, 0.9, 0.2, 1)',
      position: 'relative',
      zIndex: 2,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px 8px' }}>
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--lime), var(--lime-deep))',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 0 20px var(--lime-glow-soft)',
        }}>
          <span style={{ color: '#0A0B0E', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>K</span>
        </div>
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Kalori</span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {items.map(it => {
          const Icon = it.icon;
          const active = current === it.id;
          return (
            <button
              key={it.id}
              onClick={() => it.id === 'log' ? onOpenLog() : onNav(it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                height: 38,
                padding: collapsed ? '0' : '0 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: '1px solid ' + (active ? 'var(--line-strong)' : 'transparent'),
                borderRadius: 10,
                color: active ? 'var(--text)' : 'var(--text-dim)',
                fontSize: 13, fontWeight: active ? 500 : 400,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)'; } }}
            >
              <Icon size={17} stroke={1.6} style={active && it.id === 'log' ? { color: 'var(--lime)' } : {}}/>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
                  {it.shortcut && <kbd>{it.shortcut}</kbd>}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer: collapse + avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="icon-btn"
          style={{ alignSelf: collapsed ? 'center' : 'flex-end' }}
          title="Collapse sidebar"
        >
          <I.ChevronLeft size={16} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}/>
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? 0 : '8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--line)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--dv-violet), var(--dv-coral))',
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 600, color: '#0A0B0E',
          }}>
            {USER.name[0]}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{USER.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Pro · day {USER.streak}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function GreetingHeader({ onOpenCmd, onOpenLog }) {
  const [now, setNow] = React.useState(new Date('2026-04-18T08:42:00'));
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            {fmtDate(now)}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-faint)' }}/>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--lime)', fontSize: 11 }}>
            <I.Flame size={12}/>
            <span className="mono tnum">{USER.streak}-day streak</span>
          </span>
        </div>
        <h1 className="display-lg" style={{
          fontSize: 'clamp(24px, 3.4vw, 36px)',
          margin: 0,
          color: 'var(--text)',
          lineHeight: 1.1,
          textWrap: 'balance',
        }}>
          {greet}, {USER.name}.
          <span className="display-italic" style={{ color: 'var(--text-muted)', fontWeight: 400 }}> Here's today.</span>
        </h1>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onOpenCmd} style={{ paddingLeft: 10, paddingRight: 10 }}>
          <I.Search size={14}/>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Search or jump</span>
          <kbd>⌘K</kbd>
        </button>
        <button className="btn btn-primary" onClick={onOpenLog}>
          <I.Plus size={15}/>
          Log food
          <kbd style={{ background: 'rgba(0,0,0,0.15)', borderColor: 'rgba(0,0,0,0.25)', color: 'rgba(0,0,0,0.6)' }}>N</kbd>
        </button>
      </div>
    </div>
  );
}

function MealGroup({ name, entries, onDelete, onAdd, onEntryClick, delay = 0 }) {
  const mounted = useMountDelay(delay);
  const total = entries.reduce((s, e) => s + (getFood(e.foodId)?.kcal || 0) * e.qty, 0);
  return (
    <div style={{
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 400ms ease, transform 400ms cubic-bezier(0.2, 0.9, 0.2, 1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {name}
          </h3>
          {entries.length > 0 && (
            <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {Math.round(total)} kcal · {entries.length} {entries.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        <button className="btn-link" onClick={() => onAdd(name)} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <I.Plus size={12}/> Add
        </button>
      </div>
      {entries.length === 0 ? (
        <button
          onClick={() => onAdd(name)}
          style={{
            width: '100%', padding: '16px 12px',
            background: 'transparent',
            border: '1px dashed var(--line-strong)',
            borderRadius: 12,
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 140ms ease',
            fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(158,255,90,0.03)'; e.currentTarget.style.borderColor = 'var(--line-focus)'; e.currentTarget.style.color = 'var(--lime)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--line-strong)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <I.Plus size={13}/> Add to {name.toLowerCase()}
        </button>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 4,
        }}>
          {entries.map((e, i) => (
            <MealEntry key={e.id} entry={e}
              onDelete={onDelete}
              onClick={() => onEntryClick?.(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ delay = 0 }) {
  const mounted = useMountDelay(delay);
  return (
    <div className="card" style={{
      padding: 18,
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 400ms ease, transform 400ms cubic-bezier(0.2, 0.9, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 120, height: 120,
        background: 'radial-gradient(closest-side, var(--lime-glow-soft), transparent)',
        filter: 'blur(8px)',
      }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <I.Sparkles size={14} style={{ color: 'var(--lime)' }}/>
        <span className="mono" style={{ fontSize: 10, color: 'var(--lime)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
          Weekly insight
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5, letterSpacing: '-0.01em' }}>
        You've averaged <span className="tnum" style={{ color: 'var(--lime)', fontWeight: 500 }}>178g protein</span> over 7 days —
        <span style={{ color: 'var(--text-dim)' }}> your highest week since January.</span>
      </p>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-link" style={{ fontSize: 12, color: 'var(--text-dim)' }}>View weekly →</button>
      </div>
    </div>
  );
}

function MicronutrientPanel({ totals, trigger }) {
  const groups = [
    {
      label: 'Vitamins',
      icon: <I.Sparkles size={11}/>,
      items: MICROS.filter(m => ['vitA','vitC','vitD','vitB12'].includes(m.key)),
    },
    {
      label: 'Minerals',
      icon: <I.Zap size={11}/>,
      items: MICROS.filter(m => ['iron','calcium'].includes(m.key)),
    },
  ];
  return (
    <div className="card" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 180, height: 180,
        background: 'radial-gradient(closest-side, var(--lime-glow-soft), transparent)',
        filter: 'blur(12px)',
        pointerEvents: 'none',
        opacity: 'calc(0.8 * var(--glow-mult))',
      }}/>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, position: 'relative' }}>
        <h3 className="display" style={{ fontSize: 22, fontWeight: 500, margin: 0, lineHeight: 1.1 }}>
          Nutrition <span className="display-italic" style={{ color: 'var(--text-muted)' }}>today</span>
        </h3>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          % of goal
        </span>
      </div>
      <p style={{ margin: '4px 0 18px', fontSize: 12, color: 'var(--text-dim)' }}>
        Beyond the calories — what you're actually getting.
      </p>

      {/* Fiber / Sodium headline triad */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10,
        marginBottom: 18,
      }}>
        <HeadlineNutrient label="Fiber" value={totals.fiber||0} target={32} unit="g" hue="lime" good={(totals.fiber||0) >= 25} trigger={trigger}/>
        <HeadlineNutrient label="Sodium" value={totals.sodium||0} target={2300} unit="mg" hue="amber" inverse good={(totals.sodium||0) < 2000} trigger={trigger}/>
        <HeadlineNutrient label="Water" value={1.8} target={2.5} unit="L" hue="sky" good={false} trigger={trigger}/>
      </div>

      {/* Vitamins + Minerals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
        {groups.map((g, gi) => (
          <div key={g.label}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                display: 'grid', placeItems: 'center',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--lime)',
                border: '1px solid var(--line)',
              }}>{g.icon}</div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                {g.label}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }}/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map((m, i) => (
                <MicroRow key={m.key}
                  label={m.label}
                  value={totals[m.key] || 0}
                  target={m.tgt}
                  unit={m.unit}
                  hue={m.hue}
                  inverse={m.inverse}
                  delay={600 + (gi*g.items.length + i) * 50}
                  trigger={trigger}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--lime)' }}>●</span> 6 of 8 on track
        </span>
        <button className="btn-link" style={{ fontSize: 12, color: 'var(--text-dim)' }}>Full breakdown →</button>
      </div>
    </div>
  );
}

function HeadlineNutrient({ label, value, target, unit, hue, inverse = false, good, trigger = 0 }) {
  const mounted = useMountDelay(300);
  const pct = Math.max(0, Math.min(1.1, value/target));
  const hueVar = `var(--dv-${hue})`;
  const display = value >= 1000 ? `${(value/1000).toFixed(1)}k` : (value < 10 ? value.toFixed(1) : Math.round(value));
  const tgtDisplay = target >= 1000 ? `${(target/1000).toFixed(1)}k` : target;
  return (
    <div style={{
      position: 'relative',
      padding: '12px 12px 14px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(closest-side at 100% 0%, ${good ? 'var(--lime-glow-soft)' : 'transparent'}, transparent 60%)`,
        opacity: 'calc(0.9 * var(--glow-mult))',
      }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          {label}
        </span>
        {good && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lime)', boxShadow: '0 0 6px var(--lime)' }}/>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span className="tnum display" style={{
          fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em',
          color: good ? 'var(--lime)' : 'var(--text)',
          lineHeight: 1,
        }}>{display}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unit}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        <span className="mono tnum">of {tgtDisplay}{unit}</span>
        {inverse && <span style={{ marginLeft: 6, color: 'var(--text-faint)' }}>· max</span>}
      </div>
      <div style={{
        marginTop: 8,
        height: 3, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: mounted ? `${pct*100}%` : '0%',
          background: inverse && pct > 0.9 ? 'var(--amber)' : hueVar,
          boxShadow: `0 0 6px ${inverse && pct > 0.9 ? 'var(--amber-glow)' : hueVar}`,
          transition: 'width 900ms cubic-bezier(0.2, 0.9, 0.2, 1)',
        }}/>
      </div>
    </div>
  );
}

function Dashboard({ entries, onOpenLog, onOpenCmd, onDelete, onEntryClick, trigger }) {
  const totals = sumEntries(entries);
  const groups = entriesByMeal(entries);
  const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Center column */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px 40px' }}>
        <GreetingHeader onOpenCmd={onOpenCmd} onOpenLog={onOpenLog}/>

        {/* Ring + macros row */}
        <div className="card" style={{
          padding: 28,
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 36,
          alignItems: 'center',
          marginBottom: 28,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* subtle radial backdrop */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(closest-side at 18% 50%, var(--lime-glow-soft), transparent 50%)',
            opacity: `calc(0.7 * var(--glow-mult))`,
          }}/>

          <div style={{ display: 'grid', placeItems: 'center', position: 'relative' }}>
            <CalorieRing consumed={totals.kcal} target={USER.targetKcal} size={300} stroke={14} trigger={trigger}/>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
              <div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                  Budget
                </div>
                <div className="tnum" style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 2 }}>
                  {USER.targetKcal.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                  TDEE
                </div>
                <div className="tnum" style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 2, color: 'var(--text-dim)' }}>
                  {USER.tdee.toLocaleString()}
                </div>
              </div>
              <div style={{ flex: 1 }}/>
              <Chip tone="lime" icon={<I.Target size={11}/>}>On pace · −0.5kg / wk</Chip>
            </div>

            <div style={{ height: 1, background: 'var(--line)' }}/>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <MacroBar label="Protein" value={totals.p} target={USER.targets.protein} color="var(--macro-protein)" delay={300} trigger={trigger}/>
              <MacroBar label="Carbs"   value={totals.c} target={USER.targets.carbs}   color="var(--macro-carbs)"   delay={380} trigger={trigger}/>
              <MacroBar label="Fat"     value={totals.f} target={USER.targets.fat}     color="var(--macro-fat)"     delay={460} trigger={trigger}/>
            </div>
          </div>
        </div>

        {/* Meals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {meals.map((m, i) => (
            <MealGroup key={m}
              name={m}
              entries={groups[m] || []}
              onDelete={onDelete}
              onAdd={onOpenLog}
              onEntryClick={onEntryClick}
              delay={600 + i * 70}
            />
          ))}
        </div>
      </div>

      {/* Right rail */}
      <aside style={{
        width: 340,
        flexShrink: 0,
        borderLeft: '1px solid var(--line)',
        padding: '28px 24px 40px',
        background: 'rgba(14,16,20,0.3)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}>
        <InsightCard delay={500}/>
        <MicronutrientPanel totals={totals} trigger={trigger}/>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Water</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>1.8</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 2.5L</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < 6 ? 'var(--dv-sky)' : 'rgba(255,255,255,0.05)',
                  boxShadow: i < 6 ? '0 0 4px var(--dv-sky)' : 'none',
                }}/>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Weight</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>73.2</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>kg</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--lime)' }}>
              <I.ArrowDown size={11}/>
              <span className="mono tnum">−1.6kg this month</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { Sidebar, Dashboard });

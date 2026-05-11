// library.jsx — Food Library screen + Food Detail slideout + mobile helpers

function LibraryScreen({ onFoodClick, onLog }) {
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState('frequency');
  const items = [...LIBRARY]
    .filter(f => !query.trim() || f.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'frequency' ? b.loggedCount - a.loggedCount
      : sort === 'alpha' ? a.name.localeCompare(b.name)
      : b.p - a.p);

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '28px 40px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 6 }}>
            Personal library · {LIBRARY.length} items
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>
            Your foods <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— built by you</span>
          </h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <I.Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
          <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your library" style={{ paddingLeft: 34, height: 40 }}/>
        </div>
        <Segmented value={sort} onChange={setSort} size="sm" options={[
          { value: 'frequency', label: 'Most logged' },
          { value: 'alpha', label: 'A–Z' },
          { value: 'protein', label: 'High protein' },
        ]}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {items.map((f, i) => (
          <button key={f.id} onClick={() => onFoodClick(f)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: 14, textAlign: 'left',
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid var(--line)',
              borderRadius: 14, cursor: 'pointer',
              transition: 'all 160ms ease',
              fontFamily: 'var(--font-sans)', color: 'var(--text)',
              animation: `rise 400ms ${i * 30}ms both cubic-bezier(0.2, 0.9, 0.2, 1)`,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--line-strong)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
          >
            <FoodThumb food={f} size={56}/>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>{f.name}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.portion}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <span className="tnum" style={{ fontSize: 15, fontWeight: 500 }}>{f.kcal}<span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>kcal</span></span>
              <Chip tone="dim" style={{ padding: '2px 8px' }}>×{f.loggedCount}</Chip>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function FoodDetail({ food, onClose, onLog }) {
  if (!food) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', justifyContent: 'flex-end',
        background: 'rgba(5,6,8,0.5)', backdropFilter: 'blur(10px)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 96vw)', height: '100%',
          background: '#0F1116',
          borderLeft: '1px solid var(--line-strong)',
          padding: 24, overflowY: 'auto',
          animation: 'rise 300ms cubic-bezier(0.2, 0.9, 0.2, 1)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <Chip tone="dim" icon={<I.Bookmark size={11}/>}>{food.tag}</Chip>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn"><I.Edit size={15}/></button>
            <button className="icon-btn" onClick={onClose}><I.X size={16}/></button>
          </div>
        </div>
        <FoodThumb food={food} size={72}/>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 14, marginBottom: 4 }}>{food.name}</h2>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{food.portion}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 22 }}>
          {[
            { l: 'kcal', v: food.kcal, c: 'var(--lime)' },
            { l: 'protein', v: food.p + 'g', c: 'var(--macro-protein)' },
            { l: 'carbs', v: food.c + 'g', c: 'var(--macro-carbs)' },
            { l: 'fat', v: food.f + 'g', c: 'var(--macro-fat)' },
          ].map(m => (
            <div key={m.l} className="card" style={{ padding: 10 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{m.l}</div>
              <div className="tnum" style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em', color: m.c, marginTop: 4 }}>{m.v}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 24, marginBottom: 10 }}>
          Micronutrients
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(food.micro || {}).map(([k, v]) => {
            const m = MICROS.find(x => x.key === k);
            if (!m) return null;
            return (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{m.label}</span>
                <span className="mono tnum" style={{ fontSize: 12 }}>{v}{m.unit}</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, padding: 14, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--line)', borderRadius: 12 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>Log history</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="tnum" style={{ fontSize: 24, fontWeight: 500 }}>{food.loggedCount}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>times logged</span>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 24, height: 44 }} onClick={() => { onLog(food); onClose(); }}>
          <I.Plus size={14}/> Log now
        </button>
      </div>
    </div>
  );
}

// Command palette
function CommandPalette({ open, onClose, onNav, onOpenLog }) {
  const [q, setQ] = React.useState('');
  if (!open) return null;
  const all = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', kind: 'nav', k: 'D', action: () => onNav('dashboard') },
    { id: 'nav-progress',  label: 'Go to Progress',  kind: 'nav', k: 'P', action: () => onNav('progress') },
    { id: 'nav-library',   label: 'Go to Library',   kind: 'nav', k: 'L', action: () => onNav('library') },
    { id: 'act-log',       label: 'Log food',        kind: 'action', k: 'N', action: onOpenLog },
    ...LIBRARY.slice(0, 6).map(f => ({ id: 'f-' + f.id, label: `Re-log: ${f.name}`, kind: 'food', action: () => onNav('dashboard') })),
  ];
  const hits = q.trim() ? all.filter(x => x.label.toLowerCase().includes(q.toLowerCase())) : all;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(5,6,8,0.55)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      animation: 'pop 180ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 92vw)',
        background: '#14161B', border: '1px solid var(--line-strong)',
        borderRadius: 16, boxShadow: 'var(--shadow-float)',
        animation: 'rise 220ms cubic-bezier(0.2, 0.9, 0.2, 1)',
        overflow: 'hidden', height: 'fit-content', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <I.Search size={15} style={{ color: 'var(--text-muted)' }}/>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search or type a command…"
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'var(--font-sans)' }}/>
          <kbd>esc</kbd>
        </div>
        <div style={{ padding: 6, overflowY: 'auto' }}>
          {hits.map((h, i) => (
            <button key={h.id} onClick={() => { h.action(); onClose(); }} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '10px 12px',
              background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: 'none', borderRadius: 8,
              color: 'var(--text)', fontSize: 14, cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent'}>
              <span style={{
                width: 24, height: 24, borderRadius: 6,
                background: h.kind === 'action' ? 'rgba(158,255,90,0.1)' : 'rgba(255,255,255,0.03)',
                color: h.kind === 'action' ? 'var(--lime)' : 'var(--text-dim)',
                display: 'grid', placeItems: 'center',
              }}>
                {h.kind === 'nav' ? <I.ArrowRight size={12}/> : h.kind === 'action' ? <I.Bolt size={12}/> : <I.Apple size={12}/>}
              </span>
              <span style={{ flex: 1 }}>{h.label}</span>
              {h.k && <kbd>{h.k}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Keyboard shortcut help overlay
function ShortcutSheet({ open, onClose }) {
  if (!open) return null;
  const groups = [
    { title: 'Navigation', items: [['D','Dashboard'],['L','Library'],['P','Progress']] },
    { title: 'Actions', items: [['N','Log food'],['/','Search library'],['⌘K','Command palette']] },
    { title: 'Progress view', items: [['D','Day'],['W','Week'],['M','Month']] },
    { title: 'Help', items: [['?','This help'],['esc','Close any overlay']] },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 150,
      background: 'rgba(5,6,8,0.6)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'pop 200ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(680px, 94vw)',
        background: '#14161B', border: '1px solid var(--line-strong)',
        borderRadius: '20px 20px 0 0',
        padding: 28, marginBottom: 0,
        animation: 'rise 280ms cubic-bezier(0.2, 0.9, 0.2, 1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Keyboard shortcuts</h3>
          <button className="icon-btn" onClick={onClose}><I.X size={16}/></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {groups.map(g => (
            <div key={g.title}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{g.title}</div>
              {g.items.map(([k, l]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{l}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mobile bottom tab bar
function MobileTabBar({ current, onNav, onOpenLog }) {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: I.Home },
    { id: 'library',   label: 'Library', icon: I.Library },
    { id: 'log',       label: '', icon: I.Plus, primary: true },
    { id: 'progress',  label: 'Progress', icon: I.Progress },
    { id: 'profile',   label: 'Profile', icon: I.User },
  ];
  return (
    <nav style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '8px 12px 14px',
      background: 'rgba(14,16,20,0.88)',
      backdropFilter: 'blur(24px)',
      borderTop: '1px solid var(--line)',
      zIndex: 10,
    }}>
      {tabs.map(t => {
        const Ic = t.icon;
        const active = current === t.id;
        if (t.primary) {
          return (
            <button key={t.id} onClick={onOpenLog} style={{
              width: 50, height: 50, borderRadius: 16,
              background: 'linear-gradient(180deg, var(--lime), var(--lime-deep))',
              border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              color: '#0A0B0E',
              boxShadow: '0 8px 24px var(--lime-glow), 0 0 0 1px rgba(158,255,90,0.4)',
              marginTop: -20,
            }}>
              <Ic size={22} stroke={2}/>
            </button>
          );
        }
        return (
          <button key={t.id} onClick={() => onNav(t.id)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 10px',
            color: active ? 'var(--text)' : 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
          }}>
            <Ic size={19} stroke={active ? 2 : 1.5}/>
            <span style={{ fontSize: 10 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Mobile dashboard (vertical)
function MobileDashboard({ entries, onOpenLog, onDelete, onEntryClick, trigger }) {
  const totals = sumEntries(entries);
  const groups = entriesByMeal(entries);
  const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '18px 16px 110px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Sat, Apr 18 · <span style={{ color: 'var(--lime)' }}><I.Flame size={9} style={{ display: 'inline', marginRight: 2 }}/>17-day</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: '4px 0 0' }}>
            Hi, {USER.name}
          </h1>
        </div>
        <button className="icon-btn"><I.Settings size={17}/></button>
      </div>

      {/* Ring */}
      <div className="card" style={{
        padding: 18,
        position: 'relative', overflow: 'hidden',
        marginBottom: 14,
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(closest-side at 50% 40%, var(--lime-glow-soft), transparent 60%)',
          opacity: `calc(0.8 * var(--glow-mult))`,
        }}/>
        <div style={{ display: 'grid', placeItems: 'center', position: 'relative' }}>
          <CalorieRing consumed={totals.kcal} target={USER.targetKcal} size={220} stroke={11} trigger={trigger}/>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18, position: 'relative' }}>
          <MacroBar label="Protein" value={totals.p} target={USER.targets.protein} color="var(--macro-protein)" delay={300} trigger={trigger}/>
          <MacroBar label="Carbs"   value={totals.c} target={USER.targets.carbs}   color="var(--macro-carbs)"   delay={380} trigger={trigger}/>
          <MacroBar label="Fat"     value={totals.f} target={USER.targets.fat}     color="var(--macro-fat)"     delay={460} trigger={trigger}/>
        </div>
      </div>

      {/* Micros horizontal scroll */}
      <div style={{ marginLeft: -16, marginRight: -16, marginBottom: 14 }}>
        <div style={{ padding: '0 16px', marginBottom: 10 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Micros</div>
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollSnapType: 'x mandatory' }}>
          {MICROS.filter(m => !m.isMacro).map(m => {
            const v = totals[m.key] || 0;
            const pct = Math.min(1, v / m.tgt);
            return (
              <div key={m.key} style={{
                minWidth: 130, padding: 12,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--line)',
                borderRadius: 12, scrollSnapAlign: 'start',
              }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{m.label}</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 4 }}>
                  {v < 10 ? v.toFixed(1) : Math.round(v)}
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>/{m.tgt}{m.unit}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: `var(--dv-${m.hue})`, borderRadius: 2, boxShadow: `0 0 6px var(--dv-${m.hue})` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {meals.map((m, i) => (
          <MealGroup key={m} name={m} entries={groups[m] || []}
            onDelete={onDelete} onAdd={onOpenLog} onEntryClick={onEntryClick} delay={400 + i * 60}/>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { LibraryScreen, FoodDetail, CommandPalette, ShortcutSheet, MobileTabBar, MobileDashboard });

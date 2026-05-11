// logflow.jsx — Log food modal with Type / Snap / Library tabs + confirmation

function LogFood({ open, onClose, onLog, preset }) {
  const [tab, setTab] = React.useState('type');
  const [stage, setStage] = React.useState('input'); // input | analyzing | confirm
  const [draft, setDraft] = React.useState(null); // array of foodId+qty pairs
  const [mealCat, setMealCat] = React.useState(preset || 'Lunch');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());
  const [typedText, setTypedText] = React.useState('');
  const [typedChips, setTypedChips] = React.useState([]);
  const [photoStage, setPhotoStage] = React.useState('empty'); // empty | scanning | done
  const [dragOver, setDragOver] = React.useState(false);

  // Reset when opened
  React.useEffect(() => {
    if (open) {
      setStage('input');
      setDraft(null);
      setSelected(new Set());
      setTypedText('');
      setTypedChips([]);
      setPhotoStage('empty');
      setTab('type');
      if (preset) setMealCat(preset === 'Drink' ? 'Drink' : preset);
    }
  }, [open, preset]);

  // Debounced "AI parse" of typed text
  React.useEffect(() => {
    if (!typedText.trim()) { setTypedChips([]); return; }
    const t = setTimeout(() => {
      // Fake AI parse: find library items whose words appear in the text
      const lower = typedText.toLowerCase();
      const keywords = [
        ['egg', 'f2'], ['avocado', 'f2'], ['toast', 'f2'],
        ['yogurt', 'f1'], ['berries', 'f1'],
        ['salad', 'f3'], ['caesar', 'f3'], ['chicken', 'f3'],
        ['salmon', 'f4'], ['rice', 'f4'],
        ['coffee', 'f5'], ['cold brew', 'f5'], ['oat', 'f5'],
        ['shake', 'f6'], ['protein', 'f6'],
        ['apple', 'f7'], ['almond', 'f7'],
        ['sandwich', 'f8'], ['cheddar', 'f8'],
        ['chocolate', 'f9'],
        ['banana', 'f11'],
        ['cod', 'f12'], ['miso', 'f12'],
      ];
      const hit = new Set();
      for (const [kw, id] of keywords) {
        if (lower.includes(kw)) hit.add(id);
      }
      setTypedChips([...hit].map(id => ({ foodId: id, qty: 1 })));
    }, 380);
    return () => clearTimeout(t);
  }, [typedText]);

  const submitTyped = () => {
    if (typedChips.length === 0) {
      // Fallback — fake a new parsed item
      setDraft([{ foodId: 'f2', qty: 1 }]);
    } else {
      setDraft(typedChips);
    }
    setStage('confirm');
  };

  const handleFileSelected = () => {
    setPhotoStage('scanning');
    setTimeout(() => {
      setPhotoStage('done');
      setDraft([{ foodId: 'f4', qty: 1 }, { foodId: 'f11', qty: 1 }]);
      setStage('confirm');
    }, 2400);
  };

  const filteredLib = LIBRARY
    .filter(f => !query.trim() || f.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.loggedCount - a.loggedCount);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const submitLibrary = () => {
    if (selected.size === 0) return;
    setDraft([...selected].map(id => ({ foodId: id, qty: 1 })));
    setStage('confirm');
  };

  const confirmLog = () => {
    onLog(draft.map((d, i) => ({
      id: 'e_' + Date.now() + '_' + i,
      foodId: d.foodId,
      meal: mealCat,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      qty: d.qty,
    })));
    onClose();
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'grid', placeItems: 'center',
      background: 'rgba(5,6,8,0.65)',
      backdropFilter: 'blur(14px)',
      animation: 'pop 200ms ease',
    }}
    onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(860px, 92vw)',
          maxHeight: '88vh',
          background: 'linear-gradient(180deg, #14161B 0%, #0F1116 100%)',
          border: '1px solid var(--line-strong)',
          borderRadius: 24,
          boxShadow: 'var(--shadow-float), 0 0 0 1px rgba(158,255,90,0.04), 0 0 40px rgba(158,255,90,0.04)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'rise 280ms cubic-bezier(0.2, 0.9, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, letterSpacing: '-0.015em' }}>
              {stage === 'confirm' ? 'Review & save' : 'Log food'}
            </h2>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {stage === 'confirm' ? 'Edits save to your library' : 'Three ways. No search. No database.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {stage === 'confirm' && (
              <button className="btn btn-ghost" onClick={() => setStage('input')}>
                <I.ChevronLeft size={14}/> Back
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><I.X size={16}/></button>
          </div>
        </div>

        {/* Body */}
        {stage === 'input' && (
          <>
            {/* Tabs */}
            <div style={{ padding: '16px 22px 0', display: 'flex', gap: 6 }}>
              {[
                { id: 'type', label: 'Type it', icon: I.Type },
                { id: 'snap', label: 'Snap it', icon: I.Camera },
                { id: 'library', label: 'From library', icon: I.Library },
              ].map(t => {
                const Ic = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '9px 14px',
                      background: active ? 'rgba(158,255,90,0.08)' : 'transparent',
                      border: '1px solid ' + (active ? 'rgba(158,255,90,0.3)' : 'var(--line)'),
                      borderRadius: 10,
                      color: active ? 'var(--lime)' : 'var(--text-dim)',
                      fontSize: 13, fontWeight: 500,
                      fontFamily: 'var(--font-sans)',
                      cursor: 'pointer',
                      transition: 'all 140ms ease',
                    }}
                  >
                    <Ic size={14}/> {t.label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }}/>
              <select
                value={mealCat}
                onChange={e => setMealCat(e.target.value)}
                style={{
                  background: 'var(--bg-1)', border: '1px solid var(--line)',
                  borderRadius: 10, color: 'var(--text)', padding: '0 12px',
                  fontFamily: 'var(--font-sans)', fontSize: 13, height: 36,
                  cursor: 'pointer',
                }}
              >
                {['Breakfast','Lunch','Dinner','Snack','Drink'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ padding: '18px 22px 22px', overflow: 'auto', flex: 1, minHeight: 320 }}>
              {tab === 'type' && (
                <TypeItTab
                  text={typedText} setText={setTypedText}
                  chips={typedChips}
                  onSubmit={submitTyped}
                />
              )}
              {tab === 'snap' && (
                <SnapItTab stage={photoStage} onFile={handleFileSelected} dragOver={dragOver} setDragOver={setDragOver}/>
              )}
              {tab === 'library' && (
                <LibraryTab
                  query={query} setQuery={setQuery}
                  items={filteredLib}
                  selected={selected}
                  toggle={toggleSelect}
                  onSubmit={submitLibrary}
                />
              )}
            </div>
          </>
        )}

        {stage === 'confirm' && (
          <ConfirmStage
            draft={draft} setDraft={setDraft}
            mealCat={mealCat} setMealCat={setMealCat}
            onConfirm={confirmLog}
          />
        )}
      </div>
    </div>
  );
}

function TypeItTab({ text, setText, chips, onSubmit }) {
  return (
    <div>
      <label className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        What did you eat?
      </label>
      <textarea
        className="textarea"
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. two eggs, avocado toast and cold brew"
        rows={3}
        style={{
          marginTop: 10,
          fontSize: 18,
          fontFamily: 'var(--font-sans)',
          letterSpacing: '-0.015em',
          padding: '14px 16px',
          lineHeight: 1.45,
          resize: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, minHeight: 40 }}>
        <I.Sparkles size={13} style={{ color: chips.length ? 'var(--lime)' : 'var(--text-faint)' }}/>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {chips.length ? `AI parsed ${chips.length} ${chips.length === 1 ? 'item' : 'items'}` : 'AI will parse as you type'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, minHeight: 40 }}>
        {chips.map((c, i) => {
          const f = getFood(c.foodId);
          return (
            <span key={c.foodId} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 10px 8px 8px',
              background: 'rgba(158,255,90,0.06)',
              border: '1px solid rgba(158,255,90,0.25)',
              borderRadius: 12,
              animation: `pop 300ms ${i * 80}ms cubic-bezier(0.2, 0.9, 0.2, 1) both`,
            }}>
              <FoodThumb food={f} size={28}/>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{f.name}</div>
                <div className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.kcal} kcal · {f.portion}</div>
              </div>
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, gap: 8 }}>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!text.trim()}>
          Review <I.ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

function SnapItTab({ stage, onFile, dragOver, setDragOver }) {
  if (stage === 'empty') {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(); }}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--lime)' : 'var(--line-strong)'}`,
          borderRadius: 16,
          padding: 48,
          textAlign: 'center',
          background: dragOver ? 'rgba(158,255,90,0.04)' : 'rgba(255,255,255,0.015)',
          transition: 'all 180ms ease',
          minHeight: 260,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'radial-gradient(closest-side, var(--lime-glow-soft), transparent)',
          display: 'grid', placeItems: 'center',
          color: dragOver ? 'var(--lime)' : 'var(--text-dim)',
          animation: dragOver ? 'pulseGlow 1.2s ease-in-out infinite' : 'none',
        }}>
          <I.Camera size={28} stroke={1.5}/>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>
          Drop a photo, or click to upload
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          JPG, PNG, HEIC · AI detects portion and ingredients
        </div>
        <button className="btn btn-ghost" onClick={onFile} style={{ marginTop: 4 }}>
          <I.Upload size={14}/> Browse files
        </button>
      </div>
    );
  }
  if (stage === 'scanning') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 18, alignItems: 'flex-start' }}>
        <div style={{
          position: 'relative',
          width: 240, height: 240,
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--line)',
          background: `linear-gradient(135deg, #2a2520, #3a2e24)`,
        }}>
          {/* placeholder "photo" */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(135deg, rgba(255,176,32,0.1) 0 14px, rgba(255,176,32,0.03) 14px 28px)',
          }}/>
          <div style={{
            position: 'absolute', top: 16, left: 16,
            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase', letterSpacing: '0.14em',
          }}>
            dinner_plate.jpg
          </div>
          {/* scan line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 40,
            background: 'linear-gradient(180deg, transparent, rgba(158,255,90,0.3), transparent)',
            boxShadow: '0 0 20px var(--lime-glow)',
            animation: 'scanline 1.6s linear infinite',
          }}/>
          {/* frame corners */}
          {['tl', 'tr', 'bl', 'br'].map(c => (
            <div key={c} style={{
              position: 'absolute', width: 18, height: 18,
              borderColor: 'var(--lime)',
              borderStyle: 'solid',
              borderWidth: c.includes('t') ? '2px 0 0' : '0 0 2px',
              ...(c.includes('l') ? { left: 8, borderLeftWidth: 2 } : { right: 8, borderRightWidth: 2 }),
              ...(c.includes('t') ? { top: 8 } : { bottom: 8 }),
            }}/>
          ))}
        </div>
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--lime)', boxShadow: '0 0 8px var(--lime-glow)',
              animation: 'pulseGlow 0.9s ease-in-out infinite',
            }}/>
            <span className="mono" style={{ fontSize: 11, color: 'var(--lime)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              Analyzing
            </span>
          </div>
          {['Detecting plate region', 'Identifying ingredients', 'Estimating portion weight', 'Cross-checking library'].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              opacity: 0, animation: `rise 400ms ${i * 400}ms cubic-bezier(0.2, 0.9, 0.2, 1) both`,
            }}>
              <div className="skeleton" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--lime)', animation: 'none', opacity: i < 2 ? 1 : 0.3 }}/>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // done — results shown; the parent moves to confirm stage via effect? no, we wait for click
  // Actually the handler already sets draft + can jump
  return null;
}

function LibraryTab({ query, setQuery, items, selected, toggle, onSubmit }) {
  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <I.Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
        <input
          className="input"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your library — 157 items"
          style={{ paddingLeft: 34, height: 40, fontSize: 14 }}
        />
        <kbd style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>/</kbd>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8, maxHeight: 340, overflowY: 'auto', paddingRight: 4,
      }}>
        {items.map(f => {
          const on = selected.has(f.id);
          return (
            <button
              key={f.id}
              onClick={() => toggle(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 10,
                background: on ? 'rgba(158,255,90,0.08)' : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (on ? 'rgba(158,255,90,0.35)' : 'var(--line)'),
                borderRadius: 12,
                textAlign: 'left', cursor: 'pointer',
                transition: 'all 140ms ease',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
              }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            >
              <FoodThumb food={f} size={36}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {f.kcal} kcal · logged {f.loggedCount}×
                </div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: 6,
                border: '1px solid ' + (on ? 'var(--lime)' : 'var(--line-strong)'),
                background: on ? 'var(--lime)' : 'transparent',
                display: 'grid', placeItems: 'center',
                transition: 'all 140ms ease',
                flexShrink: 0,
              }}>
                {on && <I.Check size={12} style={{ color: '#0A0B0E' }}/>}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {selected.size ? `${selected.size} selected` : 'Tap multiple to batch-add'}
        </span>
        <button className="btn btn-primary" onClick={onSubmit} disabled={selected.size === 0}
          style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
          Review <I.ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

function ConfirmStage({ draft, setDraft, mealCat, setMealCat, onConfirm }) {
  const totals = draft.reduce((acc, d) => {
    const f = getFood(d.foodId);
    if (!f) return acc;
    acc.kcal += f.kcal * d.qty;
    acc.p += f.p * d.qty; acc.c += f.c * d.qty; acc.f += f.f * d.qty;
    return acc;
  }, { kcal: 0, p: 0, c: 0, f: 0 });

  const setQty = (i, qty) => {
    const next = [...draft];
    next[i] = { ...next[i], qty: Math.max(0.25, qty) };
    setDraft(next);
  };

  const remove = (i) => setDraft(draft.filter((_, x) => x !== i));

  return (
    <div style={{ padding: '22px 22px 22px', overflow: 'auto', flex: 1 }}>
      {/* Big totals */}
      <div style={{
        padding: 20,
        background: 'radial-gradient(closest-side at 80% 50%, var(--lime-glow-soft), transparent 70%), rgba(255,255,255,0.015)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24,
        marginBottom: 18,
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            Meal total
          </div>
          <div className="tnum" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 8, color: 'var(--lime)' }}>
            {Math.round(totals.kcal)}
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6, letterSpacing: 0 }}>kcal</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignContent: 'center' }}>
          {[{ l: 'Protein', v: totals.p, c: 'var(--macro-protein)' },
            { l: 'Carbs',   v: totals.c, c: 'var(--macro-carbs)' },
            { l: 'Fat',     v: totals.f, c: 'var(--macro-fat)' }].map(x => (
            <div key={x.l}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: x.c }}/>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{x.l}</span>
              </div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 4 }}>
                {Math.round(x.v)}<span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>g</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <I.Clock size={13} style={{ color: 'var(--text-muted)' }}/>
          <span className="mono" style={{ fontSize: 12 }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <select value={mealCat} onChange={e => setMealCat(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)', padding: '0 12px', fontFamily: 'var(--font-sans)', fontSize: 13, height: 36, cursor: 'pointer' }}>
          {['Breakfast','Lunch','Dinner','Snack','Drink'].map(m => <option key={m}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }}/>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
          <input type="checkbox" defaultChecked style={{ accentColor: 'var(--lime)' }}/>
          Save edits to library
        </label>
      </div>

      {/* Item list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.map((d, i) => {
          const f = getFood(d.foodId);
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto',
              alignItems: 'center', gap: 12,
              padding: 12,
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid var(--line)',
              borderRadius: 12,
            }}>
              <FoodThumb food={f} size={36}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {f.portion} · {f.kcal} kcal
                </div>
              </div>
              {/* qty stepper */}
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8 }}>
                <button onClick={() => setQty(i, d.qty - 0.25)} className="icon-btn" style={{ width: 28, height: 28, borderRadius: 0 }}>−</button>
                <span className="mono tnum" style={{ width: 42, textAlign: 'center', fontSize: 12 }}>× {d.qty}</span>
                <button onClick={() => setQty(i, d.qty + 0.25)} className="icon-btn" style={{ width: 28, height: 28, borderRadius: 0 }}>+</button>
              </div>
              <div className="tnum" style={{ fontSize: 14, fontWeight: 500, minWidth: 60, textAlign: 'right' }}>
                {Math.round(f.kcal * d.qty)}
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>kcal</span>
              </div>
              <button className="icon-btn" onClick={() => remove(i)}><I.X size={14}/></button>
            </div>
          );
        })}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{
          cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 10px', background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--line)', borderRadius: 8,
          listStyle: 'none',
        }}>
          <I.Info size={12}/> Why these numbers?
        </summary>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 10, padding: '0 4px' }}>
          Portion weight inferred from image geometry (plate diameter reference) and compared against your prior logs of similar items. Micronutrients extrapolated from USDA FoodData Central averages. Confidence: <span style={{ color: 'var(--lime)' }}>87%</span>.
        </p>
      </details>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button className="btn btn-primary" onClick={onConfirm}>
          <I.Check size={14}/> Save to {mealCat.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

// Auto-advance Snap tab when scanning finishes
function useSnapAutoAdvance(stage, setStage, draft) {
  React.useEffect(() => {
    if (stage === 'done') {
      // advance parent to confirm
    }
  }, [stage]);
}

Object.assign(window, { LogFood });

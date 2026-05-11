// progress.jsx — Progress screen with all 6 chart types

function useInView(ref) {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setInView(true);
    }, { threshold: 0.2 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return inView;
}

// Calorie adherence bar chart
function CalorieChart({ range, trigger }) {
  const data = range === 'day' ? HISTORY.slice(-1) :
               range === 'week' ? HISTORY.slice(-7) :
               HISTORY.slice(-30);
  const ref = React.useRef(null);
  const inView = useInView(ref);
  const max = 3200;
  const H = 180;

  return (
    <div ref={ref} className="card" style={{ padding: 22 }}>
      <ChartHeader title="Calorie adherence" sub={`Last ${data.length} days`}
        trailing={<><Chip tone="dim" icon={<span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--lime)' }}/>}>Hit</Chip>
                    <Chip tone="dim" icon={<span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--amber)' }}/>}>Over</Chip>
                    <Chip tone="dim" icon={<span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--text-faint)' }}/>}>Under</Chip></>}/>
      <div style={{ position: 'relative', height: H, marginTop: 18, display: 'flex', alignItems: 'flex-end', gap: data.length > 14 ? 4 : 8, paddingTop: 20 }}>
        {/* target line */}
        {(() => {
          const y = H - (2180 / max) * H;
          return (
            <div style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: '1px dashed rgba(158,255,90,0.3)', height: 1 }}>
              <span className="mono" style={{ position: 'absolute', right: 0, top: -16, fontSize: 10, color: 'var(--lime)' }}>
                target 2180
              </span>
            </div>
          );
        })()}
        {data.map((d, i) => {
          const over = d.kcal > d.target * 1.05;
          const under = d.kcal < d.target * 0.85;
          const color = over ? 'var(--amber)' : under ? 'var(--text-faint)' : 'var(--lime)';
          const hPx = (d.kcal / max) * H;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%',
                height: inView ? hPx : 0,
                background: `linear-gradient(180deg, ${color}, ${color}66)`,
                borderRadius: '4px 4px 2px 2px',
                transition: `height 900ms cubic-bezier(0.2, 0.9, 0.2, 1) ${i * 25}ms`,
                boxShadow: over ? 'none' : under ? 'none' : `0 0 8px ${color}33`,
                position: 'relative',
              }}/>
              {data.length <= 14 && (
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {DOW_SHORT[d.dow]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Weight trajectory line chart
function WeightChart({ range, trigger }) {
  const data = range === 'day' ? HISTORY.slice(-7) :
               range === 'week' ? HISTORY.slice(-30) :
               HISTORY.slice(-30);
  const ref = React.useRef(null);
  const inView = useInView(ref);

  const W = 600, H = 180, PAD = 24;
  const weights = data.map(d => d.weight);
  const min = Math.min(...weights) - 0.4;
  const max = Math.max(...weights) + 0.4;
  const goal = 70;
  const range_ = max - min;

  const x = (i) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const y = (w) => H - PAD - ((w - min) / range_) * (H - PAD * 2);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.weight)}`).join(' ');
  const areaPath = linePath + ` L ${x(data.length - 1)} ${H - PAD} L ${x(0)} ${H - PAD} Z`;

  return (
    <div ref={ref} className="card" style={{ padding: 22 }}>
      <ChartHeader title="Weight trajectory" sub="Trend smoothed · goal 70.0kg"
        trailing={<Chip tone="lime" icon={<I.ArrowDown size={10}/>}>−1.6kg this month</Chip>}/>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, marginTop: 14, overflow: 'visible' }}>
        <defs>
          <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dv-violet)" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="var(--dv-violet)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* goal line */}
        <line x1={PAD} y1={y(goal)} x2={W - PAD} y2={y(goal)} stroke="var(--lime)" strokeDasharray="3 4" strokeWidth={1} opacity={0.5}/>
        <text x={W - PAD} y={y(goal) - 4} fill="var(--lime)" fontFamily="var(--font-mono)" fontSize="10" textAnchor="end">goal 70.0kg</text>
        {/* area */}
        <path d={areaPath} fill="url(#weightArea)" style={{ opacity: inView ? 1 : 0, transition: 'opacity 1000ms ease 400ms' }}/>
        {/* line */}
        <path d={linePath} fill="none" stroke="var(--dv-violet)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"
          style={{ strokeDasharray: 1400, strokeDashoffset: inView ? 0 : 1400, transition: 'stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1)' }}/>
        {/* dots */}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.weight)} r={2.5} fill="var(--dv-violet)"
            style={{ opacity: inView ? 1 : 0, transition: `opacity 400ms ${600 + i * 20}ms ease` }}/>
        ))}
        {/* latest marker */}
        {(() => {
          const last = data.length - 1;
          return (
            <g style={{ opacity: inView ? 1 : 0, transition: 'opacity 600ms 1600ms ease' }}>
              <circle cx={x(last)} cy={y(data[last].weight)} r={5} fill="var(--dv-violet)" opacity={0.3}/>
              <circle cx={x(last)} cy={y(data[last].weight)} r={3.5} fill="var(--dv-violet)"/>
              <text x={x(last) - 6} y={y(data[last].weight) - 10} fill="var(--text)" fontFamily="var(--font-mono)" fontSize="11" textAnchor="end">
                {data[last].weight.toFixed(1)}kg
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// Stacked area: macros over time
function MacroAreaChart({ range }) {
  const data = HISTORY.slice(-14);
  const ref = React.useRef(null);
  const inView = useInView(ref);
  const W = 600, H = 180, PAD = 20;

  // Max total kcals (P*4 + C*4 + F*9)
  const totals = data.map(d => d.protein * 4 + d.carbs * 4 + d.fat * 9);
  const max = Math.max(...totals) * 1.1;

  const x = (i) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);

  const makePath = (key, accessor) => {
    // stacked: protein bottom, then carbs, then fat
    const top = data.map((d, i) => {
      let stack = 0;
      if (key === 'protein') stack = d.protein * 4;
      if (key === 'carbs')   stack = d.protein * 4 + d.carbs * 4;
      if (key === 'fat')     stack = d.protein * 4 + d.carbs * 4 + d.fat * 9;
      return { x: x(i), y: y(stack) };
    });
    const bottom = data.map((d, i) => {
      let stack = 0;
      if (key === 'carbs') stack = d.protein * 4;
      if (key === 'fat')   stack = d.protein * 4 + d.carbs * 4;
      return { x: x(i), y: y(stack) };
    }).reverse();
    const pts = [...top, ...bottom];
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  };

  return (
    <div ref={ref} className="card" style={{ padding: 22 }}>
      <ChartHeader title="Macro distribution" sub="Last 14 days · kcal from each macro"
        trailing={
          <div style={{ display: 'flex', gap: 10 }}>
            <Chip tone="dim" icon={<span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--macro-protein)' }}/>}>P</Chip>
            <Chip tone="dim" icon={<span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--macro-carbs)' }}/>}>C</Chip>
            <Chip tone="dim" icon={<span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--macro-fat)' }}/>}>F</Chip>
          </div>
        }/>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, marginTop: 14, overflow: 'visible' }}>
        <path d={makePath('fat')}     fill="var(--macro-fat)"     opacity={0.75} style={{ opacity: inView ? 0.75 : 0, transition: 'opacity 900ms 500ms ease' }}/>
        <path d={makePath('carbs')}   fill="var(--macro-carbs)"   opacity={0.75} style={{ opacity: inView ? 0.75 : 0, transition: 'opacity 900ms 300ms ease' }}/>
        <path d={makePath('protein')} fill="var(--macro-protein)" opacity={0.85} style={{ opacity: inView ? 0.85 : 0, transition: 'opacity 900ms 100ms ease' }}/>
      </svg>
    </div>
  );
}

// Micronutrient heatmap (signature view)
function MicroHeatmap() {
  const ref = React.useRef(null);
  const inView = useInView(ref);
  const days = HISTORY.slice(-30);
  const nutrients = [
    { key: 'fiber',   label: 'Fiber',    tgt: 32 },
    { key: 'protein', label: 'Protein',  tgt: 160 },
    { key: 'vitA',    label: 'Vit A',    tgt: 900 },
    { key: 'vitC',    label: 'Vit C',    tgt: 90 },
    { key: 'vitD',    label: 'Vit D',    tgt: 20 },
    { key: 'iron',    label: 'Iron',     tgt: 18 },
    { key: 'calcium', label: 'Calcium',  tgt: 1000 },
  ];

  // Synth values based on day's kcal
  const value = (d, n) => {
    const seed = (d.kcal % 100) / 100;
    const dayOffset = d.dow * 0.11 + n.key.charCodeAt(0) * 0.017;
    const pct = 0.3 + Math.abs(Math.sin(d.date.getDate() * 0.7 + dayOffset)) * 0.95;
    return Math.min(1.2, pct + seed * 0.2 - 0.1);
  };

  const colorFor = (pct) => {
    if (pct < 0.35) return 'rgba(255, 92, 92, 0.45)';
    if (pct < 0.6)  return 'rgba(255, 176, 32, 0.5)';
    if (pct < 0.85) return 'rgba(158, 255, 90, 0.35)';
    return 'rgba(158, 255, 90, 0.75)';
  };

  return (
    <div ref={ref} className="card" style={{ padding: 22 }}>
      <ChartHeader title="Micronutrient heatmap" sub="Rows · nutrients  ·  Cols · last 30 days"
        trailing={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>low</span>
            {[0.2, 0.5, 0.8, 1.05].map((p, i) => (
              <div key={i} style={{ width: 14, height: 10, borderRadius: 2, background: colorFor(p) }}/>
            ))}
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>hit</span>
          </div>
        }/>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, marginTop: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nutrients.map(n => (
            <div key={n.key} style={{ height: 18, fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>{n.label}</div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nutrients.map((n, ni) => (
            <div key={n.key} style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 3, height: 18 }}>
              {days.map((d, di) => {
                const v = value(d, n);
                return (
                  <div key={di} style={{
                    background: colorFor(v),
                    borderRadius: 2,
                    opacity: inView ? 1 : 0,
                    transform: inView ? 'scale(1)' : 'scale(0.6)',
                    transition: `all 400ms cubic-bezier(0.2, 0.9, 0.2, 1) ${(ni * 30) + (di * 8)}ms`,
                  }}/>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Streak calendar (GitHub-style)
function StreakCalendar() {
  const ref = React.useRef(null);
  const inView = useInView(ref);
  const days = HISTORY.slice(-30);
  return (
    <div ref={ref} className="card" style={{ padding: 22 }}>
      <ChartHeader title="Logging consistency" sub={`${days.filter(d => d.logged).length} of ${days.length} days logged`}
        trailing={<Chip tone="lime" icon={<I.Flame size={10}/>}>17-day current</Chip>}/>
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: `repeat(${Math.ceil(days.length / 5)}, 1fr)`, gridTemplateRows: 'repeat(5, 1fr)', gridAutoFlow: 'column', gap: 4, maxWidth: 520 }}>
        {days.map((d, i) => (
          <div key={i} title={d.logged ? `Logged ${d.kcal} kcal` : 'Not logged'} style={{
            aspectRatio: '1', borderRadius: 3,
            background: d.logged
              ? (d.kcal > 2200 ? 'rgba(158,255,90,0.75)' : d.kcal > 1800 ? 'rgba(158,255,90,0.5)' : 'rgba(158,255,90,0.25)')
              : 'rgba(255,255,255,0.04)',
            opacity: inView ? 1 : 0,
            transform: inView ? 'scale(1)' : 'scale(0.4)',
            transition: `all 400ms cubic-bezier(0.2, 0.9, 0.2, 1) ${i * 15}ms`,
          }}/>
        ))}
      </div>
    </div>
  );
}

// Milestones timeline
function MilestonesTimeline() {
  return (
    <div className="card" style={{ padding: 22 }}>
      <ChartHeader title="Milestones" sub="Your last 30 days"/>
      <div style={{ marginTop: 18, position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 1, background: 'var(--line-strong)' }}/>
        {MILESTONES.map((m, i) => {
          const iconMap = { check: I.Check, arrow: I.ArrowDown, flame: I.Flame, bolt: I.Bolt, target: I.Target };
          const Ic = iconMap[m.icon];
          const up = m.upcoming;
          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '10px 0',
              animation: `rise 400ms ${i * 80}ms both cubic-bezier(0.2, 0.9, 0.2, 1)`,
            }}>
              <div style={{
                position: 'absolute', left: 0,
                width: 13, height: 13, borderRadius: '50%',
                background: up ? 'var(--bg-2)' : 'var(--lime)',
                border: up ? '1px dashed var(--line-focus)' : 'none',
                boxShadow: up ? 'none' : '0 0 8px var(--lime-glow)',
                display: 'grid', placeItems: 'center',
              }}>
                {!up && <Ic size={8} stroke={2.5} style={{ color: '#0A0B0E' }}/>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: up ? 'var(--text-muted)' : 'var(--text)' }}>{m.title}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {up ? 'in progress' : `${-m.day}d ago`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartHeader({ title, sub, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, letterSpacing: '-0.015em' }}>{title}</h3>
        {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{sub}</div>}
      </div>
      {trailing && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{trailing}</div>}
    </div>
  );
}

function ProgressScreen() {
  const [range, setRange] = React.useState('week');
  const [trigger, setTrigger] = React.useState(0);
  React.useEffect(() => { setTrigger(t => t + 1); }, [range]);

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '28px 40px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 6 }}>
            Your numbers
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>
            Progress <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— the long view</span>
          </h1>
        </div>
        <Segmented value={range} onChange={setRange} options={[
          { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
        ]}/>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { l: 'Avg daily kcal', v: '2,134', d: '−46 vs target', good: true },
          { l: 'Avg protein',    v: '178g', d: '+18g vs target', good: true },
          { l: 'Adherence',      v: '87%',   d: '26 of 30 days',  good: true },
          { l: 'Weight change',  v: '−1.6kg', d: 'on pace',        good: true },
        ].map((t, i) => (
          <div key={i} className="card" style={{ padding: 16, animation: `rise 400ms ${i * 70}ms both cubic-bezier(0.2, 0.9, 0.2, 1)` }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{t.l}</div>
            <div className="tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.025em', marginTop: 6 }}>{t.v}</div>
            <div className="mono" style={{ fontSize: 10, color: t.good ? 'var(--lime)' : 'var(--text-muted)', marginTop: 4 }}>{t.d}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <CalorieChart range={range} trigger={trigger}/>
        <StreakCalendar/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <WeightChart range={range} trigger={trigger}/>
        <MacroAreaChart range={range}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <MicroHeatmap/>
        <MilestonesTimeline/>
      </div>
    </div>
  );
}

Object.assign(window, { ProgressScreen });

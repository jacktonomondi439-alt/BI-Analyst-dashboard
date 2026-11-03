import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Sparkles, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Anomaly, DateRangeKey, InventoryRow, RowStatus, SiteFilter } from '../data/analytics';
import {
  ANOMALIES_SEED,
  SITE_OPTIONS,
  getAgingData,
  getForecastVsActual,
  getInventoryRows,
  getKpis,
  getSkuWeeklyDemand,
  getThroughput,
  getVolumeBySite,
} from '../data/analytics';
import { useRealtimeLogs } from '../hooks/useRealtimeLogs';
import AIInsightBox from './AIInsightBox';

const C = {
  bg: '#060d1a',
  card: '#0d1b2e',
  border: '#1a2f4a',
  mint: '#00ffaa',
  amber: '#f59e0b',
  cyan: '#00d4ff',
  navy: '#0a0f1e',
  red: '#f87171',
} as const;

type SeverityFilter = 'All' | Anomaly['severity'];

const chartTooltip = {
  contentStyle: {
    backgroundColor: 'rgba(13, 27, 46, 0.97)',
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    fontSize: '12px',
  },
  labelStyle: { color: '#94a3b8', fontFamily: 'ui-monospace, monospace' },
};

function WeeklyThroughputTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as { dateLabel?: string; dateIso?: string };
  const value = payload[0].value as number;
  const dateText = data?.dateLabel ?? data?.dateIso ?? payload[0].payload?.week ?? '';

  return (
    <div
      style={{
        backgroundColor: 'rgba(2, 6, 23, 0.96)',
        border: `1px solid ${C.mint}`,
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: `0 0 0 1px ${C.mint}11, 0 0 18px ${C.mint}1a`,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <div style={{ color: C.mint, fontSize: 12 }}>{dateText}</div>
      <div style={{ color: C.mint, fontSize: 14, fontWeight: 800 }}>
        {value.toLocaleString()} units
      </div>
    </div>
  );
}

const SKU_POOL = ['SKU-10042', 'SKU-20441', 'SKU-08812', 'SKU-33190', 'SKU-77102', 'SKU-50001', 'SKU-22009'];

function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getTop3SkusForAging(siteName: string, bucket: string, totalUnits: number) {
  const seed = hashString(`${siteName}::${bucket}`);
  const items = [...SKU_POOL].sort((a, b) => hashString(`${seed}-${a}`) - hashString(`${seed}-${b}`)).slice(0, 3);
  const r1 = (seed % 37) / 100 + 0.38;
  const r2 = ((seed >> 3) % 29) / 100 + 0.22;
  const r3 = ((seed >> 6) % 23) / 100 + 0.14;
  const sum = r1 + r2 + r3;
  const pcts = [r1 / sum, r2 / sum, r3 / sum];
  const raw = pcts.map((p) => Math.max(0, Math.round(totalUnits * p)));
  const diff = totalUnits - raw.reduce((acc, n) => acc + n, 0);
  // Small correction so values add up nicely.
  raw[0] = raw[0] + diff;
  return items.map((sku, i) => ({ sku, units: raw[i] }));
}

function AgingStackTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const seg = payload[0];
  const siteName = seg?.payload?.name ?? seg?.payload?.site ?? 'Unknown';
  const bucket = String(seg?.dataKey ?? '');
  const total = Number(seg?.value ?? 0);
  const top = getTop3SkusForAging(siteName, bucket, total);

  return (
    <div
      style={{
        backgroundColor: 'rgba(2, 6, 23, 0.96)',
        border: `1px solid ${C.mint}`,
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: `0 0 0 1px ${C.mint}11, 0 0 18px ${C.mint}22`,
        fontFamily: 'ui-monospace, monospace',
        minWidth: 220,
      }}
    >
      <div style={{ color: C.mint, fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{bucket}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>{siteName}</div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>Top 3 SKUs</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {top.map((t) => (
          <div key={t.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: '#e2e8f0', fontSize: 12 }}>{t.sku}</span>
            <span style={{ color: C.mint, fontSize: 12, fontWeight: 800 }}>{t.units.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>Total: {total.toLocaleString()} units</div>
    </div>
  );
}

function exportInventoryCsv(rows: InventoryRow[]) {
  const headers = [
    'sku',
    'site',
    'category',
    'qty_on_hand',
    'reorder_level',
    'days_of_supply',
    'status',
    'last_receipt',
  ];
  const esc = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.sku,
        r.site,
        r.category,
        r.qtyOnHand,
        r.reorderLevel,
        r.daysOfSupply,
        r.status,
        r.lastReceipt,
      ]
        .map(esc)
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [isLive, setIsLive] = React.useState(true);
  const [dateRange, setDateRange] = React.useState<DateRangeKey>('30');
  const [site, setSite] = React.useState<SiteFilter>('all');
  const [resolvedIds, setResolvedIds] = React.useState<Set<string>>(() => new Set());
  const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>('All');
  const [showZeroBaseline, setShowZeroBaseline] = React.useState(false);
  const [showForecast, setShowForecast] = React.useState(true);
  const [showActual, setShowActual] = React.useState(true);
  const [selectedRow, setSelectedRow] = React.useState<InventoryRow | null>(null);
  const [tableSearch, setTableSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | RowStatus>('all');
  const { logs, lastInsertedId } = useRealtimeLogs(ANOMALIES_SEED);

  const dim = !isLive;

  const anomalies = React.useMemo(() => {
    let active = logs.filter((a) => !resolvedIds.has(a.id));
    if (site !== 'all') active = active.filter((a) => a.site === site);
    if (severityFilter === 'All') return active;
    return active.filter((a) => a.severity === severityFilter);
  }, [logs, resolvedIds, severityFilter, site]);

  const throughput = React.useMemo(() => getThroughput(dateRange, site), [dateRange, site]);
  const volumeBySite = React.useMemo(() => getVolumeBySite(dateRange, site), [dateRange, site]);
  const forecastVsActual = React.useMemo(() => getForecastVsActual(dateRange, site), [dateRange, site]);
  const agingData = React.useMemo(() => getAgingData(dateRange, site), [dateRange, site]);
  const agingStackData = React.useMemo(() => {
    const bucketKeys = ['0–30d', '31–60d', '61–90+d'] as const;
    if (site === 'all') {
      const sites = ['Warehouse A', 'Warehouse B', 'Terminal C'] as const;
      const base = sites.map((s) => ({
        name: s,
        '0–30d': 0,
        '31–60d': 0,
        '61–90+d': 0,
      }));
      const rowByBucket = new Map(agingData.map((r) => [r.bucket, r]));
      base.forEach((obj) => {
        bucketKeys.forEach((bk) => {
          const row = rowByBucket.get(bk);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = row ? (row as any)[obj.name] : 0;
          (obj as any)[bk] = v ?? 0;
        });
      });
      return base;
    }

    // site-specific: agingData is [{ bucket, units }]
    const single: any = { name: site };
    bucketKeys.forEach((bk) => {
      const row = (agingData as any[]).find((r) => r.bucket === bk);
      single[bk] = row?.units ?? 0;
    });
    return [single] as Array<{ name: SiteFilter } & Record<(typeof bucketKeys)[number], number>>;
  }, [agingData, site]);
  const kpis = React.useMemo(() => getKpis(dateRange, site), [dateRange, site]);
  const tableRows = React.useMemo(() => {
    const rows = getInventoryRows(site);
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.site.toLowerCase().includes(q)
      );
    });
  }, [site, tableSearch, statusFilter]);

  const throughputSeries = React.useMemo(() => {
    return throughput.map((point, idx) => {
      const weeksAgo = throughput.length - idx - 1;
      const d = new Date();
      d.setDate(d.getDate() - weeksAgo * 7);
      return {
        ...point,
        dateIso: d.toISOString().slice(0, 10),
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    });
  }, [throughput]);
  const lastThroughputIndex = throughputSeries.length - 1;
  const kpiTrends = React.useMemo(
    () => ({
      stockVelocityPct: 2.1,
      fillRatePct: 1.3,
      openExceptions: -4.6,
      daysOfSupply: -1.2,
    }),
    [],
  );

  React.useEffect(() => {
    if (!selectedRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRow]);

  const resolveAnomaly = (id: string) => {
    setResolvedIds((prev) => new Set(prev).add(id));
  };

  const resolveAllLow = () => {
    if (severityFilter !== 'Low') return;
    const lows = anomalies.filter((a) => a.severity === 'Low');
    const staggerMs = 260;
    lows.forEach((a, idx) => {
      window.setTimeout(() => resolveAnomaly(a.id), idx * staggerMs);
    });
  };

  return (
    <div className="min-h-screen w-full font-sans text-slate-200" style={{ backgroundColor: C.bg }}>
      <aside
        className="fixed left-0 top-0 z-30 flex h-screen w-80 flex-col border-r p-4"
        style={{ backgroundColor: C.navy, borderColor: C.border }}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: C.mint }}>
            AI Diagnostics
          </h2>
          <div
            className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
              isLive ? 'system-live-dot' : 'bg-slate-600'
            }`}
            style={
              isLive
                ? {
                    backgroundColor: C.mint,
                    boxShadow: `0 0 12px ${C.mint}88`,
                  }
                : undefined
            }
          />
        </div>

        <button
          type="button"
          onClick={() => setIsLive(!isLive)}
          className="mb-4 w-full shrink-0 rounded-xl border py-2.5 px-4 font-mono text-[10px] font-black uppercase tracking-widest transition-all duration-300"
          style={
            isLive
              ? {
                  borderColor: C.mint,
                  color: C.mint,
                  backgroundColor: `${C.mint}12`,
                  boxShadow: `0 0 0 1px ${C.mint}33 inset`,
                }
              : { borderColor: C.border, color: '#64748b', backgroundColor: `${C.card}80` }
          }
        >
          {isLive ? 'SIGNAL: ACTIVE' : 'SIGNAL: PAUSED'}
        </button>

        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Anomaly log</p>
          {severityFilter === 'Low' && (
            <button
              type="button"
              onClick={resolveAllLow}
              className="rounded-lg border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors hover:brightness-110"
              style={{ borderColor: C.mint, color: C.mint, backgroundColor: `${C.mint}10`, boxShadow: `0 0 18px ${C.mint}10` }}
            >
              Resolve All
            </button>
          )}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['All', 'Critical', 'Medium', 'Low'] as SeverityFilter[]).map((level) => {
            const active = severityFilter === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSeverityFilter(level)}
                className="rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
                style={
                  active
                    ? {
                        color: C.bg,
                        borderColor: C.mint,
                        backgroundColor: C.mint,
                        boxShadow: `0 0 14px ${C.mint}88`,
                      }
                    : { color: '#94a3b8', borderColor: `${C.mint}33`, backgroundColor: 'transparent' }
                }
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {anomalies.length === 0 ? (
            <p className="font-mono text-xs text-slate-500">No open anomalies.</p>
          ) : (
            <AnimatePresence mode="popLayout">
              {anomalies.map((a) => (
                <AnomalyEntry
                  key={a.id}
                  anomaly={a}
                  isLive={isLive}
                  isNew={lastInsertedId === a.id}
                  onResolve={() => resolveAnomaly(a.id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </aside>

      <div className="ml-80 flex min-h-screen flex-col">
        <main className="flex-1 space-y-5 overflow-y-auto p-6 pb-10">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Analyst Portal</h1>
              <p className="text-sm italic text-slate-500">Real-time Inventory Ecosystem</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border p-0.5 font-mono text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: C.border, backgroundColor: C.card }}>
                {(['7', '30', '90'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDateRange(d)}
                    className="rounded-md px-3 py-2 transition-colors"
                    style={
                      dateRange === d
                        ? { backgroundColor: `${C.mint}22`, color: C.mint }
                        : { color: '#94a3b8' }
                    }
                  >
                    Last {d}d
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                Site
                <select
                  value={site}
                  onChange={(e) => setSite(e.target.value as SiteFilter)}
                  className="rounded-lg border px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:ring-2 focus:ring-[#00ffaa33]"
                  style={{ backgroundColor: C.card, borderColor: C.border }}
                >
                  {SITE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'All sites' : s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setIsLive(!isLive)}
                className="rounded-lg border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wide transition-all"
                style={
                  isLive
                    ? {
                        borderColor: C.mint,
                        color: C.mint,
                        backgroundColor: `${C.mint}14`,
                        boxShadow: `0 0 20px ${C.mint}22`,
                      }
                    : { borderColor: C.border, color: '#64748b', backgroundColor: C.card }
                }
              >
                {isLive ? '● SYSTEM LIVE' : '○ SYSTEM PAUSED'}
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Stock velocity" value={`${kpis.stockVelocityPct}%`} dim={dim} valueClass="text-white" trend={kpiTrends.stockVelocityPct} />
            <KpiCard label="Fill rate" value={`${kpis.fillRatePct}%`} dim={dim} valueStyle={{ color: C.mint }} trend={kpiTrends.fillRatePct} />
            <KpiCard
              label="Open exceptions"
              value={String(kpis.openExceptions)}
              dim={dim}
              valueStyle={{ color: C.amber }}
              trend={kpiTrends.openExceptions}
              reverseColor
            />
            <KpiCard
              label="Days of supply"
              value={String(kpis.daysOfSupply)}
              dim={dim}
              valueStyle={{ color: C.cyan }}
              trend={kpiTrends.daysOfSupply}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel title="Weekly throughput (units)">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                  <span>Show Zero Baseline</span>
                  <input
                    type="checkbox"
                    checked={showZeroBaseline}
                    onChange={(e) => setShowZeroBaseline(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className="relative h-5 w-10 rounded-full border transition-colors"
                    style={{
                      borderColor: showZeroBaseline ? C.mint : C.border,
                      backgroundColor: showZeroBaseline ? `${C.mint}18` : `${C.card}`,
                      boxShadow: showZeroBaseline ? `0 0 22px ${C.mint}22` : undefined,
                    }}
                    aria-hidden="true"
                  >
                    <span
                      className="absolute"
                      style={{
                        transform: `translateX(${showZeroBaseline ? '20px' : '2px'})`,
                        width: 16,
                        height: 16,
                        marginTop: 4,
                        borderRadius: 999,
                        backgroundColor: showZeroBaseline ? C.mint : '#64748b',
                        boxShadow: showZeroBaseline ? `0 0 18px ${C.mint}55` : undefined,
                        transition: 'transform 160ms ease, background-color 160ms ease',
                      }}
                    />
                  </span>
                </label>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={throughputSeries}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <YAxis domain={showZeroBaseline ? [0, 'auto'] : ['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <Tooltip content={(props) => <WeeklyThroughputTooltip {...props} />} />
                  <Line
                    type="monotone"
                    dataKey="units"
                    name="Units"
                    stroke={C.mint}
                    strokeWidth={2}
                    dot={(dotProps: any) => {
                      const { cx, cy, index } = dotProps ?? {};
                      if (typeof cx !== 'number' || typeof cy !== 'number') {
                        return <circle cx={0} cy={0} r={0} fill={C.mint} opacity={0} stroke="none" />;
                      }
                      const isLast = index === lastThroughputIndex;
                      if (isLast) {
                        return (
                          <motion.circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={C.mint}
                            style={{ filter: `drop-shadow(0 0 8px ${C.mint}55)` }}
                            animate={{ r: [3.6, 6.2, 3.6], opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        );
                      }
                      return <circle cx={cx} cy={cy} r={3} fill={C.mint} stroke="none" />;
                    }}
                    activeDot={{ fill: C.mint, r: 7, strokeWidth: 0 }}
                    opacity={dim ? 0.35 : 1}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Volume by site">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={volumeBySite}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="units" name="Units" fill={C.mint} radius={[4, 4, 0, 0]} opacity={dim ? 0.35 : 1} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Demand forecast vs actual">
              <div className="mb-2 flex items-center justify-end gap-4 pr-2">
                <button
                  type="button"
                  onClick={() => setShowForecast((v) => !v)}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors"
                  style={{
                    borderColor: showForecast ? `${C.cyan}55` : 'rgba(255,255,255,0.05)',
                    color: showForecast ? C.cyan : '#64748b',
                    backgroundColor: showForecast ? `${C.cyan}10` : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: C.cyan,
                      boxShadow: showForecast ? `0 0 14px ${C.cyan}88` : 'none',
                    }}
                  />
                  Forecast
                </button>
                <button
                  type="button"
                  onClick={() => setShowActual((v) => !v)}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors"
                  style={{
                    borderColor: showActual ? `${C.mint}55` : 'rgba(255,255,255,0.05)',
                    color: showActual ? C.mint : '#64748b',
                    backgroundColor: showActual ? `${C.mint}10` : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: C.mint,
                      boxShadow: showActual ? `0 0 14px ${C.mint}88` : 'none',
                    }}
                  />
                  Actual
                </button>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={forecastVsActual}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="actualFillGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.mint} stopOpacity={0.28} />
                      <stop offset="90%" stopColor={C.mint} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <Tooltip {...chartTooltip} />
                  {showForecast && (
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast"
                      stroke={C.cyan}
                      strokeWidth={2}
                      strokeDasharray="6 6"
                      dot={{ fill: C.cyan, r: 3 }}
                      opacity={dim ? 0.35 : 1}
                    />
                  )}
                  {showActual && (
                    <Area
                      type="monotone"
                      dataKey="actual"
                      name="Actual"
                      stroke={C.mint}
                      strokeWidth={2}
                      fill="url(#actualFillGradient)"
                      fillOpacity={1}
                      dot={{ fill: C.mint, r: 3 }}
                      opacity={dim ? 0.35 : 1}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Inventory aging by bucket">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={agingStackData}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                  <Tooltip content={(props) => <AgingStackTooltip {...props} />} />
                  <Bar
                    dataKey="0–30d"
                    stackId="aging"
                    fill={C.mint}
                    radius={[0, 0, 4, 4]}
                    opacity={dim ? 0.35 : 1}
                  />
                  <Bar dataKey="31–60d" stackId="aging" fill={C.amber} opacity={dim ? 0.35 : 1} />
                  <Bar
                    dataKey="61–90+d"
                    stackId="aging"
                    fill={C.cyan}
                    radius={[4, 4, 0, 0]}
                    opacity={dim ? 0.35 : 1}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <section
            className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border"
            style={{
              backgroundColor: 'rgba(13, 27, 46, 0.62)',
              borderColor: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <div
              className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(13, 27, 46, 0.78)' }}
            >
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                Inventory status monitor
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Search SKU, category, site…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="min-w-[10rem] flex-1 rounded-lg border px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-[#00ffaa33] sm:max-w-xs sm:flex-none"
                  style={{ backgroundColor: C.bg, borderColor: C.border }}
                  aria-label="Filter inventory table"
                />
                <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'all' | RowStatus)}
                    className="rounded-lg border px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:ring-2 focus:ring-[#00ffaa33]"
                    style={{ backgroundColor: C.bg, borderColor: C.border }}
                  >
                    <option value="all">All</option>
                    <option value="ok">OK</option>
                    <option value="low">Low</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => exportInventoryCsv(tableRows)}
                  className="rounded-lg border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors hover:brightness-110"
                  style={{ borderColor: C.cyan, color: C.cyan, backgroundColor: `${C.cyan}12` }}
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className={`w-full text-left text-sm transition-opacity duration-500 ${isLive ? 'opacity-100' : 'opacity-30'}`}>
                <thead className="sticky top-0 z-10 font-mono text-[10px] uppercase tracking-wider text-slate-500" style={{ backgroundColor: C.card }}>
                  <tr className="border-b" style={{ borderColor: C.border }}>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3 text-right">Qty on hand</th>
                    <th className="px-4 py-3 text-right">Reorder level</th>
                    <th className="px-4 py-3 text-right">Days of supply</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: C.border }}>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No rows match your search or status filter.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row) => (
                      <tr
                        key={row.sku}
                        onClick={() => setSelectedRow(row)}
                        className="cursor-pointer transition-colors hover:bg-[#00ffaa0a]"
                        style={{ borderColor: C.border }}
                      >
                        <td className="px-4 py-3 font-mono text-slate-300">{row.sku}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.site}</td>
                        <td className="px-4 py-3 text-right font-sans text-slate-200">{row.qtyOnHand.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-sans text-slate-200">{row.reorderLevel}</td>
                        <td className="px-4 py-3 text-right font-sans text-slate-200">{row.daysOfSupply}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <div className="w-full max-w-md">
              <AIInsightBox />
            </div>
          </div>
        </main>
      </div>

      {selectedRow && (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity"
            onClick={() => setSelectedRow(null)}
          />
          <aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-2xl animate-in slide-in-from-right duration-200"
            style={{ backgroundColor: C.card, borderColor: C.border, boxShadow: `-12px 0 40px ${C.mint}12` }}
          >
            <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: C.border }}>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">SKU detail</p>
                <h2 className="font-mono text-lg font-bold text-white">{selectedRow.sku}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-lg border p-2 text-slate-400 transition-colors hover:text-white"
                style={{ borderColor: C.border }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5 font-sans text-sm text-slate-300">
              <DetailLine label="Site" value={selectedRow.site} mono />
              <DetailLine label="Category" value={selectedRow.category} />
              <DetailLine label="Qty on hand" value={selectedRow.qtyOnHand.toLocaleString()} />
              <DetailLine label="Reorder level" value={String(selectedRow.reorderLevel)} />
              <DetailLine label="Days of supply" value={String(selectedRow.daysOfSupply)} />
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">Status</p>
                <StatusPill status={selectedRow.status} />
              </div>
              <DetailLine label="Last receipt" value={selectedRow.lastReceipt} mono />
              <div className="rounded-lg border p-3" style={{ borderColor: C.border }}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Mock weekly demand (units)
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getSkuWeeklyDemand(selectedRow.sku)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                      <YAxis width={28} tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'ui-monospace' }} axisLine={{ stroke: C.border }} />
                      <Tooltip {...chartTooltip} />
                      <Line
                        type="monotone"
                        dataKey="units"
                        name="Units"
                        stroke={C.cyan}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="rounded-lg border p-3 text-xs leading-relaxed text-slate-500" style={{ borderColor: C.border }}>
                Mock panel: connect to allocation, PO pipeline, and exception history when backend is ready.
              </p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function AnomalyEntry({
  anomaly,
  isLive,
  isNew,
  onResolve,
}: {
  anomaly: Anomaly;
  isLive: boolean;
  isNew: boolean;
  onResolve: () => void;
}) {
  const isCritical = anomaly.severity === 'Critical';
  const [isResolving, setIsResolving] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onResolveClick = () => {
    if (isResolving) return;
    setIsResolving(true);
    timerRef.current = window.setTimeout(() => {
      onResolve();
    }, 600);
  };

  return (
    <motion.div
      layout
      className="rounded-lg border p-3 transition-colors"
      style={{
        borderColor: isCritical ? 'rgba(248, 113, 113, 0.55)' : 'rgba(255,255,255,0.05)',
        backgroundColor: isCritical ? 'rgba(248, 113, 113, 0.10)' : 'rgba(13, 27, 46, 0.60)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        overflow: 'hidden',
        transformOrigin: 'top',
        boxShadow: isCritical
          ? '0 0 22px rgba(248,113,113,0.22), 0 0 0 1px rgba(248,113,113,0.14) inset'
          : '0 0 0 1px rgba(255,255,255,0.02) inset',
      }}
      initial={isNew ? { opacity: 0, y: -18, scale: 0.985 } : false}
      animate={{ opacity: isLive ? 1 : 0.45, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scaleY: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] text-slate-500">{anomaly.id}</span>
        <SeverityBadge severity={anomaly.severity} />
      </div>
      <p className={`mb-2 text-xs leading-snug ${isLive ? 'text-slate-300' : 'text-slate-600'}`}>{anomaly.message}</p>
      <p className="mb-3 font-mono text-[10px] text-slate-500">{anomaly.timestamp}</p>
      <button
        type="button"
        onClick={onResolveClick}
        disabled={isResolving}
        className={`w-full rounded-lg border py-2 font-mono text-[10px] font-bold uppercase tracking-wide transition-all hover:brightness-110 ${
          isResolving ? 'cursor-not-allowed opacity-70 hover:brightness-100' : ''
        }`}
        style={{ borderColor: C.mint, color: C.mint, backgroundColor: `${C.mint}10` }}
      >
        {isResolving ? 'Resolving...' : 'Resolve'}
      </button>
    </motion.div>
  );
}

function SeverityBadge({ severity }: { severity: Anomaly['severity'] }) {
  const styles: Record<Anomaly['severity'], React.CSSProperties> = {
    Low: { color: '#94a3b8', borderColor: '#475569', backgroundColor: '#1e293b66' },
    Medium: { color: C.amber, borderColor: `${C.amber}55`, backgroundColor: `${C.amber}14` },
    Critical: { color: C.red, borderColor: `${C.red}55`, backgroundColor: `${C.red}14` },
  };
  return (
    <span className="rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide" style={styles[severity]}>
      {severity}
    </span>
  );
}

function KpiCard({
  label,
  value,
  dim,
  valueClass,
  valueStyle,
  trend,
  reverseColor,
}: {
  label: string;
  value: string;
  dim: boolean;
  valueClass?: string;
  valueStyle?: React.CSSProperties;
  trend: number;
  reverseColor?: boolean;
}) {
  const isTrendPositive = trend >= 0;
  const Icon = isTrendPositive ? ArrowUpRight : ArrowDownRight;
  const shouldUseMint = reverseColor ? !isTrendPositive : isTrendPositive;
  const color = shouldUseMint ? C.mint : C.red;
  const bg = shouldUseMint ? `${C.mint}12` : `${C.red}12`;
  const borderColor = shouldUseMint ? `${C.mint}55` : `${C.red}55`;
  const formatted = `${isTrendPositive ? '+' : '-'}${Math.abs(trend).toFixed(1)}%`;

  return (
    <div
      className="rounded-xl border p-4 transition-all duration-300 hover:shadow-[0_0_24px_rgba(0,255,170,0.12)]"
      style={{
        backgroundColor: 'rgba(13, 27, 46, 0.68)',
        borderColor: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        minHeight: '7rem',
      }}
    >
      <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`text-3xl font-bold tracking-tight font-sans ${valueClass ?? ''}`}
          style={{
            ...(dim ? { color: '#334155' } : valueStyle),
          }}
        >
          {value}
        </p>
        <div
          className="flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] font-bold tracking-wide"
          style={{
            color: dim ? '#64748b' : color,
            backgroundColor: dim ? `${C.card}cc` : bg,
            borderColor: dim ? C.border : borderColor,
            opacity: dim ? 0.8 : 1,
          }}
          aria-label={`${label} trend`}
        >
          <Icon className="h-3 w-3" />
          {formatted}
        </div>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-64 flex-col overflow-hidden rounded-xl border"
      style={{
        backgroundColor: 'rgba(13, 27, 46, 0.62)',
        borderColor: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(13, 27, 46, 0.78)' }}>
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      <motion.div className="min-h-0 flex-1 p-2" layout>
        {children}
      </motion.div>
    </div>
  );
}

function StatusPill({ status }: { status: InventoryRow['status'] }) {
  const map = {
    ok: { label: 'OK', fg: C.mint, bg: `${C.mint}18`, border: `${C.mint}44` },
    low: { label: 'Low', fg: C.amber, bg: `${C.amber}18`, border: `${C.amber}44` },
    critical: { label: 'Critical', fg: C.red, bg: `${C.red}18`, border: `${C.red}44` },
  }[status];
  return (
    <span
      className="inline-block rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide"
      style={{ color: map.fg, backgroundColor: map.bg, borderColor: map.border }}
    >
      {map.label}
    </span>
  );
}

function DetailLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-base text-slate-100 ${mono ? 'font-mono text-sm' : 'font-sans'}`}>{value}</p>
    </div>
  );
}

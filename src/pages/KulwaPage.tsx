import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertTriangle, Activity, X, MessageSquare, Clock, Hash } from 'lucide-react';
import type { KulwaOverview, SessionStats, KulwaConversation } from '../types';
import { fetchKulwaOverview, bustKulwaCache, peekKulwaOverview, isFreshKulwaOverview, fetchKulwaConversations, peekKulwaConversations } from '../api/kulwa';
import FilterBar from '../components/FilterBar';
import { Sparkline } from '../components/Charts';
import { ChartSkeleton, KpiCardSkeleton, TableSkeleton, ErrorBlock, SectionCard } from '../components/UI';

type DayOpt = 7 | 30 | 90;
type SubTab = 'overview' | 'intents' | 'outcomes';

const INTENT_PAGE_SIZE = 5;

const SUB_TABS: { key: SubTab; label: string; shortLabel: string }[] = [
  { key: 'overview', label: 'Overview',              shortLabel: 'Overview' },
  { key: 'intents',  label: 'Intent Breakdown',      shortLabel: 'Intents'  },
  { key: 'outcomes', label: 'Conversation Outcomes', shortLabel: 'Outcomes' },
];

function DeltaChip({ pct, dir, goodDir }: { pct: number | null; dir: 'up' | 'down'; goodDir: 'up' | 'down' }) {
  if (pct === null) return null;
  const isGood = dir === goodDir;
  const bg    = isGood ? 'var(--ok-soft, #E6F7EC)' : 'var(--bad-soft, #FFEEF2)';
  const color = isGood ? 'var(--ok, #00AA40)'       : 'var(--bad, #C7203F)';
  const arrow = dir === 'up' ? '↑' : '↓';
  return (
    <span className="inline-flex items-center gap-[3px] rounded-full text-[11px] font-bold"
          style={{ padding: '2px 7px', background: bg, color }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function containmentColor(rate: number) {
  if (rate >= 0.80) return 'var(--ok, #00AA40)';
  if (rate >= 0.65) return '#F59E0B';
  return 'var(--bad, #C7203F)';
}

export default function KulwaPage() {
  const [days, setDays]       = useState<DayOpt>(7);
  const [tab, setTab]         = useState<SubTab>('overview');
  const [intentPage, setIntentPage] = useState(0);
  const [data, setData]       = useState<KulwaOverview | null>(() => peekKulwaOverview(7));
  const [loading, setLoading] = useState(!peekKulwaOverview(7));
  const [error, setError]     = useState<string | null>(null);

  // Outcome drawer state
  const [selectedOutcome, setSelectedOutcome] = useState<keyof SessionStats | null>(null);
  const [outcomeConvs, setOutcomeConvs]       = useState<KulwaConversation[] | null>(null);
  const [outcomeLoading, setOutcomeLoading]   = useState(false);

  const load = useCallback(async (bust = false) => {
    if (bust) {
      bustKulwaCache();
    } else {
      const stale = peekKulwaOverview(days);
      if (stale) setData(stale);
      if (isFreshKulwaOverview(days)) return;
      if (!stale) setLoading(true);
    }
    setError(null);
    try {
      setData(await fetchKulwaOverview(days));
    } catch (e) {
      if (!data) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes to pick up background cache updates
  useEffect(() => {
    const id = setInterval(() => { load(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Reset intent page when days or tab changes
  useEffect(() => { setIntentPage(0); }, [days, tab]);

  // Populate outcome drawer: peek cache first, fetch if needed, always filter client-side
  useEffect(() => {
    if (!selectedOutcome) { setOutcomeConvs(null); return; }

    const filterByOutcome = (convs: KulwaConversation[]) =>
      convs.filter(c => c.closing_state === selectedOutcome);

    // Peek the already-warmed cache (prefetchKulwa warms limit=50)
    const cached = peekKulwaConversations(days, 50, 0, '', '', '');
    if (cached) {
      setOutcomeConvs(filterByOutcome(cached.data));
      setOutcomeLoading(false);
      return;
    }

    setOutcomeLoading(true);
    setOutcomeConvs(null);
    fetchKulwaConversations(days, 200, 0)
      .then(res => { setOutcomeConvs(filterByOutcome(res.data)); })
      .catch(() => setOutcomeConvs([]))
      .finally(() => setOutcomeLoading(false));
  }, [selectedOutcome, days]);

  const chartData = data
    ? data.days.map((d, i) => ({
        key: d.key,
        date: d.date,
        total: data.total_series[i] ?? 0,
        unique: data.unique_users_series[i] ?? 0,
      }))
    : [];

  const totalIntentPages = data ? Math.ceil(data.intents.length / INTENT_PAGE_SIZE) : 0;
  const pagedIntents = data
    ? data.intents.slice(intentPage * INTENT_PAGE_SIZE, (intentPage + 1) * INTENT_PAGE_SIZE)
    : [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <FilterBar
        days={days}
        onDaysChange={(d) => setDays((d ?? 7) as DayOpt)}
        onRefresh={() => load(true)}
        loading={loading}
        title="Kulwa-Kopagari"
        subtitle="AI Car Loan Assistant · WhatsApp Business"
      />

      {/* Live status strip — always visible */}
      {data && (
        <div className="flex-shrink-0 flex items-center flex-wrap gap-x-3 gap-y-1 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold"
             style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <Activity size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--ink-2)' }}>Live:</span>
          <span style={{ color: 'var(--ok)' }}>
            <span className="live-dot" style={{ marginRight: 5 }} />
            {data.live_status.status}
          </span>
          <span style={{ color: 'var(--ink-3)' }}>·</span>
          <span style={{ color: 'var(--ink-2)' }}>{data.live_status.active_now} active now</span>
          <span style={{ color: 'var(--ink-3)' }}>·</span>
          <span style={{ color: 'var(--ink-2)' }}>{data.live_status.in_queue} in queue</span>
        </div>
      )}

      {/* Sub-tab navigation — sits below the live bar */}
      <div className="flex-shrink-0 flex items-end gap-0.5 px-3 sm:px-4 md:px-6 pt-3 pb-0 overflow-x-auto"
           style={{ background: 'var(--canvas)', borderBottom: '1px solid var(--line)' }}>
        {SUB_TABS.map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-t-[8px] text-[11px] sm:text-[12px] md:text-[13px] font-semibold transition-all duration-150 whitespace-nowrap flex-none"
              style={{
                height: 34,
                padding: '0 10px',
                border: '1px solid var(--line)',
                borderBottom: isActive ? '1px solid var(--surface)' : '1px solid var(--line)',
                background: isActive ? 'var(--surface)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--ink-3)',
                marginBottom: isActive ? -1 : 0,
                cursor: 'pointer',
                position: 'relative',
                zIndex: isActive ? 1 : 0,
              }}>
              <span className="md:hidden">{t.shortLabel}</span>
              <span className="hidden md:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
        {error && !data ? (
          <div className="p-8"><ErrorBlock message={error} onRetry={load} /></div>
        ) : (
          <div className="p-3 sm:p-4 md:p-5 lg:p-6 space-y-3 lg:space-y-4 max-w-[1600px] mx-auto" style={{ background: 'var(--canvas)' }}>

            {/* ── OVERVIEW TAB ─────────────────────────────────── */}
            {tab === 'overview' && (
              <>
                {/* Needs-attention banner */}
                {data && data.needs_attention.length > 0 && (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-[10px]"
                       style={{ background: '#FFF7ED', border: '1px solid #FBBF24' }}>
                    <AlertTriangle size={16} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p className="text-[13px] font-bold" style={{ color: '#92400E' }}>Needs attention</p>
                      <p className="text-[12.5px] mt-0.5" style={{ color: '#92400E' }}>
                        Low containment rate (&lt;65%): {data.needs_attention.map(i => i.name).join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                  {loading && !data ? (
                    <><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /></>
                  ) : data ? (
                    data.kpis.map((kpi) => (
                      <div key={kpi.id} className="card p-4 animate-fadeUp">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--ink-3)' }}>
                            {kpi.label}
                          </p>
                          <DeltaChip pct={kpi.delta_pct} dir={kpi.delta_dir} goodDir={kpi.good_dir} />
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[30px] font-extrabold leading-none tabular-nums" style={{ color: 'var(--ink)' }}>
                              {kpi.value}{kpi.unit}
                            </p>
                            <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--ink-3)' }}>{kpi.sub}</p>
                          </div>
                          {kpi.spark.length > 1 && (
                            <Sparkline data={kpi.spark} width={80} height={32} />
                          )}
                        </div>
                      </div>
                    ))
                  ) : null}
                </div>

                {/* Daily Activity chart */}
                <SectionCard title="Daily Activity"
                  description={data ? `${data.period.start} – ${data.period.end}` : undefined}>
                  {loading && !data ? <ChartSkeleton /> : data ? (
                    <div className="px-2 pt-2 pb-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ov-total" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#00AA40" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="#00AA40" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="ov-unique" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2196F3" stopOpacity={0.2} />
                              <stop offset="100%" stopColor="#2196F3" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
                          <XAxis dataKey="key" tick={{ fontSize: 11, fill: 'var(--ink-3)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-3)', fontWeight: 500 }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip
                            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 13 }}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                          />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Area type="monotone" dataKey="total" name="Total" stroke="#00AA40" fill="url(#ov-total)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Area type="monotone" dataKey="unique" name="Unique Users" stroke="#2196F3" fill="url(#ov-unique)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </SectionCard>
              </>
            )}

            {/* ── INTENT BREAKDOWN TAB ─────────────────────────── */}
            {tab === 'intents' && (
              <SectionCard
                title="Intent Breakdown"
                description={data ? `${data.intents.length} intents tracked` : undefined}>
                {loading && !data ? <TableSkeleton rows={5} /> : data ? (
                  data.intents.length === 0 ? (
                    <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>No intent data yet.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                              {['Intent', 'Count', 'Containment', 'Avg Msgs', 'Trend'].map((h) => (
                                <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-[0.06em]"
                                    style={{ color: 'var(--ink-3)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedIntents.map((intent, idx) => (
                              <tr key={intent.id}
                                  style={{ borderBottom: idx < pagedIntents.length - 1 ? '1px solid var(--line)' : 'none' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                <td className="px-5 py-3">
                                  <p className="font-semibold" style={{ color: 'var(--ink)' }}>{intent.name}</p>
                                  {intent.desc && (
                                    <p className="text-[11.5px] mt-0.5 line-clamp-1" style={{ color: 'var(--ink-3)' }}>{intent.desc}</p>
                                  )}
                                </td>
                                <td className="px-5 py-3 font-mono font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                                  {intent.count.toLocaleString()}
                                </td>
                                <td className="px-5 py-3">
                                  <span className="font-bold" style={{ color: containmentColor(intent.containment) }}>
                                    {(intent.containment * 100).toFixed(0)}%
                                  </span>
                                </td>
                                <td className="px-5 py-3 font-mono tabular-nums" style={{ color: 'var(--ink-2)' }}>
                                  {intent.avg_msgs.toFixed(1)}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    <Sparkline data={intent.trend} width={60} height={24} />
                                    <DeltaChip pct={intent.delta_pct} dir={intent.dir} goodDir="up" />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalIntentPages > 1 && (
                        <div className="flex items-center justify-between px-5 py-3"
                             style={{ borderTop: '1px solid var(--line)' }}>
                          <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                            Showing {intentPage * INTENT_PAGE_SIZE + 1}–{Math.min((intentPage + 1) * INTENT_PAGE_SIZE, data.intents.length)} of {data.intents.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={intentPage === 0}
                              onClick={() => setIntentPage(p => p - 1)}
                              className="rounded-[6px] text-[12px] font-semibold disabled:opacity-40"
                              style={{ height: 30, padding: '0 12px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: intentPage === 0 ? 'default' : 'pointer' }}>
                              Prev
                            </button>
                            {Array.from({ length: totalIntentPages }, (_, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setIntentPage(i)}
                                className="rounded-[6px] text-[12px] font-semibold"
                                style={{
                                  height: 30, width: 30,
                                  border: '1px solid var(--line)',
                                  background: intentPage === i ? 'var(--accent)' : 'var(--surface)',
                                  color: intentPage === i ? '#fff' : 'var(--ink-2)',
                                  cursor: 'pointer',
                                }}>
                                {i + 1}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={intentPage >= totalIntentPages - 1}
                              onClick={() => setIntentPage(p => p + 1)}
                              className="rounded-[6px] text-[12px] font-semibold disabled:opacity-40"
                              style={{ height: 30, padding: '0 12px', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: intentPage >= totalIntentPages - 1 ? 'default' : 'pointer' }}>
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )
                ) : null}
              </SectionCard>
            )}

            {/* ── CONVERSATION OUTCOMES TAB ────────────────────── */}
            {tab === 'outcomes' && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] px-1 -mb-1"
                   style={{ color: 'var(--ink-3)' }}>Conversation Outcomes</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-4">
                  {([
                    { key: 'active',          label: 'Active',          desc: 'Live right now',          accent: '#00AA40',      soft: '#E6F7EC' },
                    { key: 'satisfied',       label: 'Satisfied',       desc: 'User confirmed happy',    accent: '#4338CA',      soft: '#EEF2FF' },
                    { key: 'intent_prompted', label: 'Action prompted', desc: 'Bot guided to next step', accent: '#0284C7',      soft: '#E0F2FE' },
                    { key: 'resolved',        label: 'Resolved',        desc: 'Ended normally',          accent: 'var(--ink-3)', soft: 'var(--surface-2)' },
                    { key: 'abandoned',       label: 'Abandoned',       desc: 'User went silent',        accent: '#C2410C',      soft: '#FFF7ED' },
                  ] as { key: keyof SessionStats; label: string; desc: string; accent: string; soft: string }[]).map(({ key, label, desc, accent, soft }) => {
                    if (!data) return <div key={key} className="card animate-shimmer" style={{ height: 130 }} />;
                    const count = data.session_stats[key] as number;
                    const total = data.session_stats.active + data.session_stats.satisfied + data.session_stats.intent_prompted + data.session_stats.resolved + data.session_stats.abandoned;
                    const pct   = total > 0 ? Math.round(count / total * 100) : 0;
                    const isSelected = selectedOutcome === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedOutcome(isSelected ? null : key)}
                        className="card p-4 flex flex-col gap-2 animate-fadeUp text-left w-full transition-all duration-150"
                        style={{
                          outline: isSelected ? `2px solid ${accent}` : undefined,
                          outlineOffset: isSelected ? 1 : undefined,
                          cursor: 'pointer',
                        }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: accent }}>{label}</p>
                          <span className="text-[11px] font-bold rounded-full px-2 py-[2px]"
                                style={{ background: soft, color: accent }}>{pct}%</span>
                        </div>
                        <p className="text-[30px] font-extrabold leading-none tabular-nums" style={{ color: 'var(--ink)' }}>
                          {count.toLocaleString()}
                        </p>
                        <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{desc}</p>
                        <div className="h-[3px] rounded-full overflow-hidden mt-auto" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${pct}%`, background: accent }} />
                        </div>
                        <p className="text-[10.5px] font-semibold mt-0.5" style={{ color: accent, opacity: 0.7 }}>
                          {isSelected ? 'Click to close' : 'Click to view conversations →'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

          </div>
        )}
      </div>

      {/* ── OUTCOME CONVERSATIONS DRAWER ─────────────────────── */}
      {selectedOutcome && (() => {
        const OUTCOME_META: Record<string, { label: string; accent: string; soft: string; desc: string }> = {
          active:           { label: 'Active',          accent: '#00AA40', soft: '#E6F7EC', desc: 'Live right now' },
          satisfied:        { label: 'Satisfied',       accent: '#4338CA', soft: '#EEF2FF', desc: 'User confirmed happy' },
          intent_prompted:  { label: 'Action prompted', accent: '#0284C7', soft: '#E0F2FE', desc: 'Bot guided to next step' },
          resolved:         { label: 'Resolved',        accent: 'var(--ink-3)', soft: 'var(--surface-2)', desc: 'Ended normally' },
          abandoned:        { label: 'Abandoned',       accent: '#C2410C', soft: '#FFF7ED', desc: 'User went silent' },
        };
        const meta = OUTCOME_META[selectedOutcome];
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(1px)' }}
              onClick={() => setSelectedOutcome(null)}
            />
            {/* Drawer panel */}
            <div
              className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
              style={{
                width: 'min(420px, 100vw)',
                background: 'var(--surface)',
                borderLeft: '1px solid var(--line)',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              }}>
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
                   style={{ borderBottom: '1px solid var(--line)', background: meta.soft }}>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] mb-0.5"
                     style={{ color: meta.accent }}>{meta.label}</p>
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                    Conversations — {meta.desc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOutcome(null)}
                  className="rounded-full p-1.5 transition-colors"
                  style={{ color: 'var(--ink-3)', background: 'var(--surface)' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Count summary */}
              {!outcomeLoading && outcomeConvs !== null && (
                <div className="flex-shrink-0 px-5 py-2.5 flex items-center gap-2"
                     style={{ borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
                  <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    {outcomeConvs.length === 0
                      ? 'No conversations found for this outcome'
                      : `${outcomeConvs.length} conversation${outcomeConvs.length !== 1 ? 's' : ''} ended as "${meta.label}"`}
                  </span>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {outcomeLoading ? (
                  <div className="flex flex-col gap-3 p-5">
                    {[1,2,3].map(i => (
                      <div key={i} className="rounded-[10px] animate-shimmer" style={{ height: 90, background: 'var(--surface-2)' }} />
                    ))}
                  </div>
                ) : outcomeConvs === null ? null : outcomeConvs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
                    <MessageSquare size={32} style={{ color: 'var(--ink-3)', opacity: 0.4 }} />
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>No conversations</p>
                    <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                      No conversations ended as "{meta.label}" in the selected period.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 flex flex-col gap-3">
                    {outcomeConvs.map(conv => (
                      <div key={conv.id} className="card p-4 flex flex-col gap-2.5"
                           style={{ border: '1px solid var(--line)' }}>
                        {/* Top row: name + state badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{conv.name}</p>
                            <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--ink-3)' }}>{conv.id}</p>
                          </div>
                          <span className="inline-flex rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0"
                                style={{ padding: '2px 9px', background: meta.soft, color: meta.accent }}>
                            {meta.label}
                          </span>
                        </div>

                        {/* Intent */}
                        <div className="flex items-center gap-1.5">
                          <MessageSquare size={12} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                          <p className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{conv.intent}</p>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                            <Hash size={11} />
                            {conv.messages} msg{conv.messages !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                            <Clock size={11} />
                            {conv.duration}
                          </span>
                          <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                            {conv.started}
                          </span>
                          {conv.channel && (
                            <span className="text-[11px] font-bold capitalize rounded-full"
                                  style={{ padding: '1px 7px', background: '#E6F7EC', color: '#008833' }}>
                              {conv.channel}
                            </span>
                          )}
                        </div>

                        {/* Last exchange — the actual messages */}
                        {(conv.last_user_msg || conv.last_bot_reply) && (
                          <div className="flex flex-col gap-1.5 mt-1 pt-2.5"
                               style={{ borderTop: '1px solid var(--line)' }}>
                            <p className="text-[10.5px] font-bold uppercase tracking-[0.07em]"
                               style={{ color: 'var(--ink-3)' }}>Last exchange</p>
                            {conv.last_user_msg && (
                              <div className="flex gap-2 items-start">
                                <span className="text-[10px] font-bold mt-0.5 flex-shrink-0"
                                      style={{ color: 'var(--ink-3)' }}>User</span>
                                <p className="text-[12px] rounded-[8px] px-2.5 py-1.5 leading-snug"
                                   style={{ background: '#F1F5F9', color: 'var(--ink)', flex: 1 }}>
                                  {conv.last_user_msg}
                                </p>
                              </div>
                            )}
                            {conv.last_bot_reply && (
                              <div className="flex gap-2 items-start">
                                <span className="text-[10px] font-bold mt-0.5 flex-shrink-0"
                                      style={{ color: meta.accent }}>Bot</span>
                                <p className="text-[12px] rounded-[8px] px-2.5 py-1.5 leading-snug"
                                   style={{ background: meta.soft, color: 'var(--ink)', flex: 1 }}>
                                  {conv.last_bot_reply}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Reply time if available */}
                        {conv.avg_reply_ms !== null && (
                          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                            Avg reply: {conv.avg_reply_ms < 1000 ? `${conv.avg_reply_ms}ms` : `${(conv.avg_reply_ms / 1000).toFixed(1)}s`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

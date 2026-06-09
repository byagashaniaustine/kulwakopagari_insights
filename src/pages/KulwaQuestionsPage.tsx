import { useState, useEffect, useCallback, useMemo } from 'react';
import type { KulwaQuestion, KulwaSummary, DayFilter } from '../types';
import {
  fetchAllKulwaQuestions, fetchKulwaSummary, bustKulwaCache,
  peekAllKulwaQuestions, isFreshAllKulwaQuestions,
  peekKulwaSummary,
} from '../api/kulwa';
import FilterBar from '../components/FilterBar';
import { KulwaQuestionsTable } from '../components/QuestionsTable';
import { TableSkeleton, ErrorBlock, SectionCard } from '../components/UI';

const PAGE = 50;

export default function KulwaQuestionsPage() {
  const [days, setDays]       = useState<DayFilter>(7);
  const [intent, setIntent]   = useState('');
  const [offset, setOffset]   = useState(0);
  const [allData, setAllData] = useState<KulwaQuestion[]>(
    () => peekAllKulwaQuestions(7) ?? []
  );
  const [summary, setSummary] = useState<KulwaSummary | null>(() => peekKulwaSummary(7));
  const [loading, setLoading] = useState(!peekAllKulwaQuestions(7));
  const [error, setError]     = useState<string | null>(null);

  // Only days triggers a new fetch — intent is filtered client-side
  const load = useCallback(async (bust = false) => {
    if (bust) {
      bustKulwaCache();
    } else {
      const staleQ = peekAllKulwaQuestions(days);
      const staleS = peekKulwaSummary(days);
      if (staleQ) setAllData(staleQ);
      if (staleS) setSummary(staleS);
      if (isFreshAllKulwaQuestions(days)) return;
      if (!staleQ) setLoading(true);
    }
    setError(null);
    try {
      const [q, s] = await Promise.all([
        fetchAllKulwaQuestions(days),
        fetchKulwaSummary(days),
      ]);
      setAllData(q);
      setSummary(s);
    } catch (e) {
      if (!allData.length) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Reset pagination when intent filter changes
  useEffect(() => { setOffset(0); }, [intent]);

  // Client-side intent filtering — instant
  const filtered = useMemo(() => {
    if (!intent) return allData;
    return allData.filter(q => q.intent === intent);
  }, [allData, intent]);

  const pageResult = useMemo(() => ({
    total: filtered.length,
    offset,
    limit: PAGE,
    data: filtered.slice(offset, offset + PAGE),
  }), [filtered, offset]);

  const handleDays   = (d: DayFilter) => { setDays(d); setOffset(0); setIntent(''); };
  const handleIntent = (i: string)    => { setIntent(i); };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <FilterBar days={days} onDaysChange={handleDays} onRefresh={() => load(true)}
        loading={loading} title="Conversations" subtitle="Kulwa-Kopagari" />

      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--canvas)' }}>
        {error && !allData.length ? (
          <div className="p-8"><ErrorBlock message={error} onRetry={load} /></div>
        ) : (
          <div className="p-6 max-w-[1600px] mx-auto">
            <SectionCard title="All Conversations"
              description={allData.length ? `${filtered.length.toLocaleString()} ${intent ? 'matching' : 'total'}` : undefined}>
              {loading && !allData.length ? <TableSkeleton rows={8} /> : allData.length ? (
                <KulwaQuestionsTable
                  data={pageResult.data}
                  total={pageResult.total}
                  offset={offset}
                  limit={PAGE}
                  onPage={setOffset}
                  intents={summary?.intent_breakdown.map((x) => x.intent) ?? []}
                  selectedIntent={intent}
                  onIntentChange={handleIntent}
                />
              ) : null}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

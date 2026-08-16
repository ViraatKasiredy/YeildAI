'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ChevronUp, ChevronDown, Search } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Loading, ErrorView, EmptyState } from '@/components/ui/States';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { TrendBadge } from '@/components/ui/Badge';
import { LocationBar } from '@/components/location/LocationBar';
import { PickLocationState } from '@/components/location/PickLocationState';
import { getAllLatestForecasts, getForecastHistory } from '@/lib/dataService';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEffectiveLocation } from '@/lib/useEffectiveLocation';
import type { Forecast } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_OFFSET_DAYS = 365;
const TOLERANCE_DAYS = 45;

interface PriceRow {
  id: string;
  commodity: string;
  market: string;
  state: string;
  district: string;
  thisYearPrice: number;
  thisYearDate: string;
  trend: Forecast['predictedPriceTrend'];
  historyStatus: 'loading' | 'done';
  lastYearPrice: number | null;
  changeAbs: number | null;
  changePct: number | null;
}

/**
 * Picks the history record closest to exactly one year before `anchorDateIso`,
 * accepting a match only within TOLERANCE_DAYS either side of that target —
 * price files don't always have a record on the exact same calendar day.
 */
function findYoyComparison(history: Forecast[], anchorDateIso: string): Forecast | null {
  const anchorMs = new Date(anchorDateIso).getTime();
  const targetMs = anchorMs - TARGET_OFFSET_DAYS * DAY_MS;

  let best: Forecast | null = null;
  let bestDiffMs = Infinity;
  for (const h of history) {
    const diffMs = Math.abs(new Date(h.date).getTime() - targetMs);
    if (diffMs < bestDiffMs) {
      bestDiffMs = diffMs;
      best = h;
    }
  }
  return best && bestDiffMs <= TOLERANCE_DAYS * DAY_MS ? best : null;
}

function toRow(f: Forecast): PriceRow {
  return {
    id: f.id,
    commodity: f.commodity,
    market: f.market,
    state: f.state,
    district: f.district,
    thisYearPrice: f.currentModalPrice,
    thisYearDate: f.date,
    trend: f.predictedPriceTrend,
    historyStatus: 'loading',
    lastYearPrice: null,
    changeAbs: null,
    changePct: null,
  };
}

type SortKey = 'commodity' | 'thisYear' | 'change';
type SortDir = 'asc' | 'desc';

export default function MandiPricesPage() {
  const { activeFarm } = useAuth();
  const {
    effectiveLocation,
    farmLocationStatus,
    locations,
    locationsError,
    hasOverride,
    setManualLocation,
    setMapLocation,
    resetToFarm,
  } = useEffectiveLocation(activeFarm);
  const { state, district } = effectiveLocation;

  const [rows, setRows] = useState<PriceRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('commodity');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    const controller = new AbortController();
    // No chosen location → never fetch with an empty state/district (which the
    // backend would treat as "all locations"). The 'none' empty state below
    // asks the user to pick one instead.
    if (!state || !district) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setError(null);
      setRows([]);
      return () => controller.abort();
    }
    // Clear stale rows immediately so a location change never briefly shows
    // the previous location's markets under the new label while the new
    // request is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setRows([]);
    getAllLatestForecasts(undefined, state, district, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows(data.map(toRow));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [state, district]);

  useEffect(() => {
    if (rows.length === 0) return;
    const controllers = rows.map(() => new AbortController());

    rows.forEach((row, i) => {
      getForecastHistory(row.commodity, row.state, row.district, row.market, {
        signal: controllers[i].signal,
      })
        .then((history) => {
          if (controllers[i].signal.aborted) return;
          const match = findYoyComparison(history, row.thisYearDate);
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    historyStatus: 'done',
                    lastYearPrice: match?.currentModalPrice ?? null,
                    changeAbs: match ? row.thisYearPrice - match.currentModalPrice : null,
                    changePct: match ? ((row.thisYearPrice - match.currentModalPrice) / match.currentModalPrice) * 100 : null,
                  }
                : r
            )
          );
        })
        .catch(() => {
          // Each row's history fetch fails independently — the row simply
          // keeps its "—" year-on-year cells rather than blocking the table.
          if (controllers[i].signal.aborted) return;
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, historyStatus: 'done' } : r)));
        });
    });

    return () => controllers.forEach((c) => c.abort());
    // Only re-run when the row identities (i.e. a new forecast set) change,
    // not on every per-row history update this effect itself makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.id).join(',')]);

  const hasAnyMissingYoy = rows.some((r) => r.historyStatus === 'done' && r.lastYearPrice === null);

  const visibleRows = useMemo(() => {
    const filtered = query.trim()
      ? rows.filter((r) => r.commodity.toLowerCase().includes(query.toLowerCase()))
      : rows;

    return [...filtered].sort((a, b) => {
      const aHasYoy = a.changePct !== null;
      const bHasYoy = b.changePct !== null;
      if (aHasYoy !== bHasYoy) return aHasYoy ? -1 : 1;

      let cmp = 0;
      if (sortKey === 'commodity') cmp = a.commodity.localeCompare(b.commodity);
      else if (sortKey === 'thisYear') cmp = a.thisYearPrice - b.thisYearPrice;
      else if (sortKey === 'change') cmp = (a.changePct ?? 0) - (b.changePct ?? 0);

      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <th className="pb-3 pr-4 font-medium">
        <button
          type="button"
          onClick={() => toggleSort(sortKeyValue)}
          className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
        >
          {label}
          {active ? (
            sortDir === 'asc' ? (
              <ChevronUp size={13} />
            ) : (
              <ChevronDown size={13} />
            )
          ) : (
            <span className="w-[13px]" />
          )}
        </button>
      </th>
    );
  }

  const locationBar = (
    <LocationBar
      effectiveLocation={effectiveLocation}
      farmLocationStatus={farmLocationStatus}
      locations={locations}
      locationsError={locationsError}
      hasOverride={hasOverride}
      hasFarm={!!activeFarm}
      onManualSelect={setManualLocation}
      onMapLocationResolved={(result) => {
        if (result.matchedState && result.matchedDistrict) {
          setMapLocation(result.matchedState, result.matchedDistrict);
        }
      }}
      onResetToFarm={resetToFarm}
    />
  );

  if (effectiveLocation.source === 'none') {
    return (
      <PageWrapper title="Mandi Prices">
        {locationBar}
        <PickLocationState kind="prices" />
      </PageWrapper>
    );
  }

  if (loading) {
    return (
      <PageWrapper title="Mandi Prices">
        {locationBar}
        <Loading />
      </PageWrapper>
    );
  }
  if (error) {
    return (
      <PageWrapper title="Mandi Prices">
        {locationBar}
        <ErrorView message={error} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Mandi Prices">
      {locationBar}
      <p className="text-sm -mt-2 mb-2" style={{ color: 'var(--ink-soft)' }}>
        Showing latest forecasts for {district}, {state}.
      </p>

      <Card title="Year-over-Year Market Prices">
        <div
          className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--line)', background: 'var(--canvas)' }}
        >
          <Search className="h-4 w-4" style={{ color: 'var(--ink-soft)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commodity…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState
            message={
              rows.length === 0
                ? `No forecast coverage for ${district}, ${state} yet. Try a different location above.`
                : 'No commodities match your search.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
                  <SortHeader label="Commodity" sortKeyValue="commodity" />
                  <th className="pb-3 pr-4 font-medium">Market</th>
                  <SortHeader label="This year" sortKeyValue="thisYear" />
                  <th className="pb-3 pr-4 font-medium">Last year</th>
                  <SortHeader label="Change (YoY)" sortKeyValue="change" />
                  <th className="pb-3 pr-4 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const changeColor =
                    r.changeAbs === null
                      ? 'var(--ink-soft)'
                      : r.changeAbs > 0
                        ? 'var(--forest-600)'
                        : r.changeAbs < 0
                          ? 'var(--clay-500)'
                          : 'var(--gold-500)';
                  return (
                    <tr key={r.id} className="border-b" style={{ borderColor: 'var(--line)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--ink)' }}>
                        {r.commodity}
                      </td>
                      <td className="py-3 pr-4" style={{ color: 'var(--ink-soft)' }}>
                        {r.market}
                      </td>
                      <td className="py-3 pr-4 font-[var(--font-mono)]" style={{ color: 'var(--ink)' }}>
                        ₹{r.thisYearPrice.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 pr-4 font-[var(--font-mono)]" style={{ color: 'var(--ink-soft)' }}>
                        {r.historyStatus === 'loading'
                          ? '…'
                          : r.lastYearPrice !== null
                            ? `₹${r.lastYearPrice.toLocaleString('en-IN')}`
                            : '—'}
                      </td>
                      <td className="py-3 pr-4 font-[var(--font-mono)]">
                        {r.historyStatus === 'loading' ? (
                          <span style={{ color: 'var(--ink-soft)' }}>…</span>
                        ) : r.changeAbs !== null && r.changePct !== null ? (
                          <span className="inline-flex items-center gap-1" style={{ color: changeColor }}>
                            {r.changeAbs > 0 ? (
                              <ArrowUp size={12} />
                            ) : r.changeAbs < 0 ? (
                              <ArrowDown size={12} />
                            ) : null}
                            {r.changeAbs >= 0 ? '+' : ''}
                            {r.changePct.toFixed(1)}% (₹{Math.abs(r.changeAbs).toLocaleString('en-IN')})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <TrendBadge trend={r.trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasAnyMissingYoy && (
          <p className="mt-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Some rows show “—” because year-on-year comparison needs a price file spanning more than a year — the
            comparable date wasn&apos;t found within 45 days of last year.
          </p>
        )}
      </Card>
    </PageWrapper>
  );
}

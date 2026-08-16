'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Trophy,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Loading, ErrorView } from '@/components/ui/States';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { TrendBadge, ConfidenceBadge } from '@/components/ui/Badge';
import { LocationBar } from '@/components/location/LocationBar';
import { PickLocationState } from '@/components/location/PickLocationState';
import { getRecommendations } from '@/lib/dataService';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEffectiveLocation } from '@/lib/useEffectiveLocation';
import type { Recommendation, ReasoningDirection } from '@/lib/types';

const DIRECTION_STYLES: Record<
  ReasoningDirection,
  { label: string; className: string }
> = {
  positive: {
    label: 'Positive',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  risk: {
    label: 'Risk',
    className:
      'border-red-200 bg-red-50 text-red-700',
  },
  informational: {
    label: 'Info',
    className:
      'border-stone-200 bg-stone-50 text-stone-600',
  },
};

/**
 * True only when every value is a finite, non-negative number and
 * the total is greater than zero.
 */
function hasValidProbabilities(values: number[]): boolean {
  if (values.length === 0) return false;
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) return false;

  return values.reduce((sum, v) => sum + v, 0) > 0;
}

/**
 * Converts probability values into whole percentage points
 * that add up to exactly 100.
 */
function largestRemainderRound(values: number[]): number[] {
  if (!hasValidProbabilities(values)) {
    return values.map(() => 0);
  }

  const sum = values.reduce((s, v) => s + v, 0);
  const scaled = values.map((v) => (v / sum) * 100);
  const floors = scaled.map((v) => Math.floor(v));
  const result = [...floors];

  let diff = 100 - floors.reduce((s, v) => s + v, 0);

  const order = scaled
    .map((v, i) => ({
      i,
      remainder: v - (floors[i] ?? 0),
    }))
    .sort((a, b) =>
      diff >= 0
        ? b.remainder - a.remainder
        : a.remainder - b.remainder
    );

  let idx = 0;

  while (diff !== 0) {
    const target = order[idx % order.length];

    if (target) {
      result[target.i] =
        (result[target.i] ?? 0) + (diff > 0 ? 1 : -1);
    }

    diff += diff > 0 ? -1 : 1;
    idx++;
  }

  return result;
}

function ProbabilityBreakdown({
  probRising,
  probStable,
  probFalling,
}: {
  probRising: number;
  probStable: number;
  probFalling: number;
}) {
  const [risingPct, stablePct, fallingPct] =
    largestRemainderRound([
      probRising,
      probStable,
      probFalling,
    ]);

  const rows = [
    {
      label: 'Rising',
      pct: risingPct ?? 0,
      color: 'var(--forest-600)',
    },
    {
      label: 'Stable',
      pct: stablePct ?? 0,
      color: 'var(--gold-500)',
    },
    {
      label: 'Falling',
      pct: fallingPct ?? 0,
      color: 'var(--clay-500)',
    },
  ];

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-2 text-xs"
        >
          <span className="w-12 shrink-0 text-stone-500">
            {r.label}
          </span>

          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"
            role="img"
            aria-label={`${r.label} probability ${r.pct}%`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${r.pct}%`,
                background: r.color,
              }}
            />
          </div>

          <span className="w-9 shrink-0 text-right font-mono text-stone-600">
            {r.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ReasoningPanel({
  rec,
}: {
  rec: Recommendation;
}) {
  if (!rec.reasoning) {
    return (
      <p className="text-sm text-stone-500">
        Detailed reasoning is not available for this recommendation.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-stone-700">
        {rec.reasoning.summary}
      </p>

      <div className="space-y-2">
        {rec.reasoning.factors.map((f) => {
          const style =
            DIRECTION_STYLES[f.direction] ??
            DIRECTION_STYLES.informational;

          return (
            <div
              key={f.factor}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 sm:flex-row sm:items-start sm:gap-2 ${style.className}`}
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                {style.label}
              </span>

              <span>
                <strong className="font-medium">
                  {f.factor}:
                </strong>{' '}
                {f.detail}
              </span>
            </div>
          );
        })}
      </div>

      {typeof rec.probRising === 'number' &&
        typeof rec.probStable === 'number' &&
        typeof rec.probFalling === 'number' && (
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
              Trend probability breakdown
            </div>

            {hasValidProbabilities([
              rec.probRising,
              rec.probStable,
              rec.probFalling,
            ]) ? (
              <ProbabilityBreakdown
                probRising={rec.probRising}
                probStable={rec.probStable}
                probFalling={rec.probFalling}
              />
            ) : (
              <p className="text-xs text-stone-500">
                Trend probability data unavailable.
              </p>
            )}
          </div>
        )}

      {rec.reasoning.limitations.length > 0 && (
        <ul className="space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
          {rec.reasoning.limitations.map((l) => (
            <li
              key={l}
              className="flex items-start gap-1.5"
            >
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FullReasoningToggle({
  expanded,
  onToggle,
  controlsId,
  cropName,
}: {
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
  cropName: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={`${expanded ? 'Hide' : 'Show'} full reasoning for ${cropName}`}
      className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
    >
      {expanded ? (
        <ChevronUp size={14} />
      ) : (
        <ChevronDown size={14} />
      )}

      {expanded ? 'Hide full reasoning' : 'Full reasoning'}
    </button>
  );
}

export default function RecommendationsPage() {
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

  const [data, setData] =
    useState<Recommendation[] | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [expandedCropIds, setExpandedCropIds] =
    useState<Set<string>>(new Set());

  const toggleReasoning = (cropId: string) => {
    setExpandedCropIds((prev) => {
      const next = new Set(prev);

      if (next.has(cropId)) {
        next.delete(cropId);
      } else {
        next.add(cropId);
      }

      return next;
    });
  };

  /*
   * Fetch recommendations for whatever the effective location resolves to —
   * the active farm, an override, or a session-chosen current location. When
   * nothing is chosen (source 'none'), state/district are empty and we never
   * fetch; the pick-a-location empty state is shown instead.
   */
  useEffect(() => {
    if (!state || !district) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setData(null);
    setExpandedCropIds(new Set());

    getRecommendations(
      state,
      district,
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
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

  const chartData = useMemo(
    () =>
      (data ?? []).map((r) => ({
        name: r.name,
        profit: r.expectedProfit,
      })),
    [data]
  );

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
        if (
          result.matchedState &&
          result.matchedDistrict
        ) {
          setMapLocation(
            result.matchedState,
            result.matchedDistrict
          );
        }
      }}
      onResetToFarm={resetToFarm}
    />
  );

  /*
   * No location chosen (no farm and no session-chosen current location).
   * Before loading/error so the user sees a pick-a-location prompt — with the
   * LocationBar's picker available — instead of a spinner, an error, or
   * recommendations for a location the app invented.
   */
  if (effectiveLocation.source === 'none') {
    return (
      <PageWrapper title="Crop Recommendations">
        {locationBar}
        <PickLocationState kind="recommendations" />
      </PageWrapper>
    );
  }

  if (loading) {
    return (
      <PageWrapper title="Crop Recommendations">
        {locationBar}
        <Loading />
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Crop Recommendations">
        {locationBar}
        <ErrorView message={error} />
      </PageWrapper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <PageWrapper title="Crop Recommendations">
        {locationBar}

        <Card title="Recommendations">
          <p className="text-stone-600">
            {!state || !district
              ? 'This farm does not have a complete location yet. Add or update the farm location to generate recommendations.'
              : `No recommendations available for ${district}, ${state}${
                  effectiveLocation.isSupported === false
                    ? ' — this location has no forecast coverage yet.'
                    : ' yet.'
                }`}
          </p>
        </Card>
      </PageWrapper>
    );
  }

  const top = data[0] as Recommendation;

  const hasProfitablePick = top.expectedProfit > 0;

  return (
    <PageWrapper title="Crop Recommendations">
      {locationBar}

      <p className="text-sm text-stone-500 -mt-2 mb-2">
        Ranked for {district}, {state} based on price trend
        signals and MSP margins.
      </p>

      {!hasProfitablePick && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          <span>
            No crop currently shows a positive expected profit
            for {district}, {state}. Showing the
            least-unprofitable option below — treat this as a
            caution, not a recommendation to plant.
          </span>
        </div>
      )}

      <Card
        title={
          hasProfitablePick
            ? 'Top pick'
            : 'Best available (no profitable option)'
        }
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            {hasProfitablePick ? (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <Sparkles size={12} />
                AI recommended
              </span>
            ) : (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <AlertTriangle size={12} />
                No profitable option
              </span>
            )}

            <h4 className="text-2xl font-semibold text-stone-900">
              {top.name}
            </h4>

            <p className="mt-1 text-sm text-stone-500">
              {top.bestSeason ?? 'Any season'} ·{' '}
              {top.growthDuration ?? '—'} day cycle
            </p>
          </div>

          <div className="flex gap-8 text-right">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">
                Expected profit / acre
              </div>

              <div
                className={`text-xl font-semibold ${
                  hasProfitablePick
                    ? 'text-emerald-700'
                    : 'text-red-600'
                }`}
              >
                ₹
                {top.expectedProfit.toLocaleString(
                  'en-IN'
                )}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">
                Forecast confidence
              </div>

              <div className="text-xl font-semibold text-stone-800">
                {Math.round(
                  top.confidenceScore * 100
                )}
                %
              </div>

              {top.confidenceBand && (
                <div className="mt-1">
                  <ConfidenceBadge
                    band={top.confidenceBand}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start gap-3 border-t border-stone-100 pt-4">
          <FullReasoningToggle
            expanded={expandedCropIds.has(top.cropId)}
            onToggle={() =>
              toggleReasoning(top.cropId)
            }
            controlsId={`reasoning-${top.cropId}-top`}
            cropName={top.name}
          />

          {expandedCropIds.has(top.cropId) && (
            <div
              id={`reasoning-${top.cropId}-top`}
              className="w-full rounded-xl bg-stone-50 p-4"
            >
              <ReasoningPanel rec={top} />
            </div>
          )}
        </div>
      </Card>

      <Card title="Expected profit by crop">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{
              top: 8,
              right: 16,
              left: 8,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 5"
              stroke="var(--line)"
              vertical={false}
            />

            <XAxis
              dataKey="name"
              tick={{
                fontSize: 11,
                fill: 'var(--ink-soft)',
              }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              tick={{
                fontSize: 11,
                fill: 'var(--ink-soft)',
              }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid var(--line)',
                fontSize: 12.5,
              }}
              formatter={(v) => [
                `₹${Number(v).toLocaleString('en-IN')}`,
                'Expected profit',
              ]}
            />

            <Bar
              dataKey="profit"
              radius={[6, 6, 0, 0]}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={
                    i === 0
                      ? 'var(--forest-600)'
                      : 'var(--sage-300)'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="All ranked recommendations">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="pb-3 pr-4 font-medium">
                  Rank
                </th>

                <th className="pb-3 pr-4 font-medium">
                  Crop
                </th>

                <th className="pb-3 pr-4 font-medium">
                  Score
                </th>

                <th className="pb-3 pr-4 font-medium">
                  Expected Profit
                </th>

                <th className="pb-3 pr-4 font-medium">
                  Price Trend
                </th>

                <th className="pb-3 pr-4 font-medium">
                  Reasoning
                </th>
              </tr>
            </thead>

            <tbody>
              {data.map((r, i) => {
                const rowExpanded =
                  expandedCropIds.has(r.cropId);

                const rowPanelId =
                  `reasoning-${r.cropId}-row`;

                return (
                  <Fragment key={r.cropId}>
                    <tr className="border-b border-stone-100">
                      <td className="py-3 pr-4 text-stone-500">
                        {i === 0 ? (
                          hasProfitablePick ? (
                            <Trophy className="h-4 w-4 text-amber-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )
                        ) : (
                          `#${i + 1}`
                        )}
                      </td>

                      <td className="py-3 pr-4 font-medium text-stone-800">
                        {r.name}
                      </td>

                      <td className="py-3 pr-4 text-stone-600">
                        {r.score.toFixed(1)}
                      </td>

                      <td
                        className={`py-3 pr-4 font-mono ${
                          r.expectedProfit > 0
                            ? 'text-stone-800'
                            : 'text-red-600'
                        }`}
                      >
                        ₹
                        {r.expectedProfit.toLocaleString(
                          'en-IN'
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        <TrendBadge
                          trend={r.predictedTrend}
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <FullReasoningToggle
                          expanded={rowExpanded}
                          onToggle={() =>
                            toggleReasoning(r.cropId)
                          }
                          controlsId={rowPanelId}
                          cropName={r.name}
                        />
                      </td>
                    </tr>

                    {rowExpanded && (
                      <tr className="border-b border-stone-100">
                        <td
                          colSpan={6}
                          className="bg-stone-50 px-4 py-4"
                          id={rowPanelId}
                        >
                          <ReasoningPanel rec={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageWrapper>
  );
}
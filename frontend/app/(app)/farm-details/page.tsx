'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Ruler,
  Droplet,
  Layers,
  Plus,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AddFarmModal } from '@/components/layout/AddFarmModal';
import { TrendBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/auth/AuthContext';
import { getRecommendations } from '@/lib/dataService';
import type { FarmProfile } from '@/lib/auth/types';
import type { Recommendation } from '@/lib/types';

export default function FarmDetailsPage() {
  const { farms, activeFarm, removeFarm, isGuest } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmFarm, setConfirmFarm] = useState<FarmProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-expand the active farm once, the first time farms are available.
  // A ref guard means collapsing it doesn't spring it back open.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current && activeFarm) {
      didInitRef.current = true;
      setExpandedId(activeFarm.id);
    }
  }, [activeFarm]);

  async function handleDelete() {
    if (!confirmFarm) return;
    setDeleting(true);
    setError(null);
    try {
      await removeFarm(confirmFarm.id);
      setConfirmFarm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this farm. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  if (farms.length === 0) {
    return (
      <PageWrapper title="Farm Details">
        <Card title="No farms yet">
          <p className="mb-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Add your first farm to start tracking soil health, yield predictions, and recommendations for it.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={isGuest}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--forest-700)' }}
          >
            <Plus className="h-4 w-4" />
            Add a farm
          </button>
          {isGuest && (
            <p className="mt-2 text-xs" style={{ color: 'var(--clay-500)' }}>
              Sign up to add and save your own farms.
            </p>
          )}
        </Card>
        {showAddModal && !isGuest && <AddFarmModal onClose={() => setShowAddModal(false)} />}
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Farm Details">
      <Card title="Farm Profile">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {farms.length === 1
              ? 'Your farm. Click it to see details, crops, and recommendations for its area.'
              : `All ${farms.length} of your farms. Click one to see its details, crops, and recommendations for its area.`}
          </p>
          {!isGuest && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: 'var(--line)', color: 'var(--forest-700)', background: 'var(--surface)' }}
            >
              <Plus className="h-3.5 w-3.5" /> Add a farm
            </button>
          )}
        </div>

        <div className="border-t" style={{ borderColor: 'var(--line)' }}>
          {farms.map((farm) => {
            const isOpen = expandedId === farm.id;
            const isActive = farm.id === activeFarm?.id;
            return (
              <div key={farm.id} className="border-b" style={{ borderColor: 'var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : farm.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--forest-900)' }}>
                        {farm.name}
                      </span>
                      {isActive && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: 'var(--gold-100)', color: 'var(--gold-500)' }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
                      <MapPin size={13} /> {farm.district}, {farm.state}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp size={18} style={{ color: 'var(--ink-soft)' }} />
                  ) : (
                    <ChevronDown size={18} style={{ color: 'var(--ink-soft)' }} />
                  )}
                </button>

                {isOpen && (
                  <FarmDetail farm={farm} isGuest={isGuest} onRequestDelete={() => setConfirmFarm(farm)} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {showAddModal && !isGuest && <AddFarmModal onClose={() => setShowAddModal(false)} />}

      {confirmFarm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !deleting && setConfirmFarm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ background: 'var(--surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2" style={{ color: 'var(--clay-500)' }}>
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-[var(--font-display)] text-lg" style={{ color: 'var(--forest-900)' }}>
                Delete {confirmFarm.name}?
              </h3>
            </div>
            <p className="mb-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
              This permanently removes this farm and its saved details. This can&apos;t be undone.
            </p>
            {error && (
              <div
                className="mb-3 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--clay-500)33', background: 'var(--clay-100)', color: 'var(--clay-500)' }}
              >
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmFarm(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', background: 'var(--surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'var(--clay-500)' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

/** Expanded content for one farm: stats, crops, and its area's recommendations. */
function FarmDetail({
  farm,
  isGuest,
  onRequestDelete,
}: {
  farm: FarmProfile;
  isGuest: boolean;
  onRequestDelete: () => void;
}) {
  const stats = [
    { icon: MapPin, label: 'Location', value: farm.address || farm.location },
    { icon: Ruler, label: 'Size', value: `${farm.sizeAcres} acres` },
    { icon: Layers, label: 'Soil Type', value: farm.soilType },
    { icon: Droplet, label: 'Irrigation', value: farm.irrigation },
    ...(farm.pincode ? [{ icon: MapPin, label: 'Pincode', value: farm.pincode }] : []),
  ];

  return (
    <div className="pb-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-start gap-3">
            <s.icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--forest-600)' }} />
            <div>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                {s.label}
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--forest-900)' }}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
          Current crops
        </div>
        {farm.crops.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            No crops recorded for this farm yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {farm.crops.map((crop) => (
              <span
                key={crop}
                className="rounded-full border px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: 'var(--sage-300)', background: 'var(--sage-100)', color: 'var(--forest-700)' }}
              >
                {crop}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
          Recommended for {farm.district}, {farm.state}
        </div>
        <FarmRecommendation state={farm.state} district={farm.district} />
      </div>

      {!isGuest && (
        <div className="mt-5 flex justify-end">
          <button
            onClick={onRequestDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: 'var(--clay-500)33', color: 'var(--clay-500)', background: 'var(--surface)' }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete farm
          </button>
        </div>
      )}
    </div>
  );
}

/** Top crop recommendations for a farm's area, fetched lazily when expanded. */
function FarmRecommendation({ state, district }: { state: string; district: string }) {
  const [data, setData] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state || !district) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getRecommendations(state, district, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load recommendations.');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [state, district]);

  if (!state || !district) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        This farm has no location set, so recommendations can&apos;t be generated for it.
      </p>
    );
  }
  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        Loading recommendations…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-sm" style={{ color: 'var(--clay-500)' }}>
        {error}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        No recommendations available for this area yet — it may have no forecast coverage.
      </p>
    );
  }

  const top = data.slice(0, 3);
  return (
    <div className="space-y-2">
      {top.map((rec, i) => {
        const profitable = rec.expectedProfit > 0;
        return (
          <div
            key={rec.cropId}
            className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: 'var(--line)', background: i === 0 ? 'var(--sage-100)' : 'var(--surface)' }}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <Sparkles size={14} style={{ color: 'var(--forest-600)' }} />}
              <span className="text-sm font-medium" style={{ color: 'var(--forest-900)' }}>
                {rec.name}
              </span>
              <TrendBadge trend={rec.predictedTrend} />
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                Profit / acre
              </div>
              <div
                className="font-[var(--font-mono)] text-sm font-semibold"
                style={{ color: profitable ? 'var(--forest-600)' : 'var(--clay-500)' }}
              >
                ₹{rec.expectedProfit.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

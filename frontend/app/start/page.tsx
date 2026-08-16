'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sprout,
  Tractor,
} from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AddFarmModal } from '@/components/layout/AddFarmModal';
import { Select } from '@/components/ui/Select';
import { getLocations, reverseGeocode } from '@/lib/dataService';
import { setCurrentLocation, requestBrowserGeolocation } from '@/lib/currentLocation';
import type { FarmProfile } from '@/lib/auth/types';
import type { Location } from '@/lib/types';

/**
 * Post-login gate. Login lands here (not straight on the dashboard) so the
 * user consciously chooses what location their recommendations are for — the
 * app never invents one.
 *
 * - Has farm(s): confirm the active farm, edit it, or add another.
 * - No farm: an *opt-in* "Use my location" (browser geolocation → reverse
 *   geocode → session current-location store) with a manual state/district
 *   picker fallback on denial. Nothing is assumed.
 *
 * Admins don't have personal farms, so they're routed to their own landing.
 */
function StartGate() {
  const { farms, activeFarm, isAdmin } = useAuth();
  const router = useRouter();

  const [modal, setModal] = useState<'add' | 'edit' | null>(null);

  useEffect(() => {
    if (isAdmin) router.replace('/admin');
  }, [isAdmin, router]);

  if (isAdmin) return null;

  const hasFarms = farms.length > 0;

  return (
    <div className="min-h-screen w-full px-4 py-10" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center gap-2">
          <Sprout className="h-6 w-6" style={{ color: 'var(--forest-600)' }} />
          <span className="font-[var(--font-display)] text-xl" style={{ color: 'var(--forest-900)' }}>
            YieldAI
          </span>
        </header>

        {hasFarms && activeFarm ? (
          <FarmGate
            activeFarm={activeFarm}
            farmCount={farms.length}
            onContinue={() => router.push('/dashboard')}
            onEdit={() => setModal('edit')}
            onAddNew={() => setModal('add')}
          />
        ) : (
          <NoFarmGate onDone={() => router.push('/dashboard')} />
        )}
      </div>

      {modal === 'add' && <AddFarmModal onClose={() => setModal(null)} />}
      {modal === 'edit' && activeFarm && (
        <AddFarmModal farm={activeFarm} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[18px] border p-6"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--line)',
        boxShadow: '0 1px 2px rgba(20,49,42,0.04), 0 16px 40px -20px rgba(20,49,42,0.22)',
      }}
    >
      {children}
    </div>
  );
}

function FarmGate({
  activeFarm,
  farmCount,
  onContinue,
  onEdit,
  onAddNew,
}: {
  activeFarm: FarmProfile;
  farmCount: number;
  onContinue: () => void;
  onEdit: () => void;
  onAddNew: () => void;
}) {
  return (
    <GateCard>
      <h1 className="font-[var(--font-display)] text-[24px]" style={{ color: 'var(--forest-900)' }}>
        Welcome back
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
        {farmCount > 1
          ? `You have ${farmCount} farms. Continue with your active one, or pick another below.`
          : 'Continue with your farm, or update its details.'}
      </p>

      <div
        className="mt-4 flex items-start gap-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--line)', background: 'var(--sage-100)' }}
      >
        <Tractor className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--forest-600)' }} />
        <div className="min-w-0">
          <div className="font-medium" style={{ color: 'var(--forest-900)' }}>
            {activeFarm.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <MapPin size={13} /> {activeFarm.district}, {activeFarm.state}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {activeFarm.sizeAcres} acres · {activeFarm.soilType}
            {activeFarm.crops.length > 0 ? ` · ${activeFarm.crops.join(', ')}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--forest-700)' }}
        >
          Continue with this farm <ArrowRight size={16} />
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--line)', color: 'var(--forest-900)', background: 'var(--surface)' }}
          >
            <Pencil size={15} /> Change details
          </button>
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--line)', color: 'var(--forest-900)', background: 'var(--surface)' }}
          >
            <Plus size={15} /> Add a new farm
          </button>
        </div>
      </div>
    </GateCard>
  );
}

type LocateStatus = 'idle' | 'locating' | 'denied' | 'unsupported';

function NoFarmGate({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<LocateStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Manual picker state (shown after a denial or "enter it manually").
  const [showManual, setShowManual] = useState(false);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [selState, setSelState] = useState('');
  const [selDistrict, setSelDistrict] = useState('');

  useEffect(() => {
    if (!showManual || locations !== null) return;
    const controller = new AbortController();
    getLocations({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLocations(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLocationsError(err instanceof Error ? err.message : 'Could not load locations.');
      });
    return () => controller.abort();
  }, [showManual, locations]);

  const states = useMemo(
    () => Array.from(new Set((locations ?? []).map((l) => l.state))).sort(),
    [locations]
  );
  const districts = useMemo(
    () =>
      (locations ?? [])
        .filter((l) => l.state === selState)
        .map((l) => l.district)
        .sort(),
    [locations, selState]
  );

  async function handleUseMyLocation() {
    setStatus('locating');
    setError(null);
    try {
      const coords = await requestBrowserGeolocation();
      const result = await reverseGeocode(coords.latitude, coords.longitude);
      if (result.matchedState && result.matchedDistrict) {
        setCurrentLocation({
          state: result.matchedState,
          district: result.matchedDistrict,
          source: 'geolocation',
        });
        onDone();
        return;
      }
      // We got a position but couldn't match it to a supported location —
      // don't guess; fall back to the manual picker.
      setStatus('unsupported');
      setError(
        result.state
          ? `We found you near ${result.district ?? result.state}, but that isn't in our forecast dataset yet. Pick a supported location below.`
          : "We couldn't match your position to a supported location. Pick one below."
      );
      setShowManual(true);
    } catch (err) {
      setStatus('denied');
      setError(err instanceof Error ? err.message : 'Location access failed.');
      setShowManual(true);
    }
  }

  function handleManualContinue() {
    if (!selState || !selDistrict) return;
    setCurrentLocation({ state: selState, district: selDistrict, source: 'manual' });
    onDone();
  }

  return (
    <GateCard>
      <h1 className="font-[var(--font-display)] text-[24px]" style={{ color: 'var(--forest-900)' }}>
        Where are you farming?
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
        You don&apos;t have a farm set up yet. Choose a location so we can show relevant prices and
        recommendations — we never guess it for you.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={status === 'locating'}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: 'var(--forest-700)' }}
        >
          {status === 'locating' ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
          {status === 'locating' ? 'Getting your location…' : 'Use my location'}
        </button>
        {!showManual && (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--line)', color: 'var(--forest-900)', background: 'var(--surface)' }}
          >
            Enter it manually
          </button>
        )}
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--clay-500)33', background: 'var(--clay-100)', color: 'var(--clay-500)' }}
        >
          {error}
        </p>
      )}

      {showManual && (
        <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-3 text-sm font-medium" style={{ color: 'var(--forest-900)' }}>
            Pick your location
          </p>
          {locationsError && (
            <p className="mb-2 text-xs" style={{ color: 'var(--clay-500)' }}>
              {locationsError}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              label="State"
              value={selState}
              onChange={(v) => {
                setSelState(v);
                setSelDistrict('');
              }}
              options={states.map((s) => ({ value: s, label: s }))}
              placeholder={locations ? 'Select a state' : 'Loading…'}
              disabled={!locations}
            />
            <Select
              label="District"
              value={selDistrict}
              onChange={setSelDistrict}
              options={districts.map((d) => ({ value: d, label: d }))}
              placeholder={locations ? 'Select a district' : 'Loading…'}
              disabled={!locations || districts.length === 0}
            />
          </div>
          <button
            type="button"
            onClick={handleManualContinue}
            disabled={!selState || !selDistrict}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--forest-700)' }}
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      )}
    </GateCard>
  );
}

export default function StartPage() {
  return (
    <ProtectedRoute>
      <StartGate />
    </ProtectedRoute>
  );
}

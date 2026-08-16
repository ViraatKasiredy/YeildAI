'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, X, MapPin, Loader2, CheckCircle2, XCircle, Sprout, Droplets } from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthContext';
import { getLocations, reverseGeocode } from '@/lib/dataService';
import { findSupportedMatch } from '@/lib/location';
import { estimateSoilAndIrrigation } from '@/lib/soilLookup';
import type { FarmProfile } from '@/lib/auth/types';
import type { Location, LocationMatchStatus, ReverseGeocodeResult, SelectedCoordinates } from '@/lib/types';

const LocationMap = dynamic(() => import('@/components/map/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-sm text-stone-500">
      Loading map…
    </div>
  ),
});

const INDIA_CENTER: [number, number] = [22.9734, 78.6569];
const INDIA_ZOOM = 5;

type FieldName = 'name' | 'sizeAcres' | 'pincode';

/** Required-field validation for the plain text fields. Location is
 * validated separately (see `locationError` below) since it isn't a text
 * input — it's only satisfied once a pin has been resolved on the map. */
function validateField(
  field: FieldName,
  values: { name: string; sizeAcres: string; pincode: string }
): string | null {
  switch (field) {
    case 'name':
      return values.name.trim() ? null : 'Farm name is required';
    case 'sizeAcres': {
      if (!values.sizeAcres.trim()) return 'Size is required';
      const n = Number(values.sizeAcres);
      return n > 0 ? null : 'Enter a size greater than 0';
    }
    case 'pincode':
      return values.pincode.trim().length >= 3 ? null : 'Pincode/ZIP is required';
    default:
      return null;
  }
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-stone-600">
      {children}
      {required ? (
        <span className="text-red-500" aria-hidden="true">*</span>
      ) : (
        <span className="font-normal text-stone-400">(optional)</span>
      )}
    </label>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-stone-200 focus:border-emerald-400'
  }`;

/**
 * Builds a synthetic ReverseGeocodeResult from an existing farm so that, in
 * edit mode, the location is pre-resolved and the user isn't forced to re-pick
 * it on the map just to change (say) the farm's size.
 */
function seedGeocodeFromFarm(farm: FarmProfile): ReverseGeocodeResult {
  return {
    latitude: farm.latitude ?? 0,
    longitude: farm.longitude ?? 0,
    displayName: farm.address ?? farm.location ?? null,
    state: farm.state,
    district: farm.district,
    country: 'India',
    source: 'nominatim',
    matchedState: farm.state,
    matchedDistrict: farm.district,
    isSupportedLocation: true,
  };
}

/**
 * Add-or-edit farm modal. Passing a `farm` switches it to edit mode: fields
 * are pre-filled, the location is pre-resolved from the farm, and submitting
 * calls editFarm instead of addFarm.
 */
export function AddFarmModal({ onClose, farm = null }: { onClose: () => void; farm?: FarmProfile | null }) {
  const { addFarm, editFarm } = useAuth();
  const isEdit = farm !== null;

  const [name, setName] = useState(() => farm?.name ?? '');
  const [address, setAddress] = useState(() => farm?.address ?? '');
  const [pincode, setPincode] = useState(() => farm?.pincode ?? '');
  const [sizeAcres, setSizeAcres] = useState(() => (farm ? String(farm.sizeAcres) : ''));
  const [crops, setCrops] = useState(() => (farm ? farm.crops.join(', ') : ''));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Required-field UX: per-field validation + touched tracking ---------
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const fieldErrors = useMemo(() => {
    const fieldValues = { name, sizeAcres, pincode };
    return {
      name: validateField('name', fieldValues),
      sizeAcres: validateField('sizeAcres', fieldValues),
      pincode: validateField('pincode', fieldValues),
    };
  }, [name, sizeAcres, pincode]);

  function markTouched(field: FieldName) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }
  function shownError(field: FieldName): string | null {
    return touched[field] || submitAttempted ? fieldErrors[field] : null;
  }

  // --- Map-based location picking (required) -------------------------------
  // In edit mode the location is seeded from the existing farm so it counts as
  // already-resolved; the user can still drop a new pin to move it.
  const [pin, setPin] = useState<SelectedCoordinates | null>(() =>
    farm && farm.latitude != null && farm.longitude != null
      ? { latitude: farm.latitude, longitude: farm.longitude }
      : null
  );
  const [geocodeStatus, setGeocodeStatus] = useState<LocationMatchStatus>(() =>
    farm && farm.state ? 'success' : 'idle'
  );
  const [geocodeResult, setGeocodeResult] = useState<ReverseGeocodeResult | null>(() =>
    farm && farm.state ? seedGeocodeFromFarm(farm) : null
  );
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // A location only "counts" once it has been resolved to a state/district
  // via the map — dropping a pin alone isn't enough, and there's no manual
  // state/district entry anymore, so this is the sole source of location.
  const locationResolved =
    (geocodeStatus === 'success' || geocodeStatus === 'partial' || geocodeStatus === 'unsupported') &&
    !!geocodeResult?.state;
  const resolvedState = geocodeResult?.state ?? null;
  const resolvedDistrict = geocodeResult?.district ?? null;

  const soilAndIrrigation = resolvedState ? estimateSoilAndIrrigation(resolvedState, resolvedDistrict ?? undefined) : null;

  // In edit mode, if the location wasn't changed, keep the farm's stored soil
  // and irrigation (which may have been refined) rather than overwriting them
  // with a fresh regional estimate.
  const locationUnchanged = isEdit && !!farm && resolvedState === farm.state && resolvedDistrict === farm.district;
  const displaySoil = locationUnchanged && farm
    ? { soilType: farm.soilType, irrigation: farm.irrigation }
    : soilAndIrrigation;

  const locationError =
    (submitAttempted && !locationResolved)
      ? 'Pick your farm\u2019s location on the map and confirm it'
      : null;

  function handleSelectPin(coords: SelectedCoordinates) {
    setPin(coords);
    setGeocodeStatus('idle');
    setGeocodeResult(null);
    setGeocodeError(null);
  }

  async function handleUseThisLocation() {
    if (!pin) return;
    setGeocodeStatus('loading');
    setGeocodeError(null);
    try {
      const result = await reverseGeocode(pin.latitude, pin.longitude);
      setGeocodeResult(result);
      setGeocodeStatus(result.isSupportedLocation ? 'success' : result.matchedState ? 'partial' : 'unsupported');
      if (result.displayName) setAddress(result.displayName);
    } catch (err) {
      setGeocodeStatus('error');
      setGeocodeError(err instanceof Error ? err.message : 'The location lookup failed.');
    }
  }

  // --- Soft forecast-coverage hint ------------------------------------------
  const [supportedLocations, setSupportedLocations] = useState<Location[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getLocations({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSupportedLocations(data);
      })
      .catch(() => {
        // Coverage hint is best-effort; a failed lookup just means no
        // warning is shown, not a blocked form.
      });
    return () => controller.abort();
  }, []);

  const showCoverageWarning =
    supportedLocations !== null &&
    !!resolvedState &&
    !!resolvedDistrict &&
    !findSupportedMatch(supportedLocations, resolvedState, resolvedDistrict);

  const isFormValid = Object.values(fieldErrors).every((e) => e === null) && locationResolved;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);

    if (!isFormValid || !resolvedState || !resolvedDistrict || !displaySoil) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        location: `${resolvedDistrict}, ${resolvedState}`,
        address: address.trim() || undefined,
        pincode: pincode.trim(),
        latitude: pin?.latitude,
        longitude: pin?.longitude,
        state: resolvedState,
        district: resolvedDistrict,
        sizeAcres: Number(sizeAcres),
        soilType: displaySoil.soilType,
        irrigation: displaySoil.irrigation,
        crops: crops
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      };
      if (isEdit && farm) {
        await editFarm(farm.id, payload);
      } else {
        await addFarm(payload);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEdit
            ? 'Could not save changes. Please try again.'
            : 'Could not create farm. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div>
            <h3 className="font-[var(--font-display)] text-lg text-[var(--forest-900)]">
              {isEdit ? 'Edit farm details' : 'Add a farm'}
            </h3>
            <p className="mt-0.5 text-xs text-stone-400">
              <span className="text-red-500">*</span> indicates a required field
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-stone-400 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* --- Farm name -------------------------------------------- */}
            <div>
              <FieldLabel required>Farm name</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => markTouched('name')}
                placeholder="Green Acres"
                className={inputClass(!!shownError('name'))}
                aria-invalid={!!shownError('name')}
              />
              <FieldError message={shownError('name')} />
            </div>

            {/* --- Location (required, map-only) ------------------------- */}
            <div className={`rounded-xl border p-3 ${locationError ? 'border-red-300 bg-red-50/40' : 'border-stone-100 bg-stone-50/60'}`}>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel required>Location — pick on map</FieldLabel>
                {locationResolved && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Location set
                  </span>
                )}
              </div>
              <p className="mb-2 text-xs text-stone-500">
                Click anywhere on the map to drop a pin, then confirm it. Soil type and irrigation below are
                filled in automatically from this location.
              </p>

              <LocationMap center={INDIA_CENTER} zoom={INDIA_ZOOM} selected={pin} onSelect={handleSelectPin} />

              {pin && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-mono text-xs text-stone-600">
                    {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                  </span>
                  <button
                    type="button"
                    onClick={handleUseThisLocation}
                    disabled={geocodeStatus === 'loading'}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--forest-600)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {geocodeStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                    {geocodeStatus === 'loading' ? 'Looking up…' : locationResolved ? 'Confirm this location' : 'Use this location'}
                  </button>
                </div>
              )}

              <FieldError message={locationError} />

              {geocodeStatus === 'success' && geocodeResult && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Matched to {resolvedDistrict}, {resolvedState}.</span>
                </div>
              )}
              {geocodeStatus === 'partial' && geocodeResult && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Matched state {resolvedState}, but not an exact district ({resolvedDistrict}). Move the pin for a closer match if needed.</span>
                </div>
              )}
              {geocodeStatus === 'unsupported' && geocodeResult && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Location set to {resolvedDistrict}, {resolvedState}, but it isn&apos;t in the forecast dataset yet.</span>
                </div>
              )}
              {geocodeStatus === 'error' && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{geocodeError ?? 'The location lookup failed.'} Try moving the pin slightly and confirming again.</span>
                </div>
              )}

              {showCoverageWarning && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No forecast data is available for this location yet. You can still add the farm — Mandi
                    Prices and Recommendations will show no data until this location is added to the dataset.
                  </span>
                </div>
              )}

              <div className="mt-3">
                <FieldLabel>Address</FieldLabel>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Village / street, landmark"
                  className={inputClass(false)}
                />
              </div>
            </div>

            {/* --- Size ---------------------------------------------------- */}
            <div>
              <FieldLabel required>Size (acres)</FieldLabel>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={sizeAcres}
                onChange={(e) => setSizeAcres(e.target.value)}
                onBlur={() => markTouched('sizeAcres')}
                placeholder="50"
                className={inputClass(!!shownError('sizeAcres'))}
                aria-invalid={!!shownError('sizeAcres')}
              />
              <FieldError message={shownError('sizeAcres')} />
            </div>

            {/* --- Pincode/ZIP ------------------------------------------------ */}
            <div>
              <FieldLabel required>Pincode / ZIP</FieldLabel>
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                onBlur={() => markTouched('pincode')}
                placeholder="422001"
                className={inputClass(!!shownError('pincode'))}
                aria-invalid={!!shownError('pincode')}
              />
              <FieldError message={shownError('pincode')} />
            </div>

            {/* --- Growing conditions: extracted from location, not asked --- */}
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                Growing conditions
              </span>

              {!locationResolved ? (
                <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-400">
                  Soil type and irrigation will be determined automatically once you set a location above.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                    <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <div className="text-xs font-medium text-stone-800">
                        Soil type: {displaySoil?.soilType}
                      </div>
                      <div className="text-[11px] text-stone-400">Extracted from {resolvedDistrict}, {resolvedState}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                    <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div>
                      <div className="text-xs font-medium text-stone-800">
                        Suggested irrigation: {displaySoil?.irrigation}
                      </div>
                      <div className="text-[11px] text-stone-400">Best-suited estimate for this region</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    These are regional estimates, not a measured soil test — they can be refined later from the
                    farm&apos;s Soil Analysis page.
                  </p>
                </div>
              )}
            </div>

            <div>
              <FieldLabel>Crops</FieldLabel>
              <input
                value={crops}
                onChange={(e) => setCrops(e.target.value)}
                placeholder="Wheat, Rice, Soybean (comma-separated)"
                className={inputClass(false)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-60"
          >
            {submitting ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save changes' : 'Add farm'}
          </button>
        </form>
      </div>
    </div>
  );
}
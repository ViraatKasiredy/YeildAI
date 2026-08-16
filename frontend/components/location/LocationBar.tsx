'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MapPin, Tractor } from 'lucide-react';

import { Select } from '@/components/ui/Select';
import { LocationPicker } from '@/components/map/LocationPicker';
import type { EffectiveLocation, FarmLocationStatus, Location, ReverseGeocodeResult } from '@/lib/types';

const sourceLabels: Record<EffectiveLocation['source'], string> = {
    farm: 'Farm location',
    map: 'Map pin',
    manual: 'Manual selection',
    current: 'Current location',
    default: 'Default location',
    none: 'No location chosen',
};

/**
 * Shared location control for Recommendations / Mandi Prices: shows the
 * current effective location + how it was determined, and — via the map
 * picker or state/district dropdowns — lets the user override it. Auto-opens
 * the picker the first time the effective location turns out to have no
 * forecast coverage, so an invalid farm location doesn't leave the page
 * silently stuck on empty data.
 */
export function LocationBar({
    effectiveLocation,
    farmLocationStatus,
    locations,
    locationsError,
    hasOverride,
    hasFarm,
    onManualSelect,
    onMapLocationResolved,
    onResetToFarm,
}: {
    effectiveLocation: EffectiveLocation;
    farmLocationStatus: FarmLocationStatus;
    locations: Location[] | null;
    locationsError: string | null;
    hasOverride: boolean;
    hasFarm: boolean;
    onManualSelect: (state: string, district: string) => void;
    onMapLocationResolved: (result: ReverseGeocodeResult) => void;
    onResetToFarm: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const autoExpandedRef = useRef(false);

    useEffect(() => {
        if (effectiveLocation.isSupported === false && !autoExpandedRef.current) {
            autoExpandedRef.current = true;
            setExpanded(true);
        }
    }, [effectiveLocation.isSupported]);

    const states = useMemo(() => Array.from(new Set((locations ?? []).map((l) => l.state))).sort(), [locations]);

    // handleStateChange calls onManualSelect synchronously, so
    // effectiveLocation.state already reflects the pick by the next render —
    // no need for separate local state kept in sync via an effect.
    const districtsForState = useMemo(
        () =>
            (locations ?? [])
                .filter((l) => l.state === effectiveLocation.state)
                .map((l) => l.district)
                .sort(),
        [locations, effectiveLocation.state]
    );

    function handleStateChange(newState: string) {
        const firstDistrict = (locations ?? []).find((l) => l.state === newState)?.district;
        if (firstDistrict) onManualSelect(newState, firstDistrict);
    }

    function handleDistrictChange(newDistrict: string) {
        if (!newDistrict) return;
        onManualSelect(effectiveLocation.state, newDistrict);
    }

    const unsupported = effectiveLocation.isSupported === false;
    const badgeTone = unsupported
        ? { color: 'var(--clay-500)', bg: 'var(--clay-100)' }
        : effectiveLocation.isSupported === null
          ? { color: 'var(--ink-soft)', bg: 'var(--sage-100)' }
          : { color: 'var(--forest-600)', bg: 'var(--sage-100)' };

    return (
        <div className="mb-4 rounded-xl border border-stone-200 bg-white/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
                    <MapPin size={15} className="text-stone-400" />
                    <span className="font-medium">
                        {effectiveLocation.source === 'none'
                            ? 'No location chosen'
                            : `${effectiveLocation.district}, ${effectiveLocation.state}`}
                    </span>
                    <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: badgeTone.color, background: badgeTone.bg, borderColor: `${badgeTone.color}33` }}
                    >
                        {sourceLabels[effectiveLocation.source]}
                    </span>
                    {unsupported && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--clay-500)]">
                            <AlertTriangle size={12} /> No forecast coverage
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {hasOverride && hasFarm && (
                        <button
                            type="button"
                            onClick={onResetToFarm}
                            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
                        >
                            <Tractor size={12} /> Use farm location
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        aria-controls="location-bar-panel"
                        className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                    >
                        {expanded ? 'Hide location picker' : 'Change location'}
                    </button>
                </div>
            </div>

            {farmLocationStatus === 'unsupported' && effectiveLocation.source === 'farm' && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--clay-500)]">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    This farm&apos;s location isn&apos;t in the forecast dataset yet. Pick a supported location below to see
                    data.
                </p>
            )}
            {farmLocationStatus === 'no-farm' && effectiveLocation.source === 'default' && (
                <p className="mt-2 text-xs text-stone-500">
                    No farm selected — showing the default location. Add a farm or pick one below.
                </p>
            )}
            {effectiveLocation.source === 'none' && (
                <p className="mt-2 text-xs text-stone-500">
                    No location chosen yet. Pick a state and district below to see data — nothing is assumed for you.
                </p>
            )}

            {expanded && (
                <div id="location-bar-panel" className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                    {locationsError && <p className="text-xs text-red-600">{locationsError}</p>}
                    <div className="flex flex-wrap gap-3">
                        <Select
                            label="State"
                            value={effectiveLocation.state}
                            onChange={handleStateChange}
                            options={states.map((s) => ({ value: s, label: s }))}
                            placeholder={locations ? 'Select a state' : 'Loading…'}
                            disabled={!locations}
                        />
                        <Select
                            label="District"
                            value={effectiveLocation.district}
                            onChange={handleDistrictChange}
                            options={districtsForState.map((d) => ({ value: d, label: d }))}
                            placeholder={locations ? 'Select a district' : 'Loading…'}
                            disabled={!locations || districtsForState.length === 0}
                        />
                    </div>

                    <LocationPicker onLocationResolved={onMapLocationResolved} />
                </div>
            )}
        </div>
    );
}

/**
 * Pure, framework-free logic for resolving the "effective location" used by
 * Recommendations and Mandi Prices. Kept separate from the
 * useEffectiveLocation hook so this can be unit tested without React/DOM.
 */

import { DEFAULT_LOCATION } from './mockData';
import type { EffectiveLocation, FarmLocationStatus, Location, LocationSource } from './types';

export interface LocationOverride {
    state: string;
    district: string;
    source: Extract<LocationSource, 'map' | 'manual'>;
}

export interface FarmLocationLike {
    state: string;
    district: string;
}

/** A session-chosen "current location" (see lib/currentLocation.ts), tier 3. */
export interface CurrentLocationLike {
    state: string;
    district: string;
}

function normalizePart(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
}

function hasLocation(value: FarmLocationLike | null | undefined): value is FarmLocationLike {
    return !!value && normalizePart(value.state).length > 0 && normalizePart(value.district).length > 0;
}

/** Case/whitespace-insensitive lookup of an exact (state, district) match in the supported locations list. */
export function findSupportedMatch(
    locations: Location[],
    state: string | null | undefined,
    district: string | null | undefined
): Location | null {
    if (!state || !district) return null;
    const targetState = normalizePart(state);
    const targetDistrict = normalizePart(district);
    return (
        locations.find((l) => normalizePart(l.state) === targetState && normalizePart(l.district) === targetDistrict) ??
        null
    );
}

/**
 * Status of the active farm's own location, independent of any override.
 * `locations: null` means the supported-locations list hasn't loaded yet, so
 * support can't be determined — this must resolve to 'unknown', never a
 * false 'supported' or 'unsupported'.
 */
export function resolveFarmLocationStatus(
    farm: FarmLocationLike | null,
    locations: Location[] | null
): FarmLocationStatus {
    if (!farm) return 'no-farm';
    if (!hasLocation(farm)) return 'missing';
    if (!locations) return 'unknown';
    return findSupportedMatch(locations, farm.state, farm.district) ? 'supported' : 'unsupported';
}

/**
 * Resolves the location that Recommendations/Mandi Prices should actually
 * fetch data for.
 *
 * Precedence: override → farm → current (session-chosen) → default → none.
 * The hardcoded default is *opt-in only* (`allowDefault`, off by default): the
 * app must never silently invent a location, so when there's no override, no
 * farm, no session-chosen current location, and default isn't explicitly
 * allowed, the result is a 'none' source with empty state/district meaning
 * "no location chosen; ask the user."
 *
 * The returned state/district always echo back what was picked/typed even when
 * unsupported (isSupported: false) — callers show an honest empty state rather
 * than the resolver silently substituting a different location.
 */
export function resolveEffectiveLocation(params: {
    farm: FarmLocationLike | null;
    override: LocationOverride | null;
    current?: CurrentLocationLike | null;
    locations: Location[] | null;
    /** Opt in to the hardcoded DEFAULT_LOCATION fallback. Off by default. */
    allowDefault?: boolean;
}): EffectiveLocation {
    const { farm, override, current = null, locations, allowDefault = false } = params;

    if (override) {
        const matched = findSupportedMatch(locations ?? [], override.state, override.district);
        return {
            state: matched?.state ?? override.state,
            district: matched?.district ?? override.district,
            source: override.source,
            isSupported: locations ? matched !== null : null,
        };
    }

    if (hasLocation(farm)) {
        const matched = findSupportedMatch(locations ?? [], farm.state, farm.district);
        return {
            state: matched?.state ?? farm.state,
            district: matched?.district ?? farm.district,
            source: 'farm',
            isSupported: locations ? matched !== null : null,
        };
    }

    if (hasLocation(current)) {
        const matched = findSupportedMatch(locations ?? [], current.state, current.district);
        return {
            state: matched?.state ?? current.state,
            district: matched?.district ?? current.district,
            source: 'current',
            isSupported: locations ? matched !== null : null,
        };
    }

    if (allowDefault) {
        const matched = findSupportedMatch(locations ?? [], DEFAULT_LOCATION.state, DEFAULT_LOCATION.district);
        return {
            state: DEFAULT_LOCATION.state,
            district: DEFAULT_LOCATION.district,
            source: 'default',
            isSupported: locations ? matched !== null : null,
        };
    }

    return { state: '', district: '', source: 'none', isSupported: null };
}

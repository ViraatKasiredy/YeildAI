'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { getLocations } from './dataService';
import {
    getCurrentLocation,
    getServerSnapshot,
    subscribeCurrentLocation,
} from './currentLocation';
import { resolveEffectiveLocation, resolveFarmLocationStatus, type LocationOverride } from './location';
import type { Location } from './types';
import type { FarmProfile } from './auth/types';

export interface UseEffectiveLocationOptions {
    /**
     * Opt in to the hardcoded DEFAULT_LOCATION fallback. Off by default — the
     * app never invents a location, so with no farm and no session-chosen
     * current location the effective source resolves to 'none'.
     */
    allowDefault?: boolean;
}

/**
 * Combines the active farm's location with an optional user override (map pin
 * or manual dropdown pick) and the session-scoped "current location" store
 * into the single EffectiveLocation that Recommendations/Mandi Prices fetch
 * data for. Precedence: override → farm → current → none (default is opt-in).
 *
 * The override resets whenever the active farm changes, so switching farms
 * doesn't leave a stale "custom location" pointed at the previous farm's
 * region. The current-location store is read via useSyncExternalStore, so
 * pages re-render the moment it's set or cleared elsewhere.
 */
export function useEffectiveLocation(farm: FarmProfile | null, options: UseEffectiveLocationOptions = {}) {
    const { allowDefault = false } = options;
    const [locations, setLocations] = useState<Location[] | null>(null);
    const [locationsError, setLocationsError] = useState<string | null>(null);
    const [override, setOverride] = useState<LocationOverride | null>(null);

    const currentLocation = useSyncExternalStore(
        subscribeCurrentLocation,
        getCurrentLocation,
        getServerSnapshot
    );

    useEffect(() => {
        const controller = new AbortController();
        getLocations({ signal: controller.signal })
            .then((data) => {
                if (controller.signal.aborted) return;
                setLocations(data);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                setLocationsError(err instanceof Error ? err.message : 'Failed to load supported locations.');
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        // Dropping any map/manual override on farm switch is intentional: an
        // override picked for the previous farm's region should never silently
        // carry over and shadow the newly active farm's own location.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverride(null);
    }, [farm?.id]);

    const setManualLocation = useCallback((state: string, district: string) => {
        setOverride({ state, district, source: 'manual' });
    }, []);

    const setMapLocation = useCallback((state: string, district: string) => {
        setOverride({ state, district, source: 'map' });
    }, []);

    const resetToFarm = useCallback(() => setOverride(null), []);

    const farmLocationStatus = resolveFarmLocationStatus(farm, locations);
    const effectiveLocation = resolveEffectiveLocation({
        farm,
        override,
        current: currentLocation,
        locations,
        allowDefault,
    });

    return {
        effectiveLocation,
        farmLocationStatus,
        locations,
        locationsError,
        hasOverride: override !== null,
        setManualLocation,
        setMapLocation,
        resetToFarm,
    };
}

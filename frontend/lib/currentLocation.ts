'use client';

/**
 * Session-scoped "current location" store.
 *
 * This holds a location the *user explicitly chose* for this browsing session
 * — either resolved from the browser's geolocation or picked manually — when
 * they have no farm to anchor to. It is deliberately backed by
 * `sessionStorage`, not `localStorage`: the choice survives navigation and
 * reloads within the session, but a brand-new session starts with no location
 * so the app never silently reuses a stale, possibly-wrong place.
 *
 * It sits at tier 3 of the effective-location precedence
 * (override → farm → current → none); see resolveEffectiveLocation in
 * lib/location.ts. The store never invents a location: if nothing was chosen,
 * getCurrentLocation() returns null and callers fall through to the 'none'
 * state.
 */

export type CurrentLocationSource = 'geolocation' | 'manual';

export interface CurrentLocation {
    state: string;
    district: string;
    source: CurrentLocationSource;
}

const STORAGE_KEY = 'yieldai_current_location';

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Cached snapshot so getCurrentLocation() returns a stable reference between
 * changes. useSyncExternalStore requires this — returning a freshly-parsed
 * object each call would loop forever. The cache is (re)hydrated from
 * sessionStorage lazily on first read and kept in sync on every set/clear.
 */
let cache: CurrentLocation | null = null;
let hydrated = false;

function isBrowser(): boolean {
    return typeof window !== 'undefined';
}

function parse(raw: string | null): CurrentLocation | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<CurrentLocation>;
        if (
            typeof parsed.state === 'string' &&
            parsed.state.trim().length > 0 &&
            typeof parsed.district === 'string' &&
            parsed.district.trim().length > 0 &&
            (parsed.source === 'geolocation' || parsed.source === 'manual')
        ) {
            return { state: parsed.state, district: parsed.district, source: parsed.source };
        }
    } catch {
        // Corrupt/legacy value — treat as "no current location".
    }
    return null;
}

/** Reads the current session-chosen location, or null if none was chosen. */
export function getCurrentLocation(): CurrentLocation | null {
    if (!isBrowser()) return null;
    if (!hydrated) {
        cache = parse(window.sessionStorage.getItem(STORAGE_KEY));
        hydrated = true;
    }
    return cache;
}

/** SSR snapshot: there is never a chosen location on the server. */
export function getServerSnapshot(): CurrentLocation | null {
    return null;
}

/** Persists a user-chosen location for this session and notifies subscribers. */
export function setCurrentLocation(location: CurrentLocation): void {
    if (!isBrowser()) return;
    cache = { state: location.state, district: location.district, source: location.source };
    hydrated = true;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    notify();
}

/** Clears any session-chosen location and notifies subscribers. */
export function clearCurrentLocation(): void {
    if (!isBrowser()) return;
    cache = null;
    hydrated = true;
    window.sessionStorage.removeItem(STORAGE_KEY);
    notify();
}

/**
 * Subscribe to changes. Returns an unsubscribe function. Wired into
 * useEffectiveLocation via useSyncExternalStore so every page re-reads the
 * moment the current location is set or cleared.
 */
export function subscribeCurrentLocation(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notify(): void {
    listeners.forEach((l) => l());
}

export interface GeolocationCoords {
    latitude: number;
    longitude: number;
}

/**
 * Promise wrapper around the browser Geolocation API that rejects with a
 * clean, user-facing Error on denial, unavailability, or timeout — so callers
 * can fall back to the manual picker without inspecting raw PositionError
 * codes. Never resolves to a fabricated position.
 */
export function requestBrowserGeolocation(options?: PositionOptions): Promise<GeolocationCoords> {
    return new Promise((resolve, reject) => {
        if (!isBrowser() || !('geolocation' in navigator)) {
            reject(new Error('Location services are not available in this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error('Location permission was denied.'));
                        break;
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error('Your location could not be determined.'));
                        break;
                    case error.TIMEOUT:
                        reject(new Error('Timed out while getting your location.'));
                        break;
                    default:
                        reject(new Error('Failed to get your location.'));
                }
            },
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000, ...options }
        );
    });
}

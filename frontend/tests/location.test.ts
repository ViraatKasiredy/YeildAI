import { describe, expect, it } from 'vitest';
import { findSupportedMatch, resolveEffectiveLocation, resolveFarmLocationStatus } from '../lib/location';
import { DEFAULT_LOCATION } from '../lib/mockData';
import type { Location } from '../lib/types';

const SUPPORTED_LOCATIONS: Location[] = [
    { state: 'Uttar Pradesh', district: 'Barabanki' },
    { state: 'Maharashtra', district: 'Nashik' },
];

describe('findSupportedMatch', () => {
    it('finds an exact match', () => {
        const match = findSupportedMatch(SUPPORTED_LOCATIONS, 'Uttar Pradesh', 'Barabanki');
        expect(match).toEqual({ state: 'Uttar Pradesh', district: 'Barabanki' });
    });

    it('is case- and whitespace-insensitive', () => {
        const match = findSupportedMatch(SUPPORTED_LOCATIONS, '  uttar PRADESH', 'barabanki ');
        expect(match).toEqual({ state: 'Uttar Pradesh', district: 'Barabanki' });
    });

    it('returns null for an unsupported pair', () => {
        expect(findSupportedMatch(SUPPORTED_LOCATIONS, 'Madhya Pradesh', 'Test')).toBeNull();
    });

    it('returns null when either part is missing', () => {
        expect(findSupportedMatch(SUPPORTED_LOCATIONS, 'Maharashtra', undefined)).toBeNull();
        expect(findSupportedMatch(SUPPORTED_LOCATIONS, undefined, 'Nashik')).toBeNull();
    });
});

describe('resolveFarmLocationStatus', () => {
    it('is no-farm when there is no active farm', () => {
        expect(resolveFarmLocationStatus(null, SUPPORTED_LOCATIONS)).toBe('no-farm');
    });

    it('is missing when the farm has a blank state or district', () => {
        expect(resolveFarmLocationStatus({ state: '', district: 'Barabanki' }, SUPPORTED_LOCATIONS)).toBe('missing');
        expect(resolveFarmLocationStatus({ state: 'Uttar Pradesh', district: '  ' }, SUPPORTED_LOCATIONS)).toBe('missing');
    });

    it('is unknown while the supported-locations list has not loaded yet', () => {
        expect(resolveFarmLocationStatus({ state: 'Uttar Pradesh', district: 'Barabanki' }, null)).toBe('unknown');
    });

    it('is supported when the farm location exactly matches a supported location', () => {
        expect(resolveFarmLocationStatus({ state: 'Uttar Pradesh', district: 'Barabanki' }, SUPPORTED_LOCATIONS)).toBe(
            'supported'
        );
    });

    it('is unsupported when the farm location has no forecast coverage', () => {
        expect(resolveFarmLocationStatus({ state: 'Madhya Pradesh', district: 'Test' }, SUPPORTED_LOCATIONS)).toBe(
            'unsupported'
        );
    });
});

describe('resolveEffectiveLocation', () => {
    it("resolves to 'none' (never invents a location) when there is no farm, override, or current location", () => {
        const result = resolveEffectiveLocation({ farm: null, override: null, locations: SUPPORTED_LOCATIONS });
        expect(result).toEqual({ state: '', district: '', source: 'none', isSupported: null });
    });

    it('falls back to DEFAULT_LOCATION only when default is explicitly opted in', () => {
        const result = resolveEffectiveLocation({
            farm: null,
            override: null,
            locations: SUPPORTED_LOCATIONS,
            allowDefault: true,
        });
        expect(result).toEqual({
            state: DEFAULT_LOCATION.state,
            district: DEFAULT_LOCATION.district,
            source: 'default',
            isSupported: true,
        });
    });

    it('uses a session-chosen current location (tier 3) over the default', () => {
        const result = resolveEffectiveLocation({
            farm: null,
            override: null,
            current: { state: 'Maharashtra', district: 'Nashik' },
            locations: SUPPORTED_LOCATIONS,
            allowDefault: true,
        });
        expect(result).toEqual({ state: 'Maharashtra', district: 'Nashik', source: 'current', isSupported: true });
    });

    it('prefers the farm location over a session-chosen current location', () => {
        const result = resolveEffectiveLocation({
            farm: { state: 'Uttar Pradesh', district: 'Barabanki' },
            override: null,
            current: { state: 'Maharashtra', district: 'Nashik' },
            locations: SUPPORTED_LOCATIONS,
        });
        expect(result).toEqual({ state: 'Uttar Pradesh', district: 'Barabanki', source: 'farm', isSupported: true });
    });

    it('uses the farm location when present and no override is active', () => {
        const result = resolveEffectiveLocation({
            farm: { state: 'Maharashtra', district: 'Nashik' },
            override: null,
            locations: SUPPORTED_LOCATIONS,
        });
        expect(result).toEqual({ state: 'Maharashtra', district: 'Nashik', source: 'farm', isSupported: true });
    });

    it('reports isSupported: false for a farm location with no forecast coverage, without substituting another location', () => {
        const result = resolveEffectiveLocation({
            farm: { state: 'Madhya Pradesh', district: 'Test' },
            override: null,
            locations: SUPPORTED_LOCATIONS,
        });
        expect(result).toEqual({ state: 'Madhya Pradesh', district: 'Test', source: 'farm', isSupported: false });
    });

    it('lets an explicit override take precedence over the farm location', () => {
        const result = resolveEffectiveLocation({
            farm: { state: 'Uttar Pradesh', district: 'Barabanki' },
            override: { state: 'Maharashtra', district: 'Nashik', source: 'manual' },
            locations: SUPPORTED_LOCATIONS,
        });
        expect(result).toEqual({ state: 'Maharashtra', district: 'Nashik', source: 'manual', isSupported: true });
    });

    it('preserves the map source on an override resolved from the map picker', () => {
        const result = resolveEffectiveLocation({
            farm: null,
            override: { state: 'Maharashtra', district: 'Nashik', source: 'map' },
            locations: SUPPORTED_LOCATIONS,
        });
        expect(result.source).toBe('map');
    });

    it('reports isSupported: null while the supported-locations list has not loaded yet', () => {
        const result = resolveEffectiveLocation({
            farm: { state: 'Uttar Pradesh', district: 'Barabanki' },
            override: null,
            locations: null,
        });
        expect(result.isSupported).toBeNull();
        expect(result).toMatchObject({ state: 'Uttar Pradesh', district: 'Barabanki', source: 'farm' });
    });
});

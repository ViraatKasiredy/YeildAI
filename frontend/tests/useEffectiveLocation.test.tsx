// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { useEffectiveLocation } from '../lib/useEffectiveLocation';
import type { FarmProfile } from '../lib/auth/types';
import type { Location } from '../lib/types';

vi.mock('../lib/dataService', () => ({
    getLocations: vi.fn(),
}));

import { getLocations } from '../lib/dataService';

const SUPPORTED_LOCATIONS: Location[] = [
    { state: 'Uttar Pradesh', district: 'Barabanki' },
    { state: 'Maharashtra', district: 'Nashik' },
];

function makeFarm(overrides: Partial<FarmProfile> = {}): FarmProfile {
    return {
        id: 'farm-1',
        userId: 'user-1',
        name: 'Test Farm',
        location: 'Barabanki, Uttar Pradesh',
        state: 'Uttar Pradesh',
        district: 'Barabanki',
        sizeAcres: 10,
        soilType: 'Alluvial loam',
        crops: ['Wheat'],
        irrigation: 'Canal + tube well',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

beforeEach(() => {
    vi.mocked(getLocations).mockReset();
    vi.mocked(getLocations).mockResolvedValue(SUPPORTED_LOCATIONS);
});

afterEach(() => {
    cleanup();
});

describe('useEffectiveLocation', () => {
    it('uses a valid selected farm as the default effective location', async () => {
        const farm = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const { result } = renderHook(() => useEffectiveLocation(farm));

        await waitFor(() => expect(result.current.locations).not.toBeNull());

        expect(result.current.effectiveLocation).toEqual({
            state: 'Uttar Pradesh',
            district: 'Barabanki',
            source: 'farm',
            isSupported: true,
        });
        expect(result.current.hasOverride).toBe(false);
    });

    it('lets a manual override take precedence over the farm location', async () => {
        const farm = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const { result } = renderHook(() => useEffectiveLocation(farm));
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        act(() => result.current.setManualLocation('Maharashtra', 'Nashik'));

        expect(result.current.effectiveLocation).toEqual({
            state: 'Maharashtra',
            district: 'Nashik',
            source: 'manual',
            isSupported: true,
        });
        expect(result.current.hasOverride).toBe(true);
    });

    it('lets a map override take precedence over the farm location', async () => {
        const farm = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const { result } = renderHook(() => useEffectiveLocation(farm));
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        act(() => result.current.setMapLocation('Maharashtra', 'Nashik'));

        expect(result.current.effectiveLocation).toEqual({
            state: 'Maharashtra',
            district: 'Nashik',
            source: 'map',
            isSupported: true,
        });
        expect(result.current.hasOverride).toBe(true);
    });

    it('resetToFarm clears an active override and falls back to the farm location', async () => {
        const farm = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const { result } = renderHook(() => useEffectiveLocation(farm));
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        act(() => result.current.setManualLocation('Maharashtra', 'Nashik'));
        expect(result.current.hasOverride).toBe(true);

        act(() => result.current.resetToFarm());

        expect(result.current.hasOverride).toBe(false);
        expect(result.current.effectiveLocation).toEqual({
            state: 'Uttar Pradesh',
            district: 'Barabanki',
            source: 'farm',
            isSupported: true,
        });
    });

    it("clears the previous farm's override when farm.id changes", async () => {
        const farmA = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const farmB = makeFarm({ id: 'farm-b', state: 'Maharashtra', district: 'Nashik' });
        const { result, rerender } = renderHook(({ farm }) => useEffectiveLocation(farm), {
            initialProps: { farm: farmA as FarmProfile | null },
        });
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        act(() => result.current.setManualLocation('Maharashtra', 'Nashik'));
        expect(result.current.hasOverride).toBe(true);

        rerender({ farm: farmB });

        expect(result.current.hasOverride).toBe(false);
        expect(result.current.effectiveLocation).toEqual({
            state: 'Maharashtra',
            district: 'Nashik',
            source: 'farm',
            isSupported: true,
        });
    });

    it("resolves to 'none' for a blank farm location — never invents a default", async () => {
        // The hook defaults allowDefault to false, so a farm with no usable
        // location and no session-chosen current location must resolve to the
        // 'none' state (empty state/district) rather than the hardcoded
        // DEFAULT_LOCATION. This is the core "never invent a location" fix.
        const farm = makeFarm({ id: 'farm-a', state: '', district: '' });
        const { result } = renderHook(() => useEffectiveLocation(farm));
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        expect(result.current.farmLocationStatus).toBe('missing');
        expect(result.current.effectiveLocation).toEqual({
            state: '',
            district: '',
            source: 'none',
            isSupported: null,
        });
    });

    it('produces no valid effective location for an unsupported farm location', async () => {
        const farm = makeFarm({ id: 'farm-a', state: 'Madhya Pradesh', district: 'Nowhereville' });
        const { result } = renderHook(() => useEffectiveLocation(farm));
        await waitFor(() => expect(result.current.locations).not.toBeNull());

        expect(result.current.farmLocationStatus).toBe('unsupported');
        expect(result.current.effectiveLocation).toEqual({
            state: 'Madhya Pradesh',
            district: 'Nowhereville',
            source: 'farm',
            isSupported: false,
        });
    });

    it('selects the valid farm location when switching from an invalid farm to a valid one', async () => {
        const invalidFarm = makeFarm({ id: 'farm-invalid', state: 'Madhya Pradesh', district: 'Nowhereville' });
        const validFarm = makeFarm({ id: 'farm-valid', state: 'Uttar Pradesh', district: 'Barabanki' });
        const { result, rerender } = renderHook(({ farm }) => useEffectiveLocation(farm), {
            initialProps: { farm: invalidFarm as FarmProfile | null },
        });
        await waitFor(() => expect(result.current.locations).not.toBeNull());
        expect(result.current.effectiveLocation.isSupported).toBe(false);

        rerender({ farm: validFarm });

        expect(result.current.effectiveLocation).toEqual({
            state: 'Uttar Pradesh',
            district: 'Barabanki',
            source: 'farm',
            isSupported: true,
        });
    });

    it('does not retain stale location state when switching between two valid farms', async () => {
        const farmA = makeFarm({ id: 'farm-a', state: 'Uttar Pradesh', district: 'Barabanki' });
        const farmB = makeFarm({ id: 'farm-b', state: 'Maharashtra', district: 'Nashik' });
        const { result, rerender } = renderHook(({ farm }) => useEffectiveLocation(farm), {
            initialProps: { farm: farmA as FarmProfile | null },
        });
        await waitFor(() => expect(result.current.locations).not.toBeNull());
        expect(result.current.effectiveLocation).toMatchObject({ state: 'Uttar Pradesh', district: 'Barabanki' });

        rerender({ farm: farmB });

        expect(result.current.effectiveLocation).toEqual({
            state: 'Maharashtra',
            district: 'Nashik',
            source: 'farm',
            isSupported: true,
        });
        expect(result.current.hasOverride).toBe(false);
    });
});

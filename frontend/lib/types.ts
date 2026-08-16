/**
 * Shared domain types.
 *
 * These mirror the shapes returned by the YieldAI backend (see
 * backend/prisma/schema.prisma and backend/src/controllers/*) so that the
 * mock data layer (lib/mockData.ts) and the real API can be swapped
 * transparently behind lib/dataService.ts.
 */

export type PriceTrend = 'Rising' | 'Stable' | 'Falling';
export type ConfidenceBand = 'High' | 'Medium' | 'Low';

export interface Forecast {
    id: string;
    commodity: string;
    state: string;
    district: string;
    market: string;
    date: string; // ISO date string
    currentModalPrice: number;
    predictedPriceTrend: PriceTrend;
    confidence: number; // 0.0 - 1.0
    confidenceBand: ConfidenceBand;
    priceTrendScore: number; // -1.0 - 1.0
    probFalling: number;
    probRising: number;
    probStable: number;
}

export interface Location {
    state: string;
    district: string;
}

export interface MarketOption {
    commodity: string;
    state: string;
    district: string;
    market: string;
}

export interface Crop {
    id: string;
    name: string;
    category?: string | null;
    typicalYield?: number | null; // quintals per acre
    costOfCultivation?: number | null; // per acre
    growthDuration?: number | null; // days
    bestSeason?: string | null;
}

export type ReasoningDirection = 'positive' | 'risk' | 'informational';

export interface ReasoningFactor {
    factor: string;
    detail: string;
    direction: ReasoningDirection;
}

export interface RecommendationReasoning {
    summary: string;
    factors: ReasoningFactor[];
    limitations: string[];
}

export interface Recommendation {
    cropId: string;
    name: string;
    category?: string | null;
    score: number;
    expectedProfit: number;
    confidenceScore: number;
    predictedTrend: PriceTrend;
    currentPrice: number;
    bestSeason?: string | null;
    growthDuration?: number | null;
    // Additive fields for the "Full Reasoning" feature — optional so existing
    // consumers (including the mock data layer) remain valid without them.
    confidenceBand?: ConfidenceBand;
    probFalling?: number;
    probRising?: number;
    probStable?: number;
    predictedPrice?: number;
    reasoning?: RecommendationReasoning;
}

export interface MarketAnalysis {
    commodity: string;
    state: string;
    totalMarkets: number;
    risingMarkets: number;
    fallingMarkets: number;
    stableMarkets: number;
    avgPrice: number;
    marketSentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

export interface Broker {
    id: string;
    name: string;
    location: string;
    contact: string;
    commodities: string[];
    rating: number;
    verified: boolean;
}

export interface Report {
    id: string;
    title: string;
    type: string;
    createdAt: string;
    summary?: string;
}

export interface FarmProfile {
    id: string;
    name: string;
    location: string;
    state: string;
    district: string;
    sizeAcres: number;
    soilType: string;
    crops: string[];
    irrigation: string;
}

/**
 * One row per (state, district) that has at least one registered farm —
 * what the Admin persona's country-wide landing map is built from.
 * Mirrors AdminService.listRegions() on the backend.
 */
export interface AdminRegionSummary {
    state: string;
    district: string;
    farmCount: number;
    totalAcres: number;
    latitude: number | null;
    longitude: number | null;
    topCrops: string[];
}

/** A farm as seen by an Admin drilling into a district — includes the owning farmer's identity. */
export interface AdminFarmView {
    id: string;
    name: string;
    location: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    state: string;
    district: string;
    sizeAcres: number;
    soilType: string;
    crops: string[];
    irrigation: string;
    createdAt: string;
    user: { id: string; name: string; email: string };
}

export interface AdminDistrictDetail {
    state: string;
    district: string;
    farms: AdminFarmView[];
    recommendations: Recommendation[];
}

export interface SoilSample {
    parameter: string;
    value: number;
    unit: string;
    idealMin: number;
    idealMax: number;
    status: 'Low' | 'Optimal' | 'High';
}

export interface YieldPoint {
    season: string;
    actual: number | null;
    predicted: number | null;
}
        
/**
 * Map/reverse-geocoding types for the "choose on map" pin-selection flow on
 * the Recommendations page. Pin selection only — no area/polygon selection,
 * no farm persistence.
 */
export interface SelectedCoordinates {
    latitude: number;
    longitude: number;
}

export type GeocodeSource = 'nominatim';

/** Mirrors backend/src/services/geocode.service.ts's ReverseGeocodeResult. */
export interface ReverseGeocodeResult {
    latitude: number;
    longitude: number;
    displayName: string | null;
    state: string | null;
    district: string | null;
    country: string | null;
    source: GeocodeSource;
    matchedState: string | null;
    matchedDistrict: string | null;
    isSupportedLocation: boolean;
}

export type LocationMatchStatus = 'idle' | 'loading' | 'success' | 'partial' | 'unsupported' | 'error';

/**
 * The "effective location" model used by Recommendations and Mandi Prices to
 * decide which state/district to fetch data for.
 *
 * Precedence: an explicit override (map pin or manual dropdown pick) wins over
 * the active farm's location, which wins over a session-scoped 'current'
 * location the user explicitly chose (geolocation or manual pick), which wins
 * over the hardcoded 'default' — and the default is opt-in only. When nothing
 * resolves, the source is 'none' (empty state/district) meaning "no location
 * chosen; ask the user" — the app never invents a location.
 */
export type LocationSource = 'farm' | 'map' | 'manual' | 'current' | 'default' | 'none';

export interface EffectiveLocation {
    state: string;
    district: string;
    source: LocationSource;
    /**
     * Whether (state, district) is an exact match in the backend's supported
     * forecast locations list. `null` while that list hasn't loaded yet —
     * callers should treat `null` as "unknown", not as unsupported.
     */
    isSupported: boolean | null;
}

/**
 * Status of the active farm's own location, independent of any override.
 * Drives the warning/status copy in LocationBar.
 */
export type FarmLocationStatus = 'no-farm' | 'missing' | 'unknown' | 'supported' | 'unsupported';

export interface WeatherDay {
    day: string;
    date: string;
    condition: string;
    high: number;
    low: number;
    rainfallChance: number;
}
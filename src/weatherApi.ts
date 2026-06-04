// ─── Open-Meteo API client ────────────────────────────────────────────────────
//
// Two keyless endpoints:
//   1. Geocoding  — city name → candidate locations (with lat/long + timezone)
//   2. Forecast   — lat/long → current conditions
//
// No API key is required for non-commercial use, so nothing secret is bundled.

import type {CurrentWeather, GeocodeResult, TempUnit, WindUnit} from './types';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'is_day',
].join(',');

function round(n: unknown): number {
  return typeof n === 'number' && isFinite(n) ? Math.round(n) : 0;
}

/**
 * Search for a location by name. Returns up to 8 candidates so the user can
 * disambiguate (e.g. the many "Springfield"s). The API requires a name of at
 * least 2 characters and returns an empty result otherwise.
 */
export async function searchLocations(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const url =
    `${GEOCODE_URL}?name=${encodeURIComponent(q)}` +
    '&count=8&language=en&format=json';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map(
    (r: any): GeocodeResult => ({
      id: r.id,
      name: r.name,
      admin1: r.admin1 ?? undefined,
      country: r.country ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? undefined,
    }),
  );
}

/**
 * Fetch current conditions for a coordinate. Units are applied server-side via
 * `temperature_unit` / `wind_speed_unit`, so the response already carries the
 * right numbers and unit labels (returned in `current_units`).
 */
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  tempUnit: TempUnit,
  windUnit: WindUnit,
  timezone?: string,
): Promise<CurrentWeather> {
  const tz = timezone && timezone.length > 0 ? timezone : 'auto';
  const url =
    `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
    `&current=${CURRENT_VARS}` +
    `&temperature_unit=${tempUnit}` +
    `&wind_speed_unit=${windUnit}` +
    `&timezone=${encodeURIComponent(tz)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather lookup failed (${res.status})`);
  }
  const data = await res.json();
  const cur = data?.current;
  const units = data?.current_units ?? {};
  if (!cur) {
    throw new Error('No current weather in response');
  }

  return {
    temperature: round(cur.temperature_2m),
    apparentTemperature: round(cur.apparent_temperature),
    humidity: round(cur.relative_humidity_2m),
    windSpeed: round(cur.wind_speed_10m),
    windDirection: round(cur.wind_direction_10m),
    weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : -1,
    isDay: cur.is_day === 1,
    tempUnitLabel: units.temperature_2m ?? (tempUnit === 'celsius' ? '°C' : '°F'),
    windUnitLabel: units.wind_speed_10m ?? (windUnit === 'kmh' ? 'km/h' : 'mph'),
    time: typeof cur.time === 'string' ? cur.time : '',
  };
}

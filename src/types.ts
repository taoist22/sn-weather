// ─── Shared types for sn-weather ──────────────────────────────────────────────

/** A location the user has searched for and saved. */
export type SavedLocation = {
  name: string;
  admin1?: string; // state / province / region (full name from geocoder)
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string; // IANA tz from the geocoder, passed to the forecast call
};

/** One candidate returned by the geocoding search. */
export type GeocodeResult = SavedLocation & {
  id: number;
};

export type TempUnit = 'celsius' | 'fahrenheit';
export type WindUnit = 'kmh' | 'mph';

export type WeatherFormat = 'multiline' | 'oneline';
export type Position = 'top-left' | 'top-right';
export type TimeFormat = '24h' | '12h';
export type DateFormat = 'iso' | 'eu' | 'us';

/** User preferences persisted across sessions. */
export type Prefs = {
  tempUnit: TempUnit;
  windUnit: WindUnit;
  format: WeatherFormat;
  position: Position;
  showDateTime: boolean; // include a date+time stamp, or omit it entirely
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
};

export const DEFAULT_PREFS: Prefs = {
  tempUnit: 'celsius',
  windUnit: 'kmh',
  format: 'multiline',
  position: 'top-left',
  showDateTime: true,
  dateFormat: 'iso',
  timeFormat: '24h',
};

/** Normalised current-conditions reading from the forecast API. */
export type CurrentWeather = {
  temperature: number; // rounded
  apparentTemperature: number; // rounded
  humidity: number; // percent, rounded
  windSpeed: number; // rounded
  windDirection: number; // degrees (0–360), direction wind blows from
  weatherCode: number; // WMO code
  isDay: boolean;
  tempUnitLabel: string; // e.g. "°C" / "°F" (from API current_units)
  windUnitLabel: string; // e.g. "km/h" / "mph"
  time: string; // ISO timestamp of the reading
};

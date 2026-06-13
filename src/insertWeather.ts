// ─── Build + insert the weather stamp ─────────────────────────────────────────

import {PluginNoteAPI} from 'sn-plugin-lib';
import {
  CurrentWeather,
  DateFormat,
  Position,
  Prefs,
  SavedLocation,
  TimeFormat,
} from './types';
import {wmoDescription} from './wmo';

const FONT_SIZE = 30;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.45);
const EDGE_MARGIN = 20;
const LEFT_INSET = 100;
const TOP_INSET = 80;

type ApiRes<T> =
  | {success: boolean; result?: T; error?: {message?: string}}
  | null
  | undefined;

const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Degrees (0–360) → 16-point compass heading, e.g. 45 → "NE". */
function compass(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[idx];
}

/** "14 km/h NE" — wind speed with its compass direction. */
function windText(weather: CurrentWeather): string {
  return `${weather.windSpeed} ${weather.windUnitLabel} ${compass(
    weather.windDirection,
  )}`;
}

/** "Toronto, Ontario" — name plus region (or country) when available. */
function locationLabel(loc: SavedLocation): string {
  const region = loc.admin1 ?? loc.country;
  return region ? `${loc.name}, ${region}` : loc.name;
}

/** Date of the reading, in the location's local time. */
function readingDate(weather: CurrentWeather, fmt: DateFormat): string {
  if (weather.time && weather.time.length >= 10) {
    const isoDate = weather.time.slice(0, 10);
    if (fmt === 'iso') {
      return isoDate;
    }
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) {
      return isoDate;
    }
    if (fmt === 'eu') {
      return `${day}/${month}/${year}`;
    }
    return `${Number(month)}/${Number(day)}/${year}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Local time of the reading, formatted 24h ("14:30") or 12h ("2:30 PM"). */
function readingTime(weather: CurrentWeather, fmt: TimeFormat): string {
  // weather.time looks like "2026-06-04T14:30"
  if (!weather.time || weather.time.length < 16) {
    return '';
  }
  const hhmm = weather.time.slice(11, 16);
  if (fmt === '24h') {
    return hhmm;
  }
  const [hStr, m] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) {
    return hhmm;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) {
    h = 12;
  }
  return `${h}:${m} ${ampm}`;
}

/** "2026-06-04 14:30" — date plus local time, when the stamp is enabled. */
function dateTimeStamp(
  weather: CurrentWeather,
  dateFmt: DateFormat,
  timeFmt: TimeFormat,
): string {
  const date = readingDate(weather, dateFmt);
  const time = readingTime(weather, timeFmt);
  return time ? `${date} ${time}` : date;
}

/**
 * The displayed stamp, as an array of lines. Returning lines (rather than a
 * single newline-joined string) lets the preview render one <Text> per line,
 * avoiding the multi-child JSX text pitfall.
 */
export function buildWeatherLines(
  weather: CurrentWeather,
  location: SavedLocation,
  prefs: Pick<Prefs, 'format' | 'showDateTime' | 'dateFormat' | 'timeFormat'>,
): string[] {
  const t = `${weather.temperature}${weather.tempUnitLabel}`;
  const feels = `${weather.apparentTemperature}${weather.tempUnitLabel}`;
  const wind = windText(weather);
  const desc = wmoDescription(weather.weatherCode);
  const stamp = prefs.showDateTime
    ? dateTimeStamp(weather, prefs.dateFormat, prefs.timeFormat)
    : '';

  if (prefs.format === 'oneline') {
    const head = stamp ? `${location.name} · ${stamp}` : location.name;
    return [`${head} · ${t}, ${desc} · Wind ${wind}`];
  }

  const line1 = stamp
    ? `${locationLabel(location)} · ${stamp}`
    : locationLabel(location);
  return [
    line1,
    `${t}, ${desc} · feels ${feels}`,
    `Wind ${wind} · Humidity ${weather.humidity}%`,
  ];
}

/** Approximate pixel width for the longest line so the box doesn't wrap. */
function estimateBoxWidth(lines: string[], pageWidth: number): number {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const estimated = Math.ceil(longest * FONT_SIZE * 0.62);
  const min = FONT_SIZE * 6;
  const max = pageWidth - 2 * EDGE_MARGIN;
  return Math.max(min, Math.min(max, estimated));
}

/**
 * Insert the weather stamp into the current note at the chosen corner.
 * NOTE / main-layer only (an `insertText` constraint).
 */
export async function insertWeatherStamp(
  lines: string[],
  position: Position,
  pageWidth: number,
): Promise<void> {
  const text = lines.join('\n');
  const width = estimateBoxWidth(lines, pageWidth);
  const boxHeight = lines.length * LINE_HEIGHT;

  const top = TOP_INSET;
  const bottom = top + boxHeight;
  let left: number;
  let right: number;
  let textAlign: number;

  if (position === 'top-right') {
    right = pageWidth - EDGE_MARGIN;
    // Clamp so the box can never run off the left edge if `width` overshoots.
    left = Math.max(EDGE_MARGIN, right - width);
    textAlign = 2; // right
  } else {
    left = LEFT_INSET;
    // Clamp so the box can never run off the right edge.
    right = Math.min(pageWidth - EDGE_MARGIN, left + width);
    textAlign = 0; // left
  }

  const res = (await PluginNoteAPI.insertText({
    textContentFull: text,
    textRect: {
      left: Math.round(left),
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom),
    },
    fontSize: FONT_SIZE,
    textBold: 0,
    textItalics: 0,
    textAlign,
    // Fixed-width frame: the firmware honours our textRect width instead of
    // auto-sizing to the text. Without this it defaults to auto-width, anchors
    // at `left`, and grows rightward — which pushed the box off the right edge
    // on the narrower Nomad page while landing on the edge on the Manta.
    textFrameWidthType: 0,
    textEditable: 1,
    showLassoAfterInsert: false,
  })) as ApiRes<boolean>;

  if (!res?.success) {
    throw new Error(res?.error?.message ?? 'insertText failed');
  }
}

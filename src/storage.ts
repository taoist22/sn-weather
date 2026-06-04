// ─── Persistence (AsyncStorage) ───────────────────────────────────────────────
//
// Stores the saved location and user preferences across sessions / restarts.
// Persistence is a convenience — every read falls back to a sensible default
// rather than surfacing a storage error.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_PREFS, Prefs, SavedLocation} from './types';

const LOCATION_KEY = 'sn_weather_location';
const PREFS_KEY = 'sn_weather_prefs';

export async function loadLocation(): Promise<SavedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.name === 'string'
    ) {
      return parsed as SavedLocation;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveLocation(loc: SavedLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // best-effort
  }
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {...DEFAULT_PREFS};
    }
    const parsed = JSON.parse(raw);
    // Merge over defaults so a partial/old payload can't leave gaps.
    return {...DEFAULT_PREFS, ...parsed} as Prefs;
  } catch {
    return {...DEFAULT_PREFS};
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}

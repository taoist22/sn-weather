import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {
  CurrentWeather,
  DEFAULT_PREFS,
  GeocodeResult,
  Position,
  Prefs,
  SavedLocation,
  TempUnit,
  TimeFormat,
  WeatherFormat,
  WindUnit,
} from './types';
import {fetchCurrentWeather, searchLocations} from './weatherApi';
import {loadLocation, loadPrefs, saveLocation, savePrefs} from './storage';
import {buildWeatherLines, insertWeatherStamp} from './insertWeather';
import {subscribeToButtonEvents} from './pluginRouter';

const DEFAULT_PAGE_WIDTH = 1404;
const PANEL_WIDTH = 480;
const PANEL_PADDING = 20;
const ERROR_DISPLAY_MS = 2500;

// Native screen pixel dimensions [portraitWidth, portraitHeight] by device type.
// `insertText` places content in the device's native pixel space, so when a
// note's canvas is larger than the device (e.g. a Manta-sized 1920 note opened
// on a 1404-wide Nomad), the placement reference must be capped at the device's
// native width — otherwise the right edge lands off the visible page.
const DEVICE_NATIVE_PORTRAIT: Record<number, [number, number]> = {
  3: [1404, 1872], // A5X
  4: [1404, 1872], // Nomad (A6X2)
  5: [1920, 2560], // Manta (A5X2)
};

function placementWidthFor(
  pageWidth: number,
  deviceType: number | null,
  isLandscape: boolean,
): number {
  if (deviceType == null) {
    return pageWidth;
  }
  const dims = DEVICE_NATIVE_PORTRAIT[deviceType];
  if (!dims) {
    return pageWidth;
  }
  const nativeWidth = isLandscape ? dims[1] : dims[0];
  return Math.min(pageWidth, nativeWidth);
}

type Mode = 'loading' | 'setup' | 'weather';

type ApiRes<T> =
  | {success: boolean; result?: T; error?: {message?: string}}
  | null
  | undefined;

// ─── Page context (for insert width) ──────────────────────────────────────────

type PageInfo = {width: number; height: number; ok: boolean};

async function resolvePageInfo(): Promise<PageInfo> {
  try {
    const pathRes = (await PluginCommAPI.getCurrentFilePath()) as ApiRes<string>;
    const pageRes = (await PluginCommAPI.getCurrentPageNum()) as ApiRes<number>;
    if (
      pathRes?.success &&
      pageRes?.success &&
      typeof pathRes.result === 'string' &&
      typeof pageRes.result === 'number'
    ) {
      const sizeRes = (await PluginFileAPI.getPageSize(
        pathRes.result,
        pageRes.result,
      )) as ApiRes<{width: number; height: number}>;
      if (sizeRes?.success && sizeRes.result?.width) {
        return {
          width: sizeRes.result.width,
          height: sizeRes.result.height,
          ok: true,
        };
      }
    }
  } catch {
    // fall through
  }
  return {width: DEFAULT_PAGE_WIDTH, height: 0, ok: false};
}

function candidateLabel(r: GeocodeResult): string {
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return parts.join(', ');
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function WeatherPanel() {
  const [mode, setMode] = useState<Mode>('loading');
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [pageWidth, setPageWidth] = useState(DEFAULT_PAGE_WIDTH);
  const [deviceType, setDeviceType] = useState<number | null>(null);

  // Weather fetch state
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Location search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const insertingRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);

  // ── Fetch weather for a location + prefs ──
  const fetchWeather = useCallback(
    async (loc: SavedLocation, p: Prefs) => {
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const w = await fetchCurrentWeather(
          loc.latitude,
          loc.longitude,
          p.tempUnit,
          p.windUnit,
          loc.timezone,
        );
        setWeather(w);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load weather';
        setWeatherError(msg);
        setWeather(null);
      } finally {
        setWeatherLoading(false);
      }
    },
    [],
  );

  // ── Initial load ──
  const bootstrap = useCallback(async () => {
    const [savedLoc, savedPrefs] = await Promise.all([
      loadLocation(),
      loadPrefs(),
    ]);
    setPrefs(savedPrefs);
    setLocation(savedLoc);
    if (savedLoc) {
      setMode('weather');
      fetchWeather(savedLoc, savedPrefs);
    } else {
      setMode('setup');
    }
  }, [fetchWeather]);

  // ── Refresh on (re)open ──
  // The component never unmounts — closing the panel only hides the native
  // view, so weather state would otherwise persist and a stale reading could be
  // inserted on the next open. A reopen fires both `onStart` and a toolbar
  // button press; the timestamp guard coalesces them into a single refetch.
  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 1500) {
      return;
    }
    lastRefreshRef.current = now;
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Resolve the note page size and device type — both feed the placement
    // width cap in handleInsert (a Manta-sized note opened on a Nomad must be
    // capped to the Nomad's narrower native width).
    (async () => {
      const info = await resolvePageInfo();
      setPageWidth(info.width);
      try {
        const d = (await PluginManager.getDeviceType()) as unknown;
        if (typeof d === 'number') {
          setDeviceType(d);
        } else if (d && typeof (d as any).result === 'number') {
          setDeviceType((d as any).result);
        }
      } catch {
        // leave deviceType null — placementWidthFor falls back to page width
      }
    })();
    refresh();
    const lifeSub = PluginManager.addPluginLifeListener({
      onStart() {
        // Re-open may not remount the component — refresh persisted data.
        refresh();
      },
      onStop() {
        // Drop the last reading so a stale value can never be inserted on the
        // next open; reopening refetches fresh conditions.
        setWeather(null);
        setWeatherError(null);
        // Clear transient search/error state when the panel closes.
        setQuery('');
        setResults([]);
        setSearchError(null);
        setHasSearched(false);
        setError(null);
      },
    });
    // A toolbar button press is the most reliable "reopened" signal — fires on
    // every open even when onStart does not.
    const btnSub = subscribeToButtonEvents(() => refresh());
    return () => {
      lifeSub.remove();
      btnSub();
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [bootstrap, refresh]);

  // ── Preview lines ──
  const previewLines = useMemo(() => {
    if (!weather || !location) {
      return [];
    }
    return buildWeatherLines(weather, location, prefs);
  }, [weather, location, prefs]);

  // ── Pref updates ──
  const updatePrefs = useCallback(
    (patch: Partial<Prefs>, refetch: boolean) => {
      setPrefs(prev => {
        const next = {...prev, ...patch};
        savePrefs(next);
        if (refetch && location) {
          fetchWeather(location, next);
        }
        return next;
      });
    },
    [location, fetchWeather],
  );

  // ── Location search ──
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchError('Type at least 2 characters');
      return;
    }
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const found = await searchLocations(q);
      setResults(found);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      setSearchError(msg);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handlePickLocation = useCallback(
    (r: GeocodeResult) => {
      const loc: SavedLocation = {
        name: r.name,
        admin1: r.admin1,
        country: r.country,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      };
      saveLocation(loc);
      setLocation(loc);
      setResults([]);
      setQuery('');
      setHasSearched(false);
      setMode('weather');
      fetchWeather(loc, prefs);
    },
    [prefs, fetchWeather],
  );

  // ── Insert ──
  const handleInsert = useCallback(async () => {
    if (!weather || !location || insertingRef.current) {
      return;
    }
    insertingRef.current = true;
    setError(null);
    try {
      const lines = buildWeatherLines(weather, location, prefs);
      const win = Dimensions.get('window');
      const placementWidth = placementWidthFor(
        pageWidth,
        deviceType,
        win.width > win.height,
      );
      await insertWeatherStamp(lines, prefs.position, placementWidth);
      PluginManager.closePluginView();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Insert failed';
      setError(msg);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = setTimeout(() => setError(null), ERROR_DISPLAY_MS);
    } finally {
      insertingRef.current = false;
    }
  }, [weather, location, prefs, pageWidth, deviceType]);

  const handleClose = useCallback(() => {
    if (!insertingRef.current) {
      PluginManager.closePluginView();
    }
  }, []);

  // ── Render helpers ──
  const renderHeader = (title: string, showChange: boolean) => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={handleClose}
          style={({pressed}) => [
            styles.closeBtn,
            pressed && styles.closeBtnPressed,
          ]}>
          <Text style={styles.closeText}>{'✕'}</Text>
        </Pressable>
      </View>
      <View style={styles.divider} />
      {showChange && location && (
        <View style={styles.locationRow}>
          <Text style={styles.locationName} numberOfLines={1}>
            {candidateLabel(location as GeocodeResult)}
          </Text>
          <Pressable
            onPress={() => setMode('setup')}
            style={({pressed}) => [
              styles.changeBtn,
              pressed && styles.changeBtnPressed,
            ]}>
            <Text style={styles.changeBtnText}>{'Change'}</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  // ── Setup screen ──
  const renderSetup = () => (
    <>
      {renderHeader('Set location', false)}
      <View style={styles.body}>
        <Text style={styles.fieldLabel}>{'Search for a city'}</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={'e.g. Toronto'}
            placeholderTextColor={'#AAAAAA'}
            autoCorrect={false}
            returnKeyType={'search'}
            onSubmitEditing={handleSearch}
          />
          <Pressable
            onPress={handleSearch}
            disabled={searching}
            style={({pressed}) => [
              styles.searchBtn,
              pressed && styles.searchBtnPressed,
            ]}>
            <Text style={styles.searchBtnText}>
              {searching ? '…' : 'Search'}
            </Text>
          </Pressable>
        </View>

        {searchError != null && (
          <Text style={styles.inlineError}>{searchError}</Text>
        )}

        <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
          {results.map(r => (
            <Pressable
              key={String(r.id)}
              onPress={() => handlePickLocation(r)}
              style={({pressed}) => [
                styles.resultRow,
                pressed && styles.resultRowPressed,
              ]}>
              <Text style={styles.resultText}>{candidateLabel(r)}</Text>
            </Pressable>
          ))}
          {hasSearched && !searching && results.length === 0 && searchError == null && (
            <Text style={styles.emptyText}>{'No matches found'}</Text>
          )}
        </ScrollView>

        {location && (
          <Pressable
            onPress={() => setMode('weather')}
            style={({pressed}) => [
              styles.backBtn,
              pressed && styles.backBtnPressed,
            ]}>
            <Text style={styles.backBtnText}>{'Back'}</Text>
          </Pressable>
        )}
      </View>
    </>
  );

  // ── Weather screen ──
  const renderToggle = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.toggleChip,
        selected && styles.toggleChipSelected,
        pressed && styles.toggleChipPressed,
      ]}>
      <Text
        style={[
          styles.toggleChipText,
          selected && styles.toggleChipTextSelected,
        ]}>
        {label}
      </Text>
    </Pressable>
  );

  const renderWeather = () => (
    <>
      {renderHeader('Weather', true)}

      {error != null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.body}>
        {/* Preview / status */}
        <View style={styles.previewBox}>
          {weatherLoading && (
            <Text style={styles.statusText}>{'Loading weather…'}</Text>
          )}
          {!weatherLoading && weatherError != null && (
            <>
              <Text style={styles.statusError}>{weatherError}</Text>
              <Pressable
                onPress={() => location && fetchWeather(location, prefs)}
                style={({pressed}) => [
                  styles.retryBtn,
                  pressed && styles.retryBtnPressed,
                ]}>
                <Text style={styles.retryBtnText}>{'Retry'}</Text>
              </Pressable>
            </>
          )}
          {!weatherLoading &&
            weatherError == null &&
            previewLines.map((line, i) => (
              <Text key={String(i)} style={styles.previewLine}>
                {line}
              </Text>
            ))}
        </View>

        {/* Units */}
        <Text style={styles.fieldLabel}>{'Temperature'}</Text>
        <View style={styles.chipRow}>
          {renderToggle('°C', prefs.tempUnit === 'celsius', () =>
            updatePrefs({tempUnit: 'celsius' as TempUnit}, true),
          )}
          {renderToggle('°F', prefs.tempUnit === 'fahrenheit', () =>
            updatePrefs({tempUnit: 'fahrenheit' as TempUnit}, true),
          )}
        </View>

        <Text style={styles.fieldLabel}>{'Wind'}</Text>
        <View style={styles.chipRow}>
          {renderToggle('km/h', prefs.windUnit === 'kmh', () =>
            updatePrefs({windUnit: 'kmh' as WindUnit}, true),
          )}
          {renderToggle('mph', prefs.windUnit === 'mph', () =>
            updatePrefs({windUnit: 'mph' as WindUnit}, true),
          )}
        </View>

        {/* Format */}
        <Text style={styles.fieldLabel}>{'Format'}</Text>
        <View style={styles.chipRow}>
          {renderToggle('Multi-line', prefs.format === 'multiline', () =>
            updatePrefs({format: 'multiline' as WeatherFormat}, false),
          )}
          {renderToggle('One-line', prefs.format === 'oneline', () =>
            updatePrefs({format: 'oneline' as WeatherFormat}, false),
          )}
        </View>

        {/* Timestamp */}
        <Text style={styles.fieldLabel}>{'Timestamp'}</Text>
        <View style={styles.chipRow}>
          {renderToggle('Date + time', prefs.showDateTime, () =>
            updatePrefs({showDateTime: true}, false),
          )}
          {renderToggle('None', !prefs.showDateTime, () =>
            updatePrefs({showDateTime: false}, false),
          )}
        </View>

        {prefs.showDateTime && (
          <>
            <Text style={styles.fieldLabel}>{'Time format'}</Text>
            <View style={styles.chipRow}>
              {renderToggle('24h', prefs.timeFormat === '24h', () =>
                updatePrefs({timeFormat: '24h' as TimeFormat}, false),
              )}
              {renderToggle('12h', prefs.timeFormat === '12h', () =>
                updatePrefs({timeFormat: '12h' as TimeFormat}, false),
              )}
            </View>
          </>
        )}

        {/* Position */}
        <Text style={styles.fieldLabel}>{'Position'}</Text>
        <View style={styles.chipRow}>
          {renderToggle('Top Left', prefs.position === 'top-left', () =>
            updatePrefs({position: 'top-left' as Position}, false),
          )}
          {renderToggle('Top Right', prefs.position === 'top-right', () =>
            updatePrefs({position: 'top-right' as Position}, false),
          )}
        </View>
      </View>

      <View style={styles.divider} />
      <View style={styles.insertRow}>
        <Pressable
          onPress={handleInsert}
          disabled={!weather || weatherLoading}
          style={({pressed}) => [
            styles.insertBtn,
            (!weather || weatherLoading) && styles.insertBtnDisabled,
            pressed && weather != null && styles.insertBtnPressed,
          ]}>
          <Text
            style={[
              styles.insertBtnText,
              (!weather || weatherLoading) && styles.insertBtnTextDisabled,
            ]}>
            {'Insert'}
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Pressable style={styles.overlay} onPress={handleClose}>
      <Pressable style={styles.panel} onPress={e => e.stopPropagation()}>
        {mode === 'loading' && (
          <View style={styles.loadingPanel}>
            <Text style={styles.statusText}>{'Loading…'}</Text>
          </View>
        )}
        {mode === 'setup' && renderSetup()}
        {mode === 'weather' && renderWeather()}
      </Pressable>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    // flex-start + paddingTop keeps the panel above the soft keyboard in the
    // location-search field (Pattern 15).
    justifyContent: 'flex-start',
    paddingTop: 40,
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  loadingPanel: {
    paddingVertical: 48,
    alignItems: 'center',
  },

  // Header
  header: {
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeBtn: {
    position: 'absolute',
    right: PANEL_PADDING,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    backgroundColor: '#E8E8E8',
  },
  closeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },

  divider: {
    height: 1,
    backgroundColor: '#000000',
  },

  // Location row (weather screen)
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 12,
    gap: 12,
  },
  locationName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  changeBtn: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  changeBtnPressed: {
    backgroundColor: '#E8E8E8',
  },
  changeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },

  body: {
    paddingHorizontal: PANEL_PADDING,
    paddingTop: 12,
    paddingBottom: 8,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: '#000000',
  },
  searchBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnPressed: {
    backgroundColor: '#333333',
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inlineError: {
    color: '#000000',
    fontSize: 14,
    marginTop: 8,
  },
  resultsList: {
    maxHeight: 220,
    marginTop: 10,
  },
  resultRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  resultRowPressed: {
    backgroundColor: '#EFEFEF',
  },
  resultText: {
    fontSize: 17,
    color: '#000000',
  },
  emptyText: {
    fontSize: 15,
    color: '#888888',
    paddingVertical: 16,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    textDecorationLine: 'underline',
  },

  // Preview
  previewBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 96,
    justifyContent: 'center',
  },
  previewLine: {
    fontSize: 17,
    color: '#000000',
    marginVertical: 2,
  },
  statusText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
  },
  statusError: {
    fontSize: 15,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryBtn: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  retryBtnPressed: {
    backgroundColor: '#E8E8E8',
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleChip: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  toggleChipSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  toggleChipPressed: {
    backgroundColor: '#F0F0F0',
  },
  toggleChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  toggleChipTextSelected: {
    color: '#FFFFFF',
  },

  // Error banner
  errorBanner: {
    marginHorizontal: PANEL_PADDING,
    marginTop: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },

  // Insert
  insertRow: {
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 16,
  },
  insertBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertBtnDisabled: {
    backgroundColor: '#CCCCCC',
  },
  insertBtnPressed: {
    backgroundColor: '#333333',
  },
  insertBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  insertBtnTextDisabled: {
    color: '#888888',
  },
});

jest.mock('sn-plugin-lib', () => ({
  PluginNoteAPI: {
    insertText: jest.fn().mockResolvedValue({success: true}),
  },
}));

import {PluginNoteAPI} from 'sn-plugin-lib';
import {buildWeatherLines, insertWeatherStamp} from '../src/insertWeather';
import {CurrentWeather, Prefs, SavedLocation} from '../src/types';

const WEATHER: CurrentWeather = {
  temperature: 12,
  apparentTemperature: 10,
  humidity: 78,
  windSpeed: 14,
  windDirection: 45,
  weatherCode: 61,
  isDay: true,
  tempUnitLabel: '°C',
  windUnitLabel: 'km/h',
  time: '2026-06-04T14:30',
};

const LOCATION: SavedLocation = {
  name: 'Toronto',
  admin1: 'Ontario',
  country: 'Canada',
  latitude: 43.6532,
  longitude: -79.3832,
  timezone: 'America/Toronto',
};

const PREFS: Pick<
  Prefs,
  'format' | 'dateTimeMode' | 'showDateTime' | 'dateFormat' | 'timeFormat'
> = {
  format: 'multiline',
  dateTimeMode: 'both',
  dateFormat: 'iso',
  timeFormat: '24h',
};

describe('buildWeatherLines timestamp formats', () => {
  it('keeps ISO date format as default both (date + time)', () => {
    expect(buildWeatherLines(WEATHER, LOCATION, PREFS)[0]).toBe(
      'Toronto, Ontario · 2026-06-04 14:30',
    );
  });

  it('supports EU date format for date + time', () => {
    expect(
      buildWeatherLines(WEATHER, LOCATION, {...PREFS, dateFormat: 'eu'})[0],
    ).toBe('Toronto, Ontario · 04/06/2026 14:30');
  });

  it('supports US date format with 12-hour time', () => {
    expect(
      buildWeatherLines(WEATHER, LOCATION, {
        ...PREFS,
        dateFormat: 'us',
        timeFormat: '12h',
      })[0],
    ).toBe('Toronto, Ontario · 6/4/2026 2:30 PM');
  });

  it('supports Date-only timestamp mode', () => {
    expect(
      buildWeatherLines(WEATHER, LOCATION, {...PREFS, dateTimeMode: 'date'})[0],
    ).toBe('Toronto, Ontario · 2026-06-04');
  });

  it('supports Time-only timestamp mode', () => {
    expect(
      buildWeatherLines(WEATHER, LOCATION, {...PREFS, dateTimeMode: 'time'})[0],
    ).toBe('Toronto, Ontario · 14:30');
  });

  it('supports None timestamp mode', () => {
    expect(
      buildWeatherLines(WEATHER, LOCATION, {...PREFS, dateTimeMode: 'none'})[0],
    ).toBe('Toronto, Ontario');
  });
});

describe('buildWeatherLines wind gust formatting', () => {
  it('formats normal wind without gusts', () => {
    const lines = buildWeatherLines(
      {...WEATHER, windSpeed: 7, windDirection: 202, windUnitLabel: 'mph'},
      LOCATION,
      PREFS,
    );
    expect(lines[2]).toBe('Wind 7 mph SSW · Humidity 78%');
  });

  it('splits wind speed and gust when gusts are greater than wind speed', () => {
    const lines = buildWeatherLines(
      {
        ...WEATHER,
        windSpeed: 7,
        windGusts: 15,
        windDirection: 202,
        windUnitLabel: 'mph',
      },
      LOCATION,
      PREFS,
    );
    expect(lines[2]).toBe('Wind 7/15 mph SSW · Humidity 78%');
  });
});

describe('insertWeatherStamp placement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('positions top-right without running off left edge and uses left alignment', async () => {
    const lines = ['Toronto, Ontario · 2026-06-04', '12°C, Rain · feels 10°C'];
    await insertWeatherStamp(lines, 'top-right', 1404);

    expect(PluginNoteAPI.insertText).toHaveBeenCalledWith(
      expect.objectContaining({
        textAlign: 0,
        textRect: expect.objectContaining({
          right: 1384,
        }),
      }),
    );

    const callArg = (PluginNoteAPI.insertText as jest.Mock).mock.calls[0][0];
    expect(callArg.textRect.left).toBeGreaterThanOrEqual(100);
    expect(callArg.textRect.left).toBeLessThan(callArg.textRect.right);
  });
});

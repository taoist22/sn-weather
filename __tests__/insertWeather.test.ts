jest.mock('sn-plugin-lib', () => ({
  PluginNoteAPI: {
    insertText: jest.fn(),
  },
}));

import {buildWeatherLines} from '../src/insertWeather';
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
  'format' | 'showDateTime' | 'dateFormat' | 'timeFormat'
> = {
  format: 'multiline',
  showDateTime: true,
  dateFormat: 'iso',
  timeFormat: '24h',
};

describe('buildWeatherLines timestamp formats', () => {
  it('keeps ISO date format as the default timestamp style', () => {
    expect(buildWeatherLines(WEATHER, LOCATION, PREFS)[0]).toBe(
      'Toronto, Ontario · 2026-06-04 14:30',
    );
  });

  it('supports EU date format', () => {
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
});

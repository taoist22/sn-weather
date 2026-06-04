# Weather for Supernote

A [Supernote](https://supernote.com) plugin that looks up the current weather for your location and inserts it into your note as an editable text stamp. Powered by the free, keyless [Open-Meteo](https://open-meteo.com) API.

## Features

- **City search** — type a city name and pick from the matching results; no coordinates needed. Your choice is saved for next time.
- **Current conditions** — temperature, weather description, "feels like", wind speed + direction (16-point compass), and humidity.
- **Two formats:**
  - *Multi-line* (default):
    ```
    Toronto, Ontario · 2026-06-04 14:30
    12°C, Slight rain · feels 10°C
    Wind 14 km/h NE · Humidity 78%
    ```
  - *One-line*: `Toronto · 12°C, Slight rain · Wind 14 km/h NE`
- **Optional timestamp:** toggle a date + local-time stamp on or off, in 24-hour or 12-hour format. The time is the reading's time in the location's own timezone.
- **Units:** °C / °F and km/h / mph, selectable and remembered.
- **Position:** Top Left or Top Right of the page.
- Inserted as an editable text element — lasso and move it like any text box.

## Installation

1. Download `Weather.snplg` from the [latest release](https://github.com/taoist22/sn-weather/releases).
2. Connect your Supernote to your computer using the Supernote Partner app or Browse & Access.
3. Copy `Weather.snplg` into the `MyStyle` folder on your device.
4. On your Supernote, open a note, tap the **plugin icon** in the toolbar, go to **Manage Plugins**, tap **Add Plugin**, and select `Weather`.

## Usage

1. Open a note and tap the **weather icon** in the toolbar.
2. **First run:** search for your city and tap the correct match (e.g. "Springfield, Illinois, United States"). The location is saved.
3. The panel fetches the current weather and shows a live preview.
4. Adjust **temperature** (°C/°F), **wind** (km/h / mph), **format**, and **position** as desired. Changing units re-fetches; your settings persist.
5. Tap **Insert** to place the stamp and close the panel.
6. To switch cities later, tap **Change** on the weather screen.

## Requirements & limitations

- **NOTE files only.** Insertion uses the note text-box API, which is not available in documents (DOC).
- **Needs an internet connection** at the time you fetch. The Supernote has no GPS, so location comes from your saved city search (not your physical position). Weather is current as of the last fetch.
- Weather data and forecasts by [Open-Meteo.com](https://open-meteo.com), licensed under CC BY 4.0.

## Building from Source

Requirements: Node.js ≥ 18, JDK ≥ 19 (Zulu 21 recommended), Android SDK 35.

```bash
npm install   # or: yarn install
./buildPlugin.sh
```

This plugin bundles a native module (AsyncStorage) for saved settings, so the
**first build requires two runs** (`PackageList.java` is generated on the first
and populated on the second). The built plugin will be at
`build/outputs/Weather.snplg`.

## Compatibility

Requires Supernote firmware with plugin support. Tested on Supernote Nomad (A6X2) and Manta (A5X2).

## License

MIT

---

<sub><a href="https://www.flaticon.com/free-icons/weather" title="weather icons">Weather icons created by GOWI - Flaticon</a></sub>

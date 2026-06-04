import React from 'react';
import WeatherPanel from './src/WeatherPanel';
import {installPluginRouter} from './src/pluginRouter';

// Ensure the router listener is registered even if index.js hasn't run
// (e.g. in test harnesses that render App directly).
installPluginRouter();

export default function App(): React.JSX.Element {
  return <WeatherPanel />;
}

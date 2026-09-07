import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import WeatherPanel from '../src/WeatherPanel';
import PlacementOverlay from '../src/PlacementOverlay';
import {PluginCommAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
jest.mock('../src/pluginRouter', () => ({subscribeToButtonEvents: () => () => {}}));
jest.mock('../src/pluginPermissions', () => ({
  ensureFileReadPermission: async () => true,
  ensureFileWritePermission: async () => true,
  ensureInternetPermission: async () => true,
}));
jest.mock('../src/storage', () => ({
  loadLocation: async () => ({name: 'Toronto', latitude: 43, longitude: -79}),
  loadPrefs: async () => require('../src/types').DEFAULT_PREFS,
  savePrefs: jest.fn(),
}));
jest.mock('../src/weatherApi', () => ({fetchCurrentWeather: async () => ({
  temperature: 12, apparentTemperature: 10, humidity: 78, windSpeed: 14,
  windDirection: 45, weatherCode: 61, tempUnitLabel: '°C', windUnitLabel: 'km/h', time: '2026-09-07T12:00',
})}));
jest.mock('sn-plugin-lib', () => ({
  PluginManager: {closePluginView: jest.fn(), getDeviceType: async () => 4,
    registerPluginLifeListener: () => ({remove() {}})},
  PluginCommAPI: {
    getCurrentFilePath: async () => ({success: true, result: '/Note/test.note'}),
    getCurrentPageNum: jest.fn(async () => ({success: true, result: 0})),
  },
  PluginFileAPI: {getPageSize: async () => ({success: true, result: {width: 1404, height: 1872}})},
  PluginNoteAPI: {insertText: jest.fn(async () => ({success: true, result: true}))},
}));
let tree: TestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => {tree = TestRenderer.create(<WeatherPanel />);});
  await act(async () => {
    const insert = tree.root.findAllByType(Pressable).reverse().find(node =>
      node.findAllByType(Text).some(text => text.props.children === 'Insert'))!;
    void insert.props.onPress();
  });
  expect(PluginNoteAPI.insertText).not.toHaveBeenCalled();
});
afterEach(() => {act(() => tree.unmount());});
it('inserts on tap before closing the host', async () => {
  await act(async () => {tree.root.findByType(PlacementOverlay).props.request.resolve({kind: 'placed', point: {x: 200, y: 400}});});
  expect(PluginNoteAPI.insertText).toHaveBeenCalledWith(expect.objectContaining({textRect: expect.objectContaining({left: 200, top: 339})}));
  expect((PluginNoteAPI.insertText as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((PluginManager.closePluginView as jest.Mock).mock.invocationCallOrder[0]);
});
it('cancels without inserting', async () => {
  await act(async () => {tree.root.findByType(PlacementOverlay).props.request.resolve({kind: 'cancelled'});});
  expect(PluginNoteAPI.insertText).not.toHaveBeenCalled();
  expect(PluginManager.closePluginView).toHaveBeenCalledTimes(1);
});
it('rejects a page change while awaiting the tap', async () => {
  (PluginCommAPI.getCurrentPageNum as jest.Mock).mockResolvedValueOnce({success: true, result: 1});
  await act(async () => {tree.root.findByType(PlacementOverlay).props.request.resolve({kind: 'placed', point: {x: 200, y: 400}});});
  expect(PluginNoteAPI.insertText).not.toHaveBeenCalled();
  expect(PluginManager.closePluginView).not.toHaveBeenCalled();
});

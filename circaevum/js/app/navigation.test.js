'use strict';

const assert = require('node:assert');
const Navigation = require('./navigation.js');

assert.deepStrictEqual(
  Navigation.KEYBOARD_ZOOM_SEQUENCE,
  [1, 2, 3, 4, 5, 7, 8, 9, 0],
  'W/S ladder skips Lunar (6)'
);

assert.strictEqual(Navigation.getNextKeyboardZoomLevel(1, 4), 5);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(1, 5), 7);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(-1, 7), 5);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(1, 6), 7);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(-1, 6), 5);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(1, 9), 0);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(1, 0), null);
assert.strictEqual(Navigation.getNextKeyboardZoomLevel(-1, 1), null);

const zooms = [];
globalThis._mainSetZoomLevel = function (lvl) { zooms.push(lvl); return lvl; };
globalThis.currentZoom = 5;
globalThis.getCurrentZoomLevel = function () { return globalThis.currentZoom; };

const handledW = Navigation.handleKeyWASD({ key: 'w', repeat: false });
assert.strictEqual(handledW, true);
assert.deepStrictEqual(zooms, [7], 'W from month zoom hops to week');

globalThis.currentZoom = 7;
const handledS = Navigation.handleKeyWASD({ key: 's', repeat: false });
assert.strictEqual(handledS, true);
assert.deepStrictEqual(zooms, [7, 5], 'S from week zoom hops to month');

console.log('navigation W/S zoom ladder ok');

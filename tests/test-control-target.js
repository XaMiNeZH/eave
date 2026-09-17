#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {isControlActor, isControlTarget} from '../src/lib/control-target.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed += 1;
        return;
    }
    failed += 1;
    print(`FAIL: ${message}`);
}

const capsule = {};
const transportButton = {
    get_parent: () => capsule,
};
const transportGlyph = {
    get_parent: () => transportButton,
};
const seekTrack = {
    has_style_class_name: name => name === 'dynamic-island-seek',
    get_parent: () => capsule,
};
const volumeRoot = {
    has_style_class_name: name => name === 'dynamic-island-media-volume',
    get_parent: () => capsule,
};
const volumeFill = {
    has_style_class_name: () => false,
    get_parent: () => volumeRoot,
};
const plainContent = {
    get_parent: () => capsule,
};

assert(isControlActor(transportButton, capsule, actor => actor === transportButton),
    'a transport button is an island control target');
assert(isControlActor(transportGlyph, capsule, actor => actor === transportButton),
    'a DrawingArea child resolves to its transport button parent');
assert(isControlActor(seekTrack, capsule),
    'the seek style class is an island control target');
assert(isControlActor(volumeFill, capsule),
    'volume fill clicks walk parents to the media volume control');
assert(isControlTarget({get_source: () => transportGlyph}, capsule, actor => actor === transportButton),
    'an event from a transport glyph resolves as a control target');
assert(!isControlActor(plainContent, capsule),
    'ordinary capsule content is not a control target');

print(`control-target: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);

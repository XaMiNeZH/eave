#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

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

function contents(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return new TextDecoder().decode(bytes);
}

function section(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    return source.slice(from, to < 0 ? source.length : to);
}

const views = contents('src/lib/views.js');
const css = contents('src/stylesheet.css');
const compact = section(views, 'export function buildMediaCompact', 'export function buildMediaExpanded');
const expanded = section(views, 'export function buildMediaExpanded', 'export function buildOsdView');
const marquee = section(views, 'function marqueeLabel', 'function slot');

assert(compact.includes('root.clip_to_allocation = true'),
    'compact media clips its children during a pill morph');
assert(expanded.includes('root.clip_to_allocation = true'),
    'expanded media clips at the island content boundary');
assert(expanded.includes('col.clip_to_allocation = true') &&
    expanded.includes('head.clip_to_allocation = true') &&
    expanded.includes('textCol.clip_to_allocation = true'),
    'every expanded title ancestor clips its allocation');
assert(marquee.includes('clip.clip_to_allocation = true') &&
    marquee.includes('first.clip_to_allocation = true') &&
    marquee.includes('second.clip_to_allocation = true') &&
    marquee.includes('Pango.EllipsizeMode.END'),
    'both marquee copies stay clipped while translating');
assert(css.includes('.dynamic-island-media-expanded {\n    spacing: 10px;\n    min-width: 0;') &&
    css.includes('.dynamic-island-media-compact {\n    min-width: 0;') &&
    css.includes('.dynamic-island-marquee {\n    padding: 0;\n    min-width: 0;'),
    'media containers have no minimum width that can escape the island');

print(`media-clip: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);

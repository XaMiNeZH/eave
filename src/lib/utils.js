// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

export class SourceTracker {
    constructor() {
        this._timeouts = new Set();
        this._signals = [];
        this._subscriptions = [];
    }

    timeoutAdd(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            const result = fn();
            if (result !== GLib.SOURCE_CONTINUE)
                this._timeouts.delete(id);
            return result;
        });
        this._timeouts.add(id);
        return id;
    }

    timeoutAddOnce(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeouts.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.add(id);
        return id;
    }

    timeoutRemove(id) {
        if (!id || !this._timeouts.has(id))
            return;
        GLib.source_remove(id);
        this._timeouts.delete(id);
    }

    connect(obj, signal, fn) {
        const id = obj.connect(signal, fn);
        this._signals.push([obj, id]);
        return id;
    }

    subscribe(...args) {
        const id = args[0].signal_subscribe(...args.slice(1));
        this._subscriptions.push([args[0], id]);
        return id;
    }

    destroy() {
        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts.clear();

        for (const [obj, id] of this._signals) {
            try {
                obj.disconnect(id);
            } catch {
                // actor already disposed
            }
        }
        this._signals = [];

        for (const [bus, id] of this._subscriptions) {
            try {
                bus.signal_unsubscribe(id);
            } catch {
                // bus already gone
            }
        }
        this._subscriptions = [];
    }
}

export function themedIconName(icon) {
    if (!icon)
        return '';
    if (typeof icon === 'string')
        return icon;
    if (icon.names?.length)
        return icon.names[0];
    if (icon.iconName)
        return icon.iconName;
    try {
        return icon.to_string?.() ?? '';
    } catch {
        return '';
    }
}

export function classifyOsd(icon, label) {
    const text = `${themedIconName(icon)} ${label ?? ''}`.toLowerCase();
    // Airplane / rfkill is not a mute HUD. Leave the stock OSD alone; a
    // dedicated NetworkManager/Rfkill pill can morph the island instead.
    if (text.includes('airplane') || text.includes('flight') || text.includes('rfkill'))
        return null;
    if (text.includes('bright') || text.includes('display-brightness') || text.includes('sun'))
        return 'brightness';
    if (text.includes('mic') || text.includes('audio-input') || text.includes('microphone'))
        return 'mute';
    if (text.includes('audio-volume') || text.includes('audio-speaker') ||
        text.includes('headphone') || text.includes('volume') || text.includes('speaker'))
        return 'volume';
    // Keyboard layout, caps lock, and other Shell OSDs stay native.
    return null;
}

export function formatMediaClockUs(us) {
    const sec = Math.max(0, Math.round(Number(us ?? 0) / 1_000_000));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatMediaRemainingUs(positionUs, lengthUs) {
    if (!(Number(lengthUs) > 0))
        return '-0:00';
    const leftover = Math.max(0, Number(lengthUs) - Number(positionUs ?? 0));
    return `-${formatMediaClockUs(leftover)}`;
}

/** Run the seek clock between coarse MPRIS Position reads. */
export function displayedPlaybackUs(state, nowMonoUs) {
    const position = Math.max(0, Number(state?.positionUs ?? 0));
    const length = Math.max(0, Number(state?.lengthUs ?? 0));
    if (!state?.playing)
        return position;
    const elapsed = Math.max(0, Number(nowMonoUs) - Number(state?.anchorMonoUs ?? nowMonoUs));
    const next = position + elapsed;
    return length > 0 ? Math.min(length, next) : next;
}

export function playbackNeedsResync(displayedUs, reportedUs, slackUs = 1_200_000) {
    return Math.abs(Number(displayedUs) - Number(reportedUs)) > slackUs;
}

/** Convert a normalized media position into the actual allocated rail width. */
export function progressFillWidth(fraction, trackWidth) {
    const pct = Math.max(0, Math.min(1, Number(fraction) || 0));
    return Math.round(pct * Math.max(0, Number(trackWidth) || 0));
}

export function formatClock(dateTime, {use24h, showSeconds}) {
    if (use24h) {
        return showSeconds
            ? dateTime.format('%H:%M:%S')
            : dateTime.format('%H:%M');
    }
    const raw = showSeconds
        ? dateTime.format('%l:%M:%S %p')
        : dateTime.format('%l:%M %p');
    return raw.replace(/^\s+/, '');
}

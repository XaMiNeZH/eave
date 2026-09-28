// SPDX-License-Identifier: GPL-3.0-or-later

import {SourceTracker} from './utils.js';

export function clampVolumeFraction(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

export function volumeFraction(volume, maximum) {
    const max = Number(maximum);
    if (!(max > 0))
        return 0;
    return clampVolumeFraction(Number(volume) / max);
}

export function volumeTarget(fraction, maximum) {
    const max = Math.max(0, Number(maximum) || 0);
    return Math.round(clampVolumeFraction(fraction) * max);
}

export function sinkIdentity(sink, read) {
    if (!sink)
        return null;
    const id = read(sink, 'id', 'get_id');
    if (id != null && id !== '')
        return id;
    const index = read(sink, 'index', 'get_index');
    return index == null ? null : index;
}

export function sinkLabel(sink, read) {
    return String(read(sink, 'description', 'get_description') ||
        read(sink, 'name', 'get_name') ||
        'Output');
}

export function describeSinks(sinks, defaultSink, read) {
    const defaultId = sinkIdentity(defaultSink, read);
    const rows = [];
    for (const sink of sinks ?? []) {
        const id = sinkIdentity(sink, read);
        if (id == null)
            continue;
        rows.push({
            id,
            label: sinkLabel(sink, read),
            active: defaultId != null && id === defaultId,
        });
    }
    return rows;
}

export function sinkPickerAvailable(outputs) {
    return (outputs ?? []).length > 1;
}

/**
 * Owns the real GNOME default output stream. It deliberately reports no
 * control until Gvc returns an actual sink, so the media view never presents
 * a non-functional volume affordance.
 */
export class VolumeControl {
    constructor(onChange = () => {}) {
        this._onChange = onChange;
        this._tracker = new SourceTracker();
        this._control = null;
        this._sink = null;
        this._maximum = 0;
        this._snapshot = {available: false};
        this._destroyed = false;

        import('gi://Gvc').then(module => {
            if (!this._destroyed)
                this._open(module.default);
        }).catch(() => {
            // Gvc is not installed on this Shell; keep the media UI control-free.
        });
    }

    get snapshot() {
        return this._snapshot;
    }

    _open(Gvc) {
        if (!Gvc?.MixerControl)
            return;
        try {
            this._control = new Gvc.MixerControl({name: 'dynamic-island-volume'});
            for (const signal of [
                'state-changed',
                'default-sink-changed',
                'stream-changed',
                'stream-added',
                'stream-removed',
            ]) {
                try {
                    this._tracker.connect(this._control, signal, () => this._sync());
                } catch {
                    // This MixerControl build does not emit the signal.
                }
            }
            this._control.open();
            this._sync();
        } catch {
            this._control = null;
        }
    }

    _read(stream, property, getter) {
        try {
            if (stream?.[property] != null)
                return stream[property];
            return stream?.[getter]?.();
        } catch {
            return null;
        }
    }

    _sync() {
        if (this._destroyed || !this._control)
            return;
        let sink = null;
        let maximum = 0;
        try {
            sink = this._control.get_default_sink?.() ?? null;
            maximum = Number(this._control.get_vol_max_norm?.() ?? 0);
        } catch {
            sink = null;
        }
        if (!sink || !(maximum > 0)) {
            this._sink = null;
            this._maximum = 0;
            this._publish({available: false});
            return;
        }

        const volume = Number(this._read(sink, 'volume', 'get_volume'));
        const muted = this._read(sink, 'is_muted', 'get_is_muted') === true;
        if (!Number.isFinite(volume)) {
            this._publish({available: false});
            return;
        }

        this._sink = sink;
        this._maximum = maximum;
        this._publish({
            available: true,
            level: volumeFraction(volume, maximum),
            muted,
            outputs: describeSinks(this._iterSinks(), sink, (stream, property, getter) =>
                this._read(stream, property, getter)),
            setLevel: fraction => this.setLevel(fraction),
            toggleMuted: () => this.toggleMuted(),
            setOutput: id => this.setOutput(id),
        });
    }

    _publish(next) {
        const previous = this._snapshot;
        const changed = previous.available !== next.available ||
            previous.level !== next.level ||
            previous.muted !== next.muted ||
            outputsKey(previous.outputs) !== outputsKey(next.outputs);
        this._snapshot = next;
        if (changed)
            this._onChange?.();
    }

    setLevel(fraction) {
        const sink = this._sink;
        if (!sink || !(this._maximum > 0))
            return;
        try {
            sink.volume = volumeTarget(fraction, this._maximum);
            sink.push_volume?.();
            if (clampVolumeFraction(fraction) > 0 && this._read(sink, 'is_muted', 'get_is_muted'))
                sink.change_is_muted?.(false);
        } catch {
            // The current sink disappeared between the pointer event and commit.
        }
        this._sync();
    }

    toggleMuted() {
        const sink = this._sink;
        if (!sink)
            return;
        try {
            sink.change_is_muted?.(!this._read(sink, 'is_muted', 'get_is_muted'));
        } catch {
            // The current sink disappeared between the pointer event and commit.
        }
        this._sync();
    }

    _iterSinks() {
        try {
            const list = this._control?.get_sinks?.() ?? [];
            if (Array.isArray(list))
                return list;
            if (list && typeof list[Symbol.iterator] === 'function')
                return [...list];
            const length = Number(list.length) || 0;
            const rows = [];
            for (let i = 0; i < length; i++)
                rows.push(list[i]);
            return rows;
        } catch {
            return [];
        }
    }

    setOutput(id) {
        if (id == null || !this._control)
            return;
        try {
            const match = this._iterSinks().find(sink =>
                sinkIdentity(sink, (stream, property, getter) =>
                    this._read(stream, property, getter)) === id);
            if (match)
                this._control.set_default_sink?.(match);
        } catch {
            // The requested sink disappeared before the default could change.
        }
        this._sync();
    }

    destroy() {
        this._destroyed = true;
        this._tracker.destroy();
        try {
            this._control?.close?.();
        } catch {
            // The mixer can already be closed during Shell teardown.
        }
        this._control = null;
        this._sink = null;
        this._onChange = null;
    }
}

function outputsKey(outputs) {
    return (outputs ?? []).map(row => `${row.id}:${row.active ? 1 : 0}`).join('|');
}

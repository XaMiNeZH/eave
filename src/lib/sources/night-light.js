// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {
    COLOR_IFACE,
    COLOR_NAME,
    COLOR_PATH,
    NIGHT_LIGHT_SCHEMA,
    nightLightHeadline,
    nightLightShouldToast,
} from '../night-light.js';
import {SourceTracker} from '../utils.js';

export class NightLightSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._proxy = null;
        this._desktop = null;
        this._watchId = 0;
        this._active = null;

        this._tracker.connect(settings, 'changed::enable-night-light', () => {
            if (!settings.get_boolean('enable-night-light'))
                this._stack.remove('night-light');
        });

        try {
            this._watchId = Gio.DBus.session.watch_name(
                COLOR_NAME,
                Gio.BusNameWatcherFlags.NONE,
                () => this._bindColor(),
                () => this._unbindColor());
        } catch {
            this._watchId = 0;
        }

        try {
            this._desktop = new Gio.Settings({schema_id: NIGHT_LIGHT_SCHEMA});
            this._active = this._desktop.get_boolean('night-light-enabled');
            this._tracker.connect(this._desktop, 'changed::night-light-enabled', () => {
                if (this._proxy)
                    return;
                const next = this._desktop.get_boolean('night-light-enabled');
                const previous = this._active;
                this._active = next;
                if (nightLightShouldToast(previous, next))
                    this._publish();
            });
        } catch {
            this._desktop = null;
        }
    }

    _bindColor() {
        if (this._proxy)
            return;
        try {
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                COLOR_NAME,
                COLOR_PATH,
                COLOR_IFACE,
                null);
            this._active = this._readActive();
            this._tracker.connect(this._proxy, 'g-properties-changed', () => {
                const next = this._readActive();
                const previous = this._active;
                this._active = next;
                if (nightLightShouldToast(previous, next))
                    this._publish();
            });
        } catch {
            this._proxy = null;
        }
    }

    _readActive() {
        try {
            const supported = this._proxy.get_cached_property('NightLightSupported');
            if (supported != null && supported.unpack() === false)
                return null;
            const value = this._proxy.get_cached_property('NightLightActive');
            if (value == null)
                return null;
            return value.unpack() === true;
        } catch {
            return null;
        }
    }

    _publish() {
        if (!this._settings.get_boolean('enable-night-light')) {
            this._stack.remove('night-light');
            return;
        }
        if (!this._proxy && !this._desktop) {
            this._stack.remove('night-light');
            return;
        }
        const title = nightLightHeadline(this._active);
        if (!title) {
            this._stack.remove('night-light');
            return;
        }
        this._stack.upsert({
            id: 'night-light',
            kind: Kind.NIGHT_LIGHT,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {title, active: this._active},
        });
    }

    _unbindColor() {
        this._proxy = null;
        this._stack.remove('night-light');
        if (this._desktop)
            this._active = this._desktop.get_boolean('night-light-enabled');
        else
            this._active = null;
    }

    destroy() {
        if (this._watchId) {
            try {
                Gio.DBus.session.unwatch_name(this._watchId);
            } catch {
                // already gone
            }
            this._watchId = 0;
        }
        this._unbindColor();
        this._tracker.destroy();
        this._stack = null;
        this._settings = null;
        this._desktop = null;
    }
}

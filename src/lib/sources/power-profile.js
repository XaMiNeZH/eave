// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {
    POWER_PROFILE_NAMES,
    POWER_PROFILE_PATHS,
    powerProfileHeadline,
    powerProfileShouldToast,
} from '../power-profile.js';
import {SourceTracker} from '../utils.js';

const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

export class PowerProfileSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._proxy = null;
        this._watchIds = [];
        this._profile = null;
        this._boundName = null;

        this._tracker.connect(settings, 'changed::enable-power-profile', () => this._publish());

        for (const name of POWER_PROFILE_NAMES) {
            try {
                const id = Gio.DBus.system.watch_name(
                    name,
                    Gio.BusNameWatcherFlags.NONE,
                    () => this._bind(name),
                    () => this._unbind());
                this._watchIds.push(id);
            } catch {
                // system bus unavailable
            }
        }
    }

    _bind(name) {
        if (this._proxy)
            return;
        const path = POWER_PROFILE_PATHS[name];
        if (!path)
            return;
        try {
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                name,
                path,
                name,
                null);
            this._boundName = name;
            this._profile = this._read();
            this._propSub = this._tracker.subscribe(
                Gio.DBus.system,
                name,
                PROPS_IFACE,
                'PropertiesChanged',
                path,
                null,
                Gio.DBusSignalFlags.NONE,
                () => {
                    const next = this._read();
                    const previous = this._profile;
                    this._profile = next;
                    if (powerProfileShouldToast(previous, next))
                        this._publish();
                });
        } catch {
            this._proxy = null;
            this._boundName = null;
        }
    }

    _read() {
        try {
            return this._proxy?.get_cached_property('ActiveProfile')?.unpack() ?? null;
        } catch {
            return null;
        }
    }

    _publish() {
        if (!this._settings.get_boolean('enable-power-profile') || !this._proxy) {
            this._stack.remove('power-profile');
            return;
        }
        const title = powerProfileHeadline(this._profile);
        if (!title) {
            this._stack.remove('power-profile');
            return;
        }
        this._stack.upsert({
            id: 'power-profile',
            kind: Kind.POWER_PROFILE,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {profile: this._profile, title},
        });
    }

    _unbind() {
        this._proxy = null;
        this._boundName = null;
        this._profile = null;
        this._stack?.remove('power-profile');
    }

    destroy() {
        for (const id of this._watchIds) {
            try {
                Gio.DBus.system.unwatch_name(id);
            } catch {
                // already gone
            }
        }
        this._watchIds = [];
        this._unbind();
        this._tracker.destroy();
        this._stack = null;
        this._settings = null;
    }
}

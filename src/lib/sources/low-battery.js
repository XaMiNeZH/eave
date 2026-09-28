// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {
    isLowBattery,
    lowBatteryHeadline,
    lowBatteryShouldToast,
} from '../low-battery.js';
import {SourceTracker} from '../utils.js';

const UPOWER_NAME = 'org.freedesktop.UPower';
const DISPLAY_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const DEVICE_IFACE = 'org.freedesktop.UPower.Device';

export class LowBatterySource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._proxy = null;
        this._watchId = 0;
        this._wasLow = false;
        this._state = {
            present: false,
            state: 0,
            warningLevel: 0,
            percent: 0,
        };

        this._tracker.connect(settings, 'changed::enable-low-battery', () => this._publish());

        try {
            this._watchId = Gio.DBus.system.watch_name(
                UPOWER_NAME,
                Gio.BusNameWatcherFlags.NONE,
                () => this._bind(),
                () => this._unbind());
        } catch {
            this._watchId = 0;
        }
    }

    _bind() {
        if (this._proxy)
            return;
        try {
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                UPOWER_NAME,
                DISPLAY_PATH,
                DEVICE_IFACE,
                null);
            this._read();
            this._tracker.connect(this._proxy, 'g-properties-changed', () => {
                this._read();
                this._publish();
            });
            this._publish();
        } catch {
            this._proxy = null;
        }
    }

    _read() {
        if (!this._proxy)
            return;
        try {
            this._state = {
                present: this._proxy.get_cached_property('IsPresent')?.unpack() ?? this._state.present,
                state: this._proxy.get_cached_property('State')?.unpack() ?? this._state.state,
                warningLevel: this._proxy.get_cached_property('WarningLevel')?.unpack() ??
                    this._state.warningLevel,
                percent: this._proxy.get_cached_property('Percentage')?.unpack() ?? this._state.percent,
            };
        } catch {
            // UPower not available
        }
    }

    _publish() {
        if (!this._settings.get_boolean('enable-low-battery') || !this._proxy) {
            this._stack.remove('low-battery');
            this._wasLow = false;
            return;
        }
        const low = isLowBattery(this._state);
        if (!low) {
            this._stack.remove('low-battery');
            this._wasLow = false;
            return;
        }
        if (!lowBatteryShouldToast(this._wasLow, low))
            return;
        this._wasLow = true;
        this._stack.upsert({
            id: 'low-battery',
            kind: Kind.LOW_BATTERY,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {
                percent: this._state.percent,
                warningLevel: this._state.warningLevel,
                title: lowBatteryHeadline(this._state),
            },
        });
    }

    _unbind() {
        this._proxy = null;
        this._wasLow = false;
        this._stack.remove('low-battery');
    }

    destroy() {
        if (this._watchId) {
            try {
                Gio.DBus.system.unwatch_name(this._watchId);
            } catch {
                // already gone
            }
            this._watchId = 0;
        }
        this._unbind();
        this._tracker.destroy();
        this._stack = null;
        this._settings = null;
    }
}

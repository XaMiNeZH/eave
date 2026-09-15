// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {
    NM_DEVICE_TYPE_WIFI,
    airplaneShouldToast,
    ssidFromBytes,
    wifiHeadline,
    wifiIsConnecting,
} from '../radio.js';
import {SourceTracker} from '../utils.js';

const RFKILL_NAME = 'org.gnome.SettingsDaemon.Rfkill';
const RFKILL_PATH = '/org/gnome/SettingsDaemon/Rfkill';
const RFKILL_IFACE = 'org.gnome.SettingsDaemon.Rfkill';

const NM_NAME = 'org.freedesktop.NetworkManager';
const NM_PATH = '/org/freedesktop/NetworkManager';
const NM_IFACE = 'org.freedesktop.NetworkManager';
const DEVICE_IFACE = 'org.freedesktop.NetworkManager.Device';
const WIRELESS_IFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const AP_IFACE = 'org.freedesktop.NetworkManager.AccessPoint';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

export class RadioSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._rfkill = null;
        this._nm = null;
        this._devices = new Map();
        this._wasAirplane = false;
        this._watchIds = [];

        this._tracker.connect(settings, 'changed::enable-airplane', () => this._publishAirplane());
        this._tracker.connect(settings, 'changed::enable-wifi', () => this._publishWifi());

        try {
            this._watchIds.push({
                bus: Gio.DBus.session,
                id: Gio.DBus.session.watch_name(
                    RFKILL_NAME,
                    Gio.BusNameWatcherFlags.NONE,
                    () => this._bindRfkill(),
                    () => this._unbindRfkill()),
            });
        } catch {
            // session bus unavailable
        }
        try {
            this._watchIds.push({
                bus: Gio.DBus.system,
                id: Gio.DBus.system.watch_name(
                    NM_NAME,
                    Gio.BusNameWatcherFlags.NONE,
                    () => this._bindNm(),
                    () => this._unbindNm()),
            });
        } catch {
            // system bus unavailable
        }
    }

    _bindRfkill() {
        if (this._rfkill)
            return;
        try {
            this._rfkill = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                RFKILL_NAME,
                RFKILL_PATH,
                RFKILL_IFACE,
                null);
            this._tracker.connect(this._rfkill, 'g-properties-changed', () => this._onRfkill());
            this._onRfkill();
        } catch {
            this._rfkill = null;
        }
    }

    _readBool(proxy, name) {
        try {
            return proxy?.get_cached_property(name)?.unpack() === true;
        } catch {
            return false;
        }
    }

    _onRfkill() {
        let has = true;
        try {
            const value = this._rfkill?.get_cached_property('HasAirplaneMode');
            if (value != null)
                has = value.unpack() === true;
        } catch {
            has = true;
        }
        const on = has && this._readBool(this._rfkill, 'AirplaneMode');
        const shouldToast = airplaneShouldToast(this._wasAirplane, on);
        this._wasAirplane = on;
        if (on)
            this._stack.remove('wifi');
        if (!on) {
            this._stack.remove('airplane');
            this._publishWifi();
            return;
        }
        if (shouldToast)
            this._publishAirplane();
    }

    _publishAirplane() {
        if (!this._settings.get_boolean('enable-airplane') || !this._rfkill || !this._wasAirplane) {
            this._stack.remove('airplane');
            return;
        }
        this._stack.upsert({
            id: 'airplane',
            kind: Kind.AIRPLANE,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {title: 'Airplane'},
        });
    }

    _bindNm() {
        if (this._nm)
            return;
        try {
            this._nm = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                NM_NAME,
                NM_PATH,
                NM_IFACE,
                null);
            this._nm.call('GetDevices', null, Gio.DBusCallFlags.NONE, -1, null, (_p, res) => {
                try {
                    const [paths] = this._nm.call_finish(res).deepUnpack();
                    for (const path of paths ?? [])
                        this._watchDevice(path);
                } catch {
                    // NM has no devices yet
                }
            });
            this._tracker.subscribe(
                Gio.DBus.system,
                NM_NAME,
                NM_IFACE,
                'DeviceAdded',
                NM_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                (_c, _s, _p, _i, _sig, params) => {
                    const [path] = params.deepUnpack();
                    this._watchDevice(path);
                });
            this._tracker.subscribe(
                Gio.DBus.system,
                NM_NAME,
                NM_IFACE,
                'DeviceRemoved',
                NM_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                (_c, _s, _p, _i, _sig, params) => {
                    const [path] = params.deepUnpack();
                    this._devices.delete(path);
                    this._publishWifi();
                });
        } catch {
            this._nm = null;
        }
    }

    _watchDevice(path) {
        if (!path || this._devices.has(path))
            return;
        let proxy = null;
        try {
            proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                NM_NAME,
                path,
                DEVICE_IFACE,
                null);
        } catch {
            return;
        }
        const type = Number(proxy.get_cached_property('DeviceType')?.unpack() ?? 0);
        if (type !== NM_DEVICE_TYPE_WIFI)
            return;
        const row = {path, proxy, state: Number(proxy.get_cached_property('State')?.unpack() ?? 0), ssid: ''};
        this._devices.set(path, row);
        this._tracker.subscribe(
            Gio.DBus.system,
            NM_NAME,
            PROPS_IFACE,
            'PropertiesChanged',
            path,
            null,
            Gio.DBusSignalFlags.NONE,
            (_c, _s, objectPath) => {
                const device = this._devices.get(objectPath);
                if (!device)
                    return;
                try {
                    device.state = Number(device.proxy.get_cached_property('State')?.unpack() ?? device.state);
                } catch {
                    // keep last state
                }
                this._refreshSsid(device);
                this._publishWifi();
            });
        this._refreshSsid(row);
        this._publishWifi();
    }

    _refreshSsid(device) {
        try {
            const wireless = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                NM_NAME,
                device.path,
                WIRELESS_IFACE,
                null);
            const apPath = wireless.get_cached_property('ActiveAccessPoint')?.unpack();
            if (!apPath || apPath === '/')
                return;
            const ap = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                NM_NAME,
                apPath,
                AP_IFACE,
                null);
            device.ssid = ssidFromBytes(ap.get_cached_property('Ssid'));
        } catch {
            // SSID unavailable while associating
        }
    }

    _publishWifi() {
        if (!this._settings.get_boolean('enable-wifi') || this._wasAirplane || !this._nm) {
            this._stack.remove('wifi');
            return;
        }
        const connecting = [...this._devices.values()].find(device => wifiIsConnecting(device.state));
        if (!connecting) {
            this._stack.remove('wifi');
            return;
        }
        this._stack.upsert({
            id: 'wifi',
            kind: Kind.WIFI,
            persistent: true,
            payload: {title: wifiHeadline(connecting.ssid), ssid: connecting.ssid},
        });
    }

    _unbindRfkill() {
        this._rfkill = null;
        this._wasAirplane = false;
        this._stack.remove('airplane');
    }

    _unbindNm() {
        this._nm = null;
        this._devices.clear();
        this._stack.remove('wifi');
    }

    destroy() {
        for (const watch of this._watchIds) {
            try {
                watch.bus.unwatch_name(watch.id);
            } catch {
                // already gone
            }
        }
        this._watchIds = [];
        this._unbindRfkill();
        this._unbindNm();
        this._tracker.destroy();
        this._stack = null;
        this._settings = null;
    }
}

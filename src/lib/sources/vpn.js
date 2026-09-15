// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Kind} from '../activity-stack.js';
import {pickActiveVpn, vpnHeadline} from '../vpn.js';
import {SourceTracker} from '../utils.js';

const NM_NAME = 'org.freedesktop.NetworkManager';
const NM_PATH = '/org/freedesktop/NetworkManager';
const NM_IFACE = 'org.freedesktop.NetworkManager';
const ACTIVE_IFACE = 'org.freedesktop.NetworkManager.Connection.Active';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

export class VpnSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._nm = null;
        this._connections = new Map();
        this._watchId = 0;

        this._tracker.connect(settings, 'changed::enable-vpn', () => this._publish());

        try {
            this._watchId = Gio.DBus.system.watch_name(
                NM_NAME,
                Gio.BusNameWatcherFlags.NONE,
                () => this._bind(),
                () => this._unbind());
        } catch {
            this._watchId = 0;
        }
    }

    _bind() {
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
            this._tracker.connect(this._nm, 'g-properties-changed', () => this._syncConnections());
            this._syncConnections();
            this._fetchActive();
        } catch {
            this._nm = null;
        }
    }

    _cachedPaths() {
        try {
            const variant = this._nm?.get_cached_property('ActiveConnections');
            const paths = variant?.deep_unpack?.() ?? variant?.unpack?.();
            return Array.isArray(paths) ? paths : [];
        } catch {
            return [];
        }
    }

    _fetchActive() {
        try {
            Gio.DBus.system.call(
                NM_NAME,
                NM_PATH,
                PROPS_IFACE,
                'Get',
                new GLib.Variant('(ss)', [NM_IFACE, 'ActiveConnections']),
                GLib.VariantType.new('(v)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (conn, res) => {
                    try {
                        const [inner] = conn.call_finish(res).deep_unpack();
                        const paths = inner?.deep_unpack?.() ?? inner;
                        this._applyPaths(Array.isArray(paths) ? paths : []);
                    } catch {
                        this._syncConnections();
                    }
                });
        } catch {
            this._syncConnections();
        }
    }

    _syncConnections() {
        this._applyPaths(this._cachedPaths());
    }

    _applyPaths(paths) {
        const live = new Set(paths ?? []);
        for (const path of live)
            this._watchConnection(path);
        for (const path of [...this._connections.keys()]) {
            if (!live.has(path))
                this._connections.delete(path);
        }
        this._publish();
    }

    _watchConnection(path) {
        if (!path || this._connections.has(path))
            return;
        let proxy = null;
        try {
            proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                null,
                NM_NAME,
                path,
                ACTIVE_IFACE,
                null);
        } catch {
            return;
        }
        const read = () => {
            try {
                return {
                    path,
                    vpn: proxy.get_cached_property('Vpn')?.unpack() === true,
                    type: String(proxy.get_cached_property('Type')?.unpack() ?? ''),
                    state: Number(proxy.get_cached_property('State')?.unpack() ?? 0),
                    id: String(proxy.get_cached_property('Id')?.unpack() ?? ''),
                };
            } catch {
                return {path, vpn: false, type: '', state: 0, id: ''};
            }
        };
        this._connections.set(path, read());
        this._tracker.connect(proxy, 'g-properties-changed', () => {
            if (!this._connections.has(path))
                return;
            this._connections.set(path, read());
            this._publish();
        });
        this._publish();
    }

    _publish() {
        if (!this._settings.get_boolean('enable-vpn') || !this._nm) {
            this._stack.remove('vpn');
            return;
        }
        const active = pickActiveVpn([...this._connections.values()]);
        if (!active) {
            this._stack.remove('vpn');
            return;
        }
        this._stack.upsert({
            id: 'vpn',
            kind: Kind.VPN,
            persistent: true,
            payload: {title: vpnHeadline(active.id), id: active.id},
        });
    }

    _unbind() {
        this._nm = null;
        this._connections.clear();
        this._stack.remove('vpn');
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

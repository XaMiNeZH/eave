// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {CallState, isLiveCall, pickForegroundCall} from '../call.js';
import {SourceTracker} from '../utils.js';

const CALLS_NAME = 'org.gnome.Calls';
const CALLS_PATH = '/org/gnome/Calls';
const CALL_IFACE = 'org.gnome.Calls.Call';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const ManagerIface = `
<node>
  <interface name="org.freedesktop.DBus.ObjectManager">
    <method name="GetManagedObjects">
      <arg type="a{oa{sa{sv}}}" direction="out" name="objects"/>
    </method>
    <signal name="InterfacesAdded">
      <arg type="o" name="object"/>
      <arg type="a{sa{sv}}" name="interfaces"/>
    </signal>
    <signal name="InterfacesRemoved">
      <arg type="o" name="object"/>
      <arg type="as" name="interfaces"/>
    </signal>
  </interface>
</node>`;

const ManagerProxy = Gio.DBusProxy.makeProxyWrapper(ManagerIface);

function unpackMaybe(variant) {
    if (variant == null)
        return undefined;
    if (typeof variant !== 'object' || typeof variant.deepUnpack !== 'function')
        return variant;
    try {
        return variant.deepUnpack();
    } catch {
        try {
            return variant.unpack();
        } catch {
            return variant;
        }
    }
}

function readCall(ifaces) {
    const props = ifaces?.[CALL_IFACE];
    if (!props)
        return null;
    return {
        inbound: unpackMaybe(props.Inbound) === true,
        state: Number(unpackMaybe(props.State) ?? CallState.UNKNOWN),
        id: String(unpackMaybe(props.Id) ?? ''),
        displayName: String(unpackMaybe(props.DisplayName) ?? ''),
        protocol: String(unpackMaybe(props.Protocol) ?? ''),
    };
}

export class CallsSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._calls = new Map();
        this._manager = null;
        this._watchId = 0;

        this._tracker.connect(settings, 'changed::enable-calls', () => this._publish());

        try {
            this._watchId = Gio.DBus.session.watch_name(
                CALLS_NAME,
                Gio.BusNameWatcherFlags.NONE,
                () => this._bind(),
                () => this._unbind());
        } catch {
            this._watchId = 0;
        }
    }

    _bind() {
        if (this._manager)
            return;
        try {
            this._manager = new ManagerProxy(
                Gio.DBus.session,
                CALLS_NAME,
                CALLS_PATH,
                (proxy, error) => {
                    if (error) {
                        this._manager = null;
                        return;
                    }
                    this._ready();
                },
                null,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START);
        } catch {
            this._manager = null;
        }
    }

    async _ready() {
        if (!this._manager)
            return;
        try {
            const [objects] = await this._manager.GetManagedObjectsAsync();
            if (!this._manager)
                return;
            for (const [path, ifaces] of Object.entries(objects ?? {}))
                this._ingest(path, ifaces);
        } catch {
            // Calls exported no objects yet.
        }
        if (!this._manager)
            return;

        this._addedId = this._manager.connectSignal('InterfacesAdded',
            (_p, _s, [path, ifaces]) => this._ingest(path, ifaces));
        this._removedId = this._manager.connectSignal('InterfacesRemoved',
            (_p, _s, [path]) => this._drop(path));

        this._clearPropSub();
        this._propSub = this._tracker.subscribe(
            Gio.DBus.session,
            CALLS_NAME,
            PROPS_IFACE,
            'PropertiesChanged',
            null,
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, objectPath, _iface, _signal, params) => {
                const [iface, changed] = params.deepUnpack();
                if (iface !== CALL_IFACE)
                    return;
                this._onProps(objectPath, changed);
            });
        this._publish();
    }

    _ingest(path, ifaces) {
        const call = readCall(ifaces);
        if (!call)
            return;
        this._calls.set(path, call);
        this._publish();
    }

    _onProps(path, changed) {
        const current = this._calls.get(path);
        if (!current)
            return;
        if (changed?.Inbound != null)
            current.inbound = unpackMaybe(changed.Inbound) === true;
        if (changed?.State != null)
            current.state = Number(unpackMaybe(changed.State) ?? current.state);
        if (changed?.Id != null)
            current.id = String(unpackMaybe(changed.Id) ?? current.id);
        if (changed?.DisplayName != null)
            current.displayName = String(unpackMaybe(changed.DisplayName) ?? current.displayName);
        if (changed?.Protocol != null)
            current.protocol = String(unpackMaybe(changed.Protocol) ?? current.protocol);
        this._calls.set(path, current);
        this._publish();
    }

    _drop(path) {
        if (!this._calls.delete(path))
            return;
        this._publish();
    }

    _callMethod(path, method) {
        try {
            Gio.DBus.session.call(
                CALLS_NAME,
                path,
                CALL_IFACE,
                method,
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null);
        } catch {
            // The call object disappeared before the action landed.
        }
    }

    _publish() {
        if (!this._settings.get_boolean('enable-calls')) {
            this._stack.remove('call');
            return;
        }
        const rows = [...this._calls.entries()].map(([path, call]) => ({path, ...call}));
        const live = rows.filter(call => isLiveCall(call.state));
        const foreground = pickForegroundCall(live);
        if (!foreground) {
            this._stack.remove('call');
            return;
        }
        this._stack.upsert({
            id: 'call',
            kind: Kind.CALL,
            persistent: true,
            payload: {
                ...foreground,
                accept: () => this._callMethod(foreground.path, 'Accept'),
                hangup: () => this._callMethod(foreground.path, 'Hangup'),
            },
        });
    }

    _clearPropSub() {
        if (!this._propSub)
            return;
        try {
            Gio.DBus.session.signal_unsubscribe(this._propSub);
        } catch {
            // already dropped
        }
        this._propSub = 0;
    }

    _unbind() {
        this._clearPropSub();
        if (this._addedId && this._manager) {
            try {
                this._manager.disconnectSignal(this._addedId);
            } catch {
                // already gone
            }
        }
        if (this._removedId && this._manager) {
            try {
                this._manager.disconnectSignal(this._removedId);
            } catch {
                // already gone
            }
        }
        this._addedId = 0;
        this._removedId = 0;
        this._manager = null;
        this._calls.clear();
        this._stack.remove('call');
    }

    destroy() {
        if (this._watchId) {
            try {
                Gio.DBus.session.unwatch_name(this._watchId);
            } catch {
                // watcher already gone
            }
            this._watchId = 0;
        }
        this._unbind();
        this._tracker.destroy();
        this._stack = null;
        this._settings = null;
    }
}

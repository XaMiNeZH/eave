// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Kind} from '../activity-stack.js';
import {SourceTracker} from '../utils.js';
import {VolumeControl} from '../volume.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

const DBusIface = `
<node>
  <interface name="org.freedesktop.DBus">
    <method name="ListNames">
      <arg type="as" direction="out" name="names"/>
    </method>
    <signal name="NameOwnerChanged">
      <arg type="s" name="name"/>
      <arg type="s" name="old_owner"/>
      <arg type="s" name="new_owner"/>
    </signal>
  </interface>
</node>`;

const AppIface = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
  </interface>
</node>`;

const PlayerIface = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Seek">
      <arg type="x" name="Offset" direction="in"/>
    </method>
    <method name="SetPosition">
      <arg type="o" name="TrackId" direction="in"/>
      <arg type="x" name="Position" direction="in"/>
    </method>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Position" type="x" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
  </interface>
</node>`;

const PropertiesIface = `
<node>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
      <arg type="s" direction="in" name="interface_name"/>
      <arg type="s" direction="in" name="property_name"/>
      <arg type="v" direction="out" name="value"/>
    </method>
    <method name="Set">
      <arg type="s" direction="in" name="interface_name"/>
      <arg type="s" direction="in" name="property_name"/>
      <arg type="v" direction="in" name="value"/>
    </method>
  </interface>
</node>`;

const SEEK_HOLD_US = 1_000_000;
const POSITION_REFRESH_MS = 250;

const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);
const AppProxy = Gio.DBusProxy.makeProxyWrapper(AppIface);
const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(PlayerIface);
const PropertiesProxy = Gio.DBusProxy.makeProxyWrapper(PropertiesIface);

function unpackMetadata(raw) {
    const metadata = {};
    if (!raw)
        return metadata;
    for (const key in raw) {
        try {
            metadata[key] = raw[key].deepUnpack();
        } catch {
            metadata[key] = raw[key];
        }
    }
    return metadata;
}

function desktopIcon(desktopEntry) {
    if (!desktopEntry)
        return null;
    const names = desktopEntry.endsWith('.desktop')
        ? [desktopEntry]
        : [`${desktopEntry}.desktop`, desktopEntry];
    for (const name of names) {
        try {
            const info = Gio.DesktopAppInfo.new(name);
            const icon = info?.get_icon?.();
            if (icon)
                return icon;
        } catch {
            // try the next candidate
        }
    }
    return null;
}

class Player {
    constructor(busName, onChange, onGone) {
        this.busName = busName;
        this._onChange = onChange;
        this._onGone = onGone;
        this.title = '';
        this.artist = '';
        this.artUrl = '';
        this.identity = '';
        this.iconName = 'audio-x-generic-symbolic';
        this.gicon = null;
        this.status = 'Stopped';
        this.canPlay = false;
        this.lengthUs = 0;
        this.positionUs = 0;
        this.trackId = '';
        this._seekHoldUntil = 0;
        this._positionEpoch = 0;
        this._hasPosition = false;
        this._positionRequest = false;

        this._proxy = new PlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            (proxy, error) => {
                if (error) {
                    this._onGone?.(this);
                    return;
                }
                this._ready();
            });

        this._app = new AppProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            () => this._loadAppIcon());
        this._properties = new PropertiesProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            () => {});
    }

    _ready() {
        this._propId = this._proxy.connect('g-properties-changed', () => this._update());
        this._ownerId = this._proxy.connect('notify::g-name-owner', () => {
            if (!this._proxy.g_name_owner)
                this._onGone?.(this);
        });
        if (!this._proxy.g_name_owner) {
            this._onGone?.(this);
            return;
        }
        this._update();
    }

    _loadAppIcon() {
        try {
            this.identity = this._app?.Identity ?? '';
            this.gicon = desktopIcon(this._app?.DesktopEntry);
        } catch {
            this.gicon = null;
        }
        this._onChange?.(this);
    }

    _readPosition() {
        // Position is not required to emit PropertiesChanged. A proxy cache is
        // useful only for the initial value; refreshPosition() below performs
        // real D-Bus reads while playing.
        if (this._hasPosition)
            return;
        let reported;
        try {
            reported = Number(this._proxy.Position ?? 0);
        } catch {
            reported = this.positionUs || 0;
        }
        if (this._seekHoldUntil && GLib.get_monotonic_time() < this._seekHoldUntil)
            return;
        this.positionUs = reported;
        this._hasPosition = true;
    }

    refreshPosition() {
        if (this._positionRequest || !this._properties)
            return;
        this._positionRequest = true;
        const epoch = this._positionEpoch;
        this._properties.GetAsync('org.mpris.MediaPlayer2.Player', 'Position')
            .then(([value]) => {
                if (epoch !== this._positionEpoch ||
                    GLib.get_monotonic_time() < this._seekHoldUntil)
                    return;
                const unpacked = value?.deepUnpack?.() ?? value?.unpack?.() ?? value;
                const position = Number(unpacked);
                if (!Number.isFinite(position))
                    return;
                this.positionUs = Math.max(0, position);
                this._hasPosition = true;
                this._onChange?.(this);
            })
            .catch(() => {
                // Some minimal MPRIS implementations expose no Position.
            })
            .finally(() => {
                this._positionRequest = false;
            });
    }

    _update() {
        const metadata = unpackMetadata(this._proxy.Metadata);
        const artists = metadata['xesam:artist'];
        this.artist = Array.isArray(artists) ? artists.filter(a => typeof a === 'string').join(', ') : '';
        this.title = typeof metadata['xesam:title'] === 'string' ? metadata['xesam:title'] : '';
        this.artUrl = typeof metadata['mpris:artUrl'] === 'string' ? metadata['mpris:artUrl'] : '';
        this.lengthUs = Number(metadata['mpris:length'] ?? 0) || 0;
        const trackId = typeof metadata['mpris:trackid'] === 'string' ? metadata['mpris:trackid'] : '';
        const trackChanged = trackId !== this.trackId;
        if (trackChanged)
            this._seekHoldUntil = 0;
        this.trackId = trackId;
        if (trackChanged)
            this._hasPosition = false;
        this.status = this._proxy.PlaybackStatus ?? 'Stopped';
        this.canPlay = !!this._proxy.CanPlay;
        this.canGoNext = !!this._proxy.CanGoNext;
        this.canGoPrevious = !!this._proxy.CanGoPrevious;
        this._readPosition();
        this._onChange?.(this);
    }

    get playing() {
        return this.status === 'Playing';
    }

    playPause() {
        this._proxy.PlayPauseAsync().catch(() => {});
    }

    next() {
        this._proxy.NextAsync().catch(() => {});
    }

    previous() {
        this._proxy.PreviousAsync().catch(() => {});
    }

    seekFraction(frac) {
        if (!(this.lengthUs > 0))
            return;
        const pos = Math.round(Math.max(0, Math.min(1, frac)) * this.lengthUs);
        const from = this.positionUs || 0;
        const trackId = this.trackId || '/org/mpris/MediaPlayer2/TrackList/NoTrack';
        this.positionUs = pos;
        this._seekHoldUntil = GLib.get_monotonic_time() + SEEK_HOLD_US;
        this._positionEpoch++;
        this._hasPosition = true;
        this._onChange?.(this);
        this._proxy.SetPositionAsync(trackId, pos).catch(() => {
            const delta = pos - from;
            if (!delta)
                return;
            this._proxy.SeekAsync(delta).catch(() => {});
        });
    }

    destroy() {
        if (this._propId)
            this._proxy.disconnect(this._propId);
        if (this._ownerId)
            this._proxy.disconnect(this._ownerId);
        this._proxy = null;
        this._app = null;
        this._properties = null;
    }
}

export class MprisSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._players = new Map();
        this._volume = new VolumeControl(() => this._publish());

        this._tracker.connect(settings, 'changed::enable-media', () => this._publish());

        this._bus = new DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            (proxy, error) => {
                if (error)
                    return;
                this._onBusReady();
            });
    }

    async _onBusReady() {
        try {
            const [names] = await this._bus.ListNamesAsync();
            for (const name of names) {
                if (name.startsWith(MPRIS_PREFIX))
                    this._addPlayer(name);
            }
        } catch {
            // session bus listing failed
        }

        this._nameOwnerId = this._bus.connectSignal('NameOwnerChanged',
            (_p, _s, [name, oldOwner, newOwner]) => {
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (oldOwner)
                    this._removePlayer(name);
                if (newOwner)
                    this._addPlayer(name);
            });
    }

    _addPlayer(busName) {
        if (this._players.has(busName))
            return;
        const player = new Player(
            busName,
            () => this._publish(),
            gone => this._removePlayer(gone.busName));
        this._players.set(busName, player);
    }

    _removePlayer(busName) {
        const player = this._players.get(busName);
        if (!player)
            return;
        player.destroy();
        this._players.delete(busName);
        this._publish();
    }

    _active() {
        const playing = [...this._players.values()].filter(p => p.playing);
        if (playing.length)
            return playing[playing.length - 1];
        const paused = [...this._players.values()].filter(p => p.status === 'Paused' && p.title);
        return paused[paused.length - 1] ?? null;
    }

    _ensurePositionTimer(active) {
        if (active && !this._posId) {
            this._posId = this._tracker.timeoutAdd(POSITION_REFRESH_MS, () => {
                const player = this._active();
                if (!player || !player.playing) {
                    this._publish();
                    return GLib.SOURCE_CONTINUE;
                }
                player.refreshPosition();
                return GLib.SOURCE_CONTINUE;
            });
            return;
        }
        if (!active && this._posId) {
            this._tracker.timeoutRemove(this._posId);
            this._posId = 0;
        }
    }

    _publish() {
        if (!this._settings.get_boolean('enable-media')) {
            this._ensurePositionTimer(false);
            this._stack.remove('media');
            return;
        }

        const player = this._active();
        if (!player || (!player.playing && player.status !== 'Paused')) {
            this._ensurePositionTimer(false);
            this._stack.remove('media');
            return;
        }

        this._ensurePositionTimer(true);
        this._stack.upsert({
            id: 'media',
            kind: Kind.MEDIA,
            persistent: true,
            payload: {
                title: player.title || player.identity || player.busName.replace(MPRIS_PREFIX, ''),
                artist: player.artist,
                artUrl: player.artUrl,
                gicon: player.gicon,
                iconName: player.iconName,
                playing: player.playing,
                lengthUs: player.lengthUs,
                positionUs: player.positionUs,
                playPause: () => player.playPause(),
                next: () => player.next(),
                previous: () => player.previous(),
                seek: frac => player.seekFraction(frac),
                volume: this._volume.snapshot,
            },
        });
    }

    destroy() {
        if (this._nameOwnerId && this._bus) {
            try {
                this._bus.disconnectSignal(this._nameOwnerId);
            } catch {
                // already gone
            }
        }
        for (const player of this._players.values())
            player.destroy();
        this._players.clear();
        this._volume.destroy();
        this._volume = null;
        this._tracker.destroy();
        this._stack.remove('media');
        this._stack = null;
        this._settings = null;
        this._bus = null;
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

import {Kind} from './activity-stack.js';
import {CallState} from './call.js';
import {geometryFor} from './constants.js';
import {openDateMenu} from './clock.js';
import {activityKey} from './motion.js';
import {buildView} from './views.js';

export class Presenter {
    constructor({island, stack, settings, clock, Main}) {
        this._island = island;
        this._stack = stack;
        this._settings = settings;
        this._clock = clock;
        this._Main = Main;
        this._expireId = 0;
        this._destroyed = false;
        this._key = '';
        this._view = null;

        this._unsubStack = stack.onChange(activity => this._render(activity));
        this._unsubClock = clock.onTick(text => {
            if (this._destroyed)
                return;
            this._island.updateClock(text);
        });

        this._primaryId = island.connect('primary-click', () => this._onPrimary());
        this._secondaryId = island.connect('secondary-click', () => openDateMenu(this._Main));

        this._render(stack.current());
    }

    _duration() {
        return Math.max(280, this._settings.get_int('animation-duration'));
    }

    _onPrimary() {
        const cur = this._stack.current();
        if (cur.kind === Kind.IDLE) {
            this._island.bounce();
            return;
        }

        if (cur.kind === Kind.MEDIA || cur.kind === Kind.RECORDING) {
            this._stack.toggleExpanded();
            return;
        }

        if (cur.kind === Kind.CALL) {
            if (cur.payload?.state === CallState.INCOMING ||
                cur.payload?.state === CallState.WAITING)
                cur.payload.accept?.();
            return;
        }

        if (!cur.persistent)
            this._stack.remove(cur.id);
    }

    _render(activity) {
        if (this._destroyed)
            return;

        const key = activityKey(activity);
        const geom = this._island.fitGeometry(geometryFor(activity.kind, activity.expanded));

        if (key === this._key && this._view?.update) {
            this._view.update(activity.payload, this._clock.text);
            this._view.setHover?.(this._island.hover);
            this._island.morphTo(geom, this._duration()).catch(() => {});
            this._armExpiry();
            return;
        }

        let actor;
        try {
            actor = buildView(activity, this._clock.text);
        } catch (error) {
            console.warn(`[dynamic-island] view failed: ${error.message}`);
            this._armExpiry();
            return;
        }

        this._key = key;
        this._view = actor;
        const sizeChanged = this._island.geometry.height !== geom.height ||
            this._island.geometry.width !== geom.width;
        this._island.setContent(actor, {fade: sizeChanged, delayReveal: sizeChanged});
        this._island.morphTo(geom, this._duration()).catch(() => {});
        this._armExpiry();
    }

    _armExpiry() {
        if (this._expireId) {
            GLib.source_remove(this._expireId);
            this._expireId = 0;
        }

        const next = this._stack.nextExpiryAt();
        if (next == null)
            return;

        const delay = Math.max(16, next - Date.now());
        this._expireId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._expireId = 0;
            this._stack.expireDue();
            this._armExpiry();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._destroyed = true;
        if (this._expireId) {
            GLib.source_remove(this._expireId);
            this._expireId = 0;
        }
        this._unsubStack?.();
        this._unsubClock?.();
        if (this._island && this._primaryId)
            this._island.disconnect(this._primaryId);
        if (this._island && this._secondaryId)
            this._island.disconnect(this._secondaryId);
        this._primaryId = 0;
        this._secondaryId = 0;
        this._view = null;
        this._island = null;
        this._stack = null;
        this._settings = null;
        this._clock = null;
        this._Main = null;
    }
}

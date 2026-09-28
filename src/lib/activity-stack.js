// SPDX-License-Identifier: GPL-3.0-or-later
// Pure JS activity stack — no GNOME Shell imports so gjs --module tests can run headless.

export const Kind = Object.freeze({
    IDLE: 'idle',
    MEDIA: 'media',
    RECORDING: 'recording',
    PRIVACY: 'privacy',
    BLUETOOTH: 'bluetooth',
    CHARGING: 'charging',
    NIGHT_LIGHT: 'night-light',
    VOLUME: 'volume',
    BRIGHTNESS: 'brightness',
    MUTE: 'mute',
});

export const Priority = Object.freeze({
    [Kind.IDLE]: 0,
    [Kind.MEDIA]: 30,
    [Kind.RECORDING]: 40,
    [Kind.PRIVACY]: 55,
    [Kind.NIGHT_LIGHT]: 59,
    [Kind.BLUETOOTH]: 60,
    [Kind.CHARGING]: 65,
    [Kind.VOLUME]: 70,
    [Kind.BRIGHTNESS]: 70,
    [Kind.MUTE]: 70,
});

function idleItem() {
    return {
        id: 'idle',
        kind: Kind.IDLE,
        persistent: true,
        payload: {},
        expanded: false,
        priority: Priority[Kind.IDLE],
        expiresAt: null,
    };
}

export class ActivityStack {
    /**
     * @param {{now?: () => number}} [options]
     */
    constructor({now = () => Date.now()} = {}) {
        this._now = now;
        this._items = new Map();
        this._expandedId = null;
        this._listeners = new Set();
        this._seq = 0;
    }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _emit() {
        const current = this.current();
        for (const fn of this._listeners)
            fn(current);
    }

    /**
     * Insert or refresh an activity.
     * @param {{id: string, kind: string, persistent?: boolean, durationMs?: number, payload?: object, priority?: number}} item
     */
    upsert(item) {
        if (!item?.id || !item?.kind)
            throw new Error('ActivityStack.upsert requires id and kind');

        const now = this._now();
        const persistent = item.persistent === true;
        const priority = item.priority ?? Priority[item.kind] ?? 0;
        const existing = this._items.get(item.id);
        const expiresAt = persistent
            ? null
            : now + (item.durationMs ?? 2000);

        this._items.set(item.id, {
            id: item.id,
            kind: item.kind,
            persistent,
            payload: item.payload ?? existing?.payload ?? {},
            priority,
            expiresAt,
            seq: existing?.seq ?? ++this._seq,
            updatedAt: now,
        });
        this._emit();
        return this.current();
    }

    remove(id) {
        if (!this._items.has(id))
            return this.current();

        this._items.delete(id);
        if (this._expandedId === id)
            this._expandedId = null;
        this._emit();
        return this.current();
    }

    has(id) {
        return this._items.has(id);
    }

    get(id) {
        return this._items.get(id) ?? null;
    }

    expireDue() {
        const now = this._now();
        let changed = false;
        for (const [id, item] of [...this._items.entries()]) {
            if (item.expiresAt != null && item.expiresAt <= now) {
                this._items.delete(id);
                if (this._expandedId === id)
                    this._expandedId = null;
                changed = true;
            }
        }
        if (changed)
            this._emit();
        return this.current();
    }

    nextExpiryAt() {
        let next = null;
        const now = this._now();
        for (const item of this._items.values()) {
            if (item.expiresAt == null || item.expiresAt <= now)
                continue;
            if (next == null || item.expiresAt < next)
                next = item.expiresAt;
        }
        return next;
    }

    current() {
        const now = this._now();
        let best = null;
        for (const item of this._items.values()) {
            if (item.expiresAt != null && item.expiresAt <= now)
                continue;
            if (!best)
                best = item;
            else if (item.priority > best.priority)
                best = item;
            else if (item.priority === best.priority && item.seq > best.seq)
                best = item;
        }

        if (!best)
            return idleItem();

        return {
            ...best,
            expanded: this._expandedId === best.id,
        };
    }

    toggleExpanded() {
        const cur = this.current();
        if (cur.kind === Kind.IDLE)
            return cur;
        this._expandedId = this._expandedId === cur.id ? null : cur.id;
        this._emit();
        return this.current();
    }

    collapse() {
        if (this._expandedId == null)
            return this.current();
        this._expandedId = null;
        this._emit();
        return this.current();
    }

    get expanded() {
        return this._expandedId != null;
    }

    clear() {
        this._items.clear();
        this._expandedId = null;
        this._emit();
    }

    get size() {
        return this._items.size;
    }
}

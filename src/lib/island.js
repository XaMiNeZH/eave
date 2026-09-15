// SPDX-License-Identifier: GPL-3.0-or-later

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    COMPACT_PANEL_MARGIN,
    Geometry,
    compactHeightForPanel,
    compactTopInset,
    fitGeometryToPanel,
    isExpandedGeometry,
} from './constants.js';
import {typeStack} from './fonts.js';
import {sameGeometry, springProgress} from './motion.js';
import {
    chromeAllocation,
    chromePad,
    paintIslandChrome,
    pointInChrome,
} from './squircle.js';
import {isControlTarget} from './control-target.js';

export const Island = GObject.registerClass({
    GTypeName: 'DynamicIslandOverlay',
    Signals: {
        'primary-click': {},
        'secondary-click': {},
    },
}, class Island extends GObject.Object {
    _init(extension) {
        super._init();
        this._extension = extension;

        this._geom = {...Geometry.idle};
        this._morphGen = 0;
        this._contentGen = 0;
        this._chromeMounted = false;
        this._morphTimer = 0;
        this._settings = null;
        this._settingsIds = [];
        this._bindSettings();

        this._capsule = new St.Widget({
            style_class: 'dynamic-island-capsule',
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_expand: false,
            y_expand: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        // The chrome is painted separately, so clip the whole actor tree at
        // the capsule allocation as well as at the content allocation.
        this._capsule.clip_to_allocation = true;
        try {
            this._capsule.set_offscreen_redirect(Clutter.OffscreenRedirect.DISABLED);
        } catch {
            // older St/Clutter
        }
        this._capsule.set_pivot_point(0.5, 0);
        this._capsule.accessible_role = Atk.Role.PUSH_BUTTON;
        this._capsule.accessible_name = extension.gettext('Eave');

        this._paint = new St.DrawingArea({
            reactive: false,
        });
        this._paint.connect('repaint', area => this._onRepaint(area));

        this._content = new St.Bin({
            style_class: 'dynamic-island-content',
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            opacity: 255,
        });
        this._content.clip_to_allocation = true;

        this._capsule.add_child(this._paint);
        this._capsule.add_child(this._content);

        this._applyChromeStyle();
        this._layoutActors();

        this._capsule.connect('button-press-event', (_actor, event) => this._onPress(event));
        this._capsule.connect('notify::hover', () => this._onHover());

        this._mountChrome();
        this._bindPanel();
        this.relayout(false);

        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this.relayout(false));
    }

    get hover() {
        return !!this._capsule?.hover;
    }

    _applyChromeStyle() {
        this._capsule.style =
            `background-color: transparent; border-radius: 0; box-shadow: none; ` +
            `font-family: ${typeStack('display')};`;
    }

    _onRepaint(area) {
        const cr = area.get_context();
        try {
            if (area.width > 0 && area.height > 0)
                paintIslandChrome(cr, area.width, area.height, this._geom);
        } finally {
            cr.$dispose?.();
        }
    }

    _layoutActors() {
        const alloc = chromeAllocation(this._geom);
        this._capsule.set_size(alloc.width, alloc.height);
        this._paint.set_position(0, 0);
        this._paint.set_size(alloc.width, alloc.height);
        this._content.set_position(alloc.pad, alloc.pad);
        this._content.set_size(this._geom.width, this._geom.height);
        const innerRadius = this._geom.compact === false
            ? Math.max(22, Math.round((this._geom.radius ?? 36) * 0.9))
            : Math.round(this._geom.height / 2);
        this._content.style = `border-radius: ${innerRadius}px;`;
        this._paint.queue_repaint();
        if (isExpandedGeometry(this._geom))
            this._capsule.add_style_class_name('is-expanded');
        else
            this._capsule.remove_style_class_name('is-expanded');
    }

    _eventInChrome(event) {
        let sx = 0;
        let sy = 0;
        try {
            const coords = event.get_coords();
            sx = coords[coords.length - 2] ?? coords[0] ?? 0;
            sy = coords[coords.length - 1] ?? coords[1] ?? 0;
        } catch {
            return true;
        }
        try {
            const mapped = this._capsule.transform_stage_point(sx, sy);
            const ok = mapped?.[0];
            const x = typeof ok === 'boolean' ? mapped[1] : mapped?.[0];
            const y = typeof ok === 'boolean' ? mapped[2] : mapped?.[1];
            if (ok === false)
                return false;
            return pointInChrome(x, y, this._geom, chromePad(this._geom));
        } catch {
            return true;
        }
    }

    _mountChrome() {
        try {
            Main.layoutManager.addChrome(this._capsule, {
                affectsInputRegion: true,
                affectsStruts: false,
            });
            this._chromeMounted = true;
        } catch {
            Main.layoutManager.uiGroup.add_child(this._capsule);
            this._chromeMounted = false;
        }
        try {
            this._capsule.get_parent()?.set_child_above_sibling(this._capsule, null);
        } catch {
            // stacking not available
        }
    }

    _unmountChrome() {
        if (this._chromeMounted) {
            try {
                Main.layoutManager.removeChrome(this._capsule);
            } catch {
                const parent = this._capsule.get_parent();
                parent?.remove_child(this._capsule);
            }
            this._chromeMounted = false;
            return;
        }
        const parent = this._capsule.get_parent();
        parent?.remove_child(this._capsule);
    }

    _isControlTarget(event) {
        return isControlTarget(event, this._capsule, actor => actor instanceof St.Button);
    }

    _onPress(event) {
        const controlTarget = this._isControlTarget(event);
        if (!this._eventInChrome(event) && !controlTarget)
            return Clutter.EVENT_PROPAGATE;

        // Let the actual control consume its event; never turn it into an
        // island-level primary click.
        if (controlTarget)
            return Clutter.EVENT_PROPAGATE;

        const button = event.get_button();
        if (button === Clutter.BUTTON_SECONDARY || button === 3) {
            this.emit('secondary-click');
            return Clutter.EVENT_STOP;
        }
        if (button === Clutter.BUTTON_PRIMARY || button === 1) {
            this.emit('primary-click');
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onHover() {
        const hover = this._capsule.hover;
        const child = this._content.get_child();
        if (child?.suppressHoverScale) {
            this._capsule.remove_all_transitions();
            this._capsule.scale_x = 1;
            this._capsule.scale_y = 1;
        } else {
            this._capsule.ease({
                scale_x: hover ? 1.03 : 1.0,
                scale_y: hover ? 1.03 : 1.0,
                duration: 160,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        if (hover)
            this._capsule.add_style_class_name('is-hover');
        else
            this._capsule.remove_style_class_name('is-hover');
        child?.setHover?.(hover);
    }

    bounce() {
        this._capsule.remove_all_transitions();
        this._capsule.set_pivot_point(0.5, 0);
        this._capsule.scale_x = 1;
        this._capsule.scale_y = 1;
        this._capsule.ease({
            scale_x: 1.08,
            scale_y: 1.08,
            duration: 90,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._capsule.ease({
                    scale_x: 1,
                    scale_y: 1,
                    duration: 280,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            },
        });
    }

    _revealContent() {
        this._content.remove_all_transitions();
        if (this._content.opacity >= 250)
            return;
        this._content.ease({
            opacity: 255,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    setSessionVisible(visible) {
        const show = visible !== false;
        if (!this._capsule)
            return;
        this._capsule.visible = show;
        this._capsule.reactive = show;
        if (!show) {
            this._capsule.remove_all_transitions();
            this._capsule.scale_x = 1;
            this._capsule.scale_y = 1;
        }
    }

    setContent(actor, {fade = true, delayReveal = false} = {}) {
        const prev = this._content.get_child();
        this._contentGen++;

        if (delayReveal) {
            this._content.remove_all_transitions();
            this._content.set_child(actor);
            if (prev && prev !== actor)
                prev.destroy();
            this._content.opacity = 0;
            actor?.setHover?.(this.hover);
            return Promise.resolve();
        }

        if (!fade || !prev) {
            this._content.set_child(actor);
            if (prev && prev !== actor)
                prev.destroy();
            this._content.opacity = 255;
            actor?.setHover?.(this.hover);
            return Promise.resolve();
        }

        const gen = this._contentGen;
        this._content.remove_all_transitions();
        return new Promise(resolve => {
            this._content.ease({
                opacity: 0,
                duration: 90,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this._content.get_child() !== actor) {
                        this._content.set_child(actor);
                        if (prev && prev !== actor)
                            prev.destroy();
                    }
                    actor?.setHover?.(this.hover);
                    this._content.opacity = 0;
                    this._content.ease({
                        opacity: 255,
                        duration: 180,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: resolve,
                        onStopped: resolve,
                    });
                },
                onStopped: () => {
                    if (gen !== this._contentGen) {
                        resolve();
                        return;
                    }
                    this._content.set_child(actor);
                    if (prev && prev !== actor)
                        prev.destroy();
                    actor?.setHover?.(this.hover);
                    this._content.opacity = 255;
                    resolve();
                },
            });
        });
    }

    updateClock(text) {
        const child = this._content.get_child();
        if (child?.updateClock)
            child.updateClock(text);
    }

    get geometry() {
        return this._geom;
    }

    _bindSettings() {
        try {
            this._settings = this._extension.getSettings();
        } catch {
            this._settings = null;
            return;
        }
        for (const key of ['compact-margin', 'vertical-offset']) {
            this._settingsIds.push(
                this._settings.connect(`changed::${key}`, () => this.relayout(false)));
        }
    }

    _unbindSettings() {
        if (this._settings && this._settingsIds?.length) {
            for (const id of this._settingsIds) {
                try {
                    this._settings.disconnect(id);
                } catch {
                    // already gone
                }
            }
        }
        this._settingsIds = [];
        this._settings = null;
    }

    _layoutOptions() {
        let margin = COMPACT_PANEL_MARGIN;
        let offset = 0;
        try {
            if (this._settings) {
                margin = this._settings.get_int('compact-margin');
                offset = this._settings.get_int('vertical-offset');
            }
        } catch {
            // schema not available in this session
        }
        return {margin, offset};
    }

    _bindPanel() {
        const box = Main.layoutManager.panelBox;
        this._panelIds = [];
        if (box) {
            for (const prop of ['allocation', 'height', 'y', 'x']) {
                try {
                    this._panelIds.push(box.connect(`notify::${prop}`, () => this.relayout(false)));
                } catch {
                    // property not available on this Shell
                }
            }
        }
        try {
            this._startupId = Main.layoutManager.connect('startup-complete', () => this.relayout(false));
        } catch {
            this._startupId = 0;
        }
    }

    _unbindPanel() {
        const box = Main.layoutManager.panelBox;
        if (box && this._panelIds?.length) {
            for (const id of this._panelIds) {
                try {
                    box.disconnect(id);
                } catch {
                    // already gone
                }
            }
        }
        this._panelIds = [];
        if (this._startupId) {
            try {
                Main.layoutManager.disconnect(this._startupId);
            } catch {
                // already gone
            }
            this._startupId = 0;
        }
    }

    _panelRect() {
        const monitor = Main.layoutManager.primaryMonitor;
        const panelBox = Main.layoutManager.panelBox;
        const fallback = {
            x: monitor?.x ?? 0,
            y: monitor?.y ?? 0,
            width: monitor?.width ?? 0,
            height: Main.panel?.height || 32,
        };

        if (!panelBox)
            return fallback;

        let x = Number.isFinite(panelBox.x) ? panelBox.x : fallback.x;
        let y = Number.isFinite(panelBox.y) ? panelBox.y : fallback.y;
        let width = panelBox.width || fallback.width;
        let height = panelBox.height || fallback.height;

        try {
            const pos = panelBox.get_transformed_position?.();
            if (Array.isArray(pos) && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
                const parent = this._capsule?.get_parent();
                const panelParent = panelBox.get_parent();
                if (!parent || parent === panelParent) {
                    x = panelBox.x;
                    y = panelBox.y;
                } else {
                    x = pos[0];
                    y = pos[1];
                }
            }
        } catch {
            // keep actor x/y
        }

        const panelHeight = Main.panel?.height;
        if (panelHeight > 0)
            height = panelHeight;
        if (!(height > 0))
            height = fallback.height;
        if (!(width > 0))
            width = fallback.width;

        return {x, y, width, height};
    }

    fitGeometry(geom) {
        return fitGeometryToPanel(geom, this._panelRect().height, {
            margin: this._layoutOptions().margin,
        });
    }

    _targetBox(geom) {
        const panel = this._panelRect();
        const monitor = Main.layoutManager.primaryMonitor;
        const {margin, offset} = this._layoutOptions();
        const resolved = this.fitGeometry(geom);
        const compactHeight = resolved.compact === false
            ? compactHeightForPanel(panel.height, margin)
            : resolved.height;
        const inset = compactTopInset(panel.height, compactHeight);
        const screenX = monitor?.x ?? panel.x;
        const screenW = monitor?.width ?? panel.width;
        const pad = chromePad(resolved);
        return {
            x: screenX + Math.round((screenW - resolved.width) / 2) - pad,
            y: panel.y + inset + offset - Math.min(pad, 4),
        };
    }

    relayout(animate = false) {
        this._geom = this.fitGeometry(this._geom);
        const box = this._targetBox(this._geom);
        if (animate) {
            this.morphTo(this._geom);
            return;
        }
        this._stopMorph();
        this._applyChromeStyle();
        this._capsule.set_position(box.x, box.y);
        this._layoutActors();
        this._content.opacity = 255;
    }

    _stopMorph() {
        if (this._morphTimer) {
            GLib.source_remove(this._morphTimer);
            this._morphTimer = 0;
        }
        this._capsule.remove_all_transitions();
    }

    async morphTo(geom, durationMs = 420) {
        if (!geom)
            return;
        const resolved = this.fitGeometry(geom);
        if (sameGeometry(this._geom, resolved) && !this._morphTimer) {
            this.relayout(false);
            return;
        }

        const fromGeom = {...this._geom};
        const fromBox = this._targetBox(fromGeom);
        const toBox = this._targetBox(resolved);
        const duration = Math.max(220, durationMs);

        this._morphGen++;
        const gen = this._morphGen;
        this._stopMorph();
        this._geom = {...resolved};
        this._applyChromeStyle();

        const start = GLib.get_monotonic_time();
        let revealed = this._content.opacity >= 250;

        await new Promise(resolve => {
            const tick = () => {
                if (gen !== this._morphGen) {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
                const elapsed = (GLib.get_monotonic_time() - start) / 1000;
                const t = elapsed / duration;
                const k = springProgress(Math.min(t, 2.4));
                const lerp = (a, b) => a + (b - a) * k;
                this._geom = {
                    ...resolved,
                    width: lerp(fromGeom.width, resolved.width),
                    height: lerp(fromGeom.height, resolved.height),
                    radius: lerp(fromGeom.radius ?? 17, resolved.radius ?? 17),
                    compact: resolved.compact,
                };
                this._capsule.set_position(
                    Math.round(lerp(fromBox.x, toBox.x)),
                    Math.round(lerp(fromBox.y, toBox.y)));
                this._layoutActors();

                if (!revealed && k >= 0.8) {
                    revealed = true;
                    this._revealContent();
                }

                if (k >= 0.995 || t >= 1.35) {
                    this._morphTimer = 0;
                    this._geom = {...resolved};
                    this._capsule.set_position(toBox.x, toBox.y);
                    this._layoutActors();
                    this._revealContent();
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            };
            this._morphTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, tick);
        });

        if (gen === this._morphGen) {
            this._geom = {...resolved};
            this._capsule.set_position(toBox.x, toBox.y);
            this._layoutActors();
        }
    }

    forceIdle() {
        this._stopMorph();
        this._geom = this.fitGeometry(Geometry.idle);
        this._capsule.remove_style_class_name('is-expanded');
        this._capsule.scale_x = 1;
        this._capsule.scale_y = 1;
        this.relayout(false);
    }

    destroy() {
        this._stopMorph();
        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        this._unbindPanel();
        this._unbindSettings();
        this._unmountChrome();
        this._capsule.destroy();
    }
});

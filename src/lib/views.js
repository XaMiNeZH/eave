// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Kind} from './activity-stack.js';
import {typeCss} from './fonts.js';
import {
    Glyph,
    mediaPlayGlyph,
    osdGlyph,
    paintGlyph,
    volumeGlyph,
} from './glyphs.js';
import {requestPalette} from './palette-load.js';
import {FALLBACK_PALETTE, mixHex} from './palette.js';
import {
    displayedPlaybackUs,
    formatMediaClockUs,
    formatMediaRemainingUs,
    playbackNeedsResync,
    progressFillWidth,
} from './utils.js';
import {sinkPickerAvailable} from './volume.js';
import {
    BAR_COUNT,
    BAR_THICKNESS,
    DOT_HEIGHT,
    barHeightPx,
    proceduralLevel,
} from './waveform.js';

function label(text, styleClass, expand = false) {
    const widget = new St.Label({
        text: text ?? '',
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: expand,
    });
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    widget.clutter_text.single_line_mode = true;
    const optical = /subtitle|seek-time|osd-label|rec-time/.test(styleClass ?? '')
        ? 'text'
        : 'display';
    widget.style = typeCss(optical);
    return widget;
}

function glyphActor(kind, size = 16, color = null) {
    const area = new St.DrawingArea({
        width: size,
        height: size,
        style_class: 'dynamic-island-glyph',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });
    area._glyph = kind;
    area._glyphSize = size;
    area._glyphColor = color;
    area.connect('repaint', a => {
        const cr = a.get_context();
        try {
            paintGlyph(cr, a._glyph, a._glyphSize, a._glyphColor);
        } finally {
            cr.$dispose?.();
        }
    });
    area.setGlyph = next => {
        area._glyph = next;
        area.queue_repaint();
    };
    return area;
}

function glyphButton(kind, callback, extraClass = '', iconSize = 16) {
    const area = glyphActor(kind, iconSize);
    const button = new St.Button({
        style_class: `dynamic-island-icon-button ${extraClass}`.trim(),
        reactive: true,
        can_focus: true,
        track_hover: true,
        child: area,
    });
    button.connect('button-press-event', () => {
        callback();
        return Clutter.EVENT_STOP;
    });
    button.setGlyph = next => area.setGlyph(next);
    return button;
}

function cssUrl(uri) {
    return `url("${String(uri).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

function fileUriFromGicon(gicon) {
    try {
        if (gicon instanceof Gio.FileIcon)
            return gicon.get_file()?.get_uri?.() ?? '';
    } catch {
        // not a file icon
    }
    return '';
}

function artIcon(url, size = 22) {
    const widget = new St.Icon({
        icon_size: size,
        style_class: 'dynamic-island-art',
        y_align: Clutter.ActorAlign.CENTER,
        icon_name: 'audio-x-generic-symbolic',
    });
    if (url) {
        try {
            widget.gicon = new Gio.FileIcon({file: Gio.File.new_for_uri(url)});
        } catch {
            widget.icon_name = 'audio-x-generic-symbolic';
        }
    }
    widget.setArt = nextUrl => widget.setMedia({artUrl: nextUrl});
    widget.setMedia = data => {
        if (data?.artUrl) {
            try {
                widget.gicon = new Gio.FileIcon({file: Gio.File.new_for_uri(data.artUrl)});
                return;
            } catch {
                // fall through
            }
        }
        if (data?.gicon) {
            widget.gicon = data.gicon;
            return;
        }
        widget.gicon = null;
        widget.icon_name = data?.iconName || 'audio-x-generic-symbolic';
    };
    return widget;
}

function artClip(url, size, radius = null) {
    const corner = radius ?? Math.max(4, Math.round(size * 0.22));
    const clip = new St.Bin({
        style_class: 'dynamic-island-art-clip',
        width: size,
        height: size,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    clip.clip_to_allocation = true;
    const fallback = artIcon(null, size);

    const applyStyle = image => {
        const imageCss = image
            ? `background-image: ${cssUrl(image)}; background-size: cover; background-position: center;`
            : 'background-image: none;';
        clip.style = `border-radius: ${corner}px; ${imageCss}`;
    };

    const showFallback = data => {
        applyStyle('');
        fallback.setMedia(data ?? {iconName: 'audio-x-generic-symbolic'});
        if (clip.get_child() !== fallback)
            clip.set_child(fallback);
    };

    const paint = data => {
        const artUrl = typeof data === 'string'
            ? data
            : (data?.artUrl || fileUriFromGicon(data?.gicon) || '');
        if (artUrl) {
            applyStyle(artUrl);
            if (clip.get_child())
                clip.set_child(null);
            return;
        }
        showFallback(data);
    };

    clip.setArt = nextUrl => paint({artUrl: nextUrl});
    clip.setMedia = next => paint(next);
    paint({artUrl: url});
    return clip;
}

function fractionFromEvent(actor, event, vertical = false) {
    let coordinate = 0;
    try {
        const coords = event.get_coords();
        coordinate = vertical
            ? (coords[coords.length - 1] ?? coords[1] ?? 0)
            : (coords[coords.length - 2] ?? coords[0] ?? 0);
    } catch {
        return null;
    }
    let origin = 0;
    try {
        const pos = actor.get_transformed_position();
        origin = vertical ? (pos?.[1] ?? 0) : (pos?.[0] ?? 0);
    } catch {
        origin = 0;
    }
    const length = Math.max(1, vertical ? (actor.height || 1) : (actor.width || 1));
    const fraction = (coordinate - origin) / length;
    return Math.max(0, Math.min(1, vertical ? 1 - fraction : fraction));
}

function isPrimaryPress(event) {
    try {
        const type = event.type();
        if (type === Clutter.EventType.TOUCH_BEGIN)
            return true;
        const button = event.get_button();
        return button === 1 || button === Clutter.BUTTON_PRIMARY;
    } catch {
        return true;
    }
}

function connectStage(signal, handler) {
    try {
        const stage = globalThis.global?.stage;
        if (!stage)
            return 0;
        return stage.connect(signal, handler);
    } catch {
        return 0;
    }
}

function disconnectStage(id) {
    if (!id)
        return;
    try {
        globalThis.global?.stage?.disconnect(id);
    } catch {
        // stage already gone
    }
}

function dragBar(styleClass, fraction, {onCommit, onPreview, vertical = false} = {}) {
    const pct = Math.max(0, Math.min(1, fraction ?? 0));
    const track = new St.Widget({
        style_class: `dynamic-island-slider ${styleClass}`.trim(),
        reactive: true,
        track_hover: true,
        x_expand: !vertical,
        y_expand: vertical,
        y_align: Clutter.ActorAlign.CENTER,
        height: vertical ? 32 : 8,
        layout_manager: new Clutter.FixedLayout(),
    });
    if (vertical)
        track.width = 8;
    const rail = new St.Widget({
        style_class: 'dynamic-island-seek-rail',
        height: 3,
        x_expand: false,
    });
    const fill = new St.Widget({
        style_class: 'dynamic-island-seek-fill',
        height: 3,
        x_expand: false,
        width: 0,
    });
    track.add_child(rail);
    track.add_child(fill);

    let dragging = false;
    let adjusted = false;
    let capturedId = 0;
    let last = pct;

    const railLength = () => {
        if (vertical) {
            const height = Math.max(0, track.height || 0);
            const x = Math.max(0, Math.round((track.width - 3) / 2));
            rail.set_position(x, 0);
            rail.set_size(3, height);
            fill.set_position(x, height);
            fill.width = 3;
            return height;
        }
        const width = Math.max(0, track.width || 0);
        const y = Math.max(0, Math.round((track.height - 3) / 2));
        rail.set_position(0, y);
        rail.set_size(width, 3);
        fill.set_position(0, y);
        fill.height = 3;
        return width;
    };

    const apply = (next, animate) => {
        const n = Math.max(0, Math.min(1, next ?? 0));
        last = n;
        const length = progressFillWidth(n, railLength());
        fill.remove_all_transitions();
        fill.visible = length > 0;
        if (vertical) {
            const y = Math.max(0, (track.height || 0) - length);
            fill.set_position(Math.max(0, Math.round((track.width - 3) / 2)), y);
            if (animate && length > 0) {
                fill.ease({
                    height: length,
                    duration: 120,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                fill.height = length;
            }
            return n;
        }
        if (animate && length > 0) {
            fill.ease({
                width: length,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return n;
        }
        fill.width = length;
        return n;
    };

    const stopCapture = () => {
        disconnectStage(capturedId);
        capturedId = 0;
    };

    const finish = event => {
        if (!dragging)
            return;
        dragging = false;
        stopCapture();
        const next = event ? fractionFromEvent(track, event, vertical) : null;
        const n = apply(next ?? last, false);
        onCommit?.(n);
    };

    const preview = (event, animate = false) => {
        const next = fractionFromEvent(track, event, vertical);
        if (next == null)
            return;
        apply(next, animate);
        onPreview?.(next);
    };

    const onCaptured = (_stage, event) => {
        if (!dragging)
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type === Clutter.EventType.MOTION || type === Clutter.EventType.TOUCH_UPDATE) {
            preview(event);
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE ||
            type === Clutter.EventType.TOUCH_END ||
            type === Clutter.EventType.TOUCH_CANCEL) {
            finish(event);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    };

    track.connect('button-press-event', (_actor, event) => {
        if (!isPrimaryPress(event))
            return Clutter.EVENT_PROPAGATE;
        dragging = true;
        preview(event);
        stopCapture();
        capturedId = connectStage('captured-event', onCaptured);
        return Clutter.EVENT_STOP;
    });

    track.connect('motion-event', (_actor, event) => {
        if (!dragging || capturedId)
            return Clutter.EVENT_PROPAGATE;
        preview(event);
        return Clutter.EVENT_STOP;
    });

    track.connect('button-release-event', (_actor, event) => {
        if (!dragging || capturedId)
            return Clutter.EVENT_PROPAGATE;
        finish(event);
        return Clutter.EVENT_STOP;
    });

    track.connect('notify::width', () => apply(last, false));
    track.connect('notify::height', () => apply(last, false));
    track.connect('destroy', () => {
        dragging = false;
        stopCapture();
    });

    track.setLevel = (next, animate = true) => {
        if (dragging)
            return;
        apply(next, animate);
    };
    Object.defineProperty(track, 'dragging', {
        get() {
            return dragging;
        },
    });
    apply(pct, false);
    return track;
}

function levelBar(value) {
    const pct = Math.max(0, Math.min(1, value ?? 0));
    const track = new St.Widget({
        style_class: 'dynamic-island-level',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        height: 8,
        layout_manager: new Clutter.FixedLayout(),
    });
    const fill = new St.Widget({
        style_class: 'dynamic-island-level-fill',
        height: 8,
        width: 0,
        x_expand: false,
        y_expand: false,
    });
    track.add_child(fill);

    const paint = n => {
        fill.style = n > 0.8
            ? 'background-color: #ffe4d4;'
            : 'background-color: #ffffff;';
    };

    let level = pct;
    const apply = (next, animate = false) => {
        const n = Math.max(0, Math.min(1, next ?? 0));
        level = n;
        const width = progressFillWidth(n, track.width);
        fill.set_position(0, 0);
        fill.height = 8;
        fill.remove_all_transitions();
        fill.visible = width > 0;
        if (animate && width > 0) {
            fill.ease({
                width,
                duration: 140,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            fill.width = width;
        }
        paint(n);
    };
    track.connect('notify::width', () => apply(level));
    track.setLevel = next => apply(next, true);
    apply(level);
    return track;
}

function mediaVolumeControl(volume) {
    let state = volume;
    const root = new St.BoxLayout({
        style_class: 'dynamic-island-media-volume',
        vertical: true,
        width: 22,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });
    const mute = glyphButton(
        volumeGlyph(volume?.muted ? 0 : volume?.level),
        () => state?.toggleMuted?.(),
        'is-volume-mute',
        13);
    mute.accessible_name = 'Mute output';
    mute._dynamicIslandControl = true;
    const slider = dragBar('dynamic-island-volume', volume?.level ?? 0, {
        vertical: true,
        onPreview: next => state?.setLevel?.(next),
        onCommit: next => state?.setLevel?.(next),
    });
    root._dynamicIslandControl = true;
    slider._dynamicIslandControl = true;

    slider.connect('scroll-event', (_actor, event) => {
        let delta = 0;
        try {
            const [, dy] = event.get_scroll_delta();
            delta = -Math.sign(dy);
        } catch {
            // Discrete scroll events below provide the same adjustment.
        }
        if (!delta) {
            try {
                const direction = event.get_scroll_direction();
                if (direction === Clutter.ScrollDirection.UP)
                    delta = 1;
                else if (direction === Clutter.ScrollDirection.DOWN)
                    delta = -1;
            } catch {
                // The event has no usable scroll direction.
            }
        }
        if (!delta)
            return Clutter.EVENT_STOP;
        const next = Math.max(0, Math.min(1, (state?.level ?? 0) + delta * 0.05));
        slider.setLevel(next, false);
        state?.setLevel?.(next);
        return Clutter.EVENT_STOP;
    });

    root.add_child(mute);
    root.add_child(slider);
    root.update = next => {
        state = next;
        mute.setGlyph(volumeGlyph(next?.muted ? 0 : next?.level));
        if (!slider.dragging)
            slider.setLevel(next?.level ?? 0, false);
    };
    return root;
}

function equalizer(playing, options = {}) {
    const stripH = options.height ?? (options.accent ? 22 : 14);
    const barCount = options.bars ?? BAR_COUNT;
    const thickness = options.thickness ?? BAR_THICKNESS;
    const box = new St.BoxLayout({
        style_class: options.accent
            ? 'dynamic-island-eq dynamic-island-eq-accent'
            : 'dynamic-island-eq',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        x_expand: false,
        height: stripH,
        reactive: false,
    });
    const bars = [];
    for (let i = 0; i < barCount; i++) {
        const bar = new St.Widget({
            style_class: 'dynamic-island-eq-bar',
            width: thickness,
            height: DOT_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(bar);
        bars.push(bar);
    }

    let palette = {...FALLBACK_PALETTE};
    let timer = 0;

    const paint = () => {
        const seconds = GLib.get_monotonic_time() / 1_000_000;
        for (let i = 0; i < bars.length; i++) {
            const level = proceduralLevel(i, seconds, {playing: box._playing});
            const height = barHeightPx(level, stripH);
            const bar = bars[i];
            bar.remove_all_transitions();
            bar.height = height;
            const color = mixHex(palette.primary, palette.accent, 0.22 + 0.78 * level);
            bar.style = `background-color: ${color}; border-radius: ${Math.min(thickness, height) / 2}px;`;
        }
    };

    const stop = () => {
        if (!timer)
            return;
        GLib.source_remove(timer);
        timer = 0;
    };

    const arm = () => {
        if (box._playing) {
            if (!timer)
                timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, () => {
                    paint();
                    return GLib.SOURCE_CONTINUE;
                });
            return;
        }
        stop();
        paint();
    };

    box._playing = !!playing;
    box.setPlaying = next => {
        box._playing = !!next;
        arm();
    };
    box.setPalette = next => {
        palette = next && next.primary ? next : {...FALLBACK_PALETTE};
        paint();
    };

    paint();
    arm();
    box.connect('destroy', stop);
    return box;
}

function attachPalette(eq, url) {
    let last = '\0';
    const apply = nextUrl => {
        const key = nextUrl || '';
        if (key === last)
            return;
        last = key;
        requestPalette(key, pal => {
            if (key !== last)
                return;
            eq.setPalette?.(pal || FALLBACK_PALETTE);
        });
    };
    apply(url);
    return apply;
}

function marqueeLabel(text, styleClass, {expand = true, height = 18} = {}) {
    const clip = new St.Widget({
        style_class: 'dynamic-island-marquee',
        x_expand: expand,
        y_align: Clutter.ActorAlign.CENTER,
        height,
        reactive: false,
    });
    clip.clip_to_allocation = true;
    try {
        clip.layout_manager = new Clutter.FixedLayout();
    } catch {
        // default actor layout still honors set_position
    }

    const copy = () => {
        const widget = new St.Label({
            text: text ?? '',
            style_class: styleClass,
            y_align: Clutter.ActorAlign.CENTER,
        });
        widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        widget.clutter_text.single_line_mode = true;
        const optical = /subtitle|seek-time/.test(styleClass ?? '') ? 'text' : 'display';
        widget.style = typeCss(optical);
        return widget;
    };

    const first = copy();
    const second = copy();
    clip.add_child(first);
    clip.add_child(second);

    const SPEED = 30;
    const GAP = 44;
    let alive = true;
    let delayId = 0;

    const cancel = () => {
        if (delayId) {
            GLib.source_remove(delayId);
            delayId = 0;
        }
        first.remove_all_transitions();
        second.remove_all_transitions();
    };

    const textWidth = () => {
        try {
            const pref = first.get_preferred_width(-1);
            return Math.ceil(pref?.[1] ?? pref?.[0] ?? first.width ?? 0);
        } catch {
            return Math.ceil(first.width || 0);
        }
    };

    const startSlide = () => {
        if (!alive)
            return;
        cancel();
        first.translation_x = 0;
        second.translation_x = 0;
        const width = textWidth();
        first.set_position(0, 0);
        second.set_position(width + GAP, 0);
        const avail = clip.width || 0;
        if (!(width > avail + 2) || !(avail > 0)) {
            second.visible = false;
            return;
        }
        second.visible = true;
        const distance = width + GAP;
        const duration = Math.max(400, Math.round((distance / SPEED) * 1000));
        delayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 320, () => {
            delayId = 0;
            if (!alive)
                return GLib.SOURCE_REMOVE;
            const slide = {
                translation_x: -distance,
                duration,
                mode: Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                    if (!alive)
                        return;
                    first.translation_x = 0;
                    second.translation_x = 0;
                    startSlide();
                },
            };
            first.ease(slide);
            second.ease({
                translation_x: -distance,
                duration,
                mode: Clutter.AnimationMode.LINEAR,
            });
            return GLib.SOURCE_REMOVE;
        });
    };

    clip.setText = next => {
        const value = next ?? '';
        first.text = value;
        second.text = value;
        startSlide();
    };

    clip.connect('notify::width', startSlide);
    clip.connect('destroy', () => {
        alive = false;
        cancel();
    });
    return clip;
}

function slot(child, side) {
    const bin = new St.Bin({
        style_class: `dynamic-island-slot dynamic-island-slot-${side}`,
        x_align: side === 'leading' ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
        width: 28,
        x_expand: false,
    });
    if (child)
        bin.set_child(child);
    bin.replace = next => {
        const prev = bin.get_child();
        bin.set_child(next);
        prev?.destroy();
    };
    return bin;
}

function splitChrome({leading = null, trailing = null}) {
    const root = new St.BoxLayout({
        style_class: 'dynamic-island-split',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const lead = slot(leading, 'leading');
    const mid = new St.Widget({x_expand: true, height: 1});
    const trail = slot(trailing, 'trailing');
    root.add_child(lead);
    root.add_child(mid);
    root.add_child(trail);
    root.leading = lead;
    root.trailing = trail;
    return root;
}

export function buildIdleView() {
    return new St.Widget({
        style_class: 'dynamic-island-idle',
        x_expand: true,
        y_expand: true,
    });
}

export function buildMediaCompact(payload) {
    const hold = {payload};
    const art = artClip(payload?.artUrl, 22, 5);
    art.setMedia(payload);

    const stack = new St.Widget({
        style_class: 'dynamic-island-compact-trail',
        width: 28,
        height: 22,
        layout_manager: new Clutter.BinLayout(),
    });
    const eq = equalizer(payload?.playing === true, {height: 14});
    eq.x_align = Clutter.ActorAlign.CENTER;
    eq.y_align = Clutter.ActorAlign.CENTER;
    const play = glyphButton(
        mediaPlayGlyph(payload?.playing === true),
        () => hold.payload?.playPause?.(),
        'is-compact-play',
        13);
    play.x_align = Clutter.ActorAlign.CENTER;
    play.y_align = Clutter.ActorAlign.CENTER;
    stack.add_child(eq);
    stack.add_child(play);

    const root = splitChrome({leading: art, trailing: stack});
    root.add_style_class_name('dynamic-island-media-compact');
    root.suppressHoverScale = true;
    root._payload = payload;
    root._hover = false;
    const refreshPalette = attachPalette(eq, payload?.artUrl);

    const showHover = hover => {
        eq.opacity = hover ? 0 : 255;
        eq.reactive = false;
        play.opacity = hover ? 255 : 0;
        play.reactive = !!hover;
        play.visible = true;
        eq.visible = true;
    };
    showHover(false);

    root.setHover = hover => {
        root._hover = !!hover;
        showHover(root._hover);
    };
    root.update = next => {
        hold.payload = next;
        root._payload = next;
        art.setMedia(next);
        eq.setPlaying(next?.playing === true);
        play.setGlyph(mediaPlayGlyph(next?.playing === true));
        refreshPalette(next?.artUrl);
        showHover(root._hover);
    };
    return root;
}

export function buildMediaExpanded(payload) {
    const root = new St.BoxLayout({
        style_class: 'dynamic-island-media-expanded',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    root.clip_to_allocation = true;
    root._payload = payload;
    root.suppressHoverScale = true;

    const left = new St.BoxLayout({
        style_class: 'dynamic-island-media-left',
        y_align: Clutter.ActorAlign.CENTER,
    });
    left.clip_to_allocation = true;
    const volumeSlot = new St.Bin({
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    let volumeControl = null;
    const setVolume = volume => {
        if (!volume?.available) {
            volumeSlot.visible = false;
            return;
        }
        if (!volumeControl) {
            volumeControl = mediaVolumeControl(volume);
            volumeSlot.set_child(volumeControl);
        } else {
            volumeControl.update(volume);
        }
        volumeSlot.visible = true;
    };
    setVolume(payload?.volume);
    left.add_child(volumeSlot);

    const artGlow = new St.Bin({
        style_class: 'dynamic-island-art-glow',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const art = artClip(payload?.artUrl, 52, 11);
    art.setMedia(payload);
    artGlow.set_child(art);
    left.add_child(artGlow);
    root.add_child(left);

    const col = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'dynamic-island-media-copy',
    });
    col.clip_to_allocation = true;

    const head = new St.BoxLayout({
        style_class: 'dynamic-island-media-head',
        x_expand: true,
        y_expand: false,
        y_align: Clutter.ActorAlign.START,
    });
    head.clip_to_allocation = true;
    const textCol = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'dynamic-island-text-col is-media',
    });
    textCol.clip_to_allocation = true;
    const title = marqueeLabel(payload?.title || 'Not playing', 'dynamic-island-title', {
        height: 16,
    });
    const artist = marqueeLabel(payload?.artist || '', 'dynamic-island-subtitle', {
        height: 12,
    });
    textCol.add_child(title);
    textCol.add_child(artist);
    let pickingOutput = false;
    const outputButton = new St.Button({
        style_class: 'dynamic-island-output',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        can_focus: true,
        reactive: true,
        track_hover: true,
        visible: false,
    });
    outputButton._dynamicIslandControl = true;
    const outputName = label('', 'dynamic-island-output-label', true);
    outputButton.set_child(outputName);
    textCol.add_child(outputButton);
    head.add_child(textCol);

    const eq = equalizer(payload?.playing === true, {accent: true, height: 16});
    eq.y_align = Clutter.ActorAlign.START;
    head.add_child(eq);
    col.add_child(head);

    const sinkList = new St.BoxLayout({
        style_class: 'dynamic-island-sink-list',
        vertical: true,
        x_expand: true,
        visible: false,
    });
    sinkList.clip_to_allocation = true;
    sinkList._dynamicIslandControl = true;
    col.add_child(sinkList);

    const lengthUs = payload?.lengthUs ?? 0;
    const positionUs = payload?.positionUs ?? 0;
    const frac = lengthUs > 0 ? positionUs / lengthUs : 0;

    const clock = {
        playing: payload?.playing === true,
        positionUs,
        lengthUs,
        anchorMonoUs: GLib.get_monotonic_time(),
        title: payload?.title || '',
    };

    const seekBlock = new St.BoxLayout({
        style_class: 'dynamic-island-seek-block',
        vertical: true,
        x_expand: true,
        y_expand: false,
    });
    const timeRow = new St.BoxLayout({
        style_class: 'dynamic-island-seek-times',
        x_expand: true,
        y_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const elapsed = label(formatMediaClockUs(positionUs), 'dynamic-island-seek-time');
    const remaining = label(
        formatMediaRemainingUs(positionUs, lengthUs),
        'dynamic-island-seek-time is-remaining');
    remaining.clutter_text.line_alignment = Pango.Alignment.RIGHT;

    const previewTimes = nextFrac => {
        const length = clock.lengthUs;
        const pos = length > 0 ? nextFrac * length : 0;
        elapsed.text = formatMediaClockUs(pos);
        remaining.text = formatMediaRemainingUs(pos, length);
    };
    const seek = dragBar('dynamic-island-seek', frac, {
        onCommit: next => {
            const length = root._payload?.lengthUs ?? 0;
            clock.positionUs = length > 0 ? next * length : 0;
            clock.anchorMonoUs = GLib.get_monotonic_time();
            root._payload?.seek?.(next);
        },
        onPreview: previewTimes,
    });
    timeRow.add_child(elapsed);
    timeRow.add_child(seek);
    timeRow.add_child(remaining);
    seekBlock.add_child(timeRow);
    col.add_child(seekBlock);

    const bottom = new St.Bin({
        style_class: 'dynamic-island-media-bottom',
        x_expand: true,
        y_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.FILL,
    });
    const controls = new St.BoxLayout({
        style_class: 'dynamic-island-controls',
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const prev = glyphButton(
        Glyph.prev,
        () => root._payload?.previous?.(),
        'is-transport-skip',
        14);
    const play = glyphButton(
        mediaPlayGlyph(payload?.playing === true),
        () => root._payload?.playPause?.(),
        'is-transport-play',
        16);
    const next = glyphButton(
        Glyph.next,
        () => root._payload?.next?.(),
        'is-transport-skip',
        14);
    controls.add_child(prev);
    controls.add_child(play);
    controls.add_child(next);
    bottom.set_child(controls);
    col.add_child(bottom);
    root.add_child(col);

    const showPicker = picking => {
        const outputs = root._payload?.volume?.outputs ?? [];
        const showChip = !!root._payload?.volume?.available &&
            sinkPickerAvailable(outputs);
        sinkList.visible = picking && showChip;
        seekBlock.visible = !picking;
        bottom.visible = !picking;
        outputButton.visible = showChip && !picking;
        artist.visible = !showChip || picking;
    };
    const syncOutput = volume => {
        const outputs = volume?.outputs ?? [];
        const active = outputs.find(row => row.active) ?? outputs[0];
        outputName.text = active?.label || '';
        const showChip = !!volume?.available && sinkPickerAvailable(outputs);
        while (sinkList.get_n_children())
            sinkList.get_child_at_index(0).destroy();
        for (const row of outputs) {
            const rowButton = new St.Button({
                style_class: `dynamic-island-sink-row${row.active ? ' is-active' : ''}`,
                label: row.label,
                x_align: Clutter.ActorAlign.START,
                x_expand: true,
                reactive: true,
                can_focus: true,
                track_hover: true,
            });
            rowButton._dynamicIslandControl = true;
            rowButton.connect('clicked', () => {
                volume?.setOutput?.(row.id);
                pickingOutput = false;
                showPicker(false);
            });
            sinkList.add_child(rowButton);
        }
        if (!showChip)
            pickingOutput = false;
        showPicker(pickingOutput && showChip);
    };
    outputButton.connect('clicked', () => {
        const outputs = root._payload?.volume?.outputs ?? [];
        if (!sinkPickerAvailable(outputs))
            return;
        pickingOutput = !pickingOutput;
        showPicker(pickingOutput);
    });
    syncOutput(payload?.volume);

    const refreshPalette = attachPalette(eq, payload?.artUrl);

    let tickId = 0;
    const paintClock = () => {
        if (seek.dragging)
            return;
        const pos = displayedPlaybackUs(clock, GLib.get_monotonic_time());
        const length = clock.lengthUs;
        seek.setLevel(length > 0 ? pos / length : 0, false);
        elapsed.text = formatMediaClockUs(pos);
        remaining.text = formatMediaRemainingUs(pos, length);
    };
    const stopTick = () => {
        if (!tickId)
            return;
        GLib.source_remove(tickId);
        tickId = 0;
    };
    const armTick = () => {
        if (clock.playing) {
            if (!tickId)
                tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, () => {
                    paintClock();
                    return GLib.SOURCE_CONTINUE;
                });
            return;
        }
        stopTick();
        paintClock();
    };

    root.update = data => {
        root._payload = data;
        art.setMedia(data);
        setVolume(data?.volume);
        syncOutput(data?.volume);
        title.setText(data?.title || 'Not playing');
        artist.setText(data?.artist || '');
        play.setGlyph(mediaPlayGlyph(data?.playing === true));
        eq.setPlaying(data?.playing === true);
        refreshPalette(data?.artUrl);

        const now = GLib.get_monotonic_time();
        const reported = data?.positionUs ?? 0;
        const shown = displayedPlaybackUs(clock, now);
        const trackChanged = (data?.title || '') !== clock.title;
        const lengthChanged = (data?.lengthUs ?? 0) !== clock.lengthUs;
        if (data?.playing !== clock.playing || trackChanged || lengthChanged ||
            playbackNeedsResync(shown, reported)) {
            clock.positionUs = reported;
            clock.anchorMonoUs = now;
        }
        clock.playing = data?.playing === true;
        clock.lengthUs = data?.lengthUs ?? 0;
        clock.title = data?.title || '';
        if (!seek.dragging)
            paintClock();
        armTick();
    };

    armTick();
    root.connect('destroy', stopTick);
    return root;
}

export function buildOsdView(payload) {
    const kind = payload?.kind;
    const glyph = glyphActor(osdGlyph(kind, payload?.level), 20);
    const bar = payload?.level != null ? levelBar(payload.level) : null;
    const percent = payload?.level != null
        ? `${Math.round(payload.level * 100)}`
        : (payload?.label ?? '');
    const pct = label(percent, 'dynamic-island-osd-label');

    const root = new St.BoxLayout({
        style_class: 'dynamic-island-osd',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    root.add_child(glyph);
    if (bar)
        root.add_child(bar);
    root.add_child(pct);

    root.update = next => {
        glyph.setGlyph(osdGlyph(next?.kind ?? kind, next?.level));
        if (bar && next?.level != null)
            bar.setLevel(next.level);
        if (next?.level != null)
            pct.text = `${Math.round(next.level * 100)}`;
        else if (next?.label)
            pct.text = next.label;
    };
    return root;
}

export function buildChargingView(payload) {
    const percent = Math.round(payload?.percent ?? 0);
    const title = label('Charging', 'dynamic-island-title dynamic-island-charging-title');
    const pct = label(`${percent}%`, 'dynamic-island-charging-percent');
    const glyph = glyphActor(Glyph.batteryCharge, 18, '#30d158');
    const trailing = new St.BoxLayout({
        style_class: 'dynamic-island-charging-trailing',
        y_align: Clutter.ActorAlign.CENTER,
    });
    trailing.add_child(pct);
    trailing.add_child(glyph);
    const root = new St.BoxLayout({
        style_class: 'dynamic-island-charging',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    root.add_child(title);
    root.add_child(new St.Widget({x_expand: true, height: 1}));
    root.add_child(trailing);
    root.update = next => {
        const n = Math.round(next?.percent ?? 0);
        pct.text = `${n}%`;
    };
    return root;
}

export function buildBluetoothView(payload) {
    const title = label(payload?.name ? payload.name : 'Connected', 'dynamic-island-title');
    const sub = label('Bluetooth', 'dynamic-island-subtitle');
    const textCol = new St.BoxLayout({
        vertical: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'dynamic-island-text-col',
    });
    textCol.add_child(title);
    textCol.add_child(sub);
    const root = new St.BoxLayout({
        style_class: 'dynamic-island-system',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    root.add_child(glyphActor(Glyph.bluetooth, 18));
    root.add_child(textCol);
    return root;
}

export function buildPrivacyView(payload) {
    const cam = payload?.camera
        ? glyphActor(Glyph.camera, 14)
        : new St.Widget({width: 1, height: 1});
    const mic = payload?.mic
        ? glyphActor(Glyph.mic, 14)
        : new St.Widget({width: 1, height: 1});
    const root = splitChrome({leading: cam, trailing: mic});
    root.update = next => {
        root.leading.replace(next?.camera
            ? glyphActor(Glyph.camera, 14)
            : new St.Widget({width: 1, height: 1}));
        root.trailing.replace(next?.mic
            ? glyphActor(Glyph.mic, 14)
            : new St.Widget({width: 1, height: 1}));
    };
    return root;
}

export function buildRecordingView(payload, _clockText, expanded) {
    if (expanded) {
        let time = 'Recording';
        if (payload?.seconds != null) {
            const minutes = Math.floor(payload.seconds / 60);
            const seconds = payload.seconds % 60;
            time = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
        const title = label(time, 'dynamic-island-title');
        const root = new St.BoxLayout({
            style_class: 'dynamic-island-recording dynamic-island-system',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        root.add_child(glyphActor(Glyph.record, 16));
        root.add_child(title);
        root.update = next => {
            if (next?.seconds != null) {
                const minutes = Math.floor(next.seconds / 60);
                const seconds = next.seconds % 60;
                title.text = `${minutes}:${String(seconds).padStart(2, '0')}`;
            }
        };
        return root;
    }

    const dot = new St.Widget({style_class: 'dynamic-island-rec-dot', width: 8, height: 8});
    let recText = 'REC';
    if (payload?.seconds != null) {
        const minutes = Math.floor(payload.seconds / 60);
        const seconds = payload.seconds % 60;
        recText = `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    const rec = label(recText, 'dynamic-island-rec-time');
    const root = splitChrome({leading: dot, trailing: rec});
    root.add_style_class_name('dynamic-island-recording');
    root.update = next => {
        if (next?.seconds != null) {
            const minutes = Math.floor(next.seconds / 60);
            const seconds = next.seconds % 60;
            rec.text = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
    };
    return root;
}

export function buildView(activity, clockText) {
    const {kind, payload, expanded} = activity;
    switch (kind) {
    case Kind.MEDIA:
        return expanded
            ? buildMediaExpanded(payload)
            : buildMediaCompact(payload);
    case Kind.VOLUME:
    case Kind.BRIGHTNESS:
    case Kind.MUTE:
        return buildOsdView({...payload, kind});
    case Kind.CHARGING:
        return buildChargingView(payload);
    case Kind.BLUETOOTH:
        return buildBluetoothView(payload);
    case Kind.PRIVACY:
        return buildPrivacyView(payload);
    case Kind.RECORDING:
        return buildRecordingView(payload, clockText, expanded);
    case Kind.IDLE:
    default:
        return buildIdleView();
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

export const Glyph = {
    play: 'play',
    pause: 'pause',
    prev: 'prev',
    next: 'next',
    speakerMuted: 'speaker-muted',
    speakerLow: 'speaker-low',
    speakerHigh: 'speaker-high',
    brightness: 'brightness',
    mic: 'mic',
    micMuted: 'mic-muted',
    battery: 'battery',
    batteryCharge: 'battery-charge',
    bluetooth: 'bluetooth',
    camera: 'camera',
    record: 'record',
    focus: 'focus',
};

export function mediaPlayGlyph(playing) {
    return playing ? Glyph.pause : Glyph.play;
}

export function volumeGlyph(level) {
    if (level == null)
        return Glyph.speakerHigh;
    if (level <= 0.01)
        return Glyph.speakerMuted;
    if (level < 0.5)
        return Glyph.speakerLow;
    return Glyph.speakerHigh;
}

export function osdGlyph(kind, level) {
    if (kind === 'brightness')
        return Glyph.brightness;
    if (kind === 'mute')
        return level === 0 ? Glyph.micMuted : Glyph.mic;
    return volumeGlyph(level);
}

function fillWhite(cr, a = 1) {
    cr.setSourceRGBA(1, 1, 1, a);
}

function fillColor(cr, color) {
    if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) {
        fillWhite(cr);
        return;
    }
    const value = Number.parseInt(color.slice(1), 16);
    cr.setSourceRGBA(
        ((value >> 16) & 0xff) / 255,
        ((value >> 8) & 0xff) / 255,
        (value & 0xff) / 255,
        1);
}

function roundedRect(cr, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

/** Filled SF-style marks. `cr` is a Cairo context; origin is the glyph box. */
export function paintGlyph(cr, kind, size, color = null) {
    const s = Math.max(8, Number(size) || 16);
    fillColor(cr, color);
    cr.save();
    cr.translate(s * 0.12, s * 0.12);
    const u = s * 0.76;

    switch (kind) {
    case Glyph.pause: {
        roundedRect(cr, u * 0.18, u * 0.12, u * 0.22, u * 0.76, u * 0.06);
        cr.fill();
        roundedRect(cr, u * 0.60, u * 0.12, u * 0.22, u * 0.76, u * 0.06);
        cr.fill();
        break;
    }
    case Glyph.play: {
        cr.moveTo(u * 0.22, u * 0.10);
        cr.lineTo(u * 0.88, u * 0.50);
        cr.lineTo(u * 0.22, u * 0.90);
        cr.closePath();
        cr.fill();
        break;
    }
    case Glyph.prev:
        cr.rectangle(u * 0.08, u * 0.18, u * 0.12, u * 0.64);
        cr.fill();
        cr.moveTo(u * 0.88, u * 0.12);
        cr.lineTo(u * 0.28, u * 0.50);
        cr.lineTo(u * 0.88, u * 0.88);
        cr.closePath();
        cr.fill();
        break;
    case Glyph.next:
        cr.rectangle(u * 0.80, u * 0.18, u * 0.12, u * 0.64);
        cr.fill();
        cr.moveTo(u * 0.12, u * 0.12);
        cr.lineTo(u * 0.72, u * 0.50);
        cr.lineTo(u * 0.12, u * 0.88);
        cr.closePath();
        cr.fill();
        break;
    case Glyph.speakerMuted:
    case Glyph.speakerLow:
    case Glyph.speakerHigh: {
        cr.moveTo(u * 0.08, u * 0.38);
        cr.lineTo(u * 0.32, u * 0.38);
        cr.lineTo(u * 0.52, u * 0.18);
        cr.lineTo(u * 0.52, u * 0.82);
        cr.lineTo(u * 0.32, u * 0.62);
        cr.lineTo(u * 0.08, u * 0.62);
        cr.closePath();
        cr.fill();
        if (kind !== Glyph.speakerMuted) {
            cr.setLineWidth(Math.max(1.2, u * 0.08));
            cr.setLineCap(1);
            cr.arc(u * 0.52, u * 0.50, u * 0.22, -0.7, 0.7);
            cr.stroke();
            if (kind === Glyph.speakerHigh) {
                cr.arc(u * 0.52, u * 0.50, u * 0.38, -0.7, 0.7);
                cr.stroke();
            }
        } else {
            cr.setLineWidth(Math.max(1.4, u * 0.09));
            cr.moveTo(u * 0.62, u * 0.28);
            cr.lineTo(u * 0.90, u * 0.72);
            cr.stroke();
        }
        break;
    }
    case Glyph.brightness: {
        cr.arc(u * 0.50, u * 0.50, u * 0.18, 0, Math.PI * 2);
        cr.fill();
        cr.setLineWidth(Math.max(1.3, u * 0.08));
        cr.setLineCap(1);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            cr.moveTo(u * 0.50 + Math.cos(a) * u * 0.30, u * 0.50 + Math.sin(a) * u * 0.30);
            cr.lineTo(u * 0.50 + Math.cos(a) * u * 0.44, u * 0.50 + Math.sin(a) * u * 0.44);
            cr.stroke();
        }
        break;
    }
    case Glyph.mic:
    case Glyph.micMuted: {
        roundedRect(cr, u * 0.36, u * 0.08, u * 0.28, u * 0.48, u * 0.14);
        cr.fill();
        cr.setLineWidth(Math.max(1.4, u * 0.09));
        cr.arc(u * 0.50, u * 0.42, u * 0.28, 0.15, Math.PI - 0.15);
        cr.stroke();
        cr.moveTo(u * 0.50, u * 0.70);
        cr.lineTo(u * 0.50, u * 0.84);
        cr.stroke();
        cr.moveTo(u * 0.34, u * 0.84);
        cr.lineTo(u * 0.66, u * 0.84);
        cr.stroke();
        if (kind === Glyph.micMuted) {
            cr.moveTo(u * 0.18, u * 0.20);
            cr.lineTo(u * 0.82, u * 0.84);
            cr.stroke();
        }
        break;
    }
    case Glyph.battery:
    case Glyph.batteryCharge: {
        roundedRect(cr, u * 0.08, u * 0.28, u * 0.72, u * 0.44, u * 0.08);
        cr.setLineWidth(Math.max(1.4, u * 0.08));
        cr.stroke();
        roundedRect(cr, u * 0.82, u * 0.40, u * 0.10, u * 0.20, u * 0.04);
        cr.fill();
        if (kind === Glyph.batteryCharge) {
            cr.moveTo(u * 0.48, u * 0.22);
            cr.lineTo(u * 0.32, u * 0.52);
            cr.lineTo(u * 0.46, u * 0.52);
            cr.lineTo(u * 0.38, u * 0.78);
            cr.lineTo(u * 0.58, u * 0.44);
            cr.lineTo(u * 0.44, u * 0.44);
            cr.closePath();
            cr.fill();
        } else {
            roundedRect(cr, u * 0.16, u * 0.36, u * 0.48, u * 0.28, u * 0.04);
            cr.fill();
        }
        break;
    }
    case Glyph.bluetooth: {
        cr.setLineWidth(Math.max(1.6, u * 0.10));
        cr.setLineJoin(0);
        cr.moveTo(u * 0.32, u * 0.22);
        cr.lineTo(u * 0.68, u * 0.78);
        cr.lineTo(u * 0.50, u * 0.92);
        cr.lineTo(u * 0.50, u * 0.08);
        cr.lineTo(u * 0.68, u * 0.22);
        cr.lineTo(u * 0.32, u * 0.78);
        cr.stroke();
        break;
    }
    case Glyph.camera: {
        roundedRect(cr, u * 0.08, u * 0.28, u * 0.84, u * 0.52, u * 0.10);
        cr.fill();
        fillWhite(cr, 0);
        cr.setSourceRGB(0, 0, 0);
        cr.arc(u * 0.52, u * 0.54, u * 0.16, 0, Math.PI * 2);
        cr.fill();
        fillWhite(cr);
        cr.arc(u * 0.52, u * 0.54, u * 0.09, 0, Math.PI * 2);
        cr.fill();
        roundedRect(cr, u * 0.22, u * 0.18, u * 0.22, u * 0.12, u * 0.04);
        cr.fill();
        break;
    }
    case Glyph.record:
        cr.setSourceRGB(1, 0.27, 0.23);
        cr.arc(u * 0.50, u * 0.50, u * 0.34, 0, Math.PI * 2);
        cr.fill();
        break;
    case Glyph.focus:
        cr.arc(u * 0.46, u * 0.48, u * 0.33, 0, Math.PI * 2);
        cr.fill();
        cr.setSourceRGB(0, 0, 0);
        cr.arc(u * 0.60, u * 0.36, u * 0.30, 0, Math.PI * 2);
        cr.fill();
        break;
    default:
        cr.arc(u * 0.50, u * 0.50, u * 0.28, 0, Math.PI * 2);
        cr.fill();
    }

    cr.restore();
}

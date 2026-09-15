// SPDX-License-Identifier: GPL-3.0-or-later

const CONTROL_CLASSES = [
    'dynamic-island-icon-button',
    'is-compact-play',
    'is-volume-mute',
    'dynamic-island-seek',
    'dynamic-island-slider',
    'dynamic-island-media-volume',
    'dynamic-island-output',
    'dynamic-island-sink-row',
];

function hasControlClass(actor) {
    for (const styleClass of CONTROL_CLASSES) {
        try {
            if (actor?.has_style_class_name?.(styleClass))
                return true;
        } catch {
            // The event source can be a plain Clutter actor.
        }
    }
    return false;
}

export function isControlActor(source, capsule, isButton = () => false) {
    const visited = new Set();
    let actor = source ?? null;

    while (actor && actor !== capsule && !visited.has(actor)) {
        visited.add(actor);
        if (actor._dynamicIslandControl || isButton(actor) || hasControlClass(actor))
            return true;
        try {
            actor = actor.get_parent?.() ?? null;
        } catch {
            return false;
        }
    }
    return false;
}

export function isControlTarget(event, capsule, isButton) {
    let source = null;
    try {
        source = event?.get_source?.() ?? null;
    } catch {
        return false;
    }
    return isControlActor(source, capsule, isButton);
}

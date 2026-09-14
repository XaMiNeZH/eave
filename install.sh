#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail

UUID="dynamic-island@xaminezh.xyz"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if ! command -v glib-compile-schemas >/dev/null; then
    echo "glib-compile-schemas is required. On Fedora: sudo dnf install glib2" >&2
    exit 1
fi

glib-compile-schemas "${ROOT}/src/schemas"

mkdir -p "${DEST}"
if command -v rsync >/dev/null; then
    rsync -a --delete --exclude '.git' "${ROOT}/src/" "${DEST}/"
else
    rm -rf "${DEST}"
    mkdir -p "${DEST}"
    cp -a "${ROOT}/src/." "${DEST}/"
fi

glib-compile-schemas "${DEST}/schemas"

echo "Installed to ${DEST}"
echo

if command -v gnome-extensions >/dev/null; then
    gnome-extensions enable "${UUID}" 2>/dev/null || true
    echo "Settings (alignment, clock, timeouts) apply immediately. No logout."
    echo "Code changes need a fresh GNOME Shell process. Prefer a nested window:"
    echo "  ./tools/try.sh"
    echo "That keeps this session and your apps open. Log out only as a last resort, then:"
    echo "  gnome-extensions enable ${UUID}"
else
    echo "gnome-extensions CLI not found. Enable the extension from GNOME Extensions."
    echo "To test code changes without logging out, run ./tools/try.sh on Fedora GNOME."
fi

echo
echo "Right-click the pill to open the GNOME calendar. Try:"
echo "  notify-send 'Eave' 'Hello from Fedora'"
echo "  wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+"

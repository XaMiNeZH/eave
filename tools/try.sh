#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Open a nested GNOME Shell window with this extension installed.
# Your current Wayland session stays open. No logout required.
set -euo pipefail

UUID="dynamic-island@xaminezh.xyz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"${ROOT}/install.sh"

shell_major() {
    gnome-shell --version 2>/dev/null | awk '{print int($3)}' || echo 0
}

has_flag() {
    gnome-shell --help 2>&1 | grep -q -- "$1"
}

need_devkit() {
    [[ "$(shell_major)" -ge 49 ]] || has_flag --devkit
}

if ! command -v gnome-shell >/dev/null; then
    echo "gnome-shell is not on PATH. Run this on the Fedora GNOME machine." >&2
    exit 1
fi

if need_devkit && [[ ! -x /usr/libexec/mutter-devkit ]] && ! command -v mutter-devkit >/dev/null; then
    echo "GNOME 49+ needs a windowed test shell from mutter-devkit." >&2
    echo "  sudo dnf install mutter-devkit" >&2
    exit 1
fi

echo
echo "A nested GNOME window will open. This session and your apps stay as they are."
echo "If the island is missing inside that window, open a terminal there and run:"
echo "  gnome-extensions enable ${UUID}"
echo "Close the nested window when you are done."
echo

if has_flag --devkit; then
    exec dbus-run-session -- gnome-shell --devkit --wayland
fi
if has_flag --nested; then
    exec dbus-run-session -- gnome-shell --nested --wayland
fi

echo "This gnome-shell build has neither --devkit nor --nested." >&2
echo "Install mutter-devkit (Fedora 43+) or log out once as a last resort." >&2
exit 1

#!/usr/bin/env python3
"""
Build script for Limited Media Tracker.

Version format: YYYY.QUARTER.BUILD
  - YYYY    = current year
  - QUARTER = current calendar quarter (1–4)
  - BUILD   = auto-incrementing integer, resets to 0 when year or quarter changes

Version state is stored in version.json.
The resolved version string is written back into manifest.json before packaging.
"""

import datetime
import json
import os
import sys
import zipfile

VERSION_FILE  = "version.json"
MANIFEST_FILE = "manifest.json"
OUTPUT_DIR    = "."   # change to "dist" etc. if preferred

EXTENSION_FILES = [
    "manifest.json",
    "background.js",
    "launcher.js",
    "popup-launcher.html",
    "window.html",
    "window.js",
    "icon-16.png",
    "icon-32.png",
    "icon-96.png",
    "LICENSE",
]

# ── Version helpers ────────────────────────────────────────────────────────────

def current_period():
    now = datetime.date.today()
    year = str(now.year)
    quarter = str((now.month - 1) // 3 + 1)
    return year, quarter


def load_version():
    if not os.path.exists(VERSION_FILE):
        return {}
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_version(data):
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def next_version():
    year, quarter = current_period()
    data = load_version()

    year_data = data.get(year, {})
    # Reset build counter if this is a new year or new quarter
    build = year_data.get(quarter, -1) + 1

    # Persist
    data[year] = {quarter: build}
    save_version(data)

    return f"{year}.{quarter}.{build:03d}", data


# ── manifest.json update ───────────────────────────────────────────────────────

def update_manifest(version_str):
    with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    manifest["version"] = version_str
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


# ── Packaging ─────────────────────────────────────────────────────────────────

def build_package(version_str):
    missing = [fn for fn in EXTENSION_FILES if not os.path.exists(fn)]
    if missing:
        print(f"ERROR: missing files: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    out_name = f"limited-media-tracker-{version_str}.zip"
    out_path = os.path.join(OUTPUT_DIR, out_name)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for fn in EXTENSION_FILES:
            zf.write(fn)
            print(f"  + {fn}")

    return out_path


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    version_str, _ = next_version()
    print(f"Version: {version_str}")

    print(f"Updating {MANIFEST_FILE}...")
    update_manifest(version_str)

    print("Packing extension files:")
    out_path = build_package(version_str)

    print(f"\nDone: {out_path}")


if __name__ == "__main__":
    main()

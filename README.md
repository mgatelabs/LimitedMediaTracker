# Media Tracker

A Firefox extension that watches every HTTP request your browser makes while you browse, lets you organise those requests into named groups, and exports the result — ready to paste into another tool.

Built for tracking streaming media (M3U8 playlists, VTT subtitles, audio-only streams, video segments) but works with any request type.

---

## Part of the Limited Media Server ecosystem

This extension is a companion tool for the **Limited Media Server** project — a self-hosted, private-network media platform for streaming video, reading manga, browsing music, and downloading content from sources like YouTube and M3U8 streams.

| Project | Description |
|---------|-------------|
| [LimitedMediaServer](https://github.com/mgatelabs/LimitedMediaServer) | Python-based backend server — handles media processing, streaming, downloads, and user permissions |
| [LimitedMediaServerSite](https://github.com/mgatelabs/LimitedMediaServerSite) | Angular web frontend — the browser UI for your media library, connects to the backend server |
| [LimitedMediaTracker](https://github.com/mgatelabs/LimitedMediaTracker) _(this repo)_ | Firefox extension — captures M3U8/VTT URLs while you browse and exports them for the server to process |

### Typical workflow

1. Browse to a streaming site that serves content via M3U8 (HLS)
2. Media Tracker captures the playlist and subtitle URLs in the background
3. Organise the captured URLs into episode groups (e.g. `S01E01`, `S01E02`)
4. Export the groups to your clipboard as base64 JSON
5. Paste into Limited Media Server Site to queue the content for download or processing

---

## What it does

- **Captures requests** in real time as you browse — URLs, status codes, headers, origin info
- **Filters** the list by type: M3U8 + VTT, streams, subtitles, video, audio, XHR, and more
- **Groups** requests by name (e.g. one group per TV episode)
- **Assigns** a request to a group with a single click
- **Sorts** items within a group by timestamp with the ⇅ button
- **Exports** groups as compact base64 JSON (clipboard) or Markdown (file download)
- **Generates** episode groups in bulk (S01E01 → S01E12 in one click), including paired M3U8+VTT and M3U8+Audio+VTT layouts
- **Organises** groups under folders imported from the companion Media Browser app
- **Excludes** noise (ads, trackers, scripts) via a simple keyword filter

---

## Screenshots

**Main tracker window** — live request capture on the left, group management on the right

![window](./window.png)

**Generate panel** — bulk-create episode groups in one click

![generate](./generate.png)


**Preferences dialog** — configure exclusions, known folders, and import/export settings

![preferences](./preferences.png)

**Quick start walkthrough** — step-by-step flow for new users

![steps1](./steps1.png)

**Import server data** — paste base64 folder metadata from the companion app

![importserver](./importserver.png)

---

## Installation

Available on the Firefox Add-ons store:
**[addons.mozilla.org/en-US/firefox/addon/limited-media-tracker/](https://addons.mozilla.org/en-US/firefox/addon/limited-media-tracker/)**

To load the development version temporarily in Firefox:

1. Open `about:debugging` in Firefox
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select the `manifest.json` file from this folder

Source code: [github.com/mgatelabs/LimitedMediaTracker](https://github.com/mgatelabs/LimitedMediaTracker)

---

## Quick start

1. Click the extension icon — a resizable tracker window opens
2. Browse to a page that streams video
3. The left panel fills with captured requests
4. Use the **M3U8 + VTT** filter to focus on stream and subtitle URLs
5. Create a group on the right (e.g. `S01E01`)
6. Click a request row to select it, then click the group button to assign it
7. Click **Export JSON** to copy the result to your clipboard

---

## UI overview

```
┌─────────────────────────────┬──────────────────────────────────────┐
│  [Clear] [Pause] [Prefs]    │  [Name] [Type▼] [+] [Generate]      │
│  [Search…] [Filter ▼]       │  [Folder▼] [#] [Filled] [Recent]    │
│                             │  [Export JSON ▾] [Clear Filled ▾]   │
├─────────────────────────────┼──────────────────────────────────────┤
│                             │  ── My Show ──────────────────────   │
│  STREAM  host/…/master.m3u8 │  ┌─ S01E01  1 items Auto ⇅ ⌫ × ──┐ │
│  ↳ https://example.com      │  │  [✅ M3U8 (1)]  [VTT]          │ │
│                             │  └────────────────────────────────┘ │
│  SUBTITLE host/…/subs.vtt   │  ┌─ S01E02  Auto ⇅ ⌫ × ───────────┐ │
│  ↳ https://example.com      │  │  [M3U8]  [VTT]                 │ │
│                             │  └────────────────────────────────┘ │
├─────────────────────────────┤                                      │
│  URL     https://…          │                                      │
│  Status  200                │  Requests: 42 | Groups: 2           │
│  Origin  https://…          │                                      │
└─────────────────────────────┴──────────────────────────────────────┘
```

**Left panel** — captured requests, newest first. Click a row to select it and see full details in the pane below. Requests already assigned to a group are hidden from this list automatically.

**Right panel** — your groups. Each card shows the group name, item count, and the following buttons:

| Button | Appears on | Action |
|--------|-----------|--------|
| **Auto** | M3U8 & VTT groups only | Auto-assigns the newest unassigned STREAM and SUBTITLE from the list |
| **⇅** | All groups | Sorts the group's items by timestamp (oldest first) |
| **⌫** | All groups | Clears all items from the group while keeping the group itself |
| **×** | All groups | Deletes the group entirely |

The **#** button next to the Folder dropdown scrolls the group panel to the currently selected folder's section header.

---

## Group types

Each group has a type that determines how its requests are displayed and categorised.

| Type | Display | Purpose |
|------|---------|---------|
| `m3u8_vtt` | M3U8 & VTT | HLS stream paired with a subtitle track (the most common type) |
| `m3u8_audio` | M3U8 & Audio | Audio-only M3U8 stream (no subtitle bucket, no Auto button) |
| `file` | File | Generic file — accepts any request, no category filtering |
| `mp4` | MP4 | MP4 video files |
| `mp3` | MP3 | MP3 audio files |
| `vtt` | VTT | Subtitle files only |

---

## Generate dialog

Opens with the **Generate** button. Bulk-creates numbered episode groups for a season.

| Field | Description |
|-------|-------------|
| Season | Two-digit season number (01–99) |
| Episode from | Starting episode (default 01) |
| Episode to | Ending episode (default 12) |
| Type | Group type for all created groups (see types above, plus the special paired options below) |
| Extension | Optional suffix appended to each name (e.g. `J` produces `S01E01J`) |

### Special generate types

| Type option | What is created |
|-------------|----------------|
| M3U8 & VTT | One `m3u8_vtt` group per episode |
| M3U8 & Audio | One `m3u8_audio` group per episode |
| **M3U8 + Audio + VTT (paired)** | Two groups per episode: `S01E01` (`m3u8_vtt`) **and** `S01E01~Audio` (`m3u8_audio`) |

---

## Groups and folders

Groups can optionally belong to a **folder** — a named container imported from the Media Browser app. Folders appear as section headers in the groups panel, sorted alphabetically. The **Default Folder** dropdown in the toolbar pre-assigns every new group you create to that folder.

The **#** button next to the dropdown scrolls immediately to that folder's section header without changing the selection.

To import a folder: open **Preferences → Known Folders** and paste the base64 string copied from the Media Browser.

---

## Preferences

Open with the **Preferences** button in the toolbar.

- **Exclusions** — semicolon-separated keywords; any request URL containing one of them is hidden from the list and ignored by capture (e.g. `master.m3u8;/ads/;tracking.js`)
- **Known Folders** — import folder metadata from the companion app
- **Import / Export** — save and restore your full preferences, folders, and groups as a JSON file download, or export a Markdown summary to the clipboard

---

## Export

Two export surfaces exist:

**Main toolbar (groups only)**
- **Export JSON** — copies all filled groups as compact base64 JSON to the clipboard
- **Copy JSON (clipboard)** (dropdown) — same as above
- **Download Markdown** (dropdown) — downloads a `.md` file with a human-readable table of all filled groups and their items

**Preferences dialog (full snapshot)**
- **Export JSON** — downloads a `.json` file containing exclusions, folders, and all groups with full request data — use this for backups
- **Export MD** — copies a Markdown summary of exclusions, folders, and groups to the clipboard

See [export-format.md](export-format.md) for the exact JSON structure of the clipboard/download formats.

---

## Context menu

Right-click anywhere on a page for two quick actions:

- **Open Media Tracker** — opens the tracker window
- **Clear Captured Requests** — wipes the request log immediately

---

## Technical docs

| Document | Contents |
|----------|----------|
| [export-format.md](export-format.md) | JSON export format — group fields, item fields, encoding |
| [import.md](import.md) | Preferences snapshot format, folder import, merge behaviour |
| [storage.md](storage.md) | Where and how data is stored — all in `chrome.storage.local` |
| [processing.md](processing.md) | Request capture pipeline, category detection, message API |

---

## Files

| File | Role |
|------|------|
| `manifest.json` | Extension manifest — permissions and entry points |
| `background.js` | Service worker — captures requests, manages groups |
| `popup-launcher.html` / `launcher.js` | Opens the main window when toolbar icon is clicked |
| `window.html` | Full tracker UI |
| `window.js` | All UI logic — rendering, filtering, assigning, exporting |

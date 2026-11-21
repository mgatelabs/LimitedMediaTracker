# Export format

This document covers the **main toolbar export** — the compact format used to transfer group data to the Limited Media Server Site. For the full preferences snapshot format (used in Preferences → Import / Export), see [import.md](import.md).

---

## JSON export (clipboard)

Clicking **Export JSON** (or **Copy JSON** from the dropdown) serialises all groups that have at least one item assigned. The result is written to the clipboard as a **base64-encoded** JSON string.

### Encoding

```js
btoa(unescape(encodeURIComponent(JSON.stringify(data))))
```

The button briefly shows "Copied!" on success. If clipboard access is denied, an alert shows the raw string.

### Top-level structure

The decoded value is a JSON **array** — one object per filled group, in group-order:

```json
[
  { "n": "S01E01", "t": "m3u8_vtt",   "folder_id": "f7a3c91d", "items": [ … ] },
  { "n": "S01E02", "t": "m3u8_vtt",   "folder_id": "f7a3c91d", "items": [ … ] },
  { "n": "S01E01-A", "t": "m3u8_audio", "folder_id": "f7a3c91d", "items": [ … ] }
]
```

Empty groups (no items assigned) are silently omitted.

### Group object

| Field | Type | Description |
|-------|------|-------------|
| `n` | string | Group display name (e.g. `S01E01`) |
| `t` | string | Group type — see table below |
| `folder_id` | string | Folder ID, or `""` if the group has no folder |
| `items` | array | Assigned request objects (see below) |

### Group types (`t`)

| Value | Meaning |
|-------|---------|
| `m3u8_vtt` | HLS stream + subtitle track |
| `m3u8_audio` | Audio-only HLS stream |
| `file` | Generic file (any request type) |
| `mp4` | MP4 video |
| `mp3` | MP3 audio |
| `vtt` | Subtitle file |

### Item object

Each entry in `items` represents one assigned HTTP request:

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Media type: `mediaType` if set, otherwise `category` (e.g. `STREAM`, `SUBTITLE`, `AUDIO`, `VIDEO`) |
| `url` | string | Full request URL |
| `method` | string | HTTP method (`GET`, `POST`, …) |
| `origin` | string | Resolved origin — see resolution order below |
| `referer` | string | `Referer` request header, or `""` if absent |
| `originUrl` | string | Firefox `originUrl` metadata (the page that initiated the request) |
| `documentUrl` | string | Firefox `documentUrl` metadata (the owning document URL) |

### Origin resolution order

The `origin` field is resolved at export time:

1. Actual `Origin` request header (present on CORS requests)
2. Scheme + host extracted from `originUrl`
3. Scheme + host extracted from `documentUrl`
4. `""` if nothing is available

### Full example

```json
[
  {
    "n": "S01E01",
    "t": "m3u8_vtt",
    "folder_id": "f7a3c91d",
    "items": [
      {
        "t":           "STREAM",
        "url":         "https://cdn.example.com/hls/master.m3u8",
        "method":      "GET",
        "origin":      "https://example.com",
        "referer":     "https://example.com/watch/s01e01",
        "originUrl":   "https://example.com/watch/s01e01",
        "documentUrl": "https://example.com/watch/s01e01"
      },
      {
        "t":           "SUBTITLE",
        "url":         "https://cdn.example.com/subs/en.vtt",
        "method":      "GET",
        "origin":      "https://example.com",
        "referer":     "https://example.com/watch/s01e01",
        "originUrl":   "https://example.com/watch/s01e01",
        "documentUrl": "https://example.com/watch/s01e01"
      }
    ]
  },
  {
    "n": "S01E01-A",
    "t": "m3u8_audio",
    "folder_id": "f7a3c91d",
    "items": [
      {
        "t":           "STREAM",
        "url":         "https://cdn.example.com/audio/master.m3u8",
        "method":      "GET",
        "origin":      "https://example.com",
        "referer":     "https://example.com/watch/s01e01",
        "originUrl":   "https://example.com/watch/s01e01",
        "documentUrl": "https://example.com/watch/s01e01"
      }
    ]
  }
]
```

---

## Markdown export (file download)

**Download Markdown** from the dropdown saves a `.md` file. The filename is `mediatracker-YYYY-MM-DD_HH-MM.md`.

The file contains one section per filled group, with a pipe table of all assigned items:

```markdown
# Media Tracker Export

_Generated: 11/15/2026, 14:32:00_

## S01E01 (m3u8_vtt)
_Folder: My Show (f7a3c91d)_

| # | Type | URL | Method | Origin | Referer |
|---|------|-----|--------|--------|---------|
| 1 | STREAM | `https://cdn.example.com/hls/master.m3u8` | GET | https://example.com | https://example.com/watch/s01e01 |
| 2 | SUBTITLE | `https://cdn.example.com/subs/en.vtt` | GET | https://example.com | - |

## S01E01-A (m3u8_audio)
_Folder: My Show (f7a3c91d)_

| # | Type | URL | Method | Origin | Referer |
|---|------|-----|--------|--------|---------|
| 1 | STREAM | `https://cdn.example.com/audio/master.m3u8` | GET | https://example.com | - |
```

The `_Folder: …_` line is omitted for groups with no folder. The `Referer` column shows `-` when no referer was captured.

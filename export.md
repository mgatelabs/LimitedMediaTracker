# Export formats

## JSON export (default)

Clicking **Export** (or **Export JSON** from the dropdown) serialises all groups that have at least one item. The result is copied to the clipboard as a **base64-encoded** JSON string.

### Encoding

```js
btoa(unescape(encodeURIComponent(JSON.stringify(data))))
```

Paste the base64 string into any tool that accepts it. The button briefly shows "Copied!" on success, or falls back to an alert with the string if clipboard access is denied.

### Structure

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
        "referer":     "https://example.com/watch/123",
        "originUrl":   "https://example.com/watch/123",
        "documentUrl": "https://example.com/watch/123"
      },
      {
        "t":     "SUBTITLE",
        "url":   "https://cdn.example.com/subs/en.vtt",
        "method": "GET",
        "origin": "https://example.com",
        ...
      }
    ]
  }
]
```

### Group fields

| Field | Value |
|-------|-------|
| `n` | Group display name (e.g. `S01E01`) |
| `t` | Group type: `m3u8_vtt` or `file` |
| `folder_id` | Folder ID string, or `""` if none |
| `items` | Array of assigned request objects |

### Item fields

| Field | Source |
|-------|--------|
| `t` | `mediaType` if set, otherwise `category` |
| `url` | Full request URL |
| `method` | HTTP method (`GET`, `POST`, …) |
| `origin` | Actual `Origin` request header (CORS requests); resolved to scheme+host from metadata if header absent |
| `referer` | Actual `Referer` request header; `""` if absent |
| `originUrl` | Firefox `originUrl` metadata (the initiating page URL) |
| `documentUrl` | Firefox `documentUrl` metadata (the owning document URL) |

---

## Markdown export

**Export Markdown** from the dropdown copies a human-readable Markdown table to the clipboard — useful for pasting into notes, issues, or documentation.

```markdown
# Media Tracker Export

_Generated: 29/06/2026, 14:32:00_

## S01E01 (m3u8_vtt)
_Folder: My Show (f7a3c91d)_

| # | Type | URL | Method | Origin | Referer |
|---|------|-----|--------|--------|---------|
| 1 | STREAM | `https://cdn.example.com/hls/master.m3u8` | GET | https://example.com | https://example.com/watch/123 |
| 2 | SUBTITLE | `https://cdn.example.com/subs/en.vtt` | GET | https://example.com | - |
```

The folder line (`_Folder: …_`) is omitted if the group has no folder assigned. Empty groups are omitted from both export formats.

---

## What gets exported

Both formats include only groups that have at least one item assigned. Empty groups are silently skipped.

The `origin` field is resolved in this order:
1. Actual `Origin` request header (present on CORS requests)
2. Scheme + host extracted from `originUrl` metadata
3. Scheme + host extracted from `documentUrl` metadata
4. `""` if nothing is available

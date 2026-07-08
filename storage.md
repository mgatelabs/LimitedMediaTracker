# Storage

All persistent data is stored in `chrome.storage.local`, accessible from both the background service worker and the tracker window. `localStorage` is not used.

---

## All keys — `chrome.storage.local`

| Key | Written by | Description |
|-----|-----------|-------------|
| `groups` | background | Object mapping storage key → group object |
| `groupOrder` | background | Array of storage keys in creation order |
| `mediatracker_exclude` | window | Semicolon-delimited URL exclusion keywords |
| `mediatracker_folders` | window | JSON-encoded array of known folder objects |
| `mediatracker_filter` | window | Last-used filter dropdown value |

---

## Groups

Groups and their request lists are persisted by the background service worker after every mutation (create, delete, rename, add item, clear items, clear folder).

### Group object

```js
{
  displayName: "S01E01",          // human-readable name (may differ from storage key)
  type:        "m3u8_vtt",        // "m3u8_vtt" | "file"
  folderId:    "f7a3c91d",        // "" = no folder
  created:     "2026-06-29T…",    // ISO-8601 timestamp
  requests: [
    {
      url:          "https://…",
      method:       "GET",
      type:         "STREAM",
      category:     "STREAM",
      mediaType:    "STREAM",
      timestamp:    1234567890,
      statusCode:   200,
      originUrl:    "https://…",
      documentUrl:  "https://…",
      referer:      "https://…",
      originHeader: "https://…"
    }
  ]
}
```

### Storage key format

When a group has no folder: the key equals the display name (e.g. `S01E01`).
When a group has a folder: the key is `displayName~folderId` (e.g. `S01E01~f7a3c91d`).

This allows two groups with the same name to exist in different folders without colliding in the object. Because `~` is used as the separator, group names are validated to disallow it — the UI rejects names containing `~` and `createGroup` returns `null` for them.

---

## Preferences

Preference keys are read and written by the tracker window on load and on save. On first launch after an upgrade from an older version, any values found in `localStorage` under these keys are automatically migrated to `chrome.storage.local` and the old keys are removed.

| Key | Format | Description |
|-----|--------|-------------|
| `mediatracker_exclude` | `"pattern1;pattern2"` | Semicolon-delimited URL exclusion keywords |
| `mediatracker_folders` | JSON array string | Known folder objects (id, name, rating, info_url, preview) |
| `mediatracker_filter` | string | Last-used filter dropdown value (restored on open) |

### Filter and exclusion sync

On window load, after reading storage, both the active filter and exclusion patterns are pushed to the background service worker (`set-filter` and `set-excludes` messages) so that newly captured requests are filtered at source before entering the log.

---

## Request log

`requestLog`, `requestMap`, and `urlSet` live in memory only inside the background service worker. They are **not** persisted to storage and reset whenever the extension reloads. The window polls `getLog` every 2 seconds to stay in sync. The log is capped at 500 entries (oldest dropped first) and deduplicates by URL (repeated hits increment a `hitCount` counter on the existing entry).

---

## Data flow summary

```
Browser request
    │
    ▼
background.js (onBeforeRequest)
    │  isExcluded? → drop
    │  passesFilter? → drop
    │  urlSet dedup → increment hitCount and drop if seen
    │  extractRequestInfo() → push to requestLog (memory, max 500)
    │
    ▼ (onBeforeSendHeaders)
    Attach Referer + Origin headers to log entry
    │
    ▼ (onCompleted / onErrorOccurred)
    Update statusCode on log entry
    │
    ▼ (on user assign action)
    addRequestToGroup() → groups[key].requests.push(entry)
    saveState() → chrome.storage.local.set({ groups, groupOrder })
```

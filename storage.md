# Storage

The extension uses two separate storage mechanisms — one for groups (background-accessible) and one for preferences (window-only).

---

## Groups — `chrome.storage.local`

Groups and their request lists are persisted by the background service worker. State is saved after every mutation (create, delete, rename, add item, clear items, clear folder).

### Keys stored

| Key | Value |
|-----|-------|
| `groups` | Object mapping storage key → group object |
| `groupOrder` | Array of storage keys in creation order |

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

### Request log

`requestLog` and `requestMap` live in memory only inside the background service worker. They are **not** persisted to storage and reset whenever the extension reloads. The window polls `getLog` every 2 seconds to stay in sync.

---

## Preferences — `localStorage` (window)

Preferences are stored in the tracker window's `localStorage`. They are re-applied each time the window opens.

| Key | Format | Description |
|-----|--------|-------------|
| `mediatracker_exclude` | `"pattern1;pattern2"` | Semicolon-delimited URL exclusion keywords |
| `mediatracker_folders` | JSON array | Known folder objects (id, name, rating, info_url, preview) |
| `mediatracker_filter` | string | Last-used filter dropdown value (restored on open) |

### Exclusion sync

On window load, and whenever the exclusion list is saved, the patterns are pushed to the background service worker via a `set-excludes` message so newly captured requests are also filtered at source.

---

## Data flow summary

```
Browser request
    │
    ▼
background.js (onBeforeRequest)
    │  isExcluded? → drop
    │  extractRequestInfo() → push to requestLog (memory)
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

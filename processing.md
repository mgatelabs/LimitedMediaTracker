# Request processing

## Capture pipeline

The background service worker (`background.js`) observes every HTTP request the browser makes using the `webRequest` API.

### Listener chain

```
onBeforeRequest      → log the request (all types)
onBeforeSendHeaders  → attach Referer and Origin headers
onCompleted          → record the HTTP status code
onErrorOccurred      → set status code to -1
```

All four listeners match `<all_urls>` across these request types:

```
main_frame, sub_frame, stylesheet, script, image, font, object,
xmlhttprequest, fetch, media, eventsource, websocket, ping, other
```

`fetch` catches requests made via the Fetch API (used by hls.js, dash.js, and modern media players). `media` catches requests made directly by `<video>` and `<audio>` elements.

### Exclusion filter

Before any request is added to the log, `isExcluded(url)` checks it against the active exclusion patterns sent by the window via `set-excludes`. Excluded requests are silently dropped. Patterns are case-insensitive substring matches against the full URL.

---

## Category detection

`getCategory(url, type)` assigns one of the categories below. Request `type` is checked **first** so scripts, stylesheets, and fonts are never mis-categorised regardless of their URL.

| Request type | Category |
|---|---|
| `script` | SCRIPT |
| `stylesheet` | STYLESHEET |
| `font` | FONT |
| `image` | IMAGE |
| `main_frame` | DOCUMENT |
| `sub_frame` | iframe |
| `xmlhttprequest` | STREAM or SUBTITLE if path matches; else XHR |
| `fetch` | STREAM or SUBTITLE if path matches; else FETCH |
| `media` | MEDIA |
| anything else | Path-pattern matched → STREAM / SUBTITLE / VIDEO / AUDIO / OTHER |

Path matching strips the query string and fragment before testing (`url.split('?')[0].split('#')[0]`), preventing false positives from token parameters that contain file extensions.

---

## Media type detection

`isMediaUrl(url, requestType)` returns a specific media type string, or `false` if the request is not considered media. Matching is against the **path only**.

| Condition | mediaType |
|---|---|
| `requestType === 'media'`, audio extension in URL | `AUDIO` |
| `requestType === 'media'`, anything else | `VIDEO` |
| Path ends `.m3u8` or is `master.m3u8` | `STREAM` |
| Path ends `.mpd` | `STREAM` |
| Path ends `.vtt`, `.ttml`, `.srt` | `SUBTITLE` |
| Path ends `.mp4`, `.m4v`, `.m4s` | `VIDEO` |
| Path ends `.mp3`, `.aac`, `.m4a` | `AUDIO` |
| Path ends `.ts`, `.cmaf` | `SEGMENT` |

---

## Group management

Groups are keyed objects stored in `chrome.storage.local`. The background handles all mutations; the window communicates exclusively via messages.

### Deduplication

Group names are deduplicated **within the same folder only**. Two groups called `S01E01` can coexist as long as they belong to different folders. Normalisation strips spaces and non-alphanumeric characters before comparing (so `S01 E01` and `S01E01` are considered the same name within the same folder).

### Sequential creation

When generating multiple groups at once (Generate dialog), the window sends `group-create` messages **sequentially** using a recursive `sendNext(i)` callback. This ensures each message sees the updated `groupOrder` before the next one arrives, avoiding race conditions where parallel messages overwrite each other's state.

---

## Background message API

The window communicates with the background via `browser.runtime.sendMessage`. All messages are fire-and-response (no persistent ports).

| action | params | response |
|--------|--------|----------|
| `set-excludes` | `{ patterns: string[] }` | `{ ok: true }` |
| `getLog` | — | `{ log, count }` |
| `clearLog` | — | `{ cleared: true }` |
| `pause` | — | `{ paused: bool }` |
| `groups-get` | — | `{ groups, groupOrder }` |
| `group-create` | `{ name, type, folderId }` | `{ created: key \| null }` |
| `group-delete` | `{ name }` | `{ deleted: true }` |
| `group-rename` | `{ oldName, newName }` | `{ renamed: bool }` |
| `group-update-type` | `{ name, type }` | `{ updated: bool }` |
| `group-clear-items` | `{ name }` | `{ cleared: true }` |
| `groups-clear-folder` | `{ folderId }` | `{ cleared: true }` |
| `group-add-item` | `{ groupName, request }` | `{ added: true }` |
| `search-media` | — | `{ items, count }` |

---

## Permissions

| Permission | Why |
|------------|-----|
| `webRequest` | Observe all HTTP requests |
| `storage` | Persist groups to `chrome.storage.local` |
| `tabs` | Required by Firefox MV3 to call `browser.windows.create()` |
| `contextMenus` | Register right-click context menu items |
| `<all_urls>` host permission | Observe requests to any domain |

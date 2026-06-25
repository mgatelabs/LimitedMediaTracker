# Import

## Preferences snapshot (Import / Export)

The **Preferences → Import / Export** section lets you back up and restore everything — exclusions, known folders, and all groups with their assigned requests.

### Exporting

- **Export JSON** — copies a full snapshot as raw JSON to the clipboard
- **Export MD** — copies a human-readable Markdown summary to the clipboard (exclusions, folder list, group table with per-group request tables)

### Snapshot format (JSON)

```json
{
  "version": 1,
  "exportedAt": "2026-06-29T14:32:00.000Z",
  "exclusions": ["master.m3u8", "/ads/", "tracking.js"],
  "folders": [
    {
      "id": "f7a3c91d",
      "name": "My Show",
      "rating": 0,
      "info_url": "https://example.com/show/123",
      "preview": "/9j/..."
    }
  ],
  "groups": [
    {
      "key": "S01E01~f7a3c91d",
      "displayName": "S01E01",
      "type": "m3u8_vtt",
      "folderId": "f7a3c91d",
      "created": "2026-06-29T13:00:00.000Z",
      "requests": [ ... ]
    }
  ]
}
```

### Importing

1. Click **Import JSON…** — a textarea appears
2. Paste the previously exported JSON
3. Click **Import**

The import merges into the current state:
- **Exclusions** — replaced entirely with the snapshot values
- **Folders** — merged by `id`; existing folders with the same `id` are skipped (no overwrite)
- **Groups** — created sequentially (to preserve order); existing groups with the same name+folder are skipped

---

## Folder import (from Media Browser)

The tracker can display groups under named folder headers that come from the companion **Media Browser** app.

### How to import a folder

1. In the Media Browser, open a folder and choose **⋮ → Copy Tracker Import**
2. In the tracker, open **Preferences → Known Folders**
3. Paste the base64 string into the input and click **Import**

### Folder payload format

The base64 string decodes to a JSON object:

```json
{
  "id":       "f7a3c91d",
  "name":     "My Show",
  "rating":   4,
  "info_url": "https://example.com/show/123",
  "preview":  "/9j/..."
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier — used as the foreign key in group objects |
| `name` | Display name shown in the folder section header |
| `rating` | Numeric rating (display only) |
| `info_url` | Link to the show page (display only) |
| `preview` | Base64-encoded JPEG (32×32) used as the folder thumbnail |

Folders are deduplicated by `id`. Importing the same folder twice is a no-op.

### Deleting a folder

Click **×** next to a folder in the Known Folders list. If any groups reference that folder you are asked whether to also clear the folder assignment from those groups. Choosing "OK" sends a `groups-clear-folder` message to the background; choosing "Cancel" deletes the folder entry only (groups retain the folder ID but render under an "Unknown folder" orphan header).

### Default folder

The **Default Folder** dropdown in the right panel toolbar pre-assigns every newly created group (manual or generated) to the selected folder. Choose **No Folder** to create unfiled groups.

/* ═══════════════════════════ State ═══════════════════════════ */
var requestLog      = [];
var groups          = {};
var groupOrder      = [];
var isPaused        = false;
var selectedRequest = null;
var visibleList     = [];   // current filtered list, kept in sync for arrow navigation
var knownFolders    = [];   // loaded from localStorage — array of {id,name,preview,...}
var defaultFolderId = "";   // "" = No Selection

function $(id) { return document.getElementById(id); }

/* ═══════════════════════════ Boot ════════════════════════════ */
loadPrefs();
loadKnownFolders();
loadGroups();
refreshLog();
setInterval(refreshLog, 2000);

/* ═══════════════════════════ Known Folders ═══════════════════ */
function loadKnownFolders() {
  try {
    knownFolders = JSON.parse(localStorage.getItem("mediatracker_folders") || "[]");
  } catch(e) { knownFolders = []; }
  renderFolderDropdown();
}

function saveKnownFolders() {
  localStorage.setItem("mediatracker_folders", JSON.stringify(knownFolders));
}

function folderById(id) {
  for (var i = 0; i < knownFolders.length; i++) {
    if (knownFolders[i].id === id) return knownFolders[i];
  }
  return null;
}

function renderFolderDropdown() {
  var sel = $("defaultFolderSelect");
  var prev = sel.value;
  sel.innerHTML = '<option value="">No Selection</option>';
  knownFolders.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f.id;
    o.textContent = f.name;
    sel.appendChild(o);
  });
  // Restore previous selection if still valid
  if (prev && folderById(prev)) sel.value = prev;
  else { sel.value = ""; defaultFolderId = ""; }
}

$("defaultFolderSelect").addEventListener("change", function () {
  defaultFolderId = this.value;
});

/* ═══════════════════════════ Arrow key navigation ═══════════ */
document.addEventListener("keydown", function (e) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  // Don't hijack input/textarea focus
  var tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (!visibleList.length) return;

  e.preventDefault();

  var cur = visibleList.indexOf(selectedRequest);
  var next;
  if (e.key === "ArrowDown") {
    next = (cur < 0) ? 0 : Math.min(cur + 1, visibleList.length - 1);
  } else {
    next = (cur < 0) ? visibleList.length - 1 : Math.max(cur - 1, 0);
  }

  if (next === cur) return;
  selectedRequest = visibleList[next];
  renderRequestList();
  renderGroups();
  renderDetail();

  // Scroll selected row into view
  var el = $("requestList").querySelector("[data-vi='" + next + "']");
  if (el) el.scrollIntoView({ block: "nearest" });
});

/* ═══════════════════════════ Messaging ════════════════════════ */
function refreshLog() {
  browser.runtime.sendMessage({ action: "getLog" }, function (res) {
    if (res && res.log) requestLog = res.log;
    renderRequestList();
    updateSummary();
  });
}

function loadGroups() {
  browser.runtime.sendMessage({ action: "groups-get" }, function (res) {
    if (res) { groups = res.groups; groupOrder = res.groupOrder || []; }
    renderGroups();
    renderRequestList();   // re-filter left panel against updated assigned set
    updateSummary();
  });
}

/* ═══════════════════════════ Assigned URL index ══════════════ */
function buildAssignedUrls() {
  var set = {};
  for (var i = 0; i < groupOrder.length; i++) {
    var reqs = (groups[groupOrder[i]] || {}).requests || [];
    for (var j = 0; j < reqs.length; j++) {
      if (reqs[j].url) set[reqs[j].url] = true;
    }
  }
  return set;
}

/* ═══════════════════════════ Left panel ══════════════════════ */
function renderRequestList() {
  var filter   = $("filterSelect").value;
  var search   = $("searchInput").value.toLowerCase();
  var assigned = buildAssignedUrls();

  var list = requestLog.filter(function (r) {
    return !assigned[r.url] && !isExcluded(r.url);
  });

  if (filter === "m3u8_vtt") {
    list = list.filter(function (r) {
      var u = (r.url || "").toLowerCase();
      // Exclude scripts, stylesheets, fonts, documents regardless of URL
      var cat = r.category || "";
      if (cat === "SCRIPT" || cat === "STYLESHEET" || cat === "FONT" ||
          cat === "DOCUMENT" || cat === "iframe") return false;
      return cat === "STREAM" || cat === "SUBTITLE" ||
             u.includes(".m3u8") || u.includes(".vtt");
    });
  } else if (filter !== "all") {
    list = list.filter(function (r) { return r.category === filter; });
  }
  if (search) {
    list = list.filter(function (r) {
      return ((r.url || "").toLowerCase().includes(search)) ||
             ((r.originUrl || "").toLowerCase().includes(search)) ||
             ((r.host || "").toLowerCase().includes(search));
    });
  }

  var container = $("requestList");
  container.innerHTML = "";

  // Store for arrow-key navigation (newest first order matches DOM order)
  visibleList = [];
  var start = Math.max(0, list.length - 500);
  for (var i = list.length - 1; i >= start; i--) {
    visibleList.push(list[i]);
  }

  for (var vi = 0; vi < visibleList.length; vi++) {
    container.appendChild(buildRequestRow(visibleList[vi], vi));
  }
}

function buildRequestRow(r, vi) {
  var row = document.createElement("div");
  row.className = "request-row" + (selectedRequest === r ? " selected" : "");
  row.dataset.vi = vi;

  var badge = document.createElement("span");
  badge.className = "req-badge " + (r.category || "OTHER");
  badge.textContent = r.mediaType || r.category || "-";
  row.appendChild(badge);

  var col = document.createElement("div");
  col.className = "request-col";

  // Line 1: URL + status
  var mainLine = document.createElement("div");
  mainLine.className = "request-row-main";

  var urlSpan = document.createElement("span");
  urlSpan.className = "request-url";
  if (r.category === "STREAM")        urlSpan.classList.add("stream");
  else if (r.category === "SUBTITLE") urlSpan.classList.add("sub");
  else if (r.mediaType)               urlSpan.classList.add("media");
  urlSpan.textContent = smartUrl(r.url);
  urlSpan.title = r.url || "";
  mainLine.appendChild(urlSpan);

  var statusEl = document.createElement("span");
  var st = r.statusCode;
  statusEl.className = "req-status" + (st === -1 ? " err" : (st >= 200 && st < 400 ? " ok" : ""));
  statusEl.textContent = (st == null) ? "" : (st === -1 ? "ERR" : String(st));
  mainLine.appendChild(statusEl);

  col.appendChild(mainLine);

  // Line 2: origin — prefer originUrl, fall back to documentUrl, strip to host only
  var rawOrigin = (r.originUrl && r.originUrl !== "-") ? r.originUrl
                : (r.documentUrl && r.documentUrl !== "-") ? r.documentUrl
                : "";
  if (rawOrigin && rawOrigin !== r.url) {
    var displayOrigin = rawOrigin;
    try {
      var p = new URL(rawOrigin);
      displayOrigin = p.origin;   // scheme + host, no path
    } catch(e) {}
    var originSpan = document.createElement("div");
    originSpan.className = "request-origin";
    originSpan.textContent = "↳ " + displayOrigin;
    originSpan.title = rawOrigin;
    col.appendChild(originSpan);
  }

  row.appendChild(col);

  row.addEventListener("click", function () {
    selectedRequest = (selectedRequest === r) ? null : r;
    renderRequestList();
    renderGroups();
    renderDetail();
  });

  return row;
}

/* ═══════════════════════════ Right panel ═════════════════════ */
function renderGroups() {
  var area = $("groupsArea");
  var ph   = $("groupsPlaceholder");

  var cards = area.querySelectorAll(".group-card, .folder-section-header");
  for (var i = 0; i < cards.length; i++) cards[i].remove();

  if (!groupOrder.length) {
    ph.style.display = "";
    return;
  }
  ph.style.display = "none";

  // Build ordered list of folder buckets, preserving groupOrder sequence within each.
  // Bucket key "" = no folder (rendered last without a section header).
  var bucketKeys  = [];   // ordered unique folderId values (in first-seen order)
  var buckets     = {};   // folderId -> [groupName, ...]

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var name = groupOrder[gi];
    var fid  = (groups[name] || {}).folderId || "";
    if (!buckets[fid]) { buckets[fid] = []; bucketKeys.push(fid); }
    buckets[fid].push(name);
  }

  // Render folder buckets — titled ones sorted alphabetically, unfiled last
  var orderedKeys = bucketKeys.filter(function (k) { return k !== ""; });
  orderedKeys.sort(function (a, b) {
    var fa = folderById(a), fb = folderById(b);
    var na = fa ? fa.name : a, nb = fb ? fb.name : b;
    return na.localeCompare(nb);
  });
  if (buckets[""]) orderedKeys.push("");

  var isFirst = true;
  orderedKeys.forEach(function (fid) {
    var hdr = document.createElement("div");
    hdr.className = "folder-section-header" + (isFirst ? " first" : "");

    if (fid === "") {
      hdr.classList.add("no-folder");
      var nameSpan = document.createElement("span");
      nameSpan.className = "fsh-name";
      nameSpan.textContent = "No Folder";
      hdr.appendChild(nameSpan);
    } else {
      var folder = folderById(fid);
      if (!folder) hdr.classList.add("orphaned");
      if (folder && folder.preview) {
        var img = document.createElement("img");
        img.src = "data:image/jpeg;base64," + folder.preview;
        img.alt = folder.name;
        hdr.appendChild(img);
      }
      var nameSpan = document.createElement("span");
      nameSpan.className = "fsh-name";
      nameSpan.textContent = folder ? folder.name : "Unknown folder";
      var idSpan = document.createElement("span");
      idSpan.className = "fsh-id";
      idSpan.textContent = fid;
      hdr.appendChild(nameSpan);
      hdr.appendChild(idSpan);
    }

    area.appendChild(hdr);
    buckets[fid].forEach(function (n) {
      area.appendChild(buildGroupCard(n, groups[n] || {}));
    });
    isFirst = false;
  });
}

function buildGroupCard(name, grp) {
  var card = document.createElement("div");
  card.className = "group-card" + (selectedRequest ? " ready-to-receive" : "");
  card.dataset.name = name;

  /* header */
  var hdr = document.createElement("div");
  hdr.className = "group-card-header";

  var nameEl = document.createElement("span");
  nameEl.className = "group-card-name";
  nameEl.textContent = (grp.displayName || name) + (grp.type === "file" ? " – File" : " – M3U8 & VTT");
  nameEl.title = grp.displayName || name;

  var countEl = document.createElement("span");
  countEl.className = "group-card-count";
  var cnt = (grp.requests || []).length;
  countEl.textContent = cnt ? cnt + " items" : "";

  var cleanBtn = document.createElement("button");
  cleanBtn.className = "group-card-clean";
  cleanBtn.textContent = "⌫";
  cleanBtn.title = "Clear items (keep group)";
  (function (n, grp) {
    cleanBtn.addEventListener("click", function () {
      var cnt = (grp.requests || []).length;
      if (!cnt) return;
      if (!confirm("Clear " + cnt + " item" + (cnt === 1 ? "" : "s") + " from \"" + (grp.displayName || n) + "\"? The group will remain.")) return;
      browser.runtime.sendMessage({ action: "group-clear-items", name: n }, function () {
        loadGroups();
      });
    });
  })(name, grp);

  var closeBtn = document.createElement("button");
  closeBtn.className = "group-card-close";
  closeBtn.textContent = "×";
  closeBtn.title = "Delete group";
  closeBtn.addEventListener("click", function () {
    browser.runtime.sendMessage({ action: "group-delete", name: name }, function () {
      loadGroups();
    });
  });

  hdr.appendChild(nameEl);
  hdr.appendChild(countEl);
  hdr.appendChild(cleanBtn);
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  /* body — type buttons */
  var body = document.createElement("div");
  body.className = "group-card-body";

  var type = grp.type || "m3u8_vtt";
  var requests = grp.requests || [];

  if (type === "m3u8_vtt") {
    var m3u8Btn = makeTypeButton("M3U8", requests, function (r) {
      return r.category === "STREAM" || (r.mediaType === "STREAM") ||
             /\.m3u8|\.mpd|master/i.test(r.url || "");
    });
    var vttBtn = makeTypeButton("VTT", requests, function (r) {
      return r.category === "SUBTITLE" || r.mediaType === "SUBTITLE" ||
             /\.vtt/i.test(r.url || "");
    });
    m3u8Btn.addEventListener("click", function () { assignSelected(name); });
    vttBtn.addEventListener("click",  function () { assignSelected(name); });
    body.appendChild(m3u8Btn);
    body.appendChild(vttBtn);
  } else {
    var fileBtn = makeTypeButtonAll("FILE", requests);
    fileBtn.addEventListener("click", function () { assignSelected(name); });
    body.appendChild(fileBtn);
  }

  card.appendChild(body);
  return card;
}

function makeTypeButton(label, requests, filterFn) {
  var matches = requests.filter(filterFn);
  var hasItems = matches.length > 0;
  var btn = document.createElement("button");
  btn.className = "type-btn" + (hasItems ? " active" : "");
  btn.textContent = (hasItems ? "✅ " : "") + label + (hasItems ? " (" + matches.length + ")" : "");
  btn.title = matches.map(function (r) { return r.url; }).join("\n") || "Click to assign selected request";
  return btn;
}

function makeTypeButtonAll(label, requests) {
  var hasItems = requests.length > 0;
  var btn = document.createElement("button");
  btn.className = "type-btn" + (hasItems ? " active" : "");
  btn.textContent = (hasItems ? "✅ " : "") + label + (hasItems ? " (" + requests.length + ")" : "");
  btn.title = requests.map(function (r) { return r.url; }).join("\n") || "Click to assign selected request";
  return btn;
}

/* ═══════════════════════════ Detail pane ════════════════════ */
function renderDetail() {
  var pane = $("detailPane");
  if (!selectedRequest) {
    pane.classList.remove("visible");
    return;
  }
  pane.classList.add("visible");

  var r = selectedRequest;
  $("detailTitle").textContent = truncate(r.url, 60);

  var rows = [
    ["URL",          r.url,                    "url"],
    ["Method",       r.method || "-",          ""],
    ["Status",       r.statusCode == null ? "pending" : (r.statusCode === -1 ? "ERROR" : String(r.statusCode)), ""],
    ["Type",         r.typeLabel || "-",       ""],
    ["Category",     r.category || "-",        ""],
    ["Host",         r.host || "-",            ""],
    ["Origin URL",   r.originUrl || "-",       "url"],
    ["Document URL", r.documentUrl || "-",     "url"],
    ["Referer hdr",  r.referer || "-",         "url"],
    ["Origin hdr",   r.originHeader || "-",    "url"],
    ["Frame",        r.frameId != null && r.frameId !== '-' ? (r.frameId === 0 ? "main (0)" : "sub-frame (" + r.frameId + ")") : "-", ""],
  ];

  var body = $("detailBody");
  body.innerHTML = "";
  rows.forEach(function (row) {
    var div = document.createElement("div");
    div.className = "detail-row";
    var lbl = document.createElement("span");
    lbl.className = "detail-label";
    lbl.textContent = row[0];
    var val = document.createElement("span");
    val.className = "detail-value" + (row[2] ? " " + row[2] : "");
    val.textContent = row[1] || "-";
    val.title = row[1] || "";
    div.appendChild(lbl);
    div.appendChild(val);
    body.appendChild(div);
  });
}

$("detailCloseBtn").addEventListener("click", function () {
  selectedRequest = null;
  renderRequestList();
  renderGroups();
  renderDetail();
});


function assignSelected(groupName) {
  if (!selectedRequest) return;
  var r = selectedRequest;
  browser.runtime.sendMessage({
    action: "group-add-item",
    groupName: groupName,
    request: {
      url:          r.url,
      method:       r.method        || "GET",
      typeLabel:    r.typeLabel     || r.type || "",
      category:     r.category      || "OTHER",
      mediaType:    r.mediaType     || null,
      timestamp:    r.timestamp     || Date.now(),
      statusCode:   r.statusCode,
      originUrl:    r.originUrl     || "",
      documentUrl:  r.documentUrl   || "",
      referer:      r.referer       || "",
      originHeader: r.originHeader  || "",
    }
  }, function () {
    selectedRequest = null;
    loadGroups();
  });
}

/* ═══════════════════════════ Preferences ════════════════════ */
var excludePatterns = [];  // array of lowercase strings

function loadPrefs() {
  var raw = localStorage.getItem("mediatracker_exclude") || "";
  excludePatterns = raw.split(";").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  sendExcludesToBackground();
}

function savePrefs(raw) {
  localStorage.setItem("mediatracker_exclude", raw);
  excludePatterns = raw.split(";").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  sendExcludesToBackground();
}

function sendExcludesToBackground() {
  browser.runtime.sendMessage({ action: "set-excludes", patterns: excludePatterns }).catch(function () {});
}

function isExcluded(url) {
  if (!excludePatterns.length) return false;
  var u = (url || "").toLowerCase();
  for (var i = 0; i < excludePatterns.length; i++) {
    if (u.includes(excludePatterns[i])) return true;
  }
  return false;
}

$("prefsBtn").addEventListener("click", function () {
  var raw = localStorage.getItem("mediatracker_exclude") || "";
  $("prefsExclude").value = raw;
  updatePrefsCount(raw);
  renderPrefsFolderList();
  $("prefsFolderPaste").value = "";
  $("prefsFolderError").style.display = "none";
  $("prefsBackdrop").classList.add("open");
});

$("prefsExclude").addEventListener("input", function () {
  updatePrefsCount(this.value);
});

function updatePrefsCount(raw) {
  var count = raw.split(";").map(function (s) { return s.trim(); }).filter(Boolean).length;
  $("prefsCount").textContent = count ? count + " exclusion" + (count === 1 ? "" : "s") + " active" : "No exclusions set";
}

$("prefsCancelBtn").addEventListener("click", function () {
  $("prefsBackdrop").classList.remove("open");
});

$("prefsBackdrop").addEventListener("click", function (e) {
  if (e.target === this) this.classList.remove("open");
});

$("prefsSaveBtn").addEventListener("click", function () {
  savePrefs($("prefsExclude").value);
  $("prefsBackdrop").classList.remove("open");
  renderRequestList();
});

/* ── Preferences Import / Export ── */

function buildPrefsSnapshot() {
  return {
    version:    1,
    exportedAt: new Date().toISOString(),
    exclusions: ($("prefsExclude").value || localStorage.getItem("mediatracker_exclude") || "")
                  .split(";").map(function (s) { return s.trim(); }).filter(Boolean),
    folders:    knownFolders,
    groups:     groupOrder.map(function (key) {
      var grp = groups[key] || {};
      return {
        key:         key,
        displayName: grp.displayName || key,
        type:        grp.type || "m3u8_vtt",
        folderId:    grp.folderId || "",
        created:     grp.created || "",
        requests:    grp.requests || []
      };
    })
  };
}

$("prefsExportJsonBtn").addEventListener("click", function () {
  var snap = buildPrefsSnapshot();
  var json = JSON.stringify(snap, null, 2);
  navigator.clipboard.writeText(json).then(function () {
    var btn = $("prefsExportJsonBtn");
    var prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = prev; }, 1500);
  }).catch(function () {
    alert("Clipboard write failed.\n\n" + json);
  });
});

$("prefsExportMdBtn").addEventListener("click", function () {
  var snap = buildPrefsSnapshot();
  var lines = [
    "# Media Tracker Preferences Export",
    "",
    "_Exported: " + new Date().toLocaleString() + "_",
    "",
    "## Exclusions",
    ""
  ];

  if (snap.exclusions.length) {
    snap.exclusions.forEach(function (e) { lines.push("- `" + e + "`"); });
  } else {
    lines.push("_None._");
  }

  lines.push("", "## Known Folders", "");
  if (snap.folders.length) {
    lines.push("| Name | ID | Info URL |");
    lines.push("|------|----|----------|");
    snap.folders.forEach(function (f) {
      lines.push("| " + f.name + " | `" + f.id + "` | " + (f.info_url || "-") + " |");
    });
  } else {
    lines.push("_None._");
  }

  lines.push("", "## Groups", "");
  if (snap.groups.length) {
    lines.push("| Group | Type | Folder | Items |");
    lines.push("|-------|------|--------|-------|");
    snap.groups.forEach(function (g) {
      var folder = folderById(g.folderId);
      lines.push("| " + g.displayName + " | " + g.type + " | " +
                 (folder ? folder.name : (g.folderId || "-")) + " | " +
                 g.requests.length + " |");
    });
    // Detail per group
    snap.groups.forEach(function (g) {
      if (!g.requests.length) return;
      lines.push("", "### " + g.displayName, "");
      lines.push("| # | Type | URL | Method | Origin | Referer |");
      lines.push("|---|------|-----|--------|--------|---------|");
      g.requests.forEach(function (r, i) {
        lines.push("| " + (i + 1) + " | " + (r.mediaType || r.category || "-") +
                   " | `" + (r.url || "") + "` | " + (r.method || "-") +
                   " | " + ((r.originHeader && r.originHeader !== "-") ? r.originHeader : (resolveOrigin(r) || "-")) +
                   " | " + ((r.referer && r.referer !== "-") ? r.referer : "-") + " |");
      });
    });
  } else {
    lines.push("_No groups._");
  }

  var md = lines.join("\n");
  navigator.clipboard.writeText(md).then(function () {
    var btn = $("prefsExportMdBtn");
    var prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = prev; }, 1500);
  }).catch(function () {
    alert("Clipboard write failed.\n\n" + md);
  });
});

$("prefsImportJsonBtn").addEventListener("click", function () {
  var area = $("prefsImportArea");
  var isOpen = area.style.display !== "none";
  area.style.display = isOpen ? "none" : "";
  if (!isOpen) {
    $("prefsImportInput").value = "";
    $("prefsImportError").style.display = "none";
    $("prefsImportInput").focus();
  }
});

$("prefsImportCancelBtn").addEventListener("click", function () {
  $("prefsImportArea").style.display = "none";
});

$("prefsImportConfirmBtn").addEventListener("click", function () {
  var errEl = $("prefsImportError");
  errEl.style.display = "none";
  var raw = $("prefsImportInput").value.trim();
  if (!raw) return;

  var snap;
  try { snap = JSON.parse(raw); } catch (e) {
    errEl.textContent = "Invalid JSON — could not parse.";
    errEl.style.display = "";
    return;
  }

  if (snap.version !== 1) {
    errEl.textContent = "Unrecognised format (expected version 1).";
    errEl.style.display = "";
    return;
  }

  var summary = [];

  // Restore exclusions
  if (Array.isArray(snap.exclusions)) {
    var excStr = snap.exclusions.join(";");
    $("prefsExclude").value = excStr;
    savePrefs(excStr);
    updatePrefsCount(excStr);
    summary.push(snap.exclusions.length + " exclusion(s)");
  }

  // Restore folders (merge — skip duplicates by id)
  if (Array.isArray(snap.folders)) {
    var added = 0;
    snap.folders.forEach(function (f) {
      if (!f.id || !f.name) return;
      if (!folderById(f.id)) {
        knownFolders.push({
          id:       f.id,
          name:     f.name,
          rating:   f.rating   != null ? f.rating   : 0,
          info_url: f.info_url || "",
          preview:  f.preview  || ""
        });
        added++;
      }
    });
    if (added) {
      knownFolders.sort(function (a, b) { return a.name.localeCompare(b.name); });
      saveKnownFolders();
      renderFolderDropdown();
      renderPrefsFolderList();
      summary.push(added + " folder(s)");
    }
  }

  // Restore groups via background (sequential, skip duplicates)
  if (Array.isArray(snap.groups) && snap.groups.length) {
    var toCreate = snap.groups.slice();
    var created = 0;

    function importNext(i) {
      if (i >= toCreate.length) {
        // Restore requests for each successfully imported group
        var pending = 0;
        toCreate.forEach(function (g) {
          if (!g.requests || !g.requests.length) return;
          var targetKey = g.folderId ? (g.displayName + "~" + g.folderId) : g.displayName;
          if (!groups[targetKey]) return;
          pending += g.requests.length;
          g.requests.forEach(function (r) {
            browser.runtime.sendMessage(
              { action: "group-add-item", groupName: targetKey, request: r },
              function () {
                pending--;
                if (pending === 0) {
                  loadGroups();
                  summary.push(created + " group(s)");
                  alert("Imported: " + summary.join(", ") + ".");
                  $("prefsImportArea").style.display = "none";
                }
              }
            );
          });
        });
        if (pending === 0) {
          loadGroups();
          summary.push(created + " group(s)");
          alert("Imported: " + summary.join(", ") + ".");
          $("prefsImportArea").style.display = "none";
        }
        return;
      }
      var g = toCreate[i];
      browser.runtime.sendMessage(
        { action: "group-create", name: g.displayName || g.key, type: g.type, folderId: g.folderId || "" },
        function (res) { if (res && res.created) created++; importNext(i + 1); }
      );
    }
    importNext(0);
  } else {
    alert("Imported: " + (summary.join(", ") || "nothing") + ".");
    $("prefsImportArea").style.display = "none";
  }
});

/* ── Folder import inside Preferences ── */

function renderPrefsFolderList() {
  var list  = $("prefsFolderList");
  var empty = $("prefsFolderEmpty");
  // Remove old rows
  var rows = list.querySelectorAll(".pref-folder-row");
  for (var i = 0; i < rows.length; i++) rows[i].remove();

  if (!knownFolders.length) {
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";

  knownFolders.forEach(function (f) {
    var row = document.createElement("div");
    row.className = "pref-folder-row";

    if (f.preview) {
      var img = document.createElement("img");
      img.src = "data:image/jpeg;base64," + f.preview;
      img.alt = f.name;
      row.appendChild(img);
    }

    var nameSpan = document.createElement("span");
    nameSpan.className = "pf-name";
    nameSpan.textContent = f.name;

    var idSpan = document.createElement("span");
    idSpan.className = "pf-id";
    idSpan.textContent = f.id;

    var delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.title = "Remove folder";
    (function (fid, fname) {
      delBtn.addEventListener("click", function () {
        var affected = groupOrder.filter(function (n) {
          return (groups[n] || {}).folderId === fid;
        });

        var doDelete = function (clearGroups) {
          if (clearGroups) {
            browser.runtime.sendMessage({ action: "groups-clear-folder", folderId: fid }, function () {
              knownFolders = knownFolders.filter(function (x) { return x.id !== fid; });
              saveKnownFolders();
              renderFolderDropdown();
              renderPrefsFolderList();
              loadGroups();
            });
          } else {
            knownFolders = knownFolders.filter(function (x) { return x.id !== fid; });
            saveKnownFolders();
            renderFolderDropdown();
            renderPrefsFolderList();
            renderGroups();
          }
        };

        if (affected.length) {
          var msg = "\"" + fname + "\" is still assigned to " + affected.length +
                    " group" + (affected.length === 1 ? "" : "s") + " (" +
                    affected.slice(0, 3).join(", ") + (affected.length > 3 ? "…" : "") +
                    ").\n\nAlso clear the folder assignment from those groups?";
          doDelete(confirm(msg));
        } else {
          doDelete(false);
        }
      });
    })(f.id, f.name);

    row.appendChild(nameSpan);
    row.appendChild(idSpan);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}

$("prefsFolderImportBtn").addEventListener("click", function () {
  var errEl = $("prefsFolderError");
  errEl.style.display = "none";
  var raw = $("prefsFolderPaste").value.trim();
  if (!raw) return;

  var data;
  try {
    var json = decodeURIComponent(escape(atob(raw)));
    data = JSON.parse(json);
  } catch (e) {
    errEl.textContent = "Invalid base64 or JSON — could not decode.";
    errEl.style.display = "";
    return;
  }

  if (!data.id || !data.name) {
    errEl.textContent = "Missing required fields: id and name.";
    errEl.style.display = "";
    return;
  }

  // Deduplicate by id
  var exists = false;
  for (var i = 0; i < knownFolders.length; i++) {
    if (knownFolders[i].id === data.id) { exists = true; break; }
  }
  if (exists) {
    errEl.textContent = "Folder \"" + data.name + "\" (" + data.id + ") is already in the list.";
    errEl.style.display = "";
    return;
  }

  knownFolders.push({
    id:       data.id,
    name:     data.name,
    rating:   data.rating   != null ? data.rating   : 0,
    info_url: data.info_url || "",
    preview:  data.preview  || ""
  });
  knownFolders.sort(function (a, b) { return a.name.localeCompare(b.name); });
  saveKnownFolders();
  renderFolderDropdown();
  renderPrefsFolderList();
  $("prefsFolderPaste").value = "";
});


$("addGroupBtn").addEventListener("click", function () {
  var name = $("newGroupInput").value.trim();
  var type = $("newGroupType").value;
  if (!name) return;
  if (name.includes("~")) { alert("Group name cannot contain '~'."); return; }
  browser.runtime.sendMessage({ action: "group-create", name: name, type: type, folderId: defaultFolderId }, function (res) {
    if (res && res.created) {
      $("newGroupInput").value = "";
      loadGroups();
    }
  });
});

$("newGroupInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("addGroupBtn").click();
});

$("clearLogBtn").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "clearLog" }, function () {
    requestLog = [];
    selectedRequest = null;
    renderRequestList();
    renderDetail();
    updateSummary();
  });
});

$("pauseBtn").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "pause" }, function (res) {
    isPaused = res.paused;
    $("pauseBtn").textContent = isPaused ? "Resume" : "Pause";
    $("pauseBtn").style.background = isPaused ? "#ffc107" : "";
    $("pauseBtn").style.borderColor = isPaused ? "#e0a800" : "";
  });
});

/* ═══════════════════════════ Split-button menus ════════════════ */
function closeSplitMenus() {
  $("exportMenu").classList.remove("open");
  $("clearMenu").classList.remove("open");
}

document.addEventListener("click", function (e) {
  if (!e.target.closest(".split-btn")) closeSplitMenus();
});

$("exportMenuToggle").addEventListener("click", function (e) {
  e.stopPropagation();
  var open = $("exportMenu").classList.toggle("open");
  if (open) $("clearMenu").classList.remove("open");
});

$("clearMenuToggle").addEventListener("click", function (e) {
  e.stopPropagation();
  var open = $("clearMenu").classList.toggle("open");
  if (open) $("exportMenu").classList.remove("open");
});

/* ── Export helpers ── */
function buildExportData() {
  var filledGroups = groupOrder.filter(function (name) {
    return ((groups[name] || {}).requests || []).length > 0;
  });
  return filledGroups;
}

function doExportJson() {
  var filledGroups = buildExportData();
  if (!filledGroups.length) { alert("No groups have items yet."); return; }

  var data = filledGroups.map(function (name) {
    var grp = groups[name] || {};
    return {
      n:         grp.displayName || name,
      t:         grp.type || "m3u8_vtt",
      folder_id: grp.folderId || "",
      items: (grp.requests || []).map(function (r) {
        return {
          t:           r.mediaType || r.category || r.type || "",
          url:         r.url || "",
          method:      r.method || "",
          origin:      (r.originHeader && r.originHeader !== "-") ? r.originHeader : resolveOrigin(r),
          referer:     (r.referer && r.referer !== "-") ? r.referer : "",
          originUrl:   (r.originUrl && r.originUrl !== "-") ? r.originUrl : "",
          documentUrl: (r.documentUrl && r.documentUrl !== "-") ? r.documentUrl : ""
        };
      })
    };
  });

  var json = JSON.stringify(data);
  var b64  = btoa(unescape(encodeURIComponent(json)));
  navigator.clipboard.writeText(b64).then(function () {
    var btn = $("exportAllBtn");
    var prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = prev; }, 1500);
  }).catch(function () {
    alert("Clipboard write failed. Here is the export:\n\n" + b64);
  });
}

function doExportMd() {
  var filledGroups = buildExportData();
  if (!filledGroups.length) { alert("No groups have items yet."); return; }

  var lines = ["# Media Tracker Export", "",
               "_Generated: " + new Date().toLocaleString() + "_", ""];

  filledGroups.forEach(function (name) {
    var grp = groups[name] || {};
    var reqs = grp.requests || [];
    lines.push("## " + (grp.displayName || name) + " (" + (grp.type || "m3u8_vtt") + ")");
    if (grp.folderId) {
      var f = folderById(grp.folderId);
      lines.push("_Folder: " + (f ? f.name : "Unknown") + " (" + grp.folderId + ")_");
    }
    lines.push("");
    if (!reqs.length) {
      lines.push("_No items assigned._");
    } else {
      lines.push("| # | Type | URL | Method | Origin | Referer |");
      lines.push("|---|------|-----|--------|--------|---------|");
      reqs.forEach(function (r, i) {
        var cols = [
          String(i + 1),
          r.mediaType || r.category || "-",
          r.url ? "`" + r.url + "`" : "-",
          r.method || "-",
          (r.originHeader && r.originHeader !== "-") ? r.originHeader : (resolveOrigin(r) || "-"),
          (r.referer && r.referer !== "-") ? r.referer : "-"
        ];
        lines.push("| " + cols.join(" | ") + " |");
      });
    }
    lines.push("");
  });

  var md = lines.join("\n");
  navigator.clipboard.writeText(md).then(function () {
    var btn = $("exportAllBtn");
    var prev = btn.textContent;
    btn.textContent = "Copied MD!";
    setTimeout(function () { btn.textContent = prev; }, 1500);
  }).catch(function () {
    alert("Clipboard write failed.\n\n" + md);
  });
}

// Main Export button = JSON (default action)
$("exportAllBtn").addEventListener("click", doExportJson);
// Menu items
$("exportJsonBtn").addEventListener("click", function () { closeSplitMenus(); doExportJson(); });
$("exportMdBtn").addEventListener("click",   function () { closeSplitMenus(); doExportMd(); });

/* ── Clear helpers ── */
function doClearFilled() {
  var filled = groupOrder.filter(function (name) {
    return ((groups[name] || {}).requests || []).length > 0;
  });
  if (!filled.length) { alert("No filled groups to clear."); return; }
  if (!confirm("Delete " + filled.length + " filled group" + (filled.length === 1 ? "" : "s") + "? Empty groups will remain.")) return;
  var done = 0;
  filled.forEach(function (name) {
    browser.runtime.sendMessage({ action: "group-delete", name: name }, function () {
      done++;
      if (done === filled.length) loadGroups();
    });
  });
}

function doClearAll() {
  if (!groupOrder.length) return;
  if (!confirm("Delete all groups? This cannot be undone.")) return;
  var pending = groupOrder.slice();
  var done = 0;
  pending.forEach(function (name) {
    browser.runtime.sendMessage({ action: "group-delete", name: name }, function () {
      done++;
      if (done === pending.length) loadGroups();
    });
  });
}

// Main Clear button = clear filled (most common action)
$("clearFilledBtn").addEventListener("click", doClearFilled);
// Menu items
$("clearFilledMenuBtn").addEventListener("click", function () { closeSplitMenus(); doClearFilled(); });
$("clearGroupsBtn").addEventListener("click",    function () { closeSplitMenus(); doClearAll(); });

$("generateBtn").addEventListener("click", openGenerateDialog);

/* ═══════════════════════════ Generate dialog ════════════════ */
function pad2(n) { return String(n).padStart(2, "0"); }

function openGenerateDialog() {
  // Populate season dropdown 01–99
  var seasonSel = $("genSeason");
  var epFromSel = $("genEpFrom");
  var epToSel   = $("genEpTo");

  if (!seasonSel.options.length) {
    for (var s = 1; s <= 99; s++) {
      var o = document.createElement("option");
      o.value = s;
      o.textContent = pad2(s);
      seasonSel.appendChild(o);
    }
  }

  // Rebuild episode dropdowns each open so "to" min stays in sync
  epFromSel.innerHTML = "";
  epToSel.innerHTML   = "";
  for (var e = 1; e <= 99; e++) {
    var of = document.createElement("option");
    of.value = e; of.textContent = pad2(e);
    epFromSel.appendChild(of);

    var ot = document.createElement("option");
    ot.value = e; ot.textContent = pad2(e);
    epToSel.appendChild(ot);
  }
  // Default "to" to episode 13
  epToSel.value = 13;

  updateGenPreview();
  $("generateBackdrop").classList.add("open");
}

function updateGenPreview() {
  var s    = parseInt($("genSeason").value, 10);
  var from = parseInt($("genEpFrom").value, 10);
  var to   = parseInt($("genEpTo").value, 10);
  var ext  = $("genExtension").value.trim();
  if (to < from) to = from;

  var names = [];
  for (var e = from; e <= Math.min(to, from + 4); e++) {
    names.push("S" + pad2(s) + "E" + pad2(e) + ext);
  }
  var total = Math.max(0, to - from + 1);
  var preview = names.join("  ");
  if (total > 5) preview += "  … (" + total + " groups total)";
  $("genPreview").textContent = preview || "—";
}

["genSeason", "genEpFrom", "genEpTo"].forEach(function (id) {
  $(id).addEventListener("change", function () {
    var from = parseInt($("genEpFrom").value, 10);
    var to   = parseInt($("genEpTo").value, 10);
    if (id === "genEpFrom" && to < from) $("genEpTo").value = from;
    if (id === "genEpTo"   && to < from) $("genEpTo").value = from;
    updateGenPreview();
  });
});

$("genExtension").addEventListener("input", updateGenPreview);

$("genCancelBtn").addEventListener("click", function () {
  $("generateBackdrop").classList.remove("open");
});

// Close on backdrop click
$("generateBackdrop").addEventListener("click", function (e) {
  if (e.target === this) this.classList.remove("open");
});

$("genConfirmBtn").addEventListener("click", function () {
  var s    = parseInt($("genSeason").value, 10);
  var from = parseInt($("genEpFrom").value, 10);
  var to   = parseInt($("genEpTo").value, 10);
  var type = $("genType").value;
  var ext  = $("genExtension").value.trim();
  if (to < from) to = from;
  if (ext.includes("~")) { alert("Extension cannot contain '~'."); return; }

  var names = [];
  for (var e = from; e <= to; e++) {
    names.push("S" + pad2(s) + "E" + pad2(e) + ext);
  }

  // Send sequentially so each createGroup sees the updated groupOrder
  function sendNext(i) {
    if (i >= names.length) {
      $("generateBackdrop").classList.remove("open");
      loadGroups();
      return;
    }
    browser.runtime.sendMessage(
      { action: "group-create", name: names[i], type: type, folderId: defaultFolderId },
      function () { sendNext(i + 1); }
    );
  }
  sendNext(0);
});

$("filterSelect").addEventListener("change", function () {
  localStorage.setItem("mediatracker_filter", this.value);
  renderRequestList();
});
$("searchInput").addEventListener("input",  renderRequestList);

// Restore saved filter on load
(function () {
  var saved = localStorage.getItem("mediatracker_filter");
  if (saved && $("filterSelect").querySelector('option[value="' + saved + '"]')) {
    $("filterSelect").value = saved;
  }
})();

/* ═══════════════════════════ Summary ════════════════════════ */
function updateSummary() {
  var total  = requestLog.length;
  var media  = requestLog.filter(function (r) { return r.mediaType; }).length;
  var gCount = groupOrder.length;
  $("summaryBar").textContent =
    "Requests: " + total + "  |  Media: " + media + "  |  Groups: " + gCount +
    (isPaused ? "  |  PAUSED" : "");
}

/* ═══════════════════════════ Util ════════════════════════════ */
function truncate(s, n) {
  return (s && s.length > n) ? s.slice(0, n) + "…" : (s || "");
}

// Resolve the best origin string for a request, stripping to scheme+host
function resolveOrigin(r) {
  var raw = (r.originUrl && r.originUrl !== "-") ? r.originUrl
          : (r.documentUrl && r.documentUrl !== "-") ? r.documentUrl
          : "";
  if (!raw) return "";
  try { return new URL(raw).origin; } catch(e) { return raw; }
}

// Collapse middle path segments: https://host/.../filename.ext
function smartUrl(url) {
  if (!url) return "";
  var parsed;
  try { parsed = new URL(url); } catch(e) { return truncate(url, 80); }

  var origin   = parsed.origin;                          // https://host
  var pathname = parsed.pathname;
  var segments = pathname.split("/").filter(Boolean);    // drop empty strings

  if (segments.length <= 2) return url;                  // short enough, show as-is

  var filename = segments[segments.length - 1];
  return origin + "/…/" + filename;
}

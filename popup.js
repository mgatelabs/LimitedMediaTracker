/* ================================================= State ================================================= */
var requestLog = []
var groups     = {}
var groupOrder = []
var activeGroup = null
var isPaused   = false
var currentView = "all"
var pickedIdx  = -1

function $(id) { return document.getElementById(id) }

loadGroups()
refreshLog()
setInterval(refreshLog, 2000)
updateSummary(null)
syncLeftMediaSection()

/* ================================================= Helpers =============================================== */
function getTypeBadge(t) { return t === "file" ? "FILE" : "M3U8" }
function trunc(s, n)    { return (s && s.length > n) ? s.slice(0, n) + "..." : (s || "-") }
function escAttr(s)     { return s ? s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "" }

/* ================================================= DOM helper ========================================== */
function h(tag, attrs, text) {
  var el = document.createElement(tag)
  if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k])
  if (text !== undefined) el.textContent = text
  return el
}

/* ================================================= Messages ============================================== */
function refreshLog() {
  chrome.runtime.sendMessage({ action: "getLog" }, function(res) {
    if (res && res.log) requestLog = res.log
    renderTable()
  })
}

function loadGroups() {
  chrome.runtime.sendMessage({ action: "groups-get" }, function(res) {
    if (res) { groups = res.groups; groupOrder = res.groupOrder || [] }
    renderGroups()
    updateSummary(activeGroup ? getActiveLog() : requestLog)
  })
}

function getActiveLog() {
  return activeGroup && groups[activeGroup] ? (groups[activeGroup].requests || []) : null
}

/* ================================================= Groups Sidebar ============================================ */
function renderGroups() {
  var el = $("groupList")
  var keeper = $("mediaSearchSection")
  el.innerHTML = ""
  createRow(el, null, requestLog.length, true)
  for (var i = 0; i < groupOrder.length; i++) {
    var g = groups[groupOrder[i]]
    createRow(el, groupOrder[i], (g && g.requests) ? g.requests.length : 0, false)
  }
  if (keeper) el.appendChild(keeper)
}

function createRow(container, name, count, isAll) {
  var div = h("div", { className: "group-item" + (activeGroup === name ? " active" : "") })

  // Name label
  var nameSpan = h("span", { className: "group-item-name" }, name || "(All)")
  if (isAll) nameSpan.style.cssText = "font-weight:bold;color:#cba6f7;"

  // Type badge
  var grp = (name && groups[name]) ? groups[name] : null
  var tVal = (grp && grp.type) || "m3u8_vtt"
  var typeBadge = h("span", { className: "group-item-type", title: "click to cycle type" }, getTypeBadge(tVal))

  // Count
  var cntSpan = h("span", { className: "group-item-count" }, count != null ? String(count) : "-")

  // Delete button (only for named groups)
  var delBtn = name ? h("button", { className: "group-item-delete", title: "Delete group" }, "\u2715") : null

  div.appendChild(nameSpan)
  div.appendChild(typeBadge)
  div.appendChild(cntSpan)
  if (delBtn) div.appendChild(delBtn)

  // Click row -> select this group
  div.addEventListener("click", function(e) {
    if (e.target.classList.contains("group-item-delete")) return
    selectGroup(name)
  })

  // Type badge click -> cycle type
  typeBadge.addEventListener("click", function(e) {
    e.stopPropagation()
    var cur = (groups[name] && groups[name].type) ? groups[name].type : "m3u8_vtt"
    var nxt = (cur === "file") ? "m3u8_vtt" : "file"
    chrome.runtime.sendMessage({ action: "group-update-type", name: name, type: nxt }, function(res) {
      if (res && res.updated) loadGroups()
    })
  })

  // Delete button
  if (delBtn && name) {
    delBtn.addEventListener("click", function(e) {
      e.stopPropagation()
      chrome.runtime.sendMessage({ action: "group-delete", name: name }, function() {
        if (activeGroup === name) activeGroup = null
        loadGroups()
        renderTable()
      })
    })
  }

  // Insert before media-search-section
  var ref = $("mediaSearchSection")
  if (ref) container.insertBefore(div, ref)
  else     container.appendChild(div)
}

/* ================================================= View Selection ========================================== */
function selectGroup(name) {
  activeGroup = name
  pickedIdx   = -1
  $("groupTitle").textContent = activeGroup ? "\uD83D\uDCE6 " + name : "All Requests"
  var tabs = document.querySelectorAll(".tab")
  for (var t = 0; t < tabs.length; t++) {
    if (tabs[t].getAttribute("data-view") === currentView) tabs[t].classList.add("active")
    else tabs[t].classList.remove("active")
  }
  renderGroups()
  renderTable()
}

window.switchView = function(view, el) {
  currentView = view
  var tabs = document.querySelectorAll(".tab")
  for (var t = 0; t < tabs.length; t++) {
    if (tabs[t].getAttribute("data-view") === currentView) tabs[t].classList.add("active")
    else tabs[t].classList.remove("active")
  }
  renderTable()
}

/* ================================================= New Group Form ========================================== */
$("addGroupBtn").addEventListener("click", function() {
  var name = $("newGroupInput").value.trim()
  var type = $("newGroupType") ? $("newGroupType").value : "m3u8_vtt"
  if (!name) return
  chrome.runtime.sendMessage({ action: "group-create", name: name, type: type }, function(res) {
    if (res && res.created) {
      activeGroup = res.created
      $("newGroupInput").value = ""
      loadGroups()
      selectGroup(res.created)
    }
  })
})

$("newGroupInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") $("addGroupBtn").click()
})

/* ================================================= Rename on Dblclick ====================================== */
document.addEventListener("dblclick", function(e) {
  var nameEl = e.target.closest(".group-item .group-item-name")
  if (!nameEl) return
  var oldName = activeGroup
  if (!oldName) return

  var inp = document.createElement("input")
  inp.type = "text"
  inp.value = oldName
  inp.style.cssText = "flex:1;border:none;background:#313244;color:#cdd6f4;padding:4px;font-size:12px;border-radius:4px;"
  nameEl.parentNode.insertBefore(inp, nameEl.nextSibling)
  try { nameEl.parentNode.removeChild(nameEl) } catch(err){}
  inp.focus();  inp.select()

  function finish() {
    var newName = inp.value.trim()
    if (newName && newName !== oldName) {
      chrome.runtime.sendMessage({ action: "group-rename", oldName: oldName, newName: newName }, function(res) {
        if (!res || !res.renamed) renderGroups()
        else loadGroups()
      })
    } else {
      renderGroups()
    }
    activeGroup = newName || oldName
  }

  inp.addEventListener("blur", finish)
  inp.addEventListener("keydown", function(ev) {
    if (ev.key === "Enter") inp.blur()
    if (ev.key === "Escape") { activeGroup = oldName; inp.value = oldName; inp.blur() }
  })
})

/* ================================================= Buttons =============================================== */
$("pauseBtn").addEventListener("click", function() {
  chrome.runtime.sendMessage({ action: "pause" }, function(res) {
    isPaused = res.paused
    $("pauseBtn").textContent = isPaused ? "\u25B6 Resume" : "\u23F8 Pause"
    $("pauseBtn").classList.toggle("paused", isPaused)
  })
})

$("exportAllBtn").addEventListener("click", function() {
  chrome.runtime.sendMessage({ action: "export-all" }, function(res) {
    if (!res || !res.json) return
    var blob = new Blob([res.json], { type: "application/json" })
    var url = URL.createObjectURL(blob)
    var a = document.createElement("a")
    a.href = url
    a.download = "mediatracker_export_" + Date.now() + ".json"
    a.click()
    URL.revokeObjectURL(url)
  })
})

/* ================================================= Search Overlay ========================================== */
var overlayItems = []

$("searchMediaBtn").addEventListener("click", function() {
  chrome.runtime.sendMessage({ action: "search-media" }, function(res) {
    if (!res || !res.count) return
    $("mediaSearchOverlay").classList.add("active")
    overlayItems = res.items
    renderOverlayList()
  })
})

window.closeMediaOverlay = function() {
  $("mediaSearchOverlay").classList.remove("active")
}

$("urlFilterInput").addEventListener("input", function() {
  if (overlayItems.length) renderOverlayList()
})

function renderOverlayList() {
  var q = ($("urlFilterInput") ? $("urlFilterInput").value : "").toLowerCase()
  var list = overlayItems.filter(function(r) { return (r.url || "").toLowerCase().includes(q) })
  var container = $("mediaSearchResults")
  container.innerHTML = ""
  if (!list.length) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:#a6adc8;">No matching media found.</p>'
    return
  }
  for (var oi = Math.min(list.length, 50) - 1; oi >= 0; oi--) {
    var entry = list[oi]
    var item = h("div", { className: "search-result-item" })

    var urlSpan = h("span", { className: "search-result-url", title: escAttr(entry.url) }, trunc(entry.url, 100))
    var typeBadgeEl = h("span")
    typeBadgeEl.className = "type-badge cat-" + entry.category
    typeBadgeEl.textContent = entry.mediaType || entry.category

    item.appendChild(urlSpan)
    item.appendChild(typeBadgeEl)

    if (activeGroup) {
      var btn = document.createElement("button")
      btn.className = "media-select-btn"
      btn.textContent = "+ Assign to " + activeGroup
      btn.addEventListener("click", function(e, g) {
        return function() { assignRequestToGroup(e, g) }
      }(entry, activeGroup))
      item.appendChild(btn)
    }

    container.appendChild(item)
  }
}

/* ================================================= Unmatched Media (left sidebar) ============================ */
$("searchMediaBtn2").addEventListener("click", function() { syncLeftMediaSection() })

function syncLeftMediaSection() {
  var sec = $("mediaSearchSection")
  if (!sec) return
  chrome.runtime.sendMessage({ action: "search-media" }, function(res) {
    if (!res || !res.count) { sec.style.display = "none"; return }
    sec.style.display = "block"
    doRenderUnmatched(res.items)
  })
}

function doRenderUnmatched(items) {
  var container = $("mediaSearchList")
  container.innerHTML = ""
  if (!Array.isArray(items)) items = []

  var unmatched = []
  for (var i = 0; i < items.length; i++) {
    if (items[i].mediaType && !items[i]._groupAssigned) unmatched.push(items[i])
  }
  if (!unmatched.length) return

  for (var ri = Math.min(unmatched.length, 30) - 1; ri >= 0; ri--) {
    var entry    = unmatched[ri]
    var idx      = requestLog.indexOf(entry)
    var row      = h("div", { className: "media-item-row" + (pickedIdx === idx ? " left-picked-highlight" : "") })

    var urlSpan  = h("span", { className: "media-item-url", title: escAttr(entry.url) }, trunc(entry.url, 80))
    var pickBtn  = document.createElement("button")
    pickBtn.className = "media-select-btn pick-btn"
    pickBtn.textContent = "Pick"

    (function(pidx) {
      pickBtn.addEventListener("click", function() {
        pickedIdx = pidx
        syncLeftMediaSection()
      })
    })(idx)

    row.appendChild(urlSpan)
    row.appendChild(pickBtn)
    container.appendChild(row)
  }
}

/* ================================================= Render Right Panel Table ==================================== */
function renderTable() {
  var filter = $("filterSelect").value
  var search = $("searchInput").value.toLowerCase()

  if (activeGroup) {
    /* ---- Group view ---- */
    $("groupView").style.display = "block"
    $("allView").style.display = "none"
    $("groupMediaBreakdown").style.display = "block"

    var grp = groups[activeGroup] || {}
    var type = grp.type || "m3u8_vtt"
    var reqs = grp.requests || []

    if (type === "file") {
      renderFileView(reqs, filter, search)
    } else {
      renderM3U8View(reqs, filter, search)
    }
  } else {
    /* ---- All view ---- */
    $("groupView").style.display = "none"
    $("allView").style.display = "block"
    $("groupMediaBreakdown").style.display = "none"

    var allReq = currentView === "media"
      ? requestLog.filter(function(r) { return r.mediaType })
      : [] + requestLog

    if (search) {
      allReq = allReq.filter(function(r) {
        return ((r.url||"").toLowerCase().includes(search)) ||
               ((r.originUrl||"").toLowerCase().includes(search)) ||
               ((r.host||"").toLowerCase().includes(search)) ||
               ((r.referer||"").toLowerCase().includes(search))
      })
    }
    if (filter !== "all") {
      allReq = allReq.filter(function(r) { return r.category === filter })
    }

    var tbody = $("allLogBody")
    tbody.innerHTML = ""

    var emptyState = $("noRequestsState")
    emptyState.classList.toggle("active", !requestLog.length)

    if (pickedIdx < 0 || pickedIdx >= requestLog.length) pickedIdx = -1

    for (var i = allReq.length - 1; i >= Math.max(0, allReq.length - 500); i--) {
      var r = allReq[i]
      var tr = document.createElement("tr")
      var statusTxt = (r.statusCode == null) ? "-" : ((r.statusCode === -1) ? "ERR" : String(r.statusCode))
      var statusCls = (r.statusCode === -1) ? "status-error" : ((r.statusCode >= 200 && r.statusCode < 400) ? "status-ok" : "")

      if (pickedIdx >= 0 && requestLog[pickedIdx] && r.url === requestLog[pickedIdx].url) {
        tr.style.background = "#cba6f733"
      }

      var tdNum    = h("td", {}, "-")
      var tdType   = h("td", {})
      var badge    = document.createElement("span")
      badge.className = "type-badge cat-" + (r.category || "OTHER")
      badge.textContent = r.mediaType || r.type || "-"
      tdType.appendChild(badge)

      var tdStatus  = h("td", { className: statusCls }, statusTxt)
      var tdMethod  = h("td", {}, r.method || "-")
      var tdUrl     = h("td", { className: "url-cell", title: escAttr(r.url) }, trunc(r.url, 120))
      var tdOrigin  = h("td", { className: "origin-cell", title: escAttr(r.originUrl||"") }, trunc(r.originUrl||"", 80))
      var tdReferer = h("td", { className: "referer-cell", title: escAttr(r.referer||"") }, trunc(r.referer||"", 50))

      tr.appendChild(tdNum)
      tr.appendChild(tdType)
      tr.appendChild(tdStatus)
      tr.appendChild(tdMethod)
      tr.appendChild(tdUrl)
      tr.appendChild(tdOrigin)
      tr.appendChild(tdReferer)

      // Click right row in "All" view -> pick from left
      (function(r) {
        tr.addEventListener("click", function() {
          pickedIdx = requestLog.indexOf(r)
          renderTable()
          syncLeftMediaSection()
        })
      })(r)

      tbody.appendChild(tr)
    }
  }

  updateSummary(activeGroup ? getActiveLog() : requestLog)
}

/* ---- File View (single column) ---- */
function renderFileView(reqs, filter, search) {
  var tbody = $("groupLogBody")
  tbody.innerHTML = ""
  var rows = reqs.slice()
  if (search) {
    rows = rows.filter(function(r) {
      return ((r.url||"").toLowerCase().includes(search)) ||
             ((r.originUrl||"").toLowerCase().includes(search))
    })
  }
  if (filter !== "all") rows = rows.filter(function(r) { return r.category === filter })

  for (var i = rows.length - 1; i >= Math.max(0, rows.length - 500); i--) {
    var tr = buildRowFromReq(rows[i])
    (function(r) {
      tr.addEventListener("click", function() {
        toggleAssignRequest({ url: r.url, method: r.method || "GET", typeLabel: r.type || "", category: r.category, mediaType: r.mediaType })
      })
    })(rows[i])
    tbody.appendChild(tr)
  }
}

/* ---- M3U8 View (two-column split: manifests left | segments right) ---- */
function renderM3U8View(reqs, filter, search) {
  var tbody = $("groupLogBody")
  tbody.innerHTML = ""
  var manifests = [], subtitles = [], segments = [], images = []

  for (var i = 0; i < reqs.length; i++) {
    var u = (reqs[i].url || "").toLowerCase()
    if (/\.m3u8[\?#]|master|m3u8|DASH|\/manifest|\.mpd/.test(u)) manifests.push(reqs[i])
    else if (/vtt|\/subtitle|caption/i.test(u)) subtitles.push(reqs[i])
    else if (/image|png|jpg|jpeg|webp|svg|poster/i.test(u)) images.push(reqs[i])
    else segments.push(reqs[i])
  }

  // Wrap in flex container inside tbody
  var wrap = document.createElement("div")
  wrap.style.cssText = "display:flex;gap:4px;padding:2px 0;flex:1;min-height:300px;"

  // Left pane: manifests + subtitles
  var leftDiv = document.createElement("div")
  leftDiv.style.cssText = "flex:1;overflow-y:auto;padding:2px;border-right:1px solid #313244;"
  manifests.concat(subtitles, images).forEach(function(r) {
    var tr = buildRowFromReq(r)
    tr.title = "Click to assign this manifest/subtitle item"
    // In m3u8 mode, left pane items are the source (manifests)
    tr.addEventListener("click", function() {
      pickedIdx = requestLog.indexOf(r)
      renderTable()
      syncLeftMediaSection()
    })
    leftDiv.appendChild(tr)
  })

  // Right pane: segments
  var rightDiv = document.createElement("div")
  rightDiv.style.cssText = "flex:1;overflow-y:auto;padding:2px;"
  segments.forEach(function(r) {
    var tr = buildRowFromReq(r)
    tr.title = "Click to assign to group"
    (function(r, hasLeftPick) {
      tr.addEventListener("click", function() {
        if (pickedIdx >= 0 && requestLog[pickedIdx]) {
          // User picked a left item first -> assign the right-side row using that as context
          toggleAssignRequest(pickedEntry || requestLog[pickedIdx], activeGroup)
          pickedIdx = -1
          renderTable()
          syncLeftMediaSection()
        } else {
          // No left pick: just add this segment to the group directly
          toggleAssignRequest({ url: r.url, method: r.method || "GET", typeLabel: r.type || "", category: r.category, mediaType: r.mediaType }, activeGroup)
        }
      })
    })(r, pickedIdx >= 0)
    rightDiv.appendChild(tr)
  })

  wrap.appendChild(leftDiv)
  wrap.appendChild(rightDiv)
  tbody.appendChild(wrap)
}

/* ---- Build a row from a request object (used in group view) ---- */
function buildRowFromReq(r) {
  var tr = document.createElement("tr")
  var statusTxt = (r.statusCode == null) ? "-" : ((r.statusCode === -1) ? "ERR" : String(r.statusCode))
  var statusCls = (r.statusCode === -1) ? "status-error" : ((r.statusCode >= 200 && r.statusCode < 400) ? "status-ok" : "")

  tr.appendChild(h("td", {}, ""))  // no number in group view

  var tdType = h("td", { className: "media-type-cell" })
  var badge  = document.createElement("span")
  badge.className = "type-badge cat-" + (r.category || "OTHER")
  badge.textContent = r.mediaType || r.type || "-"
  tdType.appendChild(badge)
  tr.appendChild(tdType)

  tr.appendChild(h("td", { className: statusCls }, statusTxt))
  tr.appendChild(h("td", {}, r.method || "-"))
  tr.appendChild(h("td", { className: "url-cell", title: escAttr(r.url) }, trunc(r.url, 120)))
  tr.appendChild(h("td", { className: "origin-cell", title: escAttr(r.originUrl||"") }, trunc(r.originUrl||"", 80)))
  tr.appendChild(h("td", { className: "referer-cell", title: escAttr(r.referer||"") }, trunc(r.referer||"", 50)))

  return tr
}

/* ================================================= Pick / Assign Logic ===================================== */
function toggleAssignRequest(entry, groupName) {
  if (!entry || !groupName) return
  var grp = groups[groupName]
  if (!grp) return

  // If already in group -> remove it (toggle off)
  // Also mark as _groupAssigned = false so left panel picks it back up
  var existingIdx = grp.requests.findIndex(function(r) { return r.url === entry.url })
  if (existingIdx >= 0) {
    grp.requests.splice(existingIdx, 1)
    chrome.storage.local.set({ groups: groups, groupOrder: groupOrder }, function() {
      loadGroups()
      renderTable()
      syncLeftMediaSection()
    })
    return
  }

  // Add to group
  var newEntry = {
    url: entry.url || (entry.request && entry.request.url),
    method: entry.method || "GET",
    typeLabel: entry.typeLabel || entry.type || "",
    category: entry.category || "OTHER",
    mediaType: entry.mediaType || null,
    timestamp: entry.timestamp || Date.now(),
    statusCode: entry.statusCode
  }

  grp.requests.push(newEntry)
  chrome.storage.local.set({ groups: groups, groupOrder: groupOrder }, function() {
    loadGroups()
    renderTable()
    syncLeftMediaSection()
  })
}

function assignRequestToGroup(entry, groupName) {
  toggleAssignRequest(entry, groupName)
}

/* ================================================= Summary ================================================ */
function updateSummary(log) {
  if (!log || !log.length) {
    $("summary").innerHTML = "Tracking requests as you browse..."
    return
  }
  var counts = {}
  for (var i = 0; i < log.length; i++) { counts[log[i].category] = (counts[log[i].category]||0)+1 }
  var mediaCount = log.filter(function(e) { return e.mediaType }).length
  $("summary").innerHTML =
    "Total: <strong>" + log.length + "</strong> | " +
    "Media: <strong>" + mediaCount + "</strong> | " +
    Object.keys(counts).map(function(k) { return k + ": <strong>" + counts[k] + "</strong>" }).join(" ")
}

/* ================================================= Media Breakdown ======================================== */
function renderGroupBreakdown() {
  if (!activeGroup) return
  var grp = groups[activeGroup]
  if (!grp || !grp.requests.length) { $("mediaBreakdownContent").innerHTML = "No media assets in this group."; return }

  var map = {}
  for (var i = 0; i < grp.requests.length; i++) {
    var c = grp.requests[i].category || "OTHER"
    if (!map[c]) map[c] = []
    map[c].push(grp.requests[i].url)
  }

  var html = ""
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue
    var badge = '<span class="type-badge cat-' + k + '">' + k + ": " + map[k].length + "</span>"
    html += badge + " "
  }
  $("mediaBreakdownContent").innerHTML = html
}

window.closeOverlay = window.closeMediaOverlay

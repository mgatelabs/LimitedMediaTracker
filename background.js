// Store all captured data
let requestLog = [];
let requestMap = {};   // id -> entry, for fast header lookups
let groups = {};
let groupOrder = [];
let isPaused = false;
let excludePatterns = [];

function isExcluded(url) {
  if (!excludePatterns.length) return false;
  const u = (url || '').toLowerCase();
  for (const p of excludePatterns) {
    if (u.includes(p)) return true;
  }
  return false;
}

async function saveState() {
  await chrome.storage.local.set({ groups, groupOrder });
}

async function loadState() {
  const data = await chrome.storage.local.get(['groups', 'groupOrder']);
  if (data.groups) groups = data.groups;
  if (data.groupOrder) groupOrder = data.groupOrder;
}

// =================== Group management ===================

function createGroup(name, type = 'm3u8_vtt', folderId = '') {
  name = name.trim();
  if (!name || name.includes('~')) return null;
  const normalized = name.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const existingName of groupOrder) {
    // Only block duplicates within the same folder (or among unfoldered groups)
    if ((groups[existingName] || {}).folderId !== (folderId || '')) continue;
    const existingNorm = (groups[existingName].displayName || existingName)
      .replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existingNorm === normalized) return null;
  }

  // Use a unique storage key: name alone when no folder, name~folderId otherwise.
  // Append a counter suffix if that key already exists (shouldn't happen in practice).
  let key = folderId ? `${name}~${folderId}` : name;
  if (groups[key]) key = `${key}_${Date.now()}`;

  groups[key] = {
    displayName: name,
    type:        type || 'm3u8_vtt',
    folderId:    folderId || '',
    requests:    [],
    created:     new Date().toISOString()
  };
  groupOrder.push(key);
  saveState();
  return key;
}

function deleteGroup(name) {
  delete groups[name];
  groupOrder = groupOrder.filter(n => n !== name);
  saveState();
}

function updateGroupType(name, newType) {
  if (!groups[name]) return false;
  const validTypes = ['m3u8_vtt', 'file'];
  if (!validTypes.includes(newType)) return false;
  groups[name].type = newType;
  saveState();
  return true;
}

function addRequestToGroup(groupName, request) {
  if (!groups[groupName]) return false;

  const entry = {
    url:          request.url,
    method:       request.method || 'GET',
    type:         request.typeLabel,
    category:     request.category,
    mediaType:    request.mediaType,
    timestamp:    request.timestamp,
    statusCode:   request.statusCode,
    originUrl:    request.originUrl    || '',
    documentUrl:  request.documentUrl  || '',
    referer:      request.referer      || '',
    originHeader: request.originHeader || '',
  };

  groups[groupName].requests.push(entry);
  saveState();
  return true;
}

function renameGroup(oldKey, newName) {
  if (!groups[oldKey] || !newName.trim()) return false;
  newName = newName.trim();
  const folderId = groups[oldKey].folderId || '';
  const newKey = folderId ? `${newName}~${folderId}` : newName;
  if (newKey === oldKey) { groups[oldKey].displayName = newName; saveState(); return true; }

  groups[newKey] = groups[oldKey];
  groups[newKey].displayName = newName;
  delete groups[oldKey];
  const idx = groupOrder.indexOf(oldKey);
  if (idx !== -1) groupOrder[idx] = newKey;

  saveState();
  return true;
}

// Check if a request matches a group by filename patterns
function matchRequestToGroup(request) {
  const url = (request.url || '').toLowerCase();
  
  // Extract episode-like identifiers from URL
  const epPatterns = [
    /s(\d{1,2})e(\d{1,3})/i,           // S01E03
    /season[ _\.]?(\d{1,2})[ _\.]?ep?[ _\.]?\d+/i,  // season 1 episode 3
    /(\d{1,2}x\d{1,3})/,                // 1x03
    /eps?([0-9]{1,3})/i,                // ep3, episode3
    /[ _\.-]e[ _\.\-]?(\d{2,4})/i,     // E01, -E3-, .e.1.
    /episode([_.-]?)(\d{1,3})\1/i,      // episode 1, episode_1
  ];
  
  for (const pattern of epPatterns) {
    const match = url.match(pattern);
    if (match) {
      const foundGroup = groupOrder.find(name => name.toLowerCase().includes(match[0].toLowerCase()));
      if (foundGroup) return foundGroup;
    }
  }
  
  // For m3u8/vtt that follow a known pattern, try to extract series name
  const segmentPatterns = [
    /(series|show|media)[ _\-\.\/]+(.+?)([ _\-\.]?s\d+[ _\-\.]?e\d+|[/_\-\.]\d{1,3})/i,
    /([a-z0-9_-]+)[ _-]+season[ _-]*(\d+)[ _-]+episode[ _-]*(\d+)/i,
  ];
  
  for (const pat of segmentPatterns) {
    const m = url.match(pat);
    if (m && m[2]) {
      return null; // Found pattern but no existing group - could create one
    }
  }
  
  return null;
}

// =================== HTTP Capture ===================

function parseUrl(url) {
  try { return new URL(url); } catch(e) { return null; }
}

function getTypeLabel(type) {
  const labels = {
    main_frame: 'main_frame', sub_frame: 'sub_frame', stylesheet: 'stylesheet',
    script: 'script', image: 'image', font: 'font', object: 'object',
    xmlhttprequest: 'xhr', eventsource: 'eventsource', websocket: 'websocket', ping: 'ping', other: 'other'
  };
  return labels[type] || type;
}

function getCategory(requestUrl, type) {
  const url = requestUrl.toLowerCase();
  const parsedUrl = parseUrl(requestUrl);

  if (parsedUrl && (parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:')) return 'WEBSOCKET';

  // Categorise by request type first — scripts/stylesheets/fonts are never media
  switch (type) {
    case 'script':     return 'SCRIPT';
    case 'stylesheet': return 'STYLESHEET';
    case 'font':       return 'FONT';
    case 'image':      return 'IMAGE';
    case 'main_frame': return 'DOCUMENT';
    case 'sub_frame':  return 'iframe';
    case 'xmlhttprequest': {
      const xPath = url.split('?')[0].split('#')[0];
      if (/\.m3u8$|master\.m3u8|\.mpd$/.test(xPath)) return 'STREAM';
      if (/\.vtt$|\.ttml$|\.srt$/.test(xPath))        return 'SUBTITLE';
      return 'XHR';
    }
    case 'fetch': {
      const fPath = url.split('?')[0].split('#')[0];
      if (/\.m3u8$|master\.m3u8|\.mpd$/.test(fPath)) return 'STREAM';
      if (/\.vtt$|\.ttml$|\.srt$/.test(fPath))        return 'SUBTITLE';
      return 'FETCH';
    }
    case 'media': return 'MEDIA';
  }

  // For 'other' and remaining types use path patterns only
  const basePath = url.split('?')[0].split('#')[0];
  if (/\.m3u8$|master\.m3u8|\.mpd$/.test(basePath)) return 'STREAM';
  if (/\.vtt$|\.ttml$|\.srt$/.test(basePath))        return 'SUBTITLE';
  if (/\.mp4$|\.m4v$/.test(basePath))                return 'VIDEO';
  if (/\.mp3$|\.aac$|\.m4a$/.test(basePath))         return 'AUDIO';

  return 'OTHER';
}

// Media type detection
function isMediaUrl(url, requestType) {
  const u = (url || '').toLowerCase();
  if (!u) return false;

  // Any request Firefox classified as 'media' is video/audio by definition
  if (requestType === 'media') {
    if (/\.mp3|\.aac|\.m4a|\.oga|\.opus|\.flac/.test(u)) return 'AUDIO';
    return 'VIDEO';
  }

  // Strip query string and fragment — only match against the path
  const path = u.split('?')[0].split('#')[0];

  if (/\.m3u8$|master\.m3u8/.test(path))              return 'STREAM';
  if (/\.mpd$/.test(path))                             return 'STREAM';
  if (/\.vtt$|\.ttml$|\.srt$/.test(path))             return 'SUBTITLE';
  if (/\.mp4$|\.m4v$|\.m4s$/.test(path))              return 'VIDEO';
  if (/\.mp3$|\.aac$|\.m4a$/.test(path))              return 'AUDIO';
  if (/\.ts$|\.cmaf$/.test(path))                      return 'SEGMENT';

  return false;
}

function extractRequestInfo(details) {
  const parsedUrl = parseUrl(details.url);
  const url = details.url || '';

  // originUrl: Firefox-specific field, falls back to documentUrl then initiator
  let originUrl = details.originUrl || details.documentUrl || '';
  if (!originUrl && details.initiator && details.initiator !== 'null' && !details.initiator.startsWith('moz-extension')) {
    originUrl = details.initiator;
  }

  return {
    id:          details.id,
    url:         url,
    method:      details.method || '-',
    host:        parsedUrl ? parsedUrl.host : '-',
    originUrl:   originUrl || '-',
    documentUrl: details.documentUrl || '-',
    frameId:     details.frameId != null ? details.frameId : '-',
    // Headers filled in by onBeforeSendHeaders
    referer:     '-',
    originHeader: '-',
    statusCode:  null,
    typeLabel:   getTypeLabel(details.type),
    category:    getCategory(url, details.type),
    mediaType:   isMediaUrl(url, details.type),
  };
}

// Capture Referer and Origin request headers
chrome.webRequest.onBeforeSendHeaders.addListener(function (details) {
  if (isPaused) return;
  const entry = requestMap[details.id];
  if (!entry || !details.requestHeaders) return;
  for (const h of details.requestHeaders) {
    const name = h.name.toLowerCase();
    if (name === 'referer') entry.referer      = h.value || '';
    if (name === 'origin')  entry.originHeader = h.value || '';
  }
}, {
  urls: ['<all_urls>'],
  types: [
    'main_frame', 'sub_frame',
    'stylesheet', 'script', 'image', 'font', 'object',
    'xmlhttprequest', 'fetch',
    'media',
    'eventsource', 'websocket', 'ping', 'other'
  ]
}, ['requestHeaders']);

// Listen for request start
chrome.webRequest.onBeforeRequest.addListener(function (details) {
  if (isPaused) return;
  if (isExcluded(details.url)) return;

  const info = extractRequestInfo(details);
  requestLog.push(info);
  requestMap[details.id] = info;   // index by id for header lookup
  
  // Auto-detect media requests and try to match/create groups
  if (info.mediaType && !info._groupAssigned) {
    autoMatchMediaRequest(info);
  }

  saveState();

  return { cancel: false };
}, {
  urls: ['<all_urls>'],
  types: [
    'main_frame', 'sub_frame',
    'stylesheet', 'script', 'image', 'font', 'object',
    'xmlhttprequest', 'fetch',
    'media',
    'eventsource', 'websocket', 'ping', 'other'
  ]
});

// Auto-match media requests to groups
function autoMatchMediaRequest(request) {
  const url = (request.url || '').toLowerCase();
  
  // For m3u8, look for related items in already-captured log first
  if (url.includes('m3u8') || url.includes('master')) {
    extractEpisodeIdentifier(url);
    
    // Find siblings that were captured recently within the same page context
    const documentUrl = request.originUrl.toLowerCase();
    const currentTime = new Date(request.timestamp || Date.now()).getTime();
    
    const siblings = requestLog.filter(r => {
      const reqTime = new Date(r.timestamp || Date.now()).getTime();
      return Math.abs(reqTime - currentTime) < 3000 &&  // within 3 seconds
             r.category === 'SECTION' || 
             (r.mediaType === 'SUBTITLE') || 
             (r.url.toLowerCase().includes(documentUrl.split('/').slice(-2).join('/')));
    });
    
    return; // Group assignments will happen via popup UI
  }
  
  // For VTT/subtitles, try to find matching m3u8 group
  if (request.mediaType === 'SUBTITLE') {
    const baseName = (request.url || '').replace(/[#\?].*$/, '').split('/').pop().toLowerCase();
    for (const groupName of groupOrder) {
      const name = groupName.toLowerCase();
      // Try to match episode identifier from URL to group name
      const epMatch = url.match(/[Ss](\d+)[EeEe]?(\d+)/);
      if (epMatch && name.includes(`s${epMatch[1]}e`)) {
        addRequestToGroup(groupName, request);
        return;
      }
    }
  }
}

function extractEpisodeIdentifier(url) {
  // Try to extract SxE patterns from URL
  const sxE = url.match(/[sS](\d+)[eE](\d+)/);
  if (sxE) return `S${sxE[1]}E${sxE[2]}`;
  
  const numEp = url.match(/episode[_\-\.]?(\d+)/i);
  if (numEp) return `Episode ${numEp[1]}`;
  
  // Try to find segment patterns like ep03, e1, etc.
  const genericEp = url.match(/[._-](\d{3})/);
  if (genericEp) return genericEp[1];
  
  return null;
}

// Update status code when response completes
chrome.webRequest.onCompleted.addListener(function (details) {
  if (isPaused) return;

  const entry = requestLog.find(e => e.id === details.id);
  if (entry) {
    entry.statusCode = details.responseStatusCode;
    entry.responseStarted = new Date().toISOString();
    
    // Try to match group based on type
    if (entry.mediaType && entry.mediaType !== false) {
      findAndAssignGroup(entry);
    }
    
    saveState();
  }
}, {
  urls: ['<all_urls>']
});

// Try to find the right group for a request based on URL patterns
function findAndAssignGroup(request) {
  const url = (request.url || '').toLowerCase();
  
  // For stream manifests, look for related media in recent history
  if (url.includes('m3u8') && !groups[request.originUrl.split('/').slice(-1)[0].replace(/[#?]/g,'')]?.requests) {
    const basePath = request.originUrl.replace(/#.*/, '').split('/');
    const lastDir = basePath.slice(0, -1).pop() || '';
    
    for (const groupName of groupOrder) {
      // Try to match base path or filename
      if (groupName.toLowerCase().includes(lastDir.toLowerCase()) || 
          groupName.match(/\d/) && url.includes(groupName.replace(/[^0-9]/g,''))) {
        addRequestToGroup(groupName, request);
        return;
      }
    }
  }
}

// Capture error status codes
chrome.webRequest.onErrorOccurred.addListener(function (details) {
  if (isPaused) return;

  const existingEntry = requestLog.find(e => e.id === details.id);
  if (!existingEntry) {
    const info = extractRequestInfo({
      id: Date.now(), url: details.url || 'Unknown URL', type: 'other'
    });
    info.statusCode = -1;
    requestLog.push(info);
    saveState();
  } else {
    existingEntry.statusCode = -1;
    saveState();
  }
}, {
  urls: ['<all_urls>']
});

// Export JSON for a group
function exportGroup(groupName) {
  const group = groups[groupName];
  if (!group) return null;
  
  // Group URLs by type/relationship
  const segments = [];
  let masterManifest = null;
  let subtitles = {};
  let images = [];

  for (const req of group.requests || []) {
    const url = (req.url || '').toLowerCase();
    
    if (/m3u8|manifest/i.test(url) && !masterManifest) {
      masterManifest = { url: req.url, category: req.category };
    } else if (req.category === 'SUBTITLE') {
      subtitles[extractSubtitleLang(url)] = req.url;
    } else if (url.includes('segment') || url.endsWith('.ts')) {
      segments.push({ url: req.url, type: req.category });
    } else if (/image|png|jpg|jpeg|webp|svg/i.test(url)) {
      images.push(req.url);
    } else if (!masterManifest) {
      segments.push({ url: req.url, type: req.category });
    }
  }
  
  return {
    name: groupName,
    created: group.created,
    totalItems: (group.requests || []).length,
    masterManifest: masterManifest,
    subtitles: Object.values(subtitles),
    segments: segments.map(s => ({ url: s.url })),
    images: images,
    allUrls: (group.requests || []).map(r => r.url)
  };
}

function extractSubtitleLang(url) {
  const u = url.toLowerCase();
  if (/en|eng|english/.test(u)) return 'en';
  if (/es|spa|spanish/.test(u)) return 'es';
  if (/fr|fra|french/.test(u)) return 'fr';
  if (/de|ger|german/.test(u)) return 'de';
  if (/pt|por|portuguese/.test(u)) return 'pt';
  if (/ja|jpn|japanese/.test(u)) return 'ja';
  return 'unknown_' + (u.match(/subtitle\/(.+)\/?/) || ['?', 'unknown'])[1];
}

// Export all groups as JSON
function exportAllGroups() {
  const result = {
    generatedAt: new Date().toISOString(),
    extensionVersion: '1.0',
    groups: []
  };
  
  for (const name of groupOrder) {
    const exported = exportGroup(name);
    if (exported) result.groups.push(exported);
  }
  
  return JSON.stringify(result, null, 2);
}

// Export single group as JSON
function exportGroupJson(groupName) {
  const exported = exportGroup(groupName);
  return JSON.stringify(exported || {}, null, 2);
}

// =================== Background messaging ===================

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'set-excludes') {
    excludePatterns = (request.patterns || []).map(p => p.toLowerCase()).filter(Boolean);
    sendResponse({ ok: true });
  } else if (request.action === 'getLog') {
    sendResponse({ log: requestLog, count: requestLog.length });
  } else if (request.action === 'clearLog') {
    requestLog = [];
    requestMap = {};
    chrome.storage.local.remove('log');
    sendResponse({ cleared: true });
  } else if (request.action === 'pause') {
    isPaused = !isPaused;
    sendResponse({ paused: isPaused });
  } else if (request.action === 'groups-get') {
    sendResponse({ groups, groupOrder });
  } else if (request.action === 'group-create') {
    const name = createGroup(request.name, request.type, request.folderId || '');
    sendResponse({ created: name || null });
  } else if (request.action === 'group-delete') {
    deleteGroup(request.name);
    sendResponse({ deleted: true });
  } else if (request.action === 'group-rename') {
    const ok = renameGroup(request.oldName, request.newName);
    sendResponse({ renamed: ok });
  } else if (request.action === 'group-update-type') {
    const ok = updateGroupType(request.name, request.type);
    sendResponse({ updated: ok });
  } else if (request.action === 'groups-clear-folder') {
    // Remove folderId from every group that references the given folder id
    for (const name of groupOrder) {
      if (groups[name] && groups[name].folderId === request.folderId) {
        groups[name].folderId = '';
      }
    }
    saveState();
    sendResponse({ cleared: true });
  } else if (request.action === 'group-add-item') {
    addRequestToGroup(request.groupName, request.request);
    sendResponse({ added: true });
  } else if (request.action === 'group-clear-items') {
    if (groups[request.name]) { groups[request.name].requests = []; saveState(); }
    sendResponse({ cleared: true });
  } else if (request.action === 'export-group') {
    const json = exportGroupJson(request.groupName);
    sendResponse({ json });
  } else if (request.action === 'export-all') {
    const json = exportAllGroups();
    sendResponse({ json });
  } else if (request.action === 'search-media') {
    // Search captured log for media items not yet assigned to a group
    const found = requestLog.filter(r => r.mediaType && !r._groupAssigned).slice(-50);
    sendResponse({ items: found, count: found.length });
  }
});

// Load existing state on startup
loadState();

// =================== Context menus ===================

chrome.contextMenus.create({
  id: 'open-tracker',
  title: 'Open Media Tracker',
  contexts: ['all']
});

chrome.contextMenus.create({
  id: 'clear-requests',
  title: 'Clear Captured Requests',
  contexts: ['all']
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'open-tracker') {
    chrome.windows.create({
      url: chrome.runtime.getURL('window.html'),
      type: 'popup',
      width: 1280,
      height: 780
    });
  } else if (info.menuItemId === 'clear-requests') {
    requestLog = [];
    requestMap = {};
    chrome.storage.local.remove('log');
  }
});

browser.windows.getAll({ populate: true }, function (windows) {
  var targetUrl = browser.runtime.getURL("window.html");
  var existing = null;
  for (var i = 0; i < windows.length; i++) {
    var tabs = windows[i].tabs || [];
    for (var j = 0; j < tabs.length; j++) {
      if (tabs[j].url === targetUrl) { existing = windows[i]; break; }
    }
    if (existing) break;
  }
  if (existing) {
    browser.windows.update(existing.id, { focused: true });
  } else {
    browser.windows.create({
      url: targetUrl,
      type: "popup",
      width: 1280,
      height: 780
    });
  }
  window.close();
});

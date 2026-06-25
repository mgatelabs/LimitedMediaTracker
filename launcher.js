browser.windows.create({
  url: browser.runtime.getURL("window.html"),
  type: "popup",
  width: 1280,
  height: 780
});
window.close();

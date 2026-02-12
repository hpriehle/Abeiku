(function () {
  var script = document.currentScript;
  if (!script) return;

  var hotel = script.getAttribute("data-hotel");
  if (!hotel) {
    console.error("Abeiku widget: missing data-hotel attribute");
    return;
  }

  var origin = script.src.replace(/\/embed\.js.*$/, "");
  var src = origin + "/widget/" + hotel + "/embed";

  var iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.cssText =
    "width:100%;border:none;overflow:hidden;display:block;min-height:200px;";
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("title", "Booking Widget");
  iframe.setAttribute("loading", "lazy");

  // Insert iframe where the script tag is
  script.parentNode.insertBefore(iframe, script);

  // Auto-resize based on content height
  window.addEventListener("message", function (e) {
    if (e.source !== iframe.contentWindow) return;
    if (e.data && e.data.type === "abeiku-resize") {
      iframe.style.height = e.data.height + "px";
    }
  });
})();

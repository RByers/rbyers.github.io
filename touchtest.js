document.addEventListener("touchstart", logTouch, true);
document.addEventListener("touchmove", logTouch, true);
document.addEventListener("touchend", logTouch, true);
document.addEventListener("mousedown", logTouch, true);
document.addEventListener("mousemove", logTouch, true);
document.addEventListener("mouseup", logTouch, true);

var log = null;
function logTouch(event) {
  event.preventDefault();
  if (!log)
    log = document.getElementById("log");
  var item = document.createElement("li");

  var txt = event.type + " ";
  try {
    txt += "<div>Changed Touches: " + event.changedTouches.length + "</div>";
    txt += "<div>Touches: " + event.touches.length + "</div>";
    txt += "<div>Target Touches: " + event.targetTouches.length + "</div>";
  } catch(ex) {
    txt += "<div>" + ex + "</div>";
  }

  txt += "<div>Target</div>";
  try { txt += "<div>Target: " + event.target + "</div>"; } catch(ex) { txt += "<div>Target: " + ex + "</div>"; }
  try { txt += "<div>URL: " + event.target.ownerDocument.URL + "</div>"; } catch(ex) { txt += "<div>URL: " + ex + "</div>"; }
//  if (event.target.nodeName != "BODY" && event.target.nodeName != "HTML")
//    try { txt += "<div>InnerHTML: " + event.target.innerHTML + "</div>"; } catch(ex) { txt += "<div>InnerHTML: " + ex + "</div>"; }

  if (event.touches) {
    for (var i = 0; i < event.touches.length; i++) {
      try {
        txt += "<div>touch " + i + ": " + event.touches[i].screenX + "," + event.touches[i].screenY + "</div>";
        try { txt += "<div>Target: " + event.touches[i].target + "</div>"; } catch(ex) { txt += "<div>Target: " + ex + "</div>"; }
        try { txt += "<div>URL: " + event.touches[i].target.ownerDocument.URL + "</div>"; } catch(ex) { txt += "<div>URL: " + ex + "</div>"; }
//        if (event.target.nodeName != "BODY" && event.target.nodeName != "HTML")
//          try { txt += "<div>InnerHTML: " + event.touches[i].target.innerHTML + "</div>"; } catch(ex) { txt += "<div>InnerHTML: " + ex + "</div>"; }
      } catch(ex) {
        txt += "<div>" + ex + "</div>";
      }
    }
  }
  item.innerHTML = txt;
  log.insertBefore(item, log.firstChild);
}

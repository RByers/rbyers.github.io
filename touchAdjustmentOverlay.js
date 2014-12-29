// To use this script to debug a page, paste the following JS into the devtools console:
// (function() { var s = document.createElement('script'); s.src = 'http://www.rbyers.net/touchAdjustmentOverlay.js'; document.documentElement.appendChild(s) })();

var dotRadius = 3;

(function () {

  var canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.right = '0';
  canvas.style.bottom = '0';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  function onResize() {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.scrollHeight;
  }
  window.addEventListener('resize', onResize);
  onResize();
  
  function getPosition(node) {
    var r = node.getBoundingClientRect();
    return {
      x: r.left + document.body.scrollLeft,
      y: r.top + document.body.scrollTop
    }
  }

  function nodeName(node) {
    if (node)
      return node.id || node.nodeName;     
    return "[null]";
  }

  function log(str) {
    var l = document.getElementById('touchAdjustmentLog');
    if (l)
      l.textContent += str + '\n';
    else
      console.log(str);
  }

  function clearLog() {
    var l = document.getElementById('touchAdjustmentLog');
    if (l)
      l.textContent = '';
   }

  function logNodes(left, top, right, bottom) {
    // Additional logging when running content_shell with --expose-internals-for-testing
    if (!window.internals)
      return;

    var nodes = internals.nodesFromRect(document, 
      (left + right) / 2, 
      (top + bottom) / 2, 
      (right - left) / 2,
      (bottom - top) / 2,
      (right - left) / 2,
      (bottom - top) / 2,
      true /* ignoreClipping */,
      true /* allow child-frame content */);

    var nodeStr = '';
    for (var i = 0; nodes && i < nodes.length; i++) {
      var node = nodes[i];
      if (node.nodeType == Node.ELEMENT_NODE)
        node.classList.add('adjustmentCandidate');
      nodeStr += nodeName(node) + ' ';
    }
    log('nodesFromRect: ' + nodeStr + '\n');
  }

  var target = window;
  var top, left, bottom, right;

  function onTouchEvent(e) {
    if (e.touches.length > 1 || (e.type=='touchend' && e.touches.length > 0))
      return; // ignore multi-touch
    var id = e.target.id;
    var touch = e.changedTouches[0];
    var ctx = canvas.getContext('2d');

    if (e.type == 'touchstart') {
      top = Infinity;
      left = Infinity;
      bottom = -Infinity;
      right = -Infinity;
      clearLog();
      if (window.internals) {
        var cnodes = document.querySelectorAll('.adjustmentCandidate');
        for (var i = 0; i < cnodes.length; i++)
          cnodes[i].classList.remove('candidate');
      }
    }

    if (e.type != 'touchend') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    var radiusX = touch.radiusX || touch.webkitRadiusX;
    var radiusY = touch.radiusY || touch.webkitRadiusY;
    var knownRadius = true;

    // Apply default radius similar to what Chrome will use for the
    // tap area when no radius is provided by the hardware.
    if (!radiusX || radiusX == 1) {
      knownRadius = false;
      radiusX = 25;
    }

    if (radiusX > 1 && radiusY == 1)
      radiusY = radiusX;   // only one radius supported

    top = Math.min(top, touch.pageY - radiusY);
    left = Math.min(left, touch.pageX - radiusX);
    bottom = Math.max(bottom, touch.pageY + radiusY);
    right = Math.max(right, touch.pageX + radiusX);

    // draw touch border
    var pt = getPosition(canvas);
    ctx.beginPath();
    ctx.strokeStyle = knownRadius ? '#00FF00' : '#007700';
    ctx.lineWidth = knownRadius ? 3 : 1;
    ctx.rect(left - pt.x, top - pt.y, right - left, bottom - top); 
    ctx.stroke();

    var msg = e.type + ': ' + Math.round(touch.clientX) + ', ' + Math.round(touch.clientY) + 
      ' (' + nodeName(document.elementFromPoint(touch.clientX, touch.clientY)) +') radius=' + 
      Math.round(touch.radiusX || touch.webkitRadiusX) + 'x' + Math.round(touch.radiusY || touch.webkitRadiusY);
    log(msg);

    if (e.type == 'touchend') {
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(touch.pageX - pt.x, touch.pageY - pt.y, dotRadius, 0, 2*Math.PI, true);
      ctx.fill();
      logNodes(left, top, right, bottom);
    } 
  }

  function onClick(e) {
    // disable link navigation for easier testing
    if (e.target.nodeName == "A")
      e.preventDefault();

    var id = e.target.id;
    var ctx = canvas.getContext('2d');

    log('click: ' + e.pageX + ', ' + e.pageY + ' (' + id + ')');
    var pt = getPosition(canvas);
    var offsetX = e.pageX - pt.x;
    var offsetY = e.pageY - pt.y;
    ctx.fillStyle = '#0000FF';
    ctx.beginPath();
    ctx.arc(offsetX, offsetY, dotRadius, 0, 2*Math.PI, true);
    ctx.fill();
  }

  target.addEventListener('touchstart', onTouchEvent);
  target.addEventListener('touchend', onTouchEvent);
  target.addEventListener('touchmove', onTouchEvent);
  target.addEventListener('click', onClick);

}());

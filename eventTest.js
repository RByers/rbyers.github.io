var targetElem = document.getElementById('touchTarget');
var logElem = document.getElementById('log');
logElem.innerHTML += '\n';

function updateHandlers()
{
    var setHandlerState = function(events, handler, state) {
        for (var i = 0; i < events.length; i++) {
            if (state) {
                targetElem.addEventListener(events[i], handler, false);
            }
            else {
                targetElem.removeEventListener(events[i], handler);
            }
        }
    }

    setHandlerState(
        ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup',
        'mouseover', 'mousemove', 'mouseout', 'mouseenter', 'mouseleave',
        'focus', 'mousewheel'], 
        mouseEventHandler,
        document.getElementById('enableMouseEvents').checked);

    setHandlerState(
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
        touchEventHandler,
        document.getElementById('enableTouchEvents').checked);
    
    setHandlerState(
        ['MSPointerDown', 'MSPointerMove', 'MSPointerUp', 'MSPointerOver',
        'MSPointerOut', 'MSPointerCancel', 'MSPointerHover'],
        mouseEventHandler,
        document.getElementById('enablePointerEvents').checked);

    setHandlerState(
        ['gesturestart', 'gesturechange', 'gestureend'],
        gestureEventHandler,
        document.getElementById('enableGestureEvents').checked);

    setHandlerState(
        ['dragstart', 'dragenter', 'dragleave', 'drop', 'dragend'],
        mouseEventHandler,
        document.getElementById('enableDragEvents').checked);
}

var lastLog = log.innerHTML;
var lastEvent;
var dupCount = 0;

function logEvent(event, msg)
{
  // prevent too much scrolling - overwrite the last line unless this is a new
  // event type or not a move event
  if (document.getElementById('coalesce').checked && event.type == lastEvent && 
      (event.type=='mousemove' || event.type=='touchmove' || event.type=='MSPointerMove')) {
    dupCount++;
  } else {
    lastLog = log.innerHTML;
    dupCount = 0;
  }
  lastEvent = event.type;
  log.innerHTML = lastLog + event.type +
    (dupCount > 0 ? '[' + dupCount + ']' : '') +
    ': target=' + event.target.id + ' ' + msg + '\n';
  log.scrollTop = log.scrollHeight;
}

function mouseEventHandler(event)
{
  // Click buster stuff
  var msg = '';
  if (gestureActive) {
    msg += 'gesture-active ';
  }
  if (event.type == 'mousewheel' ) {
    msg += ', wheelDelta=' + event.wheelDelta;
  }
  if (event.type.toLowerCase().indexOf("mspointer")==0) {
    msg += ', pointerType=' + event.pointerType + ', pointerId=' +
      event.pointerId;
  }
 
  msg = 'clientX=' + event.clientX + ', clientY=' + event.clientY + 
      ', detail=' + event.detail + msg;
  
  logEvent(event, msg);
}

// True if a gesture is occuring that should cause clicks to be swallowed
var gestureActive = false;

// The position a touch was last started
var lastTouchStartPosition;

// Distance which a touch needs to move to be considered a drag
var DRAG_DISTANCE=3;

var touchMap = {};
var nextId = 1;

function makeTouchList(touches, verbose)
{
  var touchStr = '';
  for(var i = 0; i < touches.length; i++) {
    var tgt = '';
    if (verbose)
      tgt = '-' + touches[i].target.id;

    if (!verbose || document.getElementById('simple').checked) {
      var id = touches[i].identifier;
      if (!(id in touchMap)) {
        touchMap[id] = nextId;
        nextId++;
      }
      touchStr += touchMap[id] + tgt + ' ';
    } else {
      touchStr += touches[i].identifier + tgt + '(' + touches[i].clientX + ',' + touches[i].clientY;
      if ('webkitForce' in touches[i]) {
        touchStr += ',f' + Math.round(touches[i].webkitForce*100);
      }

      if (touches[i].webkitRadiusX || touches[i].webkitRadiusY) {
        touchStr += ',' + touches[i].webkitRadiusX + 'x' +
            touches[i].webkitRadiusY;
      }
      touchStr += ') ';
    }
  }
  return touchStr;
}

var preventDefaultTouch = document.getElementById('preventDefaultTouch');

function touchEventHandler(event)
{
    var touchStr =
      'touches=' + makeTouchList(event.touches, true) +
      'changedTouches=' + makeTouchList(event.changedTouches) +
      'targetTouches=' + makeTouchList(event.targetTouches);

    logEvent(event, touchStr);

    if (preventDefaultTouch &&
        preventDefaultTouch.checked ) {
      event.preventDefault();
    }
}

function gestureEventHandler(event)
{
    logEvent(event, 'scale=' + event.scale + ', rotation=' + event.rotation);
}

document.getElementById('enableMouseEvents').addEventListener('click', updateHandlers, false);
document.getElementById('enableTouchEvents').addEventListener('click', updateHandlers, false);
document.getElementById('enableGestureEvents').addEventListener('click', updateHandlers, false);
document.getElementById('enablePointerEvents').addEventListener('click', updateHandlers, false);
updateHandlers();

var blue = document.getElementById('blue');
blue.addEventListener('mousedown', function(e) { blue.className='noevents'; });
blue.addEventListener('touchstart', function(e) { blue.className='noevents'; });
document.addEventListener('mouseup', function(e) { blue.className=''; });
document.addEventListener('touchend', function(e) { blue.className=''; });

// Disable drag and drop on the document so it doesn't interfere with events
document.addEventListener('dragstart', function(e) {
  e.preventDefault();
}, true);


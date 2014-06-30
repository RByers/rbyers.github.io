function $(str) {
  return document.getElementById(str);
}

var targetElem = $('touchTarget');
var logElem = $('log');

function updateHandlers()
{
    var setHandlerState = function(events, target, handler, state) {
        for (var i = 0; i < events.length; i++) {
            if (state) {
                target.addEventListener(events[i], handler);
            }
            else {
                target.removeEventListener(events[i], handler);
            }
        }
    }

    setHandlerState(
        ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup',
        'mouseover', 'mousemove', 'mouseout', 'mouseenter', 'mouseleave',
        'focus', 'mousewheel', 'wheel'], 
        targetElem, mouseEventHandler,
        $('enableMouseEvents').checked);

    setHandlerState(
        ['scroll'],
        targetElem, logEvent,
        $('enableScrollEvents').checked);

    // Scroll event doesn't bubble, listen for it directly
    setHandlerState(
        ['scroll'],
        $('scroll'), logEvent,
        $('enableScrollEvents').checked);

    setHandlerState(
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
        targetElem, touchEventHandler,
        $('enableTouchEvents').checked);
    
    setHandlerState(
        ['MSPointerDown', 'MSPointerMove', 'MSPointerUp', 'MSPointerOver',
        'MSPointerOut', 'MSPointerCancel', 'MSPointerHover', 
        'MSGotPointerCapture', 'MSLostPointerCapture',
        'pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout',
        'pointerenter', 'pointerleave', 'pointercancel',
        'gotpointercapture', 'lostpointercapture'],
        targetElem, mouseEventHandler,
        $('enablePointerEvents').checked);

    setHandlerState(
        ['gesturestart', 'gesturechange', 'gestureend'],
        targetElem, gestureEventHandler,
        $('enableGestureEvents').checked);

    setHandlerState(
        ['dragstart', 'dragenter', 'dragleave', 'drop', 'dragend'],
        targetElem, mouseEventHandler,
        $('enableDragEvents').checked);

    setHandlerState(
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
        $('red'), touchEventHandler,
        $('redHandlers').checked);

}

var lastLog = log.innerHTML;
var lastEvent;
var dupCount = 0;

function log(msg)
{
  logElem.innerHTML += msg + '\n';
  logElem.scrollTop = logElem.scrollHeight;
}

var lastTime = undefined;

function logEvent(event, msg)
{
  if (event.shiftKey) msg += ' shift';
  if (event.altKey) msg += ' alt';
  if (event.ctrlKey) msg += ' ctrl';
  if (event.metaKey) msg += ' meta';

  if (lastTime) {
    msg += ' ' + (event.timeStamp - lastTime) + 'ms';
  }
  lastTime = event.timeStamp;

  // prevent too much scrolling - overwrite the last line unless this is a new
  // event type or not a move event
  if ($('coalesce').checked && event.type == lastEvent && 
      (event.type=='mousemove' || event.type=='touchmove' || event.type=='MSPointerMove' || event.type=='scroll')) {
    dupCount++;
  } else {
    lastLog = logElem.innerHTML;
    dupCount = 0;
  }
  lastEvent = event.type;
  logElem.innerHTML = lastLog + event.type +
    (dupCount > 0 ? '[' + dupCount + ']' : '') +
    ': target=' + event.target.id + ' ' + msg + '\n';
  logElem.scrollTop = logElem.scrollHeight;
}

function callPreventDefault(event)
{
  var evtName = event.type;
  if (evtName.indexOf("MS") == 0)
      evtName = evtName.substr(2).toLowerCase();
  var pdConfig = $('pd-' + evtName);
  if (pdConfig && pdConfig.checked)
      event.preventDefault();
}

function mouseEventHandler(event)
{
  var msg = '';
  if (gestureActive) {
    msg += 'gesture-active ';
  }
  if (event.type == 'mousewheel' ) {
    msg += ', wheelDelta=' + event.wheelDelta + 
      ' (' + event.wheelDeltaX + ',' + event.wheelDeltaY + ')';
  }
  if (event.type == 'wheel' ) {
    msg += ', deltaX=' + event.deltaX + ', deltaY=' + event.deltaY + 
      ', deltaZ=' + event.deltaZ;
  }
  if (event.type == 'mousewheel' || event.type == 'wheel') {
    msg += ', deltaMode=' + (
      event.deltaMode == 0 ? "PIXEL" :
      event.deltaMode == 1 ? "LINE" :
      event.deltaMode == 2 ? "PAGE" : 
      event.deltaMode); 
  }
  if (event.type.toLowerCase().indexOf("pointer") != -1) {
    msg += ', pointerType=' + event.pointerType + ', pointerId=' +
      event.pointerId + ', width=' + event.width + ', height=' + event.height + 
      ', pressure=' + event.pressure + ', tiltX=' + event.tiltX + ', tiltY=' + event.tiltY;
  }
 
  msg = 'client=' + event.clientX + ',' + event.clientY + 
      ' screen=' + event.screenX + ',' + event.screenY +
      ' button=' + event.button + ' buttons=' + event.buttons +
      ' detail=' + event.detail + ' cancelable=' + event.cancelable + msg;
  
  logEvent(event, msg);

  callPreventDefault(event);

  if (event.type=='MSPointerDown' && $('pointercapture').checked) {
    event.target.msSetPointerCapture(event.pointerId);
  }	
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
    if (i > 0)
      touchStr += ' ';

    if (verbose)
      tgt = '-' + touches[i].target.id;
      
    var id = touches[i].identifier;
    if (id >= 100) {
      if (!(id in touchMap)) {
        touchMap[id] = nextId;
        nextId++;
      }
      id = '#' + touchMap[id];
    }

    if (!verbose || $('simple').checked) {
      touchStr += id + tgt;
    } else {
      touchStr += id + tgt + '(c=' + touches[i].clientX + ',' + touches[i].clientY +
        ' s=' + touches[i].screenX + ',' + touches[i].screenY;
      if ('webkitForce' in touches[i]) {
        touchStr += ' f' + Math.round(touches[i].webkitForce*100);
      }

      if (touches[i].webkitRadiusX || touches[i].webkitRadiusY) {
        touchStr += ' ' + touches[i].webkitRadiusX + 'x' +
            touches[i].webkitRadiusY;
      }
      if ('webkitRotationAngle' in touches[i]) {
        touchStr += ' ' + touches[i].webkitRotationAngle + '&deg;'
      }
      touchStr += ')';
    }
  }
  return touchStr;
}

var activeTouchData = {};

function touchEventHandler(event)
{
    var touchStr =
      ' touches=' + makeTouchList(event.touches, true) +
      ' changed=' + makeTouchList(event.changedTouches) +
      ' target=' + makeTouchList(event.targetTouches)

    if (!$('simple').checked) {
      touchStr += ' cancelable=' + event.cancelable;
    }

    logEvent(event, touchStr);

    if ($('touchSummary').checked) {
      for (var i = 0; i < event.changedTouches.length; i++) {
        var touch = event.changedTouches[i];

        if (event.type == 'touchstart') {	
          var touchData = {
            startTime: event.timeStamp,
            startX: touch.screenX,
            startY: touch.screenY,
            maxDist: 0,
            maxMDist: 0
          };
          activeTouchData[touch.identifier] = touchData;
        } else {
          var touchData = activeTouchData[touch.identifier];
          var distX = Math.abs(touch.screenX - touchData.startX);
          var distY = Math.abs(touch.screenY - touchData.startY);
          touchData.maxDist = Math.max(touchData.maxDist,
            Math.sqrt(distX*distX + distY*distY));
          touchData.maxMDist = Math.max(touchData.maxMDist, distX + distY);
          if (event.type == 'touchend') {
            log('touch ' + touch.identifier + ' summary:' +
              ' dist=(' + distX + ',' + distY + ')' +
              ' max-dist=' + Math.round(touchData.maxDist) +
              ' max-manhattan-dist=' + touchData.maxMDist + 
              ' dur=' + (event.timeStamp - touchData.startTime)/1000);
            delete activeTouchData[touch.identifier];
          }
        }
      }
    }
    callPreventDefault(event);
}

function gestureEventHandler(event)
{
    logEvent(event, 'scale=' + event.scale + ', rotation=' + event.rotation);
}

function updateConfigSummary() {
  var checkboxes = document.querySelectorAll('#config input[type=checkbox]');
  var summary = '';
  for(var i = 0; i < checkboxes.length; i++)
  {
    if (checkboxes[i].checked)
      summary += checkboxes[i].id + ' ';
  }
  $('config-summary').textContent = summary;
}

function writeConfigState() {
  var eventConfig = {};
  var checkboxes = document.querySelectorAll('#config input[type=checkbox]');
  for(var i = 0; i < checkboxes.length; i++)
    eventConfig[checkboxes[i].id] = checkboxes[i].checked;
  localStorage.eventConfig = JSON.stringify(eventConfig);
}

function readConfigState() {
  if (localStorage.eventConfig) {
    var eventConfig = JSON.parse(localStorage.eventConfig);
    var checkboxes = document.querySelectorAll('#config input[type=checkbox]');
    for(var i = 0; i < checkboxes.length; i++)
      if (checkboxes[i].id in eventConfig)
        checkboxes[i].checked = eventConfig[checkboxes[i].id];    
  }
}

$('btnConfig').addEventListener('click', function() {
  $('overlay').className = '';
});

$('btnOk').addEventListener('click', function() {
  $('overlay').className = 'hide';
  updateConfigSummary();
  writeConfigState();
});

// Disable drag and drop on the document so it doesn't interfere with events
document.addEventListener('dragstart', function(e) {
  e.preventDefault();
}, true);

$('enableMouseEvents').addEventListener('click', updateHandlers, false);
$('enableScrollEvents').addEventListener('click', updateHandlers, false);
$('enableTouchEvents').addEventListener('click', updateHandlers, false);
$('enableGestureEvents').addEventListener('click', updateHandlers, false);
$('enablePointerEvents').addEventListener('click', updateHandlers, false);
$('enableDragEvents').addEventListener('click', updateHandlers, false);
$('redHandlers').addEventListener('click', updateHandlers, false);

var alternateTimer;
function setAlternateTimer() {
  if ($('alternatePDTouchMove').checked) {
    alternateTimer = window.setInterval(function() {
      $('pd-touchmove').click();
      updateConfigSummary();
    }, 3000);
  } else {
    window.clearInterval(alternateTimer);
    alternateTimer = undefined;
  }
}
$('alternatePDTouchMove').addEventListener('click', setAlternateTimer);

function setTouchAction() {
   $('touchTarget').className = $('touchActionNone').checked ? 'touchActionNone' : '';
}

$('touchActionNone').addEventListener('click', setTouchAction);

function setOverflowScrollTouch() {
  $('scroll').className = $('overflowScrollTouch').checked ? 'box overflowScrollTouch' : 'box';
  $('log').className = $('overflowScrollTouch').checked ? 'overflowScrollTouch' : '';
}

$('overflowScrollTouch').addEventListener('click', setOverflowScrollTouch);

function deleteRed(e) {
  var n = $('red');
  log ('red: saw ' + e.type);
  if (n) {
    n.parentNode.removeChild(n);
    log ('red: removed node from dom');
  }
}
//$('red').addEventListener('touchmove', deleteRed);
//$('red').addEventListener('mousemove', deleteRed);
document.addEventListener('keyup', function(e) {
  switch(e.which) {
    // ESC
    case 27:
    deleteRed(e);
  }
});

readConfigState();
updateConfigSummary();
updateHandlers();
setAlternateTimer();
setTouchAction();
setOverflowScrollTouch();

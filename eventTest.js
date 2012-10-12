function $(str) {
  return document.getElementById(str);
}

var targetElem = $('touchTarget');
var logElem = $('log');
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
        $('enableMouseEvents').checked);

    setHandlerState(
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
        touchEventHandler,
        $('enableTouchEvents').checked);
    
    setHandlerState(
        ['MSPointerDown', 'MSPointerMove', 'MSPointerUp', 'MSPointerOver',
        'MSPointerOut', 'MSPointerCancel', 'MSPointerHover'],
        mouseEventHandler,
        $('enablePointerEvents').checked);

    setHandlerState(
        ['gesturestart', 'gesturechange', 'gestureend'],
        gestureEventHandler,
        $('enableGestureEvents').checked);

    setHandlerState(
        ['dragstart', 'dragenter', 'dragleave', 'drop', 'dragend'],
        mouseEventHandler,
        $('enableDragEvents').checked);
}

var lastLog = log.innerHTML;
var lastEvent;
var dupCount = 0;

function logEvent(event, msg)
{
  // prevent too much scrolling - overwrite the last line unless this is a new
  // event type or not a move event
  if ($('coalesce').checked && event.type == lastEvent && 
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

    if (!verbose || $('simple').checked) {
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

var preventDefaultTouchStart = $('preventDefaultTouchStart');
var preventDefaultTouchMove = $('preventDefaultTouchMove');
var preventDefaultTouchEnd = $('preventDefaultTouchEnd');

function touchEventHandler(event)
{
    var touchStr =
      'touches=' + makeTouchList(event.touches, true) +
      'changedTouches=' + makeTouchList(event.changedTouches) +
      'targetTouches=' + makeTouchList(event.targetTouches);

    logEvent(event, touchStr);

    if ((event.type == 'touchstart' && preventDefaultTouchStart.checked) ||
        (event.type == 'touchmove' && preventDefaultTouchMove.checked) ||
        (event.type == 'touchend' && preventDefaultTouchEnd.checked))
        event.preventDefault();
}

function gestureEventHandler(event)
{
    logEvent(event, 'scale=' + event.scale + ', rotation=' + event.rotation);
}

$('enableMouseEvents').addEventListener('click', updateHandlers, false);
$('enableTouchEvents').addEventListener('click', updateHandlers, false);
$('enableGestureEvents').addEventListener('click', updateHandlers, false);
$('enablePointerEvents').addEventListener('click', updateHandlers, false);
updateHandlers();

function updateConfigSummary() {
  var checkboxes = document.querySelectorAll('#config input[type=checkbox]');
  var summary = '';
  for(var i = 0; i < checkboxes.length; i++)
  {
    if (checkboxes[i].checked)
      summary += checkboxes[i].nextSibling.textContent + ' ';
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
  $('config').className = '';
});

$('btnOk').addEventListener('click', function() {
  $('config').className = 'hide';
  updateConfigSummary();
  writeConfigState();
});

var blue = $('blue');
blue.addEventListener('mousedown', function(e) { blue.className='noevents'; });
blue.addEventListener('touchstart', function(e) { blue.className='noevents'; });
document.addEventListener('mouseup', function(e) { blue.className=''; });
document.addEventListener('touchend', function(e) { blue.className=''; });

// Disable drag and drop on the document so it doesn't interfere with events
document.addEventListener('dragstart', function(e) {
  e.preventDefault();
}, true);

readConfigState();
updateConfigSummary();
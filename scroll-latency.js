function $(id) { return document.getElementById(id); }

var logElem = $('log');
function log(msg, cls) {
  var line = document.createElement('div');
  if (cls)
    line.className = cls;
  line.appendChild(document.createTextNode(msg));
  logElem.appendChild(line);
  logElem.scrollTop = logElem.scrollHeight;
}

// Chrome has changed event timestamp from being relative to
// Date.now() to being relative to performance.now().

// Detect timebase used for Event.timestamp
var timebase = (function detectTimebase(testTimeStamp) {
  function timeNear(a, b) {
    const d = 1000 * 60 * 5;
    return a > b - d && a < b + d;
  }

  var timebase;
  if ('performance' in window && timeNear(testTimeStamp, performance.now()))
    timebase = "performance";
  else if (timeNear(testTimeStamp, Date.now()))
    timebase = "Date";
  else {
    log("ERROR: Unknown timebase for timeStamp: " + testTimeStamp);
    return;
  }

  log("Using timebase " + timebase + ".now()");
  return timebase;
}(new Event('test').timeStamp));

function round(val) {
  const scale = 1000;
  return Math.round(val * scale) / scale;
}

function monitoringHandler(e) {
  // Only cancelable events block scrolling, and are the 
  // only ones that contribute to scroll latency.
  if (e.cancelable) {
    // Wait until after all event handlers have run (to capture
    // jank caused by slow handlers invoked after this one).
    requestAnimationFrame(function() {
      // Compute the difference between the current time and the
      // timestamp associated with the event.
      var latency = window[timebase].now() - e.timeStamp;
      log(e.type + ': ' + round(latency) + "ms" + 
      (e.defaultPrevented ? ' defaultPrevented' : ''));
    });
  } else if($('snb').checked) {
    log(e.type + ': non-blocking', 'grey');
  }
}

function jank(amt) {
  var start = Date.now();
  while(Date.now() < start + amt) {
    ;
  }
}

function jankHandler(e) {
  if ($('hjank').checked)
    jank(Number($('htime').value));
    
  if ($('pd').checked)
    e.preventDefault();
}

var transformAttr = 'transform' in document.body.style ? 'transform' : 'webkitTransform';

var spin = 0;
var lastJank = 0;
function doFrame() {
  spin = (spin + 3) % 360;
  $('spinner').style[transformAttr] = 'rotate(' + spin + 'deg)'; 

  if ($('pjank').checked) {
    var jankTime = Number($('ptime').value);
    if (Date.now() > lastJank + jankTime) {
      jank(jankTime);
      lastJank = Date.now();
    }
  }

  requestAnimationFrame(doFrame);
}
doFrame();

var supportsPassive = false;
try {
  addEventListener("test", null, { get passive() { supportsPassive = true; } });
} catch(e) {}
$('passive').disabled = !supportsPassive;

['touchstart', 'touchmove', 'touchend', 'wheel'].forEach(function(type) {
  // This handler is demonstrating how to (passively) monitor scroll latency.
  $('content').addEventListener(type, monitoringHandler, supportsPassive ? {passive:true} : false);
});

var jankHandlerPassive = false;

var touchListenerType = $('ltype').value;
[touchListenerType, 'wheel'].forEach(function(type) {
  // This handler may introduce / trigger some scroll jank 
  $('content').addEventListener(type, jankHandler);
});
$('ltype').addEventListener('change', function(e) {
  $('content').removeEventListener(touchListenerType, jankHandler, supportsPassive ? {passive:jankHandlerPassive} : false);
  touchListenerType = $('ltype').value;
  $('content').addEventListener(touchListenerType, jankHandler, supportsPassive ? {passive:jankHandlerPassive} : false);
});

if (supportsPassive) {
  $('passive').addEventListener('click', function() {
    var oldPassive = jankHandlerPassive;
    jankHandlerPassive = $('passive').checked;
    [touchListenerType, 'wheel'].forEach(function(type) {
      $('content').removeEventListener(type, jankHandler, {passive:oldPassive});
      $('content').addEventListener(type, jankHandler, {passive:jankHandlerPassive});
    });
  });
}

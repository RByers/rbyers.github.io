var points = [];
var eventCount = 0;
var startTime;
var canvas;
var frameCounter;

function GetContext() {
  return document.getElementById("canvas").getContext("2d"); 
}   

window.addEventListener('resize', function(e) {
    InitializeCanvas();
});

function drawPoints(points) {
  var context = canvas.getContext('2d');
  for (var i = 0; i < points.length; ++i) {

    context.beginPath();

    context.arc(points[i].x * scale, points[i].y * scale, 4 * scale, 0, 2.0 * 3.14159, false);
    context.closePath();

    context.fillStyle = 'rgba(0,0,100,0.5)';
    context.fill();
  }
}

function onFrame()
{
  frameCounter++;
  if (!startTime || frameCounter % parseInt(document.getElementById('throttle').value) == 0) {
    drawPoints(points);
    points = [];

    var extraWork = parseInt(document.getElementById('work').value);
    if (extraWork > 0) {
      var start = Date.now();
      while(Date.now() - start < extraWork) {
        ;
      }
    }
  }

  if (startTime)
    window.requestAnimationFrame(onFrame);
}

function startDraw()
{
  startTime = performance.now();
  eventCount = 0;
  frameCounter = 0;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  window.requestAnimationFrame(onFrame);
}

function endDraw()
{
  var duration = performance.now() - startTime;
  var rate = Math.round(eventCount / duration * 1000);
  document.getElementById('rate').textContent = rate;
  startTime = undefined;
}

function addPoint(x, y)
{
  eventCount++;
  points.push({x:x, y:y});
}


window.onload = function() {
  canvas = document.getElementById('canvas');
  var mouseDown = false;

  canvas.addEventListener('mousedown', function(e) {
    if (e.button == 0) {
      mouseDown = true;
      startDraw();
      addPoint(e.pageX, e.pageY);
      e.preventDefault();
    }
  });
  canvas.addEventListener('mouseup', function(e) {
    if (e.button == 0) {
      endDraw();
      mouseDown = false;
      e.preventDefault();
    }
  });
  canvas.addEventListener('mousemove', function(e) {
    if (mouseDown) {
      addPoint(e.pageX, e.pageY);
      e.preventDefault();
    }
  });
  canvas.addEventListener('touchstart', function(e) {
    if (e.touches.length == e.changedTouches.length) {
      startDraw();
      addPoint(e.touches[0].pageX, e.touches[0].pageY);
    }
    e.preventDefault();
  });
  canvas.addEventListener('touchend', function(e) {
    if (e.touches.length == 0) {
      endDraw();
    }
    e.preventDefault();
  });
  canvas.addEventListener('touchmove', function(e) {
    var touch = e.touches[0];
    addPoint(touch.pageX, touch.pageY);
    e.preventDefault();
  });
  InitializeCanvas();
}

var scale = 1;

function InitializeCanvas() {
  var elem = document.getElementById('canvas');
  var container = document.getElementById('container');
  
  scale = window.devicePixelRatio ? window.devicePixelRatio : 1;
  elem.width = container.clientWidth * scale;
  elem.height = container.clientHeight * scale;
}

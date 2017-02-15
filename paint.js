var radiusSupported = false;
var nextCount = 0;
var touchMap = {};
var pointMode = (window.location.hash == "#points");
var pointerEventDisabledMode = (window.location.hash == "#nopointer");
var enableForce = false;
var drawTouchMajor = true;
var foundRotationAngle = false;
var scale = 1;
var mousePressed = false;
var drawCoalesced = false;

function InitializeApp() {
    InitializeCanvas();

    var elem = document.getElementById("canvas");
    if (window.PointerEvent && !pointerEventDisabledMode) {
        console.log("Adding PointerEvent listeners");
        ["pointerdown", "pointermove", "pointerup"].forEach(function(e) {
            elem.addEventListener(e, PointerHandler);
        });
    } else {
        console.log("Adding MouseEvent & TouchEvent listeners");
        ["mousedown", "mousemove", "mouseup"].forEach(function(e) {
            elem.addEventListener(e, MouseHandler);
        });
        ["touchstart", "touchmove", "touchend"].forEach(function(e) {
            elem.addEventListener(e, TouchHandler);
        });
    }

    window.addEventListener("resize", function(e) {
        InitializeCanvas();
    });

    document.addEventListener("keyup", function(e) {
        switch(e.which) {
        // ESC
        case 27:
            var canvas = document.getElementById("canvas");
            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
            break;

        // p
        case 80:
            pointMode = !pointMode;
            window.location.hash = pointMode ? "#points" : "";
            break;

        // f
        case 70:
            enableForce = !enableForce;
            break;

        // a
        case 65:
            drawTouchMajor = !drawTouchMajor;
            break;

        // c
        case 67:
            drawCoalesced = !drawCoalesced;
            break;

        // enter
        case 13:
            if (document.documentElement.webkitRequestFullscreen) {
                if (document.webkitFullscreenElement)
                    document.webkitCancelFullScreen();
                else
                    document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        }
    });
}

function InitializeCanvas() {
    var elem = document.getElementById("canvas");

    var newscale = window.devicePixelRatio ? window.devicePixelRatio : 1;
    var newwidth = window.screen.width * newscale;
    var newheight = window.screen.height * newscale;

    if (elem.width != newwidth || elem.height != newheight || scale != newscale) {
        // resizing a canvas clears it, so do it only when it's dimensions have changed.
        scale = newscale;
        elem.width = newwidth;
        elem.height = newheight;
        elem.style.width = window.screen.width + "px";
        elem.style.height = window.screen.height + "px";
    }
}

function PointerHandler(event) {
    event.preventDefault();

    if (event.type == "pointerdown" && event.button === 0)
        mousePressed = true;

    if (mousePressed || event.type == "pointerup" || (event.buttons & 1)) {
        var fakeTouch = {
            identifier: event.pointerId,
            pageX : event.pageX,
            pageY : event.pageY,
            radiusX : event.width,
            radiusY : event.height,
            force : event.pressure,
        };
        var eventType = event.type == "pointerdown" ? "touchstart" :
            event.type == "pointerup" ? "touchend" : "touchmove";
        event.preventDefault();
        drawTouch(fakeTouch, eventType, false);

        if (drawCoalesced && event.getCoalescedEvents) {
            var points = event.getCoalescedEvents();
            for(let coalesced of points) {
                fakeTouch.pageX = coalesced.pageX;
                fakeTouch.pageY = coalesced.pageY + 50;
                fakeTouch.radiusX = coalesced.width;
                fakeTouch.radiuxY = coalesced.height;
                fakeTouch.force = coalesced.pressure;

                drawTouch(fakeTouch, eventType, true);
            }
        }
    }

    if (event.type == "pointerup")
        mousePressed = false;
}

function MouseHandler(event) {
    if (event.type == "mousedown" && event.button === 0)
        mousePressed = true;

    if (mousePressed && event.button === 0) {
        var fakeTouch = {
            identifier : 10,
            pageX : event.pageX,
            pageY : event.pageY
        };
        var eventType = event.type == "mousedown" ? "touchstart" :
            event.type == "mouseup" ? "touchend" : "touchmove";
        drawTouch(fakeTouch, eventType, false);
        event.preventDefault();
    }

    if (event.type == "mouseup")
        mousePressed = false;
}

function TouchHandler(event) {
    event.preventDefault();
    for (var i = 0; i < event.changedTouches.length; i++)
        drawTouch(event.changedTouches[i], event.type, false);
}

function drawTouch(touch, eventType, coalesced) {
    var context = document.getElementById("canvas").getContext("2d");

    // Map the identifier to a small count (no-op on Chrome, but
    // important for mobile Safari).
    if (!(touch.identifier in touchMap)) {
        touchMap[touch.identifier] = nextCount;
        nextCount++;
    }

    // Polyfill non-standard properties
    if (!("radiusX" in touch) && "webkitRadiusX" in touch)
        touch.radiusX = touch.webkitRadiusX;
    if (!("radiusY" in touch) && "webkitRadiusY" in touch)
        touch.radiusY = touch.webkitRadiusY;
    if (!("rotationAngle" in touch) && "webkitRotationAngle" in touch)
        touch.rotationAngle = touch.webkitRotationAngle;
    if (!("force" in touch) && "webkitForce" in touch)
        touch.force = touch.webkitForce;

    var radiusX = getAdjustedRadius(touch.radiusX, touch.radiusY);
    var radiusY = getAdjustedRadius(touch.radiusY, touch.radiusX);
    var rotationAngle = getAdjustedRotationAngle(touch.rotationAngle);
    foundRotationAngle = foundRotationAngle || rotationAngle;

    // Try to avoid start/end ellipses overlapping exactly
    if (eventType == "touchend") {
        radiusX++;
        radiusY++;
    }

    context.save();
    context.translate(touch.pageX * scale, touch.pageY * scale);
    context.rotate(rotationAngle);
    context.scale(1, radiusY/radiusX);
    context.beginPath();
    context.arc(0, 0, radiusX, 0, 2.0 * Math.PI, false);
    context.closePath();

    // Fill the ellipse on start/move
    if (eventType != "touchend") {
        var opacity = pointMode ? 1 : 0.1;

        var hue = (touchMap[touch.identifier] * 30) % 256;
        if (coalesced)
            hue += 10;
        var lum = 40;
        if (enableForce && touch.force)
            lum = Math.round(touch.force / 0.4 * 50 + 20);
        context.fillStyle = "hsla(" + hue + ",100%," + lum + "%, " + opacity + ")";
        context.fill();
    }

    // Outline ellipse on start/end
    if (eventType != "touchmove") {
        context.strokeStyle = eventType == "touchstart" ? "black" : "grey";
        context.lineWidth = 2;
        context.stroke();
    }

    if (drawTouchMajor && foundRotationAngle) {
        context.strokeStyle = "#fff";
        context.lineWidth = 1;
        context.beginPath();
        if (radiusX >= radiusY) {
            context.moveTo(-radiusX, 0);
            context.lineTo(radiusX, 0);
        } else {
            // Note that this is also radiusX, because of the scaling above
            context.moveTo(0, -radiusX);
            context.lineTo(0, radiusX);
        }
        context.stroke();
    }

    context.restore();
}

function getAdjustedRadius(radius, otherRadius) {
    if (pointMode)
        return 1;

    // Spec says to use 1 for unknown radius, can't differentiate between that
    // and real 1 pixel radius.
    var radiusUndefined = !radius || radius <= 1;
    var otherRadiusUndefined = !otherRadius || otherRadius <= 1;

    if (radiusUndefined) {
        radius = otherRadiusUndefined? 15 : otherRadius;
    }

    if (radius > 100) {
        console.error("Got large radius: " + radius);
        radius = 100;
    }

    return radius * scale;
}

function getAdjustedRotationAngle(angle) {
    return angle * Math.PI / 180;
}

// Google analytics
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-69196529-2', 'auto');
ga('send', 'pageview');

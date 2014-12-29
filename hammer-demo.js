var box = document.getElementById('box');

var base = { deltaX: 0, deltaY: 0, scale: 1, rotation: 0 };
var current = { deltaX: 0, deltaY: 0, scale: 1, rotation: 0 };
var h = Hammer(box, { prevent_default: true });

h.on('transform', function(event) {
    current.scale = event.gesture.scale;
    current.rotation = event.gesture.rotation;
    current.deltaX = event.gesture.deltaX;
    current.deltaY = event.gesture.deltaY;
    box.style.webkitTransform = 
        'translate(' + (base.deltaX + current.deltaX) + 'px, ' + 
         (base.deltaY + current.deltaY) + 'px) ' +
        'scale(' + (base.scale * current.scale) + ') ' +
        'rotate( ' + (base.rotation + current.rotation) + 'deg) ';
});
h.on('transformstart', function(event) {
    // There's some sort of jump at transformstart related to the relative
    // position of the second finger to the first.  Compensate for that.
    base.deltaX -= event.gesture.deltaX;
    base.deltaY -= event.gesture.deltaY;
});
h.on('transformend', function(event) {
    // Current scale/rotation is surprisingly not preserved in the event.
    base.scale *= current.scale;
    base.rotation += current.rotation;
    // And the deltaX/deltaY in the event has a jump like above.
    base.deltaX += current.deltaX;
    base.deltaY += current.deltaY;
});

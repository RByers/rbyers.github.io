var box = document.getElementById('box');

var base = { deltaX: 0, deltaY: 0, scale: 1, rotation: 0 };
var current = { deltaX: 0, deltaY: 0, scale: 1, rotation: 0 };
var h = Hammer(box, { prevent_default: true });

function update() {
    box.style.webkitTransform = 
        'translate(' + (base.deltaX + current.deltaX) + 'px, ' + 
         (base.deltaY + current.deltaY) + 'px) ' +
        'scale(' + (base.scale * current.scale) + ') ' +
        'rotate( ' + (base.rotation + current.rotation) + 'deg) ';
}

h.on('transform', function(event) {
    console.log(event.type + ": deltaX=" + event.gesture.deltaX);
    current.scale = event.gesture.scale;
    current.rotation = event.gesture.rotation;
    current.deltaX = event.gesture.deltaX;
    current.deltaY = event.gesture.deltaY;
    update();
});
h.on('drag', function(event) {
    console.log(event.type + ": deltaX=" + event.gesture.deltaX);
    current.deltaX = event.gesture.deltaX;
    current.deltaY = event.gesture.deltaY;
    update();
});
h.on('transformend', function(event) {
    console.log(event.type + ": deltaX=" + event.gesture.deltaX);
    // Current scale/rotation is surprisingly not preserved in the event.
    base.scale *= current.scale;
    base.rotation += current.rotation;
    current.scale = 1;
    current.rotation = 0;
});
h.on('release', function(event) {
    console.log(event.type + ": deltaX=" + event.gesture.deltaX);
    base.deltaX += event.gesture.deltaX;
    base.deltaY += event.gesture.deltaY;
    current.deltaX = 0;
    current.deltaY = 0;
});

var movingCard;
function onStart(e) {
  movingCard = e.currentTarget;
  movingCard.classList.add('moving');
  movingCard.startX = e.clientX;
  movingCard.startY = e.clientY;
  e.preventDefault();
}

function onMove(e) {
  if (movingCard) {
    movingCard.style.webkitTransform = 'translate(' +
      (e.clientX - movingCard.startX) + 'px, ' +
      (e.clientY - movingCard.startY) + 'px)';
    e.preventDefault();
  }
}

function onEnd(e) {
  if (movingCard) {
    movingCard.classList.remove('moving');  
    movingCard.style.webkitTransform = '';
    e.preventDefault();
    movingCard = undefined;
  }
  if (e.target.classList.contains('circle'))
    e.target.classList.remove('open');
}

function onOver(e) {
  if (movingCard) {
    e.currentTarget.classList.add('open');
  }
}

function onOut(e) {
  if (movingCard) {
    e.currentTarget.classList.remove('open');
  }
}

var cards = document.querySelectorAll('.card');
for(var i = 0; i < cards.length; i++) {
  var c = cards[i];
  c.addEventListener('mousedown', onStart, false);
}

var circles = document.querySelectorAll('.circle');
for(var i = 0; i < circles.length; i++) {
  var c = circles[i];
  c.addEventListener('mouseover', onOver, false);
  c.addEventListener('mouseout', onOut, false);
}

document.body.addEventListener('mousemove', onMove, false);
document.body.addEventListener('mouseup', onEnd, false);
document.body.addEventListener('mouseout', function(e) {
  if (e.relatedTarget == document.documentElement)
    onEnd(e);
}, false);

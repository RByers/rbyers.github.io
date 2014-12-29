var mouseCard;
function onMouseStart(e) {
  mouseCard = e.currentTarget;
  onStart(mouseCard, e.clientX, e.clientY);
  e.preventDefault();
}

function onTouchStart(e) {
  var card = e.currentTarget;
  if (!card.classList.contains('moving')) {
    var touch = e.targetTouches[0];
    onStart(card, touch.clientX, touch.clientY);
    // Make sure we'll still get events if the target node gets
    // removed while dragging
    e.target.card = card;
    e.target.addEventListener('touchmove', onTouchMove, false);
    e.target.addEventListener('touchend', onTouchEnd, false);
    e.target.addEventListener('touchcancel', onTouchEnd, false);
  }
  e.preventDefault();
}

function onStart(card, startX, startY) {
  if (!card.classList.contains('moving'))
  {
    card.classList.add('moving');
    card.startX = startX;
    card.startY = startY;
  }
}

function onMouseMove(e) {
  if (mouseCard) {
    onMove(mouseCard, e.clientX, e.clientY);
    e.preventDefault();
  }
}

function onTouchMove(e) {
  var card = e.target.card;
  var touch = e.targetTouches[0];
  onMove(card, touch.clientX, touch.clientY);
  var over = document.elementFromPoint(touch.clientX, touch.clientY);
  if (card.lastOver && card.lastOver != over) {
    removeCardFromCircle(card, card.lastOver);
    card.lastOver = undefined;
  }
  if (card.lastOver != over && over.classList.contains('circle')) {
    addCardToCircle(card, over);
    card.lastOver = over;
  }
  e.preventDefault();
}

function onMove(card, clientX, clientY) {
  card.style.webkitTransform = 'translate(' +
    (clientX - card.startX) + 'px, ' +
    (clientY - card.startY) + 'px)';
}

function onMouseEnd(e) {
  if (mouseCard) {
    onEnd(mouseCard);
    e.preventDefault();
    if (e.target.classList.contains('circle'))
      removeCardFromCircle(mouseCard, e.target);
    mouseCard = undefined;
  }
}

function onTouchEnd(e) {
  var card = e.target.card;
  onEnd(card);
  if (card.lastOver) {
    removeCardFromCircle(card, card.lastOver);
    card.lastOver = undefined;
  }
}

function onEnd(card) {
  card.classList.remove('moving');  
  card.style.webkitTransform = '';
}

function onMouseOver(e) {
  if (mouseCard) {
    addCardToCircle(mouseCard, e.currentTarget);
  }
}

function onMouseOut(e) {
  if (mouseCard) {
    removeCardFromCircle(mouseCard, e.currentTarget);
  }
}

function addCardToCircle(card, circle)
{
  if (!circle.cardsOver)
    circle.classList.add('open');
  circle.cardsOver++;
}

function removeCardFromCircle(card, circle)
{
  circle.cardsOver--;
  if (!circle.cardsOver)
    circle.classList.remove('open');
}

var cards = document.querySelectorAll('.card');
for(var i = 0; i < cards.length; i++) {
  var c = cards[i];
  c.addEventListener('mousedown', onMouseStart, false);
  c.addEventListener('touchstart', onTouchStart, false);
}

var circles = document.querySelectorAll('.circle');
for(var i = 0; i < circles.length; i++) {
  var c = circles[i];
  c.addEventListener('mouseover', onMouseOver, false);
  c.addEventListener('mouseout', onMouseOut, false);
  c.cardsOver = 0;
}

document.body.addEventListener('mousemove', onMouseMove, false);
document.body.addEventListener('mouseup', onMouseEnd, false);
document.body.addEventListener('mouseout', function(e) {
  if (e.relatedTarget == document.documentElement)
    onMouseEnd(e);
}, false);

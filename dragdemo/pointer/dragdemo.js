var activeCards = {};

function onStart(e) {
  var card = e.currentTarget;
  activeCards[e.pointerId] = card;
  if (!card.classList.contains('moving'))
  {
    card.classList.add('moving');
    card.startX = e.clientX;
    card.startY = e.clientY;
  }  
  e.preventDefault();
}

function onMove(e) {
  var card = activeCards[e.pointerId];
  if (card) {
    card.style.webkitTransform = 'translate(' +
      (e.clientX - card.startX) + 'px, ' +
      (e.clientY - card.startY) + 'px)';
    e.preventDefault();
  }
}

function onEnd(e) {
  var id = e.pointerId;
  var card = activeCards[id];
  if (card) {
    card.classList.remove('moving');  
    card.style.webkitTransform = '';
    e.preventDefault();
    if (e.target.classList.contains('circle'))
      removeCardFromCircle(card, e.target);
    delete activeCards[id];
  }
}

function onOver(e) {
  var card = activeCards[e.pointerId];
  if (card) {
    addCardToCircle(card, e.currentTarget);
  }
}

function onOut(e) {
  var card = activeCards[e.pointerId];
  if (card) {
    removeCardFromCircle(card, e.currentTarget);
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
  c.addEventListener('pointerdown', onStart, false);
}

var circles = document.querySelectorAll('.circle');
for(var i = 0; i < circles.length; i++) {
  var c = circles[i];
  c.addEventListener('pointerover', onOver, false);
  c.addEventListener('pointerout', onOut, false);
  c.cardsOver = 0;
}

document.body.addEventListener('pointermove', onMove, false);
document.body.addEventListener('pointerup', onEnd, false);
document.body.addEventListener('pointercancel', onEnd, false);
document.body.addEventListener('pointerout', function(e) {
  if (e.relatedTarget == document.documentElement)
    onEnd(e);
}, false);

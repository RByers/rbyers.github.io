var usePE = !!navigator.pointerEnabled;
var eventPrefix = usePE ? 'pointer' : 'mouse';
var activeCards = {};

function onStart(e) {
  var card = e.currentTarget;
  activeCards[usePE ? e.pointerId : 1] = card;
  if (!card.classList.contains('moving'))
  {
    card.classList.add('moving');
    card.startX = e.clientX;
    card.startY = e.clientY;
  }  
  e.preventDefault();
}

function onMove(e) {
  var card = activeCards[usePE ? e.pointerId : 1];
  if (card) {
    card.style.webkitTransform = 'translate(' +
      (e.clientX - card.startX) + 'px, ' +
      (e.clientY - card.startY) + 'px)';
    e.preventDefault();
  }
}

function onEnd(e) {
  var id = usePE ? e.pointerId : 1;
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
  var card = activeCards[usePE ? e.pointerId : 1];
  if (card) {
    addCardToCircle(card, e.currentTarget);
  }
}

function onOut(e) {
  var card = activeCards[usePE ? e.pointerId : 1];
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
  c.addEventListener(eventPrefix + 'down', onStart, false);
}

var circles = document.querySelectorAll('.circle');
for(var i = 0; i < circles.length; i++) {
  var c = circles[i];
  c.addEventListener(eventPrefix + 'over', onOver, false);
  c.addEventListener(eventPrefix + 'out', onOut, false);
  c.cardsOver = 0;
}

document.body.addEventListener(eventPrefix + 'move', onMove, false);
document.body.addEventListener(eventPrefix + 'up', onEnd, false);
if (usePE)
  document.body.addEventListener(eventPrefix + 'cancel', onEnd, false);
  document.body.addEventListener(eventPrefix + 'out', function(e) {
  if (e.relatedTarget == document.documentElement)
    onEnd(e);
}, false);

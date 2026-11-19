/* Drag across the field to fold it by hand; the stage buttons jump to a shape.
 * Until the first touch it plays its own loop, exactly as the site's hero does. */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var labels = document.querySelectorAll('.scale span');
  var dragging = false;

  function mark(value) {
    var nearest = Math.round(value);
    labels.forEach(function (el, i) {
      el.classList.toggle('on', i === nearest);
    });
  }

  function go(value) {
    window.cgemHero.scrubTo(value);
    mark(value);
  }

  function fromPointer(e) {
    go((e.clientX / window.innerWidth) * 2);
  }

  hero.addEventListener('pointerdown', function (e) {
    dragging = true;
    hero.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  hero.addEventListener('pointermove', function (e) {
    if (dragging) fromPointer(e);
  });
  hero.addEventListener('pointerup', function () {
    dragging = false;
  });
  hero.addEventListener('pointercancel', function () {
    dragging = false;
  });

  StageBridge.commands({ shape: go });
  mark(0);
})();

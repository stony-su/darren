/* The full site mounts all six pieces at once. On the stage only one runs:
 * each piece gets a fresh canvas, and the last one's GPU context is released
 * before the next starts. */
(function () {
  'use strict';

  var AA = window.AA;
  var stage = document.getElementById('stage');
  var titleEl = document.getElementById('title');
  var taglineEl = document.getElementById('tagline');
  var current = null;

  function unmount() {
    if (!current) return;
    current.piece.dispose();
    var gl = current.piece.gl;
    var lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    current.host.remove();
    current = null;
  }

  function show(id) {
    var def = AA.registry.find(function (d) { return d.id === id; });
    if (!def) return;
    unmount();

    var host = document.createElement('div');
    host.className = 'host';
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', def.title + ': ' + def.tagline);
    host.appendChild(canvas);
    stage.appendChild(host);

    var piece = new def.klass(def, canvas, host);
    piece.on('error', function () {
      host.innerHTML = '<div class="fallback">' + def.title +
        ' needs WebGL2 with float render targets, which this browser did not provide.</div>';
    });
    piece.mount();
    piece.start();

    current = { piece: piece, host: host };
    titleEl.textContent = def.title;
    taglineEl.textContent = def.tagline;
  }

  StageBridge.commands({
    piece: show,
    seed: function () {
      if (current) current.piece.randomSeed();
    },
  });

  var wanted = new URLSearchParams(location.search).get('piece');
  show(wanted || 'physarum');
})();

/*
 * Loaded first by every self-hosted build under /play. It is the only thing
 * the portfolio talks to: the games keep their own globals and scoping, and
 * each build's small adapter registers whatever commands its stage buttons need.
 *
 * Running a build on its own, outside the portfolio, this does nothing.
 */
(function () {
  'use strict';

  var host = window.parent;
  var embedded = host !== window;
  var HOLD_MS = 600;

  var commands = {};
  var exitMode = 'tap';
  var holdTimer = null;

  function send(type, extra) {
    if (!embedded) return;
    var message = { ns: 'stage', type: type };
    if (extra) for (var key in extra) message[key] = extra[key];
    host.postMessage(message, location.origin);
  }

  /* ── What has to be let go of when the stage closes ── */

  var glContexts = [];
  var audioContexts = [];

  var getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind) {
    var ctx = getContext.apply(this, arguments);
    if (ctx && /webgl/i.test(String(kind)) && glContexts.indexOf(ctx) < 0) glContexts.push(ctx);
    return ctx;
  };

  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var Original = window[name];
    if (!Original) return;
    var Tracked = function () {
      var ctx = Reflect.construct(Original, arguments, new.target || Original);
      audioContexts.push(ctx);
      return ctx;
    };
    Tracked.prototype = Original.prototype;
    Object.setPrototypeOf(Tracked, Original);
    window[name] = Tracked;
  });

  function teardown() {
    audioContexts.forEach(function (ctx) {
      try { ctx.close(); } catch (e) { /* already closed */ }
    });
    // The browser only keeps so many contexts alive and evicts the oldest,
    // which would be the portfolio's own particle field.
    glContexts.forEach(function (gl) {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    });
  }

  /* ── Esc ──
   * A frame with focus keeps its key events to itself, so leaving has to be
   * decided in here. Games use a tap of Esc for their own pause menu, so they
   * leave on a hold. */

  function cancelHold() {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  }

  window.addEventListener('keydown', function (e) {
    if (!embedded || e.key !== 'Escape' || e.repeat) return;
    if (exitMode === 'tap') {
      send('exit');
      return;
    }
    cancelHold();
    holdTimer = setTimeout(function () {
      holdTimer = null;
      send('exit');
    }, HOLD_MS);
  }, true);

  window.addEventListener('keyup', function (e) {
    if (e.key === 'Escape') cancelHold();
  }, true);

  window.addEventListener('blur', cancelHold);

  /* ── Messages from the stage ── */

  window.addEventListener('message', function (e) {
    if (e.source !== host || e.origin !== location.origin) return;
    var data = e.data;
    if (!data || data.ns !== 'stage') return;
    if (data.type === 'init') exitMode = data.exit === 'hold' ? 'hold' : 'tap';
    else if (data.type === 'teardown') teardown();
    else if (data.type === 'cmd' && commands[data.cmd]) {
      try {
        commands[data.cmd](data.arg);
      } catch (err) {
        send('error', { message: String(err) });
      }
    }
  });

  window.StageBridge = {
    embedded: embedded,
    commands: function (map) {
      for (var name in map) commands[name] = map[name];
    },
  };

  if (document.readyState === 'complete') send('ready');
  else window.addEventListener('load', function () { send('ready'); });
})();

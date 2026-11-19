/* A classic script, so it can see the game's top-level `App`. Seeds only change
 * on the menu: a song in progress is left alone. */
StageBridge.commands({
  seed: function () {
    if (App.mode === 'menu') App.loadSeed(1 + Math.floor(Math.random() * 99999));
  },
});

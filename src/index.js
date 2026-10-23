// Serves the game page, its modules and the vendored three.js straight from the Worker bundle,
// because static-asset upload doesn't work from our deploy environment.
import html from "../public/index.html";
import game from "../public/js/game.js";
import gfx from "../public/js/gfx.js";
import levels from "../public/js/levels.js";
import audio from "../public/js/audio.js";
import threeModule from "../public/vendor/three.module.min.js";
import threeCore from "../public/vendor/three.core.min.js";

const JS = "text/javascript; charset=utf-8";
const FILES = {
  "/js/game.js": [game, JS, 300],
  "/js/gfx.js": [gfx, JS, 300],
  "/js/levels.js": [levels, JS, 300],
  "/js/audio.js": [audio, JS, 300],
  "/vendor/three.module.min.js": [threeModule, JS, 604800],
  "/vendor/three.core.min.js": [threeCore, JS, 604800],
};

export default {
  fetch(req) {
    const path = new URL(req.url).pathname;
    const [body, type, maxAge] = FILES[path] || [html, "text/html; charset=utf-8", 300];
    return new Response(body, { headers: { "content-type": type, "cache-control": `public, max-age=${maxAge}` } });
  },
};

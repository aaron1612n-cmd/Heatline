// Serves the single-page game and its vendored three.js straight from the Worker bundle,
// because static-asset upload doesn't work from our deploy environment.
import html from "../public/index.html";
import threeModule from "../public/vendor/three.module.min.js";
import threeCore from "../public/vendor/three.core.min.js";

const JS = { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" };
const FILES = {
  "/vendor/three.module.min.js": [threeModule, JS],
  "/vendor/three.core.min.js": [threeCore, JS],
};

export default {
  fetch(req) {
    const hit = FILES[new URL(req.url).pathname];
    if (hit) return new Response(hit[0], { headers: hit[1] });
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  },
};

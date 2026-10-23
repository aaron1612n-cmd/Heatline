// Serves the single-page game straight from the Worker bundle.
import html from "../public/index.html";

export default {
  fetch() {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};

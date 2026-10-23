# Heatline

A 2.5D isometric crew heist game that runs in the browser on phones and PCs. Plan the job, sneak in or go loud, then outrun the police in a physics getaway van.

## Play

Open `public/index.html` in a browser. No build step and no dependencies other than Google Fonts.

The game detects touch or keyboard on load and switches live on the first touch or keypress.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move / steer | WASD or arrows | Left thumb stick |
| Sneak | Hold Shift (or C to toggle) | Sneak button |
| Action (door, camera, wall, van) / boost | E or Space | Big orange button |
| Gadgets: smoke, decoy, EMP | 1, 2, 3 | Three small buttons |
| Swap Hacker / Muscle | Q | Swap button |
| Pause | Esc or P | Pause button |

First launch runs a wordless training job; replay it from the board or the pause menu.

## Deploy (Cloudflare Workers)

The game is served by a small Cloudflare Worker (`src/index.js`) that bundles `public/index.html` as text and returns it for every path. Live at https://heatline.avadlabs.workers.dev.

- **Automatic:** every push to `main` deploys via `.github/workflows/deploy.yml`. Add two repository secrets first: `CLOUDFLARE_API_TOKEN` (a token with the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.
- **Manual:** `npx wrangler login` then `npx wrangler deploy`.

The site goes live at `https://heatline.<your-subdomain>.workers.dev`.

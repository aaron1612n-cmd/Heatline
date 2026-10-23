# Heatline

A night-time heist in sodium streetlight, played in a lit 3D isometric view. Case the job, sneak or shoot your way to the money, then outrun the cops in the getaway van. Runs in the browser on phones and PCs.

## Play

Open `public/index.html` through any static server (it uses ES modules, so `file://` won't work), e.g. `npx http-server public`. three.js is vendored in `public/vendor`; the only other network request is Google Fonts.

The game detects touch or keyboard on load and switches live on the first touch or keypress.

| Action | Keyboard + mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrows | Left thumb stick |
| Aim / shoot | Mouse / left click (F fires with auto-aim) | Fire button (auto-aims) |
| Sneak | Hold Shift (C toggles) | Sneak button |
| Takedown, pick lock, grab bag, drag body, get in van | E | Action button (icon follows what's nearby) |
| Knife (lethal, from behind) | Click while the takedown prompt shows | Fire while the takedown prompt shows |
| Reload | R | Automatic |
| Drive / steer | W/S throttle, A/D steer | Stick points where to go |
| Boost / handbrake | Space or click / Shift | Fire / Sneak |
| Pause | Esc or P | Pause button |

Guards see along their flashlight beams, and standing in light makes you easier to spot (the eye meter shows how lit you are). A guard who spots you starts radioing in: drop them before the radio finishes or the alarm goes up, more police join the chase and the building lights turn red. Bodies left in sight give you away.

First launch runs a wordless training job; replay it from the job list.

## Deploy (Cloudflare Workers)

The game is served by a small Cloudflare Worker (`src/index.js`) that bundles the page, the game modules and three.js as text and serves them by path. Add any new file under `public/` to the `FILES` map there. Live at https://heatline.avadlabs.workers.dev.

- **Automatic:** every push to `main` deploys via `.github/workflows/deploy.yml`. Add two repository secrets first: `CLOUDFLARE_API_TOKEN` (a token with the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.
- **Manual:** `npx wrangler login` then `npx wrangler deploy`.

The site goes live at `https://heatline.<your-subdomain>.workers.dev`.

# Einmaleins (moved)

Einmaleins now lives in the Lernwelt launcher: [`launcher/apps/einmaleins/`](../launcher/apps/einmaleins/).

This folder only keeps the old address working:

- `index.html` redirects to `../launcher/`.
- `sw.js` replaces the old service worker on devices that installed the standalone app.
  It deletes the old offline cache and unregisters itself.

Progress saved by the standalone app is imported into the launcher the first time the
launcher starts (see `launcher/src/core/migrate.js`).

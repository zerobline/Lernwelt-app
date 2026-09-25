# Lernwelt

Small offline learning apps for children. No ads, no accounts, no backend.
All apps live in one launcher, a PWA that installs on a tablet and works offline.

| App | Folder | What it does |
| --- | --- | --- |
| Lernwelt-Launcher | [`launcher/`](launcher/) | One home screen for all apps, with a parent area, stars and rewards, and shared services (storage, speech, sounds). |
| Uhr lesen | [`launcher/apps/uhr-lesen/`](launcher/apps/uhr-lesen/) | Read an analog clock in spoken German ("Viertel nach drei", "halb vier"): three clock-help levels, Stufe 1–5, three answer modes (pick, build from words, set the hands). |
| Einmaleins | [`launcher/apps/einmaleins/`](launcher/apps/einmaleins/) | Multiplication 1–10 × 1–10 with three help levels (dot array and tips down to plain recall) and Leitner-box practice. |

`index.html` at the top level redirects to `launcher/`. If GitHub Pages is turned on
for `main`, that makes the launcher the site's home.

## Layout

```
.
├── index.html          redirects to launcher/
├── package.json        npm test / npm start for the whole repo
├── launcher/           the launcher and every app (launcher/apps/<id>/)
├── uhr-lesen/          old address of the standalone app: redirect only
└── einmaleins/         old address of the standalone app: redirect only
```

The `uhr-lesen/` and `einmaleins/` folders used to hold standalone versions of the apps.
They now only redirect to the launcher and remove the old offline cache on devices that
installed them. Progress saved by the standalone apps is imported into the launcher the
first time it starts.

## Running and testing

```
npm start      # http://localhost:8080/ (serves launcher/)
npm test       # all tests (Node 22+)
```

Tests also run on every pull request (`.github/workflows/test.yml`).

## Adding an app

Add a folder under `launcher/apps/` and list it in `launcher/apps/index.json`.
The launcher README describes the app contract.

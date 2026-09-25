# Lernwelt

Small offline learning apps for children. Each app lives in its own folder,
runs in the browser, and needs no accounts and no backend.

| App | Folder | What it does |
| --- | --- | --- |
| Uhr lesen | [`uhr-lesen/`](uhr-lesen/) | Read an analog clock in spoken German ("Viertel nach drei", "halb vier"). |
| Einmaleins | [`einmaleins/`](einmaleins/) | Multiplication 1–10 × 1–10 with three help levels (dot array and tips down to plain recall) and Leitner-box practice. |

`index.html` at the top level is a start page that links to every app. If
GitHub Pages is turned on for `main`, that page is the site's home.

## Layout

```
.
├── index.html          start page linking all apps
├── README.md           this overview
└── <app-name>/         one folder per app, self-contained
    ├── README.md       what the app does, how to run and test it
    ├── index.html      entry point
    ├── package.json    npm test / npm run build for this app only
    ├── tests/
    └── dist/           optional single-file build that opens from disk
```

## Adding an app

1. Put it in a new top-level folder with a lowercase, hyphenated name
   (for example `rechnen-bis-20/`).
2. Keep everything the app needs inside that folder and use relative paths,
   so it works from the start page, from GitHub Pages and from disk.
3. Give it its own `README.md` and, if it has tests, a `package.json` with
   an `npm test` script.
4. Add a row to the table above and a card to `index.html`.

## Tests

Run each app's tests from its folder, for example:

```
cd uhr-lesen && npm test
```

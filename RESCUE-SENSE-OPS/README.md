# RESCUE-SENSE OPS — Structural Intelligence Prototype

A responsive, frontend-only disaster-management / structural-risk demonstration. It is designed to be extended later with a Python Flask backend and SQLite database.

## What's included

- `index.html` — page structure, dashboard and dialogs
- `css/style.css` — responsive dark emergency-operations interface
- `js/app.js` — simulated sensors, risk calculation, scenarios, incident queue, local event history, chart drawing, CSV/JSON exports and UI interactions

## Run it

1. Extract the ZIP.
2. Open the `RESCUE-SENSE-OPS` folder.
3. Double-click `index.html` to open it in a modern browser. If your browser restricts local files, use VS Code's Live Server extension or run `python -m http.server 8000` from this folder and visit `http://localhost:8000`.
4. Try **Normal conditions**, **Movement detected**, **Critical hazard**, **Simulate SOS**, **Run safety check**, **Acknowledge**, **Mark resolved**, **Export report**, and **Download CSV**.
5. Use **Start continuous simulation** to update demo sensor values every five seconds.

## Current limits — important

- This ZIP has a frontend only. It does **not** include a Flask server, database, physical sensor integration, real GPS, SMS/email, or rescue dispatch.
- Sensor values and the risk formula are demonstration logic, not a validated structural-engineering model.
- Event/incident records are saved in the browser's `localStorage` where available. This is local demo persistence, not a shared database.
- Exported reports are generated locally by the browser.
- The interface explicitly labels SOS and notification activity as simulated. Do not use it for real emergency decisions.

## Future backend extension

A suggested next structure is:

```text
RESCUE-SENSE-OPS/
├── app.py                 # Flask application and API routes
├── requirements.txt       # Flask dependencies
├── rescue_sense.db        # SQLite database (created at runtime)
├── templates/
│   └── index.html         # move/copy frontend here if using Flask templates
├── static/
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

Suggested API routes:

- `GET /api/health` — backend health
- `GET /api/sensors` — latest sensor values
- `POST /api/readings` — validate and store a reading
- `POST /api/checks` — calculate and return a risk assessment
- `GET /api/incidents` — list incidents
- `POST /api/incidents/<id>/acknowledge` — acknowledge an incident
- `POST /api/incidents/<id>/resolve` — resolve an incident
- `GET /api/events` — retrieve event history

`window.RescueSense` is exposed in `js/app.js` as a small integration seam for later development. When the Flask API is ready, replace the local simulation data source with `fetch()` calls, handle network errors, and move authoritative risk calculation and persistence to the backend. Keep the browser-side simulation available only as an explicitly labeled demo mode.

## Browser compatibility

Use a recent Chrome, Edge, Firefox or Safari. Google Fonts are optional; the interface uses fallback fonts if the network is unavailable.

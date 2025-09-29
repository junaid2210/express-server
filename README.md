Quick endpoint checklist (what the server provides)

GET /api/datasets
→ returns available dataset metadata (ids, parameters, date ranges).

GET /api/datasets/:id/data?param=temperature&from=YYYY-MM-DD&to=YYYY-MM-DD
→ returns raw timeseries (or a series of {date, value} if param provided).

GET /api/datasets/:id/summary?param=temperature&from=&to=
→ mean, median, stddev, min, max, anomaly count + textual insight.

GET /api/datasets/:id/trends?param=temperature&window=7
→ timeseries including a moving average (window default = 7 days).

GET /api/datasets/:id/correlation?param1=temperature&param2=salinity
→ Pearson r + interpretation (strong/moderate/weak).

GET /api/datasets/:id/export?param=temperature
→ CSV download of the parameter for the full dataset.

POST /api/datasets/upload
→ (optional) add an in-memory dataset (requires auth middleware if enabled).

All datasets are synthetic (in-memory) so you can test instantly without uploading files.

4) Test with curl (examples)

Run these in terminal while the server is running.

List datasets:

curl http://localhost:3000/api/datasets


Get trends (7-day moving average for temperature from marine_weather):

curl "http://localhost:3000/api/datasets/marine_weather/trends?param=temperature&window=7"


Get summary (chemical oceanographic pH):

curl "http://localhost:3000/api/datasets/chemical_oceanographic/summary?param=pH"


Correlation example:

curl "http://localhost:3000/api/datasets/marine_weather/correlation?param1=temperature&param2=wind_speed"


CSV export (downloads a file):

curl -o marine_temp.csv "http://localhost:3000/api/datasets/marine_weather/export?param=temperature"

5) How to integrate with your Firebase frontend (React example)

Your Firebase UI already has dataset selection and graph components. Replace your local mock data calls with fetches to this microservice.

Minimal fetch example (plain JS; put inside your React handler):

// get list of datasets
async function fetchDatasets() {
  const res = await fetch("http://localhost:3000/api/datasets");
  const json = await res.json();
  return json.datasets; // populate your side panel
}

// fetch trends for chosen dataset + parameter
async function fetchTrends(datasetId, param, window = 7) {
  const url = `http://localhost:3000/api/datasets/${datasetId}/trends?param=${param}&window=${window}`;
  const res = await fetch(url);
  return res.json(); // { id, param, window, data: [{date, value, moving_average}, ...] }
}


Once you receive the JSON, feed the data array to your existing chart component (Chart.js / Recharts / D3). Example mapping:

const labels = data.map(d => d.date);
const values = data.map(d => d.value);
const ma = data.map(d => d.moving_average);

// feed `labels` and `values` to Chart.js datasets for display


Export button (trigger CSV download):

function downloadCSV(datasetId, param) {
  window.location.href = `http://localhost:3000/api/datasets/${datasetId}/export?param=${param}`;
}


If your Firebase site is served over HTTPS and your Node service is local, during local testing you might need to allow mixed content or run both on local HTTPS. For hackathon demo, running locally is acceptable; if you deploy Node to Railway (see below), use the deployed URL.

6) (Optional) Enable Firebase authentication check

If you want /api/datasets/upload and other endpoints to accept only logged-in users, enable Firebase Admin:

In Firebase Console → Project Settings → Service accounts → generate JSON key, download file serviceAccountKey.json.

Put the file into your project and set env variable:

export FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
node server.js


The server will try to verify Authorization: Bearer <ID_TOKEN> headers. In your frontend, after Firebase login, pass the ID token:

const idToken = await firebase.auth().currentUser.getIdToken();
fetch('https://your-node/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

7) Quick deployment (Railway / Render / Heroku)

For demo in the hackathon (so the judges can access live):

Railway (fastest)

Create a new project on Railway.

Connect your GitHub repo or push code via Railway CLI.

Set start command: node server.js.

Add env var PORT (Railway provides one automatically).

Deploy — Railway gives a public URL like https://your-service.up.railway.app.

Heroku (classic)

heroku create

git push heroku main

Set env var if using Firebase Admin.

When deployed, update your Firebase frontend to call https://your-service.<provider>.app/api/... instead of localhost.

8) Small UI wiring plan (what to change in your Firebase portal)

Side panel: when user clicks a dataset, call GET /api/datasets to populate options.

When user selects dataset + parameter:

Call /api/datasets/:id/trends?param=... to draw graph.

Call /api/datasets/:id/summary?param=... to show textual summary below the graph.

Add “Export CSV” button linking to the /export endpoint.

Add a “Correlation” modal: let user pick 2 params and call /correlation to display r and interpretation.

This wiring keeps all UI in Firebase while the heavy logic (preprocessing, moving average, correlation, exports) runs in your Node microservice — exactly the hybrid architecture we discussed.

9) If you have time — 2 quick upgrades you can add (and how)

CSV upload from the Firebase UI to Node

Add a file input in the frontend. POST the CSV file to /api/datasets/upload (you’ll need to add a parser in the Node app; I kept the prototype simple and in-memory).

Alternatively, upload CSV to Firebase Storage and then POST the file URL to Node for processing.

Scheduled fetch of live data

Add a small cron (e.g., using node-cron) to your Node app to fetch real APIs (NOAA, OpenWeather, IMD) and update in-memory datasets or push them into Firestore.

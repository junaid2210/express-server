/*
express-datasets-microservice.js

Prototype Node + Express microservice for the hackathon:
- Provides synthetic example datasets (marine weather and chemical oceanographic)
- Endpoints for listing datasets, fetching time-series, summaries, trends (moving average), correlation, and CSV export
- Optional Firebase Auth verification (use FIREBASE_SERVICE_ACCOUNT_PATH env var to enable)

How to use in 1 night:
1. Create a folder, `npm init -y` and install dependencies (see README below)
2. Save this file as `server.js` in project root
3. Run `node server.js` (or `npx nodemon server.js`)
4. Visit endpoints described below or call via fetch from your Firebase frontend

Dependencies: express, cors, firebase-admin (optional)

This file purposely contains in-memory / synthetic data so you don't need any other files.
*/

const express = require("express");
const cors = require("cors");

// Optional: Firebase Admin for token verification
// To enable: set env FIREBASE_SERVICE_ACCOUNT_PATH to the path of your service account JSON
let firebaseAdmin = null;
let firebaseAuthEnabled = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    firebaseAdmin = require("firebase-admin");
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(serviceAccount) });
    firebaseAuthEnabled = true;
    console.log("Firebase Admin initialized — token verification enabled");
  } catch (err) {
    console.warn("Could not initialize firebase-admin. Make sure FIREBASE_SERVICE_ACCOUNT_PATH points to JSON. Proceeding without token verification.");
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// --- Simple auth middleware (optional) ---
async function authMiddleware(req, res, next) {
  if (!firebaseAuthEnabled) return next();
  const authHeader = req.headers.authorization || ""; // expecting: Bearer <token>
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing auth token" });
  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(token);
    req.user = decoded; // contains uid, email, etc.
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token", details: err.message });
  }
}

// --- Synthetic dataset generator ---
function generateTimeSeries(type, days = 60) {
  const out = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);

    if (type === "marine_weather") {
      // temperature (°C), wind_speed (m/s), wave_height (m)
      const temp = 24 + 3 * Math.sin(i / 8) + (Math.random() - 0.5) * 1.5;
      const wind = 5 + 2 * Math.sin(i / 6) + (Math.random() - 0.5) * 1.2;
      const wave = 1 + 0.5 * Math.abs(Math.sin(i / 10)) + Math.random() * 0.4;
      out.push({ date: iso, temperature: Number(temp.toFixed(3)), wind_speed: Number(wind.toFixed(3)), wave_height: Number(wave.toFixed(3)) });
    } else if (type === "chemical_oceanographic") {
      // salinity (PSU), pH, dissolved_oxygen (mg/L)
      const salinity = 35 + 0.3 * Math.sin(i / 12) + (Math.random() - 0.5) * 0.2;
      const ph = 8 + 0.05 * Math.cos(i / 15) + (Math.random() - 0.5) * 0.03;
      const dox = 6 + 0.6 * Math.cos(i / 9) + (Math.random() - 0.5) * 0.3;
      out.push({ date: iso, salinity: Number(salinity.toFixed(3)), pH: Number(ph.toFixed(3)), dissolved_oxygen: Number(dox.toFixed(3)) });
    }
  }
  return out;
}

// In-memory datasets (synthetic) — easy for a hackathon prototype
const datasets = {
  marine_weather: {
    id: "marine_weather",
    name: "Marine Weather (synthetic)",
    description: "Synthetic sea surface temperature, wind and waves for demo.",
    parameters: ["temperature", "wind_speed", "wave_height"],
    data: generateTimeSeries("marine_weather", 90),
  },
  chemical_oceanographic: {
    id: "chemical_oceanographic",
    name: "Chemical Oceanographic (synthetic)",
    description: "Synthetic salinity, pH and dissolved oxygen for demo.",
    parameters: ["salinity", "pH", "dissolved_oxygen"],
    data: generateTimeSeries("chemical_oceanographic", 90),
  },
};

// --- Utility stats functions ---
function mean(arr) {
  if (!arr.length) return null;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
}

function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}

function stddev(arr) {
  if (!arr.length) return null;
  const m = mean(arr);
  const s = Math.sqrt(arr.reduce((acc, v) => acc + (v - m) * (v - m), 0) / arr.length);
  return s;
}

function movingAverage(arr, windowSize = 7) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = arr.slice(start, i + 1);
    out.push(Number(mean(slice).toFixed(6)));
  }
  return out;
}

function pearson(x, y) {
  if (x.length !== y.length || x.length === 0) return null;
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let denx = 0;
  let deny = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denx += dx * dx;
    deny += dy * dy;
  }
  const denom = Math.sqrt(denx * deny);
  if (denom === 0) return 0;
  return num / denom;
}

// --- Helper: filter by date range ---
function filterByDateRange(series, from, to) {
  if (!from && !to) return series;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  return series.filter((s) => {
    const d = new Date(s.date + "T00:00:00Z");
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

// --- Routes ---
app.get("/", (req, res) => {
  res.send({ message: "Datasets microservice running", endpoints: ["/api/datasets", "/api/datasets/:id/summary", "/api/datasets/:id/trends", "/api/datasets/:id/correlation"] });
});

// List datasets
app.get("/api/datasets", (req, res) => {
  const list = Object.values(datasets).map((d) => ({ id: d.id, name: d.name, description: d.description, parameters: d.parameters, range: { start: d.data[0].date, end: d.data[d.data.length - 1].date } }));
  res.json({ datasets: list });
});

// Get raw data for a dataset (optionally filter param and date range)
app.get("/api/datasets/:id/data", (req, res) => {
  const id = req.params.id;
  const param = req.query.param; // optional
  const from = req.query.from;
  const to = req.query.to;

  const ds = datasets[id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  let series = ds.data;
  series = filterByDateRange(series, from, to);
  if (param) {
    series = series.map((s) => ({ date: s.date, value: s[param] !== undefined ? s[param] : null }));
  }
  res.json({ id: ds.id, name: ds.name, param: param || null, data: series });
});

// Summary statistics for a parameter
app.get("/api/datasets/:id/summary", (req, res) => {
  const id = req.params.id;
  const param = req.query.param;
  const from = req.query.from;
  const to = req.query.to;

  const ds = datasets[id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  if (!param) return res.status(400).json({ error: "param query required (e.g., ?param=temperature)" });
  if (!ds.parameters.includes(param)) return res.status(400).json({ error: `Parameter ${param} not available. Use: ${ds.parameters.join(", ")}` });

  let series = ds.data;
  series = filterByDateRange(series, from, to);
  const values = series.map((s) => s[param]).filter((v) => v !== null && v !== undefined);
  if (!values.length) return res.status(400).json({ error: "No data in range" });

  const m = mean(values);
  const med = median(values);
  const sdev = stddev(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const anomalies = values.filter((v) => Math.abs(v - m) > 2 * sdev).length;

  // Simple textual insight
  const insight = `Parameter ${param}: mean=${m.toFixed(3)}, median=${med.toFixed(3)}, std=${sdev.toFixed(3)}, anomalies=${anomalies}`;

  res.json({ id: ds.id, param, summary: { mean: Number(m.toFixed(6)), median: Number(med.toFixed(6)), stddev: Number(sdev.toFixed(6)), min: Number(min.toFixed(6)), max: Number(max.toFixed(6)), count: values.length, anomalies }, insight });
});

// Trends: return timeseries plus moving average
app.get("/api/datasets/:id/trends", (req, res) => {
  const id = req.params.id;
  const param = req.query.param;
  const window = parseInt(req.query.window || "7", 10);
  const from = req.query.from;
  const to = req.query.to;

  const ds = datasets[id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  if (!param) return res.status(400).json({ error: "param query required (e.g., ?param=temperature)" });
  if (!ds.parameters.includes(param)) return res.status(400).json({ error: `Parameter ${param} not available. Use: ${ds.parameters.join(", ")}` });

  let series = ds.data;
  series = filterByDateRange(series, from, to);
  const values = series.map((s) => s[param]);
  const ma = movingAverage(values, window);

  const result = series.map((s, idx) => ({ date: s.date, value: s[param], moving_average: Number(ma[idx].toFixed(6)) }));
  res.json({ id: ds.id, param, window, data: result });
});

// Correlation between two parameters
app.get("/api/datasets/:id/correlation", (req, res) => {
  const id = req.params.id;
  const p1 = req.query.param1;
  const p2 = req.query.param2;
  const from = req.query.from;
  const to = req.query.to;

  const ds = datasets[id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  if (!p1 || !p2) return res.status(400).json({ error: "param1 and param2 required" });
  if (!ds.parameters.includes(p1) || !ds.parameters.includes(p2)) return res.status(400).json({ error: `Parameters must be in: ${ds.parameters.join(", ")}` });

  let series = ds.data;
  series = filterByDateRange(series, from, to);
  const x = series.map((s) => s[p1]);
  const y = series.map((s) => s[p2]);
  if (x.length === 0 || y.length === 0) return res.status(400).json({ error: "No data in range" });
  const r = pearson(x, y);

  let interpretation = "No clear correlation";
  if (r >= 0.7) interpretation = "Strong positive correlation";
  else if (r >= 0.4) interpretation = "Moderate positive correlation";
  else if (r <= -0.7) interpretation = "Strong negative correlation";
  else if (r <= -0.4) interpretation = "Moderate negative correlation";
  else interpretation = "Weak or no correlation";

  res.json({ id: ds.id, param1: p1, param2: p2, r: Number(r.toFixed(6)), interpretation });
});

// Export: CSV for one parameter
app.get("/api/datasets/:id/export", (req, res) => {
  const id = req.params.id;
  const param = req.query.param;

  const ds = datasets[id];
  if (!ds) return res.status(404).json({ error: "Dataset not found" });
  if (!param) return res.status(400).json({ error: "param query required (e.g., ?param=temperature)" });
  if (!ds.parameters.includes(param)) return res.status(400).json({ error: `Parameter ${param} not available. Use: ${ds.parameters.join(", ")}` });

  const rows = [["date", param]];
  ds.data.forEach((s) => rows.push([s.date, s[param]]));
  const csv = rows.map((r) => r.join(",")).join("\n");

  res.header("Content-Type", "text/csv");
  res.attachment(`${ds.id}_${param}.csv`);
  res.send(csv);
});

// Simple endpoint to add a new dataset (JSON body). This is in-memory only.
app.post("/api/datasets/upload", authMiddleware, (req, res) => {
  // Accept structure: { id, name, description, parameters, data: [{date: 'YYYY-MM-DD', param1: val, ...}, ...] }
  const payload = req.body;
  if (!payload || !payload.id || !payload.parameters || !payload.data) return res.status(400).json({ error: "Invalid payload" });
  datasets[payload.id] = { id: payload.id, name: payload.name || payload.id, description: payload.description || "", parameters: payload.parameters, data: payload.data };
  res.json({ ok: true, id: payload.id });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Datasets microservice listening on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}/api/datasets to see available datasets`);
});

/*
--- End of file ---

Next steps (in chat):
- I will show you the commands to create a Node project, install deps, save this file as server.js and run it.
- Then I'll show example curl/fetch calls and how to wire it into your Firebase frontend.
*/

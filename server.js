// Attendance backend. No npm install needed (Node 16+).
// Run:  node server.js   then open  http://localhost:3000
// Data is stored locally in attendance-db.json next to this file.
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 3000;
const DB = process.env.DB_PATH || path.join(__dirname, "attendance-db.json");
const STATUS = ["P", "A", "L", "E"]; // Present, Absent, Late, Excused
const FILES = {
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "text/javascript"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"]
};

let db;
try { db = JSON.parse(fs.readFileSync(DB, "utf8")); } catch { db = { layout: {}, removed: [], records: {} }; }
db.layout = db.layout || {};
db.removed = Array.isArray(db.removed) ? db.removed : [];
db.records = db.records || {};
const save = () => { fs.writeFileSync(DB + ".tmp", JSON.stringify(db)); fs.renameSync(DB + ".tmp", DB); };
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (!p.startsWith("/api/")) {
    const file = FILES[p === "/" ? "/index.html" : p];
    if (!file) { res.writeHead(404); return res.end("Not found"); }
    return fs.readFile(path.join(__dirname, file[0]), (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache" });
      res.end(data);
    });
  }

  let body = "";
  req.on("data", c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on("end", () => {
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch { return send(res, 400, { error: "Invalid JSON" }); }

    // Everything the UI needs on load
    if (req.method === "GET" && p === "/api/state") return send(res, 200, db);

    // Chair positions: { "AMORA": {x: 2.6, y: 15}, ... } (percent of the room)
    if (req.method === "PUT" && p === "/api/layout") {
      const layout = {};
      for (const [name, pos] of Object.entries(data.layout || {})) {
        if (pos && isFinite(pos.x) && isFinite(pos.y)) layout[name] = { x: +pos.x, y: +pos.y };
      }
      const removed = Array.isArray(data.removed) ? data.removed.filter(name => typeof name === "string") : [];
      db.layout = layout; db.removed = removed; save();
      return send(res, 200, { ok: true });
    }

    // One day of attendance: { section, marks: { "AMORA": "P", ... } }
    const m = p.match(/^\/api\/attendance\/(\d{4}-\d{2}-\d{2})$/);
    if (m) {
      const date = m[1];
      if (req.method === "GET") return send(res, 200, db.records[date] || { section: "", marks: {} });
      if (req.method === "PUT") {
        const marks = {};
        for (const [name, s] of Object.entries(data.marks || {})) if (STATUS.includes(s)) marks[name] = s;
        const rawSteps = data.checklist?.steps && typeof data.checklist.steps === "object" ? data.checklist.steps : {};
        const steps = {};
        for (const key of ["roster", "marked", "exported"]) {
          if (typeof rawSteps[key] === "boolean") steps[key] = rawSteps[key];
        }
        const students = {};
        if (data.checklist?.students && typeof data.checklist.students === "object") {
          for (const [name, checked] of Object.entries(data.checklist.students)) {
            if (typeof checked === "boolean") students[String(name).slice(0, 100)] = checked;
          }
        }
        const checklist = {
          steps,
          students
        };
        db.records[date] = { section: String(data.section || "").slice(0, 100), marks, checklist };
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE") { delete db.records[date]; save(); return send(res, 200, { ok: true }); }
    }
    send(res, 404, { error: "Not found" });
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log("Attendance running at http://localhost:" + PORT);
  for (const list of Object.values(require("os").networkInterfaces()))
    for (const i of list)
      if (i.family === "IPv4" && !i.internal) console.log("On your Android phone (same Wi-Fi): http://" + i.address + ":" + PORT);
});

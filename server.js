// Attendance backend. No npm install needed (Node 16+).
// Run:  node server.js   then open  http://localhost:3000
// Data is stored locally in attendance-db.json next to this file.
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "attendance-db.json");
const STATUS = ["P", "A", "L", "E"]; // Present, Absent, Late, Excused

let db;
try { db = JSON.parse(fs.readFileSync(DB, "utf8")); } catch { db = { layout: {}, records: {} }; }
const save = () => { fs.writeFileSync(DB + ".tmp", JSON.stringify(db)); fs.renameSync(DB + ".tmp", DB); };
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (!p.startsWith("/api/")) {
    return fs.readFile(path.join(__dirname, "index.html"), (err, html) => {
      if (err) { res.writeHead(404); return res.end("index.html not found"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
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
      db.layout = layout; save();
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
        db.records[date] = { section: String(data.section || "").slice(0, 100), marks };
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE") { delete db.records[date]; save(); return send(res, 200, { ok: true }); }
    }
    send(res, 404, { error: "Not found" });
  });
}).listen(PORT, () => console.log("Attendance running at http://localhost:" + PORT));

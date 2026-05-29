#!/usr/bin/env node
/* Generate a PlantUML component diagram from the SAME code-verified ecosystem
   data that drives the live map (ecosystem-data.json) — so the static diagram
   can never drift from the interactive one. Emits:
     - ecosystem.puml             (editable source)
     - ecosystem-plantuml-url.txt (a plantuml.com render URL)
   Then fetch the SVG once and self-host it:
     node gen-diagram.mjs && curl -s "$(cat ecosystem-plantuml-url.txt)" -o ecosystem-diagram.svg
*/
import fs from "fs";
import zlib from "zlib";

const PROJECT_TITLE = process.env.PROJECT_TITLE || "Project";  // set your project name

const data = JSON.parse(fs.readFileSync(new URL("./ecosystem-data.json", import.meta.url), "utf8"));

const alias = (id) => "n_" + id.replace(/[^a-zA-Z0-9]/g, "_");
const galias = (id) => "g_" + id.replace(/[^a-zA-Z0-9]/g, "_");

const nodesByGroup = {};
const groupOf = {};
data.nodes.forEach((n) => {
  (nodesByGroup[n.group] = nodesByGroup[n.group] || []).push(n);
  groupOf[n.id] = n.group;
});

const KIND_COLOR = {
  control: "#5a6b8a", data: "#d29922", payment: "#f85149",
  bandwidth: "#3fb950", sales: "#39c5cf", auth: "#bc8cff", infra: "#46506a",
};

let p = "";
p += "@startuml\n";
p += "scale 1.4\n";                                   // larger overall render
p += "skinparam backgroundColor #05070d\n";
p += "skinparam shadowing false\n";
p += "skinparam defaultFontName monospace\n";
p += "skinparam defaultFontColor #d6e2f5\n";
p += "skinparam defaultFontSize 17\n";                 // was 11 — much more legible
p += "skinparam nodesep 16\n";                         // breathing room between nodes
p += "skinparam ranksep 70\n";                         // taller layout, clearer ranks
p += "skinparam ArrowThickness 1.4\n";
p += "skinparam ArrowColor #4a5878\n";
p += "skinparam ArrowFontColor #7d8ca5\n";
p += "skinparam ArrowFontSize 13\n";
p += "skinparam linetype ortho\n";
p += "skinparam package {\n  BorderColor #34406a\n  BorderThickness 1.6\n  FontColor #c9d6ee\n  FontStyle bold\n  FontSize 20\n}\n";
p += "skinparam rectangle {\n  BorderColor #34406a\n  FontColor #eaf2ff\n  FontSize 16\n  roundCorner 12\n}\n";
p += `title <color:#eef4ff><size:22>${PROJECT_TITLE} — Ecosystem (analysed)</size></color>\\n<color:#62728c><size:14>${data.nodes.length} components · ${data.groups.length} subsystems · meaningful cross-subsystem flows, colored by kind</size></color>\n\n`;

// SUBSYSTEM-LEVEL "analysed" view. 73 individual boxes can't be read when fit to a
// screen (text shrinks to ~6px), so the static diagram works at the subsystem altitude:
// ONE box per subsystem that LISTS its components as text, with aggregated cross-subsystem
// flows between boxes. Readable on first view (9 boxes), still names every component; the
// interactive 73-node detail is the job of the live WebGL map.
data.groups.forEach((g) => {
  const nodes = nodesByGroup[g.id] || [];
  if (!nodes.length) return;
  // Keep every creole/HTML tag opened AND closed on the SAME line — a color/size span
  // that crosses a \n leaks its closing tags as literal text in the render.
  const comps = nodes.map((n) => n.label).join("\\n");
  const title = `<size:18><b>${g.label}</b></size>  <color:#7d8ca5>· ${nodes.length}</color>`;
  p += `rectangle "${title}\\n${comps}" as ${galias(g.id)} ${g.color}1E\n`;
});
p += "\n";

// Aggregate cross-subsystem flows to one edge per directed subsystem pair, coloured by
// the highest-signal kind on that pair. Drop pure deployment (infra) noise.
const KIND_RANK = { payment: 6, bandwidth: 5, sales: 4, auth: 3, data: 2, control: 1, infra: 0 };
const pair = new Map();   // "src>tgt" -> best kind
data.links.forEach((l) => {
  const sg = groupOf[l.source], tg = groupOf[l.target];
  if (sg === tg || l.kind === "infra") return;
  const key = sg + ">" + tg;
  const cur = pair.get(key);
  if (!cur || (KIND_RANK[l.kind] || 0) > (KIND_RANK[cur] || 0)) pair.set(key, l.kind);
});
for (const [key, kind] of pair) {
  const [sg, tg] = key.split(">");
  p += `${galias(sg)} -[${KIND_COLOR[kind] || "#46506a"}]-> ${galias(tg)}\n`;
}
p += "@enduml\n";

fs.writeFileSync(new URL("./ecosystem.puml", import.meta.url), p);

/* PlantUML text encoding: raw-deflate, then its custom base64 alphabet */
function encChar(c) {
  if (c < 10) return String.fromCharCode(48 + c);
  c -= 10;
  if (c < 26) return String.fromCharCode(65 + c);
  c -= 26;
  if (c < 26) return String.fromCharCode(97 + c);
  c -= 26;
  if (c === 0) return "-";
  if (c === 1) return "_";
  return "?";
}
function encode(buf) {
  let r = "";
  for (let i = 0; i < buf.length; i += 3) {
    const b1 = buf[i];
    const b2 = i + 1 < buf.length ? buf[i + 1] : 0;
    const b3 = i + 2 < buf.length ? buf[i + 2] : 0;
    r += encChar(b1 >> 2);
    r += encChar(((b1 & 0x3) << 4) | (b2 >> 4));
    r += encChar(((b2 & 0xf) << 2) | (b3 >> 6));
    r += encChar(b3 & 0x3f);
  }
  return r;
}
const encoded = encode(zlib.deflateRawSync(Buffer.from(p, "utf8"), { level: 9 }));
const url = "https://www.plantuml.com/plantuml/svg/" + encoded;
fs.writeFileSync(new URL("./ecosystem-plantuml-url.txt", import.meta.url), url + "\n");

console.log(`puml: ${p.length} chars · ${data.groups.length} subsystems · ${pair.size} aggregated flows · render-url: ${url.length} chars`);
console.log(url);

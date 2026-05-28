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
p += "skinparam nodesep 26\n";                         // breathing room between nodes
p += "skinparam ranksep 70\n";                         // taller layout, clearer ranks
p += "skinparam ArrowThickness 1.4\n";
p += "skinparam ArrowColor #4a5878\n";
p += "skinparam ArrowFontColor #7d8ca5\n";
p += "skinparam ArrowFontSize 13\n";
p += "skinparam linetype ortho\n";
p += "skinparam package {\n  BorderColor #34406a\n  BorderThickness 1.6\n  FontColor #c9d6ee\n  FontStyle bold\n  FontSize 20\n}\n";
p += "skinparam rectangle {\n  BorderColor #34406a\n  FontColor #eaf2ff\n  FontSize 16\n  roundCorner 12\n}\n";
p += `title <color:#eef4ff><size:22>${PROJECT_TITLE} — Ecosystem (analysed)</size></color>\\n<color:#62728c><size:14>${data.nodes.length} components · ${data.groups.length} subsystems · meaningful cross-subsystem flows, colored by kind</size></color>\n\n`;

data.groups.forEach((g) => {
  const nodes = nodesByGroup[g.id] || [];
  if (!nodes.length) return;
  p += `package "${g.label}" as ${galias(g.id)} ${g.color}22 {\n`;
  nodes.forEach((n) => {
    p += `  rectangle "${n.label}" as ${alias(n.id)} ${g.color}1A\n`;
  });
  p += "}\n\n";
});

/* draw only the MEANINGFUL cross-subsystem edges — intra-subsystem structure is
   implied by the package box, and the dense 'control'/'infra' fan-outs (every
   module→datastore, every portal→api, everything→server) are dropped so the
   analysed view stays legible instead of a hairball */
const SKIP_KINDS = new Set(["control", "infra"]);
const seen = new Set();
data.links.forEach((l) => {
  if (groupOf[l.source] === groupOf[l.target]) return;
  if (SKIP_KINDS.has(l.kind)) return;
  const key = l.source + ">" + l.target;
  if (seen.has(key)) return;
  seen.add(key);
  const color = KIND_COLOR[l.kind] || "#46506a";
  p += `${alias(l.source)} -[${color}]-> ${alias(l.target)}\n`;
});
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

const crossEdges = seen.size;
console.log(`puml: ${p.length} chars · cross-subsystem edges: ${crossEdges} · render-url: ${url.length} chars`);
console.log(url);

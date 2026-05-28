---
name: system-map-visualization
description: >
  Deeply analyze ANY software project's real source/config, then build a live, animated
  WebGL "system map" (an orbiting 3D force-graph of the whole ecosystem) PLUS a static
  PlantUML "analysed" architecture diagram — both driven by ONE code-verified data file,
  with real-time telemetry pulled from the project's own public endpoints. Use this skill
  whenever the user wants a system map, an architecture/ecosystem diagram, an interactive
  dependency or service graph, "show me / visualize the whole system", a force-directed
  graph of services, a live status/telemetry map, or a PlantUML component diagram generated
  from real code. Output is one self-contained static HTML page + a generated SVG,
  deployable to any static host, with no backend of its own. NEVER invents data — every
  node, edge, and number is verified against the real codebase or a live endpoint.
  Trigger on: "system map", "architecture diagram", "ecosystem graph", "WebGL graph",
  "force graph of our services", "visualize the whole platform/stack", "live infra map",
  "plantuml from our code", "dependency map".
---

# System Map + PlantUML Visualization (universal)

Build two artifacts for **any** software project, from one source of truth:

1. **A live WebGL system map** (`index.html`) — an orbiting 3D force-graph of the entire
   ecosystem with flowing "traffic" particles, **real-time count/health badges fetched from
   the project's own public endpoints**, clickable subsystem cards, guided end-to-end
   "journey" walk-throughs, and a production-readiness panel. One self-contained static HTML
   file. Mission-control aesthetic.
2. **A static PlantUML "analysed" diagram** (`diagram.html` + a generated `.svg`) — a clean
   component diagram grouped by subsystem, generated from the *same* data so the two can
   never drift; rendered to a self-hosted SVG with pan/zoom.

Both are driven by one file, **`ecosystem-data.json`** — the only thing you produce per
project. The HTML/CSS/JS is project-agnostic: re-skin tokens, point the live endpoints at
the project's API. A reference, live build: <https://agents.proxies.sx/system-map/>.

---

## ⛔ The two laws

### 1. NO MOCK DATA. EVER.

Everything the map shows is **either a code-verified constant or a real, live API value** —
never a plausible-looking placeholder.

- **Structure** (nodes, links, groups) comes from *reading the actual code/config*, not from
  imagination. Open the file. If you can't point to the line that proves a node or edge
  exists, it does not go in.
- **Live numbers** are fetched client-side from real endpoints at runtime. A value styled as
  "live" MUST be wired to a real feed.
- **Static facts** (counts that don't change minute-to-minute) are allowed, but must be
  visually distinct from live values (no pulsing dot) and tagged.
- **If you cannot verify it, do not show it.** A smaller true map beats a bigger fictional one.

If you catch yourself writing a number you didn't read from the code or a live response —
stop and go verify it.

### 2. NO FLUFF.

Concrete nodes, real flows, real endpoints. Skip decorative nodes that don't exist as real
components. Skip prose. The map is an operational instrument, not marketing — though it will
happen to look stunning if you execute the design faithfully.

---

## Step 0 — Deeply analyze the REAL system (do this first, thoroughly)

You are reverse-engineering a true architecture, not sketching one. Spend real effort here;
the quality of the map is exactly the quality of this analysis. Read, in order:

1. **Entry points** — `main`, `index`, `app.module`, router files, `Dockerfile`,
   `docker-compose.yml`, `Procfile`, `serverless.yml`, k8s manifests, `nginx`/`Caddy`
   configs, `.env.example`. These reveal the processes, ports, and public surface.
2. **Modules / services** — enumerate every backend module, microservice, worker, cron,
   queue consumer. One **node** each. Record its real tech (`sublabel`) and one verified
   sentence on what it does (`detail`).
3. **Datastores & infra** — every DB, cache, blob store, message bus, plus servers,
   networks, CDNs, blockchains, external SaaS the code actually calls. Nodes.
4. **Edges = real flows.** For each dependency you can prove (an import, a client, a query,
   an HTTP call, a publish/subscribe), add a **link** with a `kind`:
   `control` (orchestration/RPC), `data` (reads/writes a store), `auth`, `payment`,
   `bandwidth` (raw traffic), `sales` (customer/commerce), `infra` (deploy/host/network).
5. **Frontends, SDKs, clients** — dashboards, mobile apps, CLIs, published packages, the
   things that call the API. Nodes + their edges to the API.
6. **Live, safe endpoints.** Find every **public, unauthenticated GET that returns
   counts/status** — health checks, `/metrics`-style summaries, public stats, pricing,
   availability. These power the real-time layer. **Flag anything that would leak sensitive
   or enumerable data** (user lists, IPs, secrets) — that's a finding, never a feed.
7. **Production-readiness gaps** — while reading, note what's mocked, stubbed, TODO,
   deprecated, or fragile. These populate a panel and double as the honest "what's next."

For a large codebase, **fan out**: assign one reader per subsystem (parallel sub-agents),
each returning structured JSON, then a synthesis pass that merges, de-dupes, drops dangling
edges, assigns each subsystem a distinct accent color, and writes `ecosystem-data.json`.

Verify the result: every `links[].source/target` references a real `nodes[].id`; every
`nodes[].group` matches a `groups[].id`; every `liveEndpoints[]` is `safe:true`.

---

## The data model — `ecosystem-data.json`

```jsonc
{
  "summary": "3-4 honest sentences on the system's current posture.",
  "groups": [
    { "id": "edge", "label": "Edge / Ingress", "color": "#4c9aff",
      "blurb": "One-line description of this subsystem." }
    // one per subsystem; distinct hex accents for a DARK theme:
    // blue #4c9aff, cyan #39c5cf, green #3fb950, amber #d29922,
    // red #f85149, purple #bc8cff, grey #8b949e
  ],
  "nodes": [
    { "id": "api",                       // stable kebab-case, referenced by links
      "label": "API (REST)",             // display name
      "group": "edge",                   // must match a groups[].id
      "status": "operational",           // operational | beta | degraded | planned
      "sublabel": "Express, :3000",      // short, REAL tech detail
      "detail": "One verified sentence — what it does, from the code." }
  ],
  "links": [
    { "source": "api", "target": "db", "kind": "data", "label": "reads/writes (optional)" }
    // source AND target MUST be existing node ids. Drop dangling links.
  ],
  "liveEndpoints": [
    { "url": "https://api.example.com/health", "method": "GET",
      "returns": "{ status, components } — status only, no sensitive data",
      "safe": true,                      // true ONLY if it exposes nothing sensitive
      "mapsTo": "which node/metric this animates" }
  ],
  "productionReadiness": [
    { "rank": 1, "area": "...", "status": "gap",   // done | partial | gap
      "severity": "P0", "why": "why it matters", "nextStep": "the concrete next action" }
  ],
  "headlineStats": [
    { "label": "Services", "key": "services", "live": true },        // filled from API at runtime
    { "label": "Endpoints", "value": "42", "live": false, "note": "static fact" }
  ]
}
```

---

## Artifact A — the live WebGL system map (`index.html`)

A single self-contained HTML file. Static-deployable; no build step.

### Dependencies (CDN, pinned)

```html
<script src="https://unpkg.com/3d-force-graph@1"></script>   <!-- global: ForceGraph3D (bundles three.js) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script> <!-- global: gsap -->
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet">
```

> Why this stack and not React + framer-motion: a static site wants one robust UMD bundle,
> not a multi-package ESM import map (three peer-dep conflicts are notorious). Same premium
> motion, zero build. If the target IS a React app, swap in `react-force-graph-3d` +
> `framer-motion` — the data model and patterns are identical.

### Layout zones (fixed panels over a full-screen canvas)

```
┌ LEFT RAIL (one flex column) ┐  ┌ live counts strip (top-center) ┐  ┌ stats (top-right) ┐
│  identity card (top)        │            … WebGL graph …          │ detail panel (right, │
│  Subsystems cards (fill)    │                                     │ slides in on click)  │
└─────────────────────────────┘  ┌ journeys (bottom-center) ┐       └ readiness (bot-right)┘
                                  └ controls (below journeys) ┘
```
Stack identity + Subsystems in ONE `position:fixed` flex-column rail (`#left-rail`) so they
never overlap; the Subsystems list `flex:1; overflow:auto` fills the remaining height.

### The graph (the heart)

```js
const KIND_STYLE = {            // edges styled + animated by semantic kind (lookup table)
  control:   { color:"#3d5170", particles:0, speed:0.004, width:0.5 },
  data:      { color:"#d29922", particles:2, speed:0.006, width:0.7 },
  payment:   { color:"#f85149", particles:4, speed:0.011, width:0.9 },
  bandwidth: { color:"#3fb950", particles:5, speed:0.013, width:1.0 },
  sales:     { color:"#39c5cf", particles:3, speed:0.009, width:0.8 },
  auth:      { color:"#bc8cff", particles:2, speed:0.008, width:0.7 },
  infra:     { color:"#46506a", particles:0, speed:0.003, width:0.4 },
};
const GRAPH = ForceGraph3D()(document.getElementById("graph"))
  .graphData({ nodes, links })
  .backgroundColor("rgba(0,0,0,0)")           // transparent → CSS atmosphere shows through
  .showNavInfo(false).nodeRelSize(6)
  .nodeVal(n => n.__liveSize)                  // size can pulse with live counts
  .nodeColor(nodeColor).nodeOpacity(0.95).nodeResolution(18)
  .nodeLabel(htmlTooltip)                      // styled HTML hover card
  .linkColor(linkColor).linkWidth(linkWidth).linkCurvature(0.06).linkOpacity(0.42)
  .linkDirectionalParticles(l => K(l.kind).particles)     // = flowing traffic
  .linkDirectionalParticleSpeed(l => K(l.kind).speed)
  .linkDirectionalParticleColor(l => K(l.kind).color)
  .onNodeClick(onNodeClick).onBackgroundClick(clearSelection)
  .cooldownTicks(220);
GRAPH.d3Force("charge").strength(-160);
GRAPH.d3Force("link").distance(l => l.kind==="infra"?95 : l.kind==="control"?50 : 64);
GRAPH.d3Force("cluster", clusterForce);        // groups settle into legible lobes (below)
GRAPH.d3VelocityDecay(0.32);
GRAPH.onEngineStop(() => GRAPH.zoomToFit(800, 30));
```

**Group-clustering force** (turns a rainbow hairball into readable subsystem lobes — anchor
each group on a Fibonacci sphere, nudge members toward it):

```js
function computeGroupAnchors() {
  const ids = DATA.groups.map(g=>g.id), a={}, R=360, n=Math.max(1,ids.length-1);
  ids.forEach((g,i)=>{ const y=1-(i/n)*2, r=Math.sqrt(Math.max(0,1-y*y)), phi=i*Math.PI*(3-Math.sqrt(5));
    a[g]={x:Math.cos(phi)*r*R, y:y*R, z:Math.sin(phi)*r*R}; }); return a;
}
function clusterForce(alpha){ const k=alpha*0.11; DATA.nodes.forEach(nd=>{ const an=groupAnchors[nd.group];
  if(!an||nd.x===undefined)return; nd.vx+=(an.x-nd.x)*k; nd.vy+=(an.y-nd.y)*k; nd.vz+=(an.z-nd.z)*k; }); }
```

**Slow auto-orbit + always-on hub labels** (HTML divs synced to 3D via `graph2ScreenCoords`,
for full font control over the WebGL canvas):

```js
function renderLoop(){ if(orbitOn){ orbitAngle+=0.0010;
  GRAPH.cameraPosition({x:camDist*Math.sin(orbitAngle), z:camDist*Math.cos(orbitAngle)}); }
  syncLabels(); requestAnimationFrame(renderLoop); }
// camDist = (distance after zoomToFit) * 0.72; label only "hub" nodes; hide off-screen labels;
// pause orbit on first interaction: GRAPH.controls().addEventListener("start", ()=>orbitOn=false)
```

### Live data wiring (the real-time layer)

```js
const LIVE_ENDPOINTS = { /* the project's own safe, counts-only GETs from Step 0 */ };
const REFRESH_MS = 20000;
async function refreshLive(){
  const r = await Promise.allSettled(Object.values(LIVE_ENDPOINTS).map(u =>
    fetch(u,{cache:"no-store"}).then(x=>{ if(!x.ok) throw 0; return x.json(); })));
  // apply fulfilled results: GSAP-tween counters old→new, pulse node sizes by live counts,
  // set health dots from a status feed, render per-bucket chips.
  // On any failure → show a "cached" badge and keep last values. Never blank out.
}
setInterval(refreshLive, REFRESH_MS); refreshLive();
```

- **CORS**: the page's origin must be allowed by the API (`Access-Control-Allow-Origin`).
  Verify: `curl -H "Origin: https://yourhost" .../endpoint -D -`. Degrade gracefully if not.
- A `live:true` headline stat is filled by writing into `.v[data-stat="<key>"]`; static facts
  render their literal `value` with no live dot.

### Guided journeys (the explainers)

Named end-to-end paths through real components. Clicking one highlights its nodes + the links
among them, dims the rest, frames the camera to the subset
(`zoomToFit(900,110, n => set.has(n.id))`), and shows a numbered **step timeline** (real
ports/timings/mechanisms — not fluff) in the right panel. Support `?flow=<id>` deep-links.

```js
const FLOWS = [{ id:"request", label:"Request lifecycle",
  caption:"One-line what-happens.",
  steps:["concrete step 1 (real)", "step 2", "…"],   // verified intel only
  nodes:["client","api","auth","service","db"] }];   // existing node ids
```

### Interactive subsystem cards & design

Left "Subsystems" panel = one card per group (bordered, hover-lift, active state). Clicking a
card highlights that whole subsystem and pops its explainer (blurb + member chips) in the
right panel. One right panel serves node detail, journey intel, AND subsystem explainer.

Design = mission-control: near-black `#05070d`, layered drifting radial glows + faint
blueprint grid + grain + vignette in CSS *behind* the transparent WebGL canvas (robust glow
without fragile postprocessing); panels use `backdrop-filter:blur()`; type = Chakra Petch
(display) + IBM Plex Mono (data). Pick characterful fonts — never Inter/Roboto/system.

---

## Artifact B — the PlantUML "analysed" diagram

Generated from the SAME `ecosystem-data.json` (can't drift). The included generator emits a
`.puml`, encodes it to a plantuml.com render URL; fetch the SVG once and self-host it;
`diagram.html` shows it with `svg-pan-zoom`.

**Use the bundled [`gen-diagram.mjs`](./gen-diagram.mjs)** (in this folder) — it is generic:
packages per subsystem, only the *meaningful* cross-subsystem edges (drops the dense
`control`/`infra` fan-outs so it's legible, not a hairball), big fonts, dark theme, and the
exact PlantUML raw-deflate + custom-base64 URL encoding.

```bash
node gen-diagram.mjs                                                  # → ecosystem.puml + url file
curl -s "$(cat ecosystem-plantuml-url.txt)" -o ecosystem-diagram.svg  # self-host (no runtime CDN dep)
```

`diagram.html` fetches `./ecosystem-diagram.svg`, injects it inline (strip `width`/`height`),
and `svgPanZoom(el, { fit:true, center:true, controlIconsEnabled:true, minZoom:0.2, maxZoom:18 })`.
Cross-link it with the live map.

---

## Invariants & gotchas (do not re-discover these)

1. **`position:fixed` on every floating non-panel div.** Bars (journeys, controls) that
   aren't your `.panel` class default to `position:static`, so `bottom:`/`left:` do nothing
   and they render at the TOP of the page. Set `position:fixed`.
2. **Centered panels need their own entrance keyframe.** A generic `rise` keyframe ending at
   `transform:none` strips `translateX(-50%)` off centered panels. Use a `riseC` keyframe
   whose `to` is `transform:translateX(-50%)`.
3. **Progressive enhancement.** Base content must be visible without JS animation. Hide
   panels under a boot overlay, reveal with a CSS keyframe (`animation: … both`) — do NOT
   gate base visibility on a JS `opacity:0→1` tween that can be interrupted.
4. **Class-based panel transitions for responsive axis.** Drive open/close with a `.open`
   class (not JS-set transform) so a media query slides the detail panel from the RIGHT on
   desktop and UP as a bottom-sheet on mobile, with the same JS.
5. **Stack the left rail.** Identity + sidebar as ONE fixed flex-column, or they overlap as
   the identity grows.
6. **Live ≠ static, visibly.** Never style a static constant as live.
7. **No sensitive enumeration.** Live feeds are counts/status only. Treat any leak of
   enumerable sensitive data as a release blocker.
8. **Graceful offline.** Wrap every fetch; on failure show "cached" and keep last values.

---

## Verifying it (headless, deterministic)

It's WebGL + animation — verify it actually renders; don't trust types.

```bash
python3 -m http.server 8899 &
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # your path
# headless GPU is usually blocked → use software WebGL:
"$CHROME" --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --run-all-compositor-stages-before-draw --window-size=1600,900 \
  --virtual-time-budget=40000 --screenshot=/tmp/map.png "http://localhost:8899/system-map/"
# real JS errors only:
"$CHROME" --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --enable-logging=stderr --v=1 ... 2>&1 | grep -iE "Uncaught|TypeError|ReferenceError"
```

- A boot-screen-only capture is a **timing artifact**, not a bug — raise
  `--virtual-time-budget`, add `--run-all-compositor-stages-before-draw`, or load with a
  `?flow=…` deep-link (forces a `zoomToFit` that settles the frame). Retry; it's nondeterministic.
- For **layout** bugs, inject a one-off probe logging `getBoundingClientRect()` of suspect
  elements and read the console — far faster than eyeballing screenshots. Test mobile at 390×844.

---

## The whole job, end to end

1. **Analyze** the real system → write `ecosystem-data.json` (Step 0 + schema). Verify every
   node/edge against code. No mock data.
2. **Build** `index.html` (Artifact A) and `diagram.html` from the spec; copy
   `gen-diagram.mjs`.
3. **Re-skin**: brand text, the project title in `gen-diagram.mjs`, optionally `:root` tokens.
   Group accents come from the data file.
4. **Wire live endpoints** to the project's real safe GETs; confirm CORS for the host.
5. **Generate the diagram**: `node gen-diagram.mjs && curl "$(cat ecosystem-plantuml-url.txt)" -o ecosystem-diagram.svg`.
6. **Verify** headless; fix real errors only.
7. **Deploy** the folder to any static host; route `/<path>/` → its `index.html`
   (`try_files $uri $uri/` on nginx, no config change needed).

Result: a living, real-data map of the system + a clean analysed diagram, from one source of
truth, on any static host, with no backend of their own — and not a single invented number.

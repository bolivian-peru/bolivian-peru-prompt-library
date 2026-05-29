---
name: agentic-chat-interface
description: >-
  Build a production-grade streaming agentic chat front-end: an SSE-streamed conversation
  with a live tool-call timeline, a collapsible "thinking" panel, typing/status animations,
  an auto-growing input, stop/retry/abort, and graceful failure. Framework-light (React +
  fetch + the Streams API + Tailwind + lucide icons — no chat library, no SSE library) so it
  ports cleanly into any Next.js/React product. Use when building ANY chat UI for an
  LLM/agent backend: a support assistant, a research agent, an admin copilot, a data-Q&A
  surface. Triggers on: "chat interface", "streaming assistant UI", "agent front-end",
  "tool-call timeline", "SSE chat", "real-time AI chat", "build a ChatGPT-style UI".
---

# Agentic chat interface

A complete, battle-tested pattern for a **streaming agent chat front-end**, extracted from a
production tool-using assistant. It is deliberately framework-light (React + `fetch` + the
Streams API + Tailwind + lucide icons — **no chat library, no SSE library**) so it ports
cleanly into any Next.js/React product.

**Reference shape — build these two files (names are yours):**
- A **client component** (`chat-view.tsx`, ~1100 lines) — the state machine, the stream
  consumer, and every animated sub-component.
- A **server route** (`api/chat/route.ts`, ~680 lines) — the SSE producer: the `send()`
  helper, the heartbeat, abort handling, and interim/final bucketing.
- Optional: a page shell + a conversation-list sidebar (only for multi-thread, logged-in chat).

The single most important idea: **the front-end and the agent backend are decoupled by one
thing — a well-defined SSE event contract.** Get that contract right and you can swap either
side freely. Everything below serves that contract.

---

## 1. The reusable seam — the SSE event contract

The server streams `text/event-stream`. Each event is `event: <type>\ndata: <json>\n\n`.
Comment lines (`: ping …`) are heartbeats, ignored by the client. The client buffers raw
bytes, splits on `\n\n`, and dispatches on `<type>`.

**These ten event types are the entire interface.** A new agent backend only has to emit
them; a new front-end only has to consume them.

| `event:` | `data` payload | UI effect |
|----------|----------------|-----------|
| `status` | `{ step, round?, attempt? }` | sets the streaming status-pill text ("Analyzing your query", "Searching data · step 2", "Retrying (attempt 2/3)"…) |
| `phase` | `{ phase: "planning" \| "answering" }` | flips the message phase; `"answering"` clears the status pill |
| `tool_use` | `{ tool, input, round }` | pushes a step into the tool-call timeline (icon + verb + query hint, spinner running) |
| `tool_result` | `{ tool, summary }` | attaches the result summary to the most-recent matching unresolved tool step (spinner → "→ N found") |
| `interim_text` | `{ content }` | appends to the collapsible "thinking" (planning) text — reasoning **between** tool calls |
| `text` | `{ content }` | appends a delta to the **final answer** (the main bubble); clears status |
| `text_bulk` | `{ content }` | replaces the final answer wholesale (server decided the last round's text WAS the answer) |
| `interim_commit_final` | `{ length }` | trims the last `length` chars off interim text because they were promoted to the final answer (prevents duplication) |
| `error` | `{ message, canRetry, partial }` | injects a system message; arms the retry banner if `canRetry` |
| `done` | `{}` | marks the message `phase: "done"`, collapses the thinking block, shows the "✓ answer ready" chip |

**Why two text channels (`interim_text` vs `text`)?** A tool-using agent produces *reasoning
between tool calls* (planning) and *a final answer*. Conflating them makes the UI a wall of
text. The contract keeps them separate: planning text lives in a collapsible panel; the
answer is the clean main bubble. The `interim_commit_final` event handles the case where the
agent's "planning" in the last round turns out to be the answer — the server promotes it and
tells the client to de-dupe.

**Server-side producer shape:**

```ts
const stream = new ReadableStream({
  async start(controller) {
    let closed = false
    const send = (event: string, data: unknown) => {
      if (closed) return
      try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) }
      catch { closed = true }
    }
    const heartbeat = setInterval(() => {        // keeps proxies from closing an idle stream
      if (!closed) try { controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)) } catch { closed = true }
    }, HEARTBEAT_INTERVAL_MS)
    request.signal.addEventListener('abort', () => { abortController.abort(); closed = true })
    // … agentic loop: send('status',…); send('tool_use',…); send('text',…); send('done',{})
  }
})
return new Response(stream, { headers: {
  'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive',
}})
```

---

## 2. Client architecture — the stream consumer

State:

```ts
const [messages, setMessages] = useState<ChatMessage[]>([])            // the transcript
const [isStreaming, setIsStreaming] = useState(false)
const [streamStatus, setStreamStatus] = useState<string | null>(null) // the pill text
const abortControllerRef = useRef<AbortController | null>(null)
const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Each `ChatMessage` carries: `role`, `content` (final answer only), `interimText` (planning),
`toolCalls[]`, `phase` (`planning` | `answering` | `done`). One assistant message accumulates
all four as events arrive.

**The consume loop — copy this almost verbatim; it is the heart and it is correct:**

```ts
const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  resetStallTimeout()                      // per-chunk 60s stall watchdog
  buffer += decoder.decode(value, { stream: true })
  const events = buffer.split("\n\n")
  buffer = events.pop() || ""              // keep the incomplete trailing event
  for (const rawEvent of events) {
    if (!rawEvent.trim() || rawEvent.startsWith(":")) continue   // skip heartbeats
    let eventType = "message", dataStr = ""
    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim()
      else if (line.startsWith("data: ")) dataStr = line.slice(6)
    }
    if (!dataStr) continue
    let data; try { data = JSON.parse(dataStr) } catch { continue }
    switch (eventType) { /* …the 10 cases above… */ }
  }
}
```

Local accumulators (`interimText`, `finalText`, `phase`, `toolCalls[]`) are mutated as events
arrive, then flushed to React via a single `updateAssistant()` that maps the in-flight
assistant message. **Mutate locals, flush once per event — not a `setState` per token.**

**Resilience primitives (all of them matter):**
- **AbortController** — `stopStreaming()` aborts the fetch; a new send aborts any in-flight one first.
- **60s stall watchdog** — a per-chunk timeout. If no bytes arrive for 60s, abort + inject a
  "took too long, retry" system message + arm retry. Reset on every chunk.
- **Heartbeat tolerance** — `:`-prefixed lines are skipped, so keep-alive pings don't corrupt parsing.
- **Retry** — on `error{canRetry}` or stall, stash the query and show a retry banner;
  `retryLastMessage()` re-streams.
- **Graceful 401** — if the backend gates (auth/quota), it returns a JSON 401 *before* the
  stream; the client reads `requiresLogin` and renders a login CTA instead of erroring.

**Persistence** (optional): anonymous chats persist to `localStorage` (last 50 msgs);
logged-in chats load/save under a `conversationId` via REST. Decouple this — it's not core
to the UX.

---

## 3. Animations & micro-interactions — the complete inventory

This is the part that makes the interface feel alive. Reproduce these precisely; they are
tuned.

### 3.1 Streaming status pill
The "what's happening right now" indicator — a **pulsing dot + text**:
```tsx
<span className="relative inline-flex h-1.5 w-1.5">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
</span>
{streamStatus}…
```
`animate-ping` (Tailwind's scale+fade keyframe) on a translucent clone over a solid dot = the
classic "live" radar ping. Text comes from `status` events. Shown only while
`isStreaming && streamStatus`; cleared the moment `text`/`text_bulk` arrives.

### 3.2 Thinking block — collapsible tool timeline
Container border + tint **transition on active state**:
```
isActive → "border-primary/30 bg-primary/[0.03]"   (live, primary tint)
else     → "border-border/50 bg-muted/20"          (resting, muted)
with `transition-colors`
```
- Header left icon: `Loader2` with `animate-spin text-primary` while active; swaps to a static
  `Database` icon when done.
- Header label is **pluralised live** ("3 searches running…" → "Thought process · 3 searches").
- Chevron: `transition-transform` + `rotate-180` when expanded.
- **Auto-expand while streaming, auto-collapse when the answer arrives** (`useEffect` on
  `hasAnswer`/`isActive`). This is the key UX move: the user watches the agent think, then the
  noise folds away and the clean answer remains. They can re-expand any time.
- Expanded body reveals with the natural layout (no JS opacity tween) — base content is
  visible without animation; only the border/tint and chevron animate.

### 3.3 Tool step row
- **Icon-in-tile with a numbered badge.** A 6×6 rounded tile tinted by the tool's *tone*
  (`search`/`profile`/`compare`/`risk`/`meta` → bg + text + ring classes in `TONE_CLASSES`),
  with a tiny step-number badge floated `-top-1 -right-1` (`tabular-nums`, original step index
  preserved even when older steps are hidden).
- **Running highlight:** the whole `<li>` gets `bg-primary/[0.03]` while `isRunning`, via `transition-colors`.
- **Live verb → noun swap:** while running, shows the action verb + ellipsis ("searching…");
  when done, shows the label ("search by name").
- **Result reveal:** when `tool_result` lands, append `→ <summary>` in `emerald-700/85` (or
  muted if the result matches an empty-result regex like `0 / none`). A trailing `Loader2
  animate-spin` shows only while running.
- **Overflow cap:** at >5 steps, the oldest collapse behind a "Show N earlier steps" button.
  Keeps long agentic sessions scannable; the newest (running) step is always visible.

### 3.4 Tool metadata registry (`TOOL_META`)
The mapping `toolName → { label, icon, action(verb), tone }` is THE thing you re-skin per
product. The timeline reads it for every step. A `DEFAULT_TOOL_META` covers unknown tools so
the UI never breaks when the backend adds a tool. **This registry is your main customization
surface** — see §5.

### 3.5 Assistant header + completion chip
A small uppercase "Assistant" eyebrow. On `done` with an answer, a `CheckCircle2 + "answer
ready"` chip appears in `emerald-700`. A `Sparkles` avatar in a `bg-primary/10` circle anchors
each assistant turn.

### 3.6 Input composer
- **Auto-growing textarea:** on every change, set `height="auto"` then `height =
  min(scrollHeight, 180)px`. Grows with content to a 180px cap, then scrolls. `rows={1}` baseline.
- **Focus-within ring:** the wrapper gets `focus-within:border-primary/50` + a soft
  `focus-within:shadow-[0_0_0_3px_rgb(0_0_0_/_0.02)]` halo, via `transition-all`. While
  streaming the wrapper tints `border-primary/30 bg-primary/[0.02]`.
- **Send ↔ Stop swap:** a `Send` submit button (disabled + greyed when empty) becomes a
  `Square` (filled) stop button while streaming, same position, `transition-all`. Both
  absolutely positioned `right-2 bottom-2`, 8×8, rounded.
- **Placeholder swaps** with state ("Ask anything…" → "Generating answer… you can stop.").
- **Keyboard:** `Enter` sends, `Shift+Enter` newlines; global `⌘K`/`Ctrl+K` focuses the
  input. Footer shows the `<kbd>` hints.

### 3.7 Welcome screen quick-prompts
Shown only when `messages.length === 0`. Grouped suggestion columns; each row a button with a
`ChevronRight` that slides on hover (`group-hover:translate-x-0.5 group-hover:text-primary
transition-all`) and text that brightens (`group-hover:text-foreground`). Clicking sends the
prompt immediately. This empty-state teaches users what to ask.

### 3.8 Retry banner
On a recoverable failure, an amber banner shows the truncated failed query + a `RefreshCw`
"Try again" button. Disappears once streaming resumes.

### 3.9 Auto-scroll — near-bottom only
The single most-respected detail: **only auto-scroll if the reader is already within 150px of
the bottom** (`scrollHeight - scrollTop - clientHeight < 150`). If they've scrolled up to
read, a streaming answer must NOT yank them back. Fires on `messages` + `streamStatus` change,
`behavior:"smooth"`.

### 3.10 Markdown answer rendering (`MarkdownText`)
A tiny hand-rolled markdown renderer (no library) so the answer is typographically rich but
tightly controlled:
- **Headings** → sized by level; `##` gets a little `bg-primary` dot pill before it.
- **Bullets** → custom `▸` marker in `text-primary/60`.
- **Tables** → bordered, `bg-muted/30` header, `tabular-nums` cells, row `hover:bg-muted/10`,
  horizontal-scroll wrapper.
- **Inline:** `**bold**`, `*italic*`, and links `[text](href)`. Internal links (`/…`) get an
  `ArrowUpRight` icon; external get `ExternalLink` + `target="_blank" rel=noopener`. This is
  how the agent's answer links straight to your entity/detail pages.

### 3.11 Reduced motion & tokens
All colour comes from design-system tokens (`primary`, `muted`, `border`, `foreground`,
`emerald`/`amber`/`rose` for states) — re-skin by changing the theme, not the components. Type
scale runs small and dense (10–15px) for an information-rich, calm feel. Gate any keyframes you
add behind `@media (prefers-reduced-motion: reduce)`.

---

## 4. Layout shell

`flex h-full flex-col` with a scrollable transcript (`flex-1 overflow-y-auto min-h-0`) above a
pinned composer (`shrink-0 border-t bg-background/95 backdrop-blur-md`). Transcript and
composer share a `max-w-[900px]` centered column. The `min-h-0` on the scroll area is
load-bearing — without it the flex child won't scroll. A `transcriptEndRef` sentinel `<div>`
at the bottom is the scroll target.

---

## 5. Reuse checklist — what to copy, swap, keep

**Copy verbatim** (it's correct, don't reinvent):
- The SSE event contract (§1) and the consume loop (§2).
- The resilience set: AbortController, 60s stall watchdog, heartbeat skipping, retry,
  graceful pre-stream 401.
- The animation classes in §3 — they're tuned.
- The near-bottom-only auto-scroll (§3.9).

**Swap per product:**
- `TOOL_META` (§3.4) — your tools, icons, verbs, tones. The main re-skin. Keep
  `DEFAULT_TOOL_META` so unknown tools degrade gracefully.
- `QUICK_PROMPTS` and all UI copy / locale.
- The backend `fetch` URL + request body shape, and the agent loop that produces the events.
- `MarkdownText` link targets (deep-link to your own routes).
- Auth/quota/persistence (anon localStorage, conversationId) — fully optional; strip if your
  chat is single-thread and open.

**Keep (the invariants that make it good):**
- Two text channels (planning vs answer) — never collapse them.
- Mutate locals, flush once per event — never setState-per-token.
- Status pill cleared the instant the answer starts.
- Thinking block auto-collapses on answer; user can re-open.
- Provenance/links preserved in the rendered answer.

---

## 6. Core principles (code-simplifier — mandatory)

Adapted from the official
[code-simplifier](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md)
agent. Apply when you port or extend this interface:

1. **Preserve behaviour** — refactors change *how*, never *what*. The stream loop and event
   contract are correct; don't "improve" their semantics, only their clarity.
2. **`function` keyword over arrows** for top-level/components; explicit prop types.
3. **No nested ternaries** — label pluralisation uses readable chained conditionals, not deep `?:`.
4. **One renderer, one contract.** Don't fork a second event format or a second markdown
   renderer. If you add an event type, add it to the contract table AND both ends.
5. **Remove redundancy; keep the *why* comments** — the comments explaining "two text buckets",
   "near-bottom only", "per-chunk stall reset" are load-bearing. Keep them.
6. **Scope discipline** — re-skinning is `TOOL_META` + copy + theme tokens, not a rewrite of
   the stream loop.

## 7. You may — and should — customise

This is a strong default, not a cage. Different products need different shapes: a code-assistant
might add a `diff` event and a monospace block; a voice agent might add `audio_chunk`; a
research agent might add a `citation` event with a sources rail. **Add them — extend the
contract table, emit from the backend, handle in the switch, render a new component.** The
constraints in §6 govern *how* you change things (cleanly, one contract, behaviour preserved);
they don't forbid changing them.

---

## 8. Anti-patterns (recognise and avoid)

- **`setState` per streamed token.** Murders performance. Mutate locals, flush once per event.
- **Collapsing planning text into the answer.** Produces a wall of reasoning where users want
  a clean answer. Keep the two channels.
- **Auto-scrolling unconditionally.** Makes a long streaming answer unreadable. Near-bottom-only
  or nothing.
- **No abort / no stall timeout.** A hung backend = a spinner forever + a leaked connection.
  Both watchdogs are mandatory.
- **Parsing SSE without skipping `:` heartbeats.** Corrupts the buffer.
- **A markdown library for three features.** The hand-rolled renderer (~80 lines) is faster,
  smaller, and fully controllable. Don't pull a 200KB dependency for bold/links/tables.
- **Pulsing/"live" affordances on static content.** The ping dot means "happening now". Don't
  decorate idle UI with it.

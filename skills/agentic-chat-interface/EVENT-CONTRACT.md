# The SSE event contract

This is the decoupling seam between an agent backend and a streaming chat front-end. The
server emits these events; the client consumes them. Get this right and either side is freely
swappable. Hand this page to whoever owns the other side.

## Transport

- `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive`.
- Each event is exactly: `event: <type>\ndata: <json>\n\n`.
- Heartbeat comment lines `: ping <ts>\n\n` keep idle connections alive through proxies and
  are **ignored** by the client (any line starting with `:` is skipped).
- The client buffers raw bytes, splits on `\n\n`, keeps the trailing incomplete chunk, and
  dispatches each complete event on its `event:` type.

## The 10 events

| `event:` | `data` | Meaning / UI effect |
|---|---|---|
| `status` | `{ step: string, round?: number, attempt?: number }` | Human-readable "what's happening now" → sets the status pill. Cleared when the answer starts. |
| `phase` | `{ phase: "planning" \| "answering" }` | Flips the message phase. `"answering"` clears the status pill. |
| `tool_use` | `{ tool: string, input: object, round: number }` | A tool call started → push a step into the tool-call timeline (spinner running). |
| `tool_result` | `{ tool: string, summary: string }` | A tool call finished → attach the summary to the most-recent unresolved step for that tool (spinner → result). |
| `interim_text` | `{ content: string }` | A delta of **planning/reasoning between tool calls** → append to the collapsible "thinking" panel. |
| `text` | `{ content: string }` | A delta of the **final answer** → append to the main bubble. Clears status. |
| `text_bulk` | `{ content: string }` | Replace the final answer wholesale (the server decided the last round's text was the answer). |
| `interim_commit_final` | `{ length: number }` | Trim the last `length` chars off the interim/planning text — they were promoted to the final answer; prevents duplication. |
| `error` | `{ message: string, canRetry: boolean, partial?: boolean }` | Inject a system message; arm the retry banner if `canRetry`. |
| `done` | `{}` | End of turn → mark the message done, collapse the thinking block, show the completion chip. |

## The two text channels (do not collapse them)

A tool-using agent produces two kinds of text:

1. **Planning** (`interim_text`) — reasoning between tool calls. Lives in a collapsible panel.
2. **Answer** (`text` / `text_bulk`) — the clean final response. The main bubble.

Conflating them turns the UI into a wall of text. When the agent's last-round "planning" turns
out to *be* the answer, the server promotes it to `text`/`text_bulk` and emits
`interim_commit_final` so the client de-dupes.

## Minimal server emit sequence (one tool round)

```
event: status
data: {"step":"Analyzing your query"}

event: phase
data: {"phase":"planning"}

event: tool_use
data: {"tool":"search","input":{"q":"…"},"round":1}

: ping 1716950000000

event: tool_result
data: {"tool":"search","summary":"12 found"}

event: phase
data: {"phase":"answering"}

event: text
data: {"content":"Here is what I found: "}

event: text
data: {"content":"…"}

event: done
data: {}
```

## Client contract (the non-negotiables)

- Skip `:`-prefixed heartbeat lines.
- Mutate local accumulators per event; flush to the view **once per event**, never per token.
- Run a per-chunk stall watchdog (e.g. 60s) and an `AbortController`; both are mandatory.
- If the backend gates access, return a JSON `401` **before** the stream starts so the client
  can render a login/quota CTA instead of a broken stream.

## Extending the contract

Need more? Add an event type (e.g. `citation`, `diff`, `audio_chunk`): add a row here, emit it
from the backend, handle it in the client `switch`, render its component. One contract, both
ends — never fork a second event format.

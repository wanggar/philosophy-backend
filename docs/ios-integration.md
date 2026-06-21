# iOS Integration Guide — `/api/v1/chat`

## Overview

The backend exposes a single POST endpoint that powers the AI companion across all session stages. Each call is **stateless on the server** — the iOS client owns the conversation history and all accumulated artifacts, and must send them up on every turn.

The backend uses the **OpenAI Responses API** with structured output (`zodTextFormat`), which guarantees the JSON shape on every response. No retries or validation needed on the iOS side.

---

## Endpoint

```
POST /api/v1/chat
Content-Type: application/json
```

**Local dev:** `http://localhost:3000/api/v1/chat`  
**Production:** update `baseURL` in `LiveAPIService.swift` after deploying to Vercel.

---

## Request

### Shape

```json
{
  "message": "string",
  "stage": "initial" | "fog" | "ledger" | "clash" | "review",
  "history": [
    { "role": "user" | "assistant", "content": "string" }
  ],
  "artifacts": {
    "fog": [FogScrap],
    "clashScales": [ClashScaleState]
  }
}
```

### Field notes

| Field | Description |
|---|---|
| `message` | The user's current message text |
| `stage` | Current session stage. Must match `ChatStage.stringValue` on iOS |
| `history` | Full conversation so far — alternating `user`/`assistant` turns. Do **not** include the current `message` here |
| `artifacts.fog` | All fog scraps accumulated so far (send full list, not just new ones) |
| `artifacts.clashScales` | All clash scales accumulated so far (send full list) |

> **Note:** Ledger state is not sent up in artifacts — the backend infers ledger context from the conversation history.

### iOS types that map to this

```swift
struct ChatRequestBody: Encodable {
    let message: String
    let stage: String
    let history: [ChatHistoryMessage]
    let artifacts: ArtifactsPayload
}

struct ChatHistoryMessage: Encodable {
    let role: String   // "user" | "assistant"
    let content: String
}

struct ArtifactsPayload: Encodable {
    let fog: [FogScrap]
    let clashScales: [ClashScaleState]
}
```

---

## Response

### Shape

```json
{
  "aiMessage": "string",
  "nextStage": "initial" | "fog" | "ledger" | "clash" | "review" | null,
  "fogUpdates": [FogScrap] | null,
  "clashUpdates": [ClashScale] | null,
  "ledgerUpdates": [LedgerEntry] | null
}
```

### Field notes

| Field | When non-null | What to do on iOS |
|---|---|---|
| `aiMessage` | Always | Display in chat bubble |
| `nextStage` | When the AI decides to advance | Transition `currentStage` on the view model |
| `fogUpdates` | Only during `fog` stage | Append to `fogScraps` array; assign random `x/y` on device |
| `clashUpdates` | Only during `clash` stage | Upsert into `clashScales` by `id` |
| `ledgerUpdates` | Only during `ledger` stage | Merge into `[LedgerCellKey: [String]]` dict keyed by `path + row + column` |

### Object shapes

#### FogScrap (from server)
```json
{
  "text": "Public loss feels final",
  "isItalic": true,
  "size": 28
}
```
> The server does **not** send `id`, `x`, or `y`. Generate those on-device in `ServerFogScrap.toFogScrap()`.

#### ClashScale (from server)
```json
{
  "id": "belonging_vs_identity",
  "left": "Belonging with the team",
  "right": "Identity as a founder",
  "botPosition": 0.35,
  "userPosition": 0.35
}
```
> `botPosition` and `userPosition` are floats `0.0–1.0`. `0.0` = fully left pole, `1.0` = fully right pole. The user adjusts `userPosition` on-device after receiving it.

#### LedgerEntry (from server)
```json
{
  "path": "go" | "stay",
  "row": "short" | "long",
  "column": "gain" | "lose",
  "items": ["a clean slate", "sunday lunch"]
}
```
> Multiple entries can share the same `path/row/column` — append `items` arrays together when merging into the dict.

### iOS types that map to this

```swift
struct AgentResponse: Decodable {
    let aiMessage: String?
    let nextStage: String?
    let fogUpdates: [ServerFogScrap]?
    let clashUpdates: [ServerClashScale]?
    let ledgerUpdates: [ServerLedgerEntry]?
}
```

---

## Stage Machine

The session moves linearly through 5 stages. The backend controls advancement via `nextStage`.

```
initial → fog → ledger → clash → review
```

| Stage | AI behaviour | Artifact emitted |
|---|---|---|
| `initial` | Listens, reflects, names the dilemma | None |
| `fog` | Surfaces emotional patterns | `fogUpdates` |
| `ledger` | Maps gains/losses for each path | `ledgerUpdates` |
| `clash` | Names core value tensions | `clashUpdates` |
| `review` | Summarises the journey, prompts toward decision | None |

**Rules:**
- `nextStage` is `null` when the AI wants to stay in the current stage. Only update `currentStage` when it is non-null.
- Stages never go backwards.
- The AI will not advance a stage until it has emitted at least one artifact for that stage (e.g. it will not leave `fog` until `fogUpdates` has been populated at least once).

---

## History Management

The server is **fully stateless**. The iOS client is responsible for maintaining history.

`LiveAPIService` accumulates `ChatHistoryMessage` entries in memory:

```swift
// After a successful response:
history.append(ChatHistoryMessage(role: "user", content: text))
if let aiMessage = agentResponse.aiMessage {
    history.append(ChatHistoryMessage(role: "assistant", content: aiMessage))
}
```

Call `resetHistory()` when starting a new session:

```swift
(apiService as? LiveAPIService)?.resetHistory()
```

---

## Known Issue — Artifacts Not Sent

`LiveAPIService.sendMessage` currently sends **empty artifacts** on every call:

```swift
// ⚠️ BUG: artifacts are hardcoded empty
artifacts: ArtifactsPayload(fog: [], clashScales: [])
```

This means the backend's system prompt always shows `"Fog scraps: none yet"` and `"Value clashes: none yet"` even when the user has accumulated them. Fix by passing the actual accumulated state from the view model:

```swift
artifacts: ArtifactsPayload(
    fog: viewModel.fogScraps,
    clashScales: viewModel.clashScales
)
```

`sendMessage` will need an updated signature to accept the current artifacts, or `LiveAPIService` needs a reference to session state.

---

## Error Handling

On any server error the backend returns:

```json
{ "error": "Something went wrong. Please try again." }
```
with HTTP status `500`.

The iOS client handles this via:

```swift
private struct BackendError: Decodable {
    let error: String
}
// Throws ServiceError.serverError(message) on non-200
```

---

## Local Dev Setup

1. In `LiveAPIService.swift`, switch `baseURL` to localhost:
   ```swift
   private let baseURL = URL(string: "http://localhost:3000/api/v1")!
   ```

2. Add `NSAppTransportSecurity` exception in `Info.plist` for HTTP on localhost:
   ```xml
   <key>NSAppTransportSecurity</key>
   <dict>
     <key>NSExceptionDomains</key>
     <dict>
       <key>localhost</key>
       <dict>
         <key>NSExceptionAllowsInsecureHTTPLoads</key>
         <true/>
       </dict>
     </dict>
   </dict>
   ```

3. Make sure the backend is running:
   ```bash
   cd philosophy-backend && npm run dev
   ```

4. Watch the Xcode console — `LiveAPIService` logs every request and response:
   ```
   📤 [Client] POST http://localhost:3000/api/v1/chat | stage=initial
   📥 [Client] HTTP 200
   📡 [Server] Raw response: {...}
   ✅ [Server] aiMessage    : It sounds like...
   ✅ [Server] nextStage    : fog
   ✅ [Server] fogUpdates   : 3 scraps
   ```

---

## Quick Reference — Full curl Example

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I cannot decide whether to leave my job or go all in on my startup.",
    "stage": "initial",
    "history": [],
    "artifacts": { "fog": [], "clashScales": [] }
  }'
```

Expected response shape:
```json
{
  "aiMessage": "...",
  "nextStage": "fog",
  "fogUpdates": [
    { "text": "Safety feels sacred", "isItalic": false, "size": 24 }
  ],
  "clashUpdates": null,
  "ledgerUpdates": null
}
```

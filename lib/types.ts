// Types shared between route handler and prompt builder.
// These mirror the Codable structs on the iOS side exactly.

export type Stage = "initial" | "fog" | "ledger" | "clash" | "review"

export type FogScrap = {
  text: string
  isItalic: boolean
  size: number
}

export type ClashScale = {
  id: string
  left: string
  right: string
  botPosition: number
  userPosition: number
}

export type LedgerPath = "go" | "stay"
export type LedgerRow = "short" | "long"
export type LedgerColumn = "gain" | "lose"

export type LedgerEntry = {
  path: LedgerPath
  row: LedgerRow
  column: LedgerColumn
  items: string[]
}

export type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

export type Artifacts = {
  fog: FogScrap[]
  clashScales: ClashScale[]
}

// Request body sent by the iOS app on every chat turn
export type ChatRequest = {
  message: string
  stage: Stage
  history: ChatHistoryMessage[]
  artifacts: Artifacts
}

// Response decoded by iOS LiveAPIService into AgentResponse
export type ChatResponse = {
  aiMessage: string
  sessionTitle: string | null
  nextStage: Stage | null
  fogUpdates: FogScrap[] | null
  clashUpdates: ClashScale[] | null
  ledgerUpdates: LedgerEntry[] | null
}

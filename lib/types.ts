// Types shared between route handler and prompt builder.
// These mirror the Codable structs on the iOS side exactly.

export type Stage = "initial" | "fog" | "ledger" | "clash" | "review"

export type FogScrap = {
  text: string
  isItalic: boolean
  size: number
}

export type ClashPerspective = {
  name: string
  text: string
  application: string
}

export type ClashElaboration = {
  heading: string
  headingAccent: string
  stake: string
  meaning: string
  carryQuestion: string
  perspectives: ClashPerspective[]
}

export type ClashScale = {
  id: string
  left: string
  right: string
  botPosition: number
  userPosition: number
  elaboration?: ClashElaboration | null
}

export type LedgerPath = "go" | "stay"
export type LedgerRow = "short" | "long"
export type LedgerColumn = "gain" | "lose"

export type LedgerItem = {
  label: string
  details: string[]
}

export type LedgerCell = {
  path: LedgerPath
  row: LedgerRow
  column: LedgerColumn
  items: LedgerItem[]
}

export type LedgerEntry = {
  path: LedgerPath
  row: LedgerRow
  column: LedgerColumn
  items: LedgerItem[]
}

export type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

export type Artifacts = {
  fog: FogScrap[]
  clashScales: ClashScale[]
  ledger: LedgerCell[]
}

// Request body sent by the iOS app on every chat turn
export type ChatRequest = {
  message: string
  stage: Stage
  history: ChatHistoryMessage[]
  artifacts: Artifacts
}

export type ResearchLink = {
  title: string
  url: string
  note: string
}

// Response decoded by iOS LiveAPIService into AgentResponse
export type ChatResponse = {
  aiMessage: string
  sessionTitle: string | null
  nextStage: Stage | null
  fogUpdates: FogScrap[] | null
  clashUpdates: ClashScale[] | null
  ledgerUpdates: LedgerEntry[] | null
  ledgerPathLabels: { go: string; stay: string } | null
  researchLinks: ResearchLink[] | null
}

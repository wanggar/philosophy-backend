import type { ChatRequest, ChatResponse, ClashScale } from "./types"

/** Explicit comfort/readiness to decide — not mere engagement with tensions. */
export function userIndicatesDecisionReadiness(message: string): boolean {
  const m = message.trim()
  if (!m) return false

  const patterns: RegExp[] = [
    // English
    /\b(ready to (decide|choose|commit|seal)|i(?:'m| am) ready\b|want to (decide|choose|commit|seal)|time to (decide|choose|commit)|let'?s (decide|seal|commit)|i(?:'ve| have) (decided|chosen)|i know what (?:i|to)\b|feel(?:ing)? ready\b|comfortable (?:deciding|choosing|committing)|can decide now|want to review|see everything|before i (decide|commit|seal)|i(?:'m| am) leaning (toward|towards)\b.*\band\b.*\b(ready|decide))/i,
    // Chinese
    /准备好(决定|选择|定下来|封存)|可以决定了|想决定了|决定吧|我想定下来|可以定了|想回顾|准备封存|我准备好了|我想好了|可以选了/,
    // Spanish
    /\b(list[oa] para (decidir|elegir|comprometer|sellar)|ya puedo decidir|quiero decidir|vamos a decidir|me siento list[oa]|ya sé qué (hacer|elegir))\b/i,
    // French
    /\b(prêt[e]? à (décider|choisir|m'engager|sceller)|je suis prêt[e]?\b|je peux décider|je veux décider|j'ai décidé|je sais ce que je (veux|vais))\b/i,
  ]

  return patterns.some((re) => re.test(m))
}

/**
 * Enforce product rules the model sometimes ignores:
 * - review only when the user signals readiness
 * - first tension unlock seeds exactly two clashes
 * - later clash turns add at most one new tension per turn
 */
export function enforceStageArtifactGuards(
  body: ChatRequest,
  parsed: ChatResponse
): ChatResponse {
  const out = { ...parsed }

  if (out.nextStage === "review" && !userIndicatesDecisionReadiness(body.message)) {
    out.nextStage = null
    // Drop the Review orienting line if the model jumped early — keep the rest of the reply.
    if (out.aiMessage) {
      out.aiMessage = out.aiMessage
        .replace(
          /\s*Before you commit, review everything we built[\s\S]*$/i,
          ""
        )
        .replace(
          /\s*在做决定前[\s\S]*$/u,
          ""
        )
        .trim()
    }
  }

  const clashes = out.clashUpdates
  if (clashes && clashes.length > 0) {
    if (out.nextStage === "clash" && body.stage === "ledger") {
      // First unlock: exactly two tensions.
      out.clashUpdates = clashes.slice(0, 2)
    } else if (body.stage === "clash" && out.nextStage !== "review") {
      const existingIds = new Set(body.artifacts.clashScales.map((c) => c.id))
      const existingKeys = new Set(
        body.artifacts.clashScales.map((c) => clashKey(c.left, c.right))
      )

      const updates: ClashScale[] = []
      let addedNew = false
      for (const clash of clashes) {
        const isExisting =
          existingIds.has(clash.id) || existingKeys.has(clashKey(clash.left, clash.right))
        if (isExisting) {
          updates.push(clash)
        } else if (!addedNew) {
          updates.push(clash)
          addedNew = true
        }
      }
      out.clashUpdates = updates.length ? updates : null
    }
  }

  return out
}

function clashKey(left: string, right: string): string {
  return `${left.trim().toLowerCase()}::${right.trim().toLowerCase()}`
}

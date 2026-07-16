// Research helpers: intent classification, Tavily (primary) + OpenAI web search (secondary).
import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import type { ResearchLink } from "./types"

type TavilyResult = {
  title?: string
  url?: string
  content?: string
}

type TavilyResponse = {
  results?: TavilyResult[]
}

export type SearchIntent = {
  shouldSearch: boolean
  searchQuery: string | null
}

const searchIntentSchema = z.object({
  shouldSearch: z
    .boolean()
    .describe(
      "True when the user wants a live web search executed on THIS turn — explicit command, acceptance of a prior offer, or answering a search clarification (e.g. both/reddit/official)."
    ),
  needsClarificationFirst: z
    .boolean()
    .describe(
      "True when the companion should ask the user a clarifying question BEFORE searching on this turn (e.g. which source types, which school, what to focus on). When true, shouldSearch must be false."
    ),
  searchQuery: z
    .string()
    .nullable()
    .describe(
      "Keyword-rich search query (max ~300 chars) when shouldSearch is true. Include schools, topics, and source preferences. Null when shouldSearch is false."
    ),
})

const CLASSIFIER_INSTRUCTIONS = `You decide whether to run a live web search on THIS user turn.

SEARCH (shouldSearch=true) when:
- The user explicitly asks to look something up, search, find links/sources, list faculty, get student feedback/testimonials, or verify an external claim.
- The user accepts a prior assistant offer to look something up — including short replies (yes, sure, both, either, go ahead) or elaborated agreement.
- The user answers a clarifying question about WHAT to search (e.g. Reddit vs official pages) and still wants the information — "both" means search all mentioned source types.
- The current message adds detail to an unfulfilled search request from the recent conversation.

DO NOT SEARCH (shouldSearch=false) when:
- The user declines or prefers to stay with gut feelings only.
- The assistant offered lookup but the user has not agreed yet and is not commanding a search.
- The message is purely emotional/values with no request for external facts.
- The user is reacting to prior results without asking for more lookup.
- The request is too vague to run a useful search WITHOUT asking the user first what to focus on or which source types they want (set needsClarificationFirst=true). Examples: "look it up" with no clear topic; accepting an offer but not specifying reddit vs official when that choice matters and hasn't been asked/answered yet.
- needsClarificationFirst=true — the companion should ask a clarifying question on this turn instead of searching. Sources must NOT appear until the user answers and a search actually runs.

needsClarificationFirst: true when the natural next step is to ask the user what to search, which school/program, or which source types (official vs forums vs news) — NOT when the user already answered that question or gave a specific query.

Use the full conversation context. Example: if the user previously said "help me search Cornell's vibe" and now replies "both" to a Reddit-vs-official question, shouldSearch=true and needsClarificationFirst=false.

searchQuery: write a concise, specific query for a search API (school names, field, source types).`

function formatHistoryForClassifier(
  message: string,
  history: { role: string; content: string }[]
): string {
  const recent = history.slice(-6)
  const lines = recent.map((m) => `${m.role.toUpperCase()}: ${m.content}`)
  lines.push(`USER (current): ${message}`)
  return lines.join("\n\n")
}

export async function evaluateSearchIntent(
  client: OpenAI,
  message: string,
  history: { role: string; content: string }[]
): Promise<SearchIntent> {
  const trimmed = message.trim()
  if (!trimmed) {
    return { shouldSearch: false, searchQuery: null }
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_SEARCH_INTENT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: [
        { role: "system", content: CLASSIFIER_INSTRUCTIONS },
        {
          role: "user",
          content: `Conversation:\n\n${formatHistoryForClassifier(trimmed, history)}`,
        },
      ],
      text: {
        format: zodTextFormat(searchIntentSchema, "search_intent"),
      },
    })

    const parsed = searchIntentSchema.parse(JSON.parse(response.output_text))

    if (parsed.needsClarificationFirst || !parsed.shouldSearch) {
      return { shouldSearch: false, searchQuery: null }
    }

    const query = (parsed.searchQuery ?? buildSearchQuery(trimmed, history))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400)

    return query ? { shouldSearch: true, searchQuery: query } : { shouldSearch: false, searchQuery: null }
  } catch (err) {
    console.error("[research] search intent classification error:", err)
    return { shouldSearch: false, searchQuery: null }
  }
}

/** Fallback query builder when the classifier omits searchQuery. */
export function buildSearchQuery(
  message: string,
  history: { role: string; content: string }[]
): string {
  const lastUser = [...history].reverse().find((m) => m.role === "user")
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")
  const parts = [message, lastUser?.content, lastAssistant?.content]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return parts.slice(0, 400)
}

export async function searchWithTavily(query: string): Promise<ResearchLink[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: 8,
    }),
  })

  if (!response.ok) {
    console.error("[research] Tavily error:", response.status, await response.text())
    return []
  }

  const data = (await response.json()) as TavilyResponse
  return (data.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({
      title: r.title!.trim(),
      url: r.url!.trim(),
      note: (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    }))
}

export async function searchWithOpenAIWeb(
  client: OpenAI,
  query: string
): Promise<ResearchLink[]> {
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      tools: [{ type: "web_search" as const }],
      input: `Find 6–8 high-quality sources to help someone verify this claim or research need. Prefer a DIVERSE mix — do not repeat the same site:
- Official pages (.edu, company sites, government)
- Student testimonials / reviews (Niche, Reddit, forums)
- News or investigative reports
- Include both favorable AND critical perspectives when relevant
Return useful links only — do not decide for the user.\n\nQuery: ${query}`,
    })

    const links: ResearchLink[] = []
    const seen = new Set<string>()

    const output = (response as { output?: unknown[] }).output ?? []
    for (const item of output) {
      const block = item as {
        type?: string
        content?: { type?: string; annotations?: { type?: string; url?: string; title?: string }[]; text?: string }[]
      }
      if (block.type !== "message" || !Array.isArray(block.content)) continue
      for (const part of block.content) {
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === "url_citation" && annotation.url && !seen.has(annotation.url)) {
            seen.add(annotation.url)
            links.push({
              title: annotation.title?.trim() || annotation.url,
              url: annotation.url,
              note: "",
            })
          }
        }
      }
    }

    if (links.length === 0 && response.output_text) {
      const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
      let match: RegExpExecArray | null
      while ((match = mdLink.exec(response.output_text)) !== null) {
        const url = match[2]
        if (seen.has(url)) continue
        seen.add(url)
        links.push({ title: match[1], url, note: "" })
      }
    }

    return links.slice(0, 8)
  } catch (err) {
    console.error("[research] OpenAI web_search error:", err)
    return []
  }
}

export async function gatherResearchLinks(
  client: OpenAI,
  query: string
): Promise<ResearchLink[]> {
  const [tavily, openai] = await Promise.all([
    searchWithTavily(query),
    searchWithOpenAIWeb(client, query),
  ])

  const merged = deduplicateByDomain([...tavily, ...openai])
  return diversifyResearchLinks(merged, 4)
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

type SourceCategory =
  | "official"
  | "forum"
  | "testimonials"
  | "news"
  | "other"

function getSourceCategory(link: ResearchLink): SourceCategory {
  const host = getDomain(link.url)
  const text = `${link.title} ${link.note} ${link.url}`.toLowerCase()

  if (
    host.endsWith(".edu") ||
    host.endsWith(".gov") ||
    text.includes("official") ||
    text.includes("department")
  ) {
    return "official"
  }
  if (
    host.includes("reddit") ||
    host.includes("quora") ||
    host.includes("stackexchange") ||
    host.includes("forum")
  ) {
    return "forum"
  }
  if (
    host.includes("niche.com") ||
    host.includes("unigo") ||
    host.includes("yelp") ||
    host.includes("trustpilot") ||
    host.includes("glassdoor") ||
    text.includes("review") ||
    text.includes("student experience") ||
    text.includes("testimonial")
  ) {
    return "testimonials"
  }
  if (
    host.includes("news") ||
    host.includes("nytimes") ||
    host.includes("reuters") ||
    host.includes("bbc.") ||
    host.includes("theguardian") ||
    text.includes("report")
  ) {
    return "news"
  }
  return "other"
}

type SentimentHint = "positive" | "negative" | "neutral"

function sentimentHint(link: ResearchLink): SentimentHint {
  const text = `${link.title} ${link.note}`.toLowerCase()
  if (/\b(?:complaint|worst|regret|negative|downside|problem|issue|bad|hate|avoid|critical|disappoint)\b/.test(text)) {
    return "negative"
  }
  if (/\b(?:love|great|best|recommend|positive|amazing|wonderful|excellent|praise|favorable)\b/.test(text)) {
    return "positive"
  }
  return "neutral"
}

function deduplicateByDomain(links: ResearchLink[]): ResearchLink[] {
  const seen = new Set<string>()
  const result: ResearchLink[] = []

  for (const link of links) {
    const domain = getDomain(link.url)
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    result.push({
      title: link.title.slice(0, 120),
      url: link.url,
      note: link.note.slice(0, 160),
    })
  }

  return result
}

function diversifyResearchLinks(links: ResearchLink[], max: number): ResearchLink[] {
  if (links.length <= max) return links

  const byCategory = new Map<SourceCategory, ResearchLink[]>()
  for (const link of links) {
    const cat = getSourceCategory(link)
    const bucket = byCategory.get(cat) ?? []
    bucket.push(link)
    byCategory.set(cat, bucket)
  }

  const categoryOrder: SourceCategory[] = [
    "official",
    "forum",
    "testimonials",
    "news",
    "other",
  ]

  const selected: ResearchLink[] = []
  const usedDomains = new Set<string>()

  const tryAdd = (link: ResearchLink) => {
    const domain = getDomain(link.url)
    if (usedDomains.has(domain)) return false
    selected.push(link)
    usedDomains.add(domain)
    return true
  }

  // One link per category first — maximizes vantage-point diversity
  for (const cat of categoryOrder) {
    if (selected.length >= max) break
    const pool = byCategory.get(cat) ?? []
    if (pool.length) tryAdd(pool[0])
  }

  // Prefer a mix of positive and critical tones when testimonials/forums present
  const tonePool = links.filter((l) => {
    const cat = getSourceCategory(l)
    return cat === "forum" || cat === "testimonials" || cat === "news"
  })
  const hasPositive = selected.some((l) => sentimentHint(l) === "positive")
  const hasNegative = selected.some((l) => sentimentHint(l) === "negative")

  if (selected.length < max && !hasPositive) {
    const candidate = tonePool.find(
      (l) => sentimentHint(l) === "positive" && !usedDomains.has(getDomain(l.url))
    )
    if (candidate) tryAdd(candidate)
  }
  if (selected.length < max && !hasNegative) {
    const candidate = tonePool.find(
      (l) => sentimentHint(l) === "negative" && !usedDomains.has(getDomain(l.url))
    )
    if (candidate) tryAdd(candidate)
  }

  for (const link of links) {
    if (selected.length >= max) break
    tryAdd(link)
  }

  return selected.slice(0, max)
}

/** True when the assistant is asking the user to clarify before delivering search results. */
export function responseRequestsSearchClarification(message: string): boolean {
  const m = message.trim()
  if (!m) return false

  if (
    /\b(?:sources suggest|what i found|these (?:suggest|point|show|sources)|from what (?:i|the sources) found|here(?:'s| is) what)\b/i.test(
      m
    )
  ) {
    return false
  }

  const clarificationPatterns = [
    /\b(?:reddit|official|niche|forums?|student reviews?)\b.*\bor\b/i,
    /\bwhich (?:would you|do you|should i|kind of|type of|source)\b/i,
    /\bbefore i (?:search|pull|look)\b/i,
    /\bor stay with how it feels\b/i,
    /\bwant me to (?:pull|look|search|focus on)\b[^.?!]*\?/i,
    /\b(?:happy to|should i) (?:look|pull|search)\b[^.?!]*\?/i,
    /\bwhat (?:would you|should i) (?:focus on|look for|search for)\b/i,
    /\b(?:official pages?|forums?|news|testimonials?) or\b/i,
  ]

  return clarificationPatterns.some((pattern) => pattern.test(m))
}

/** Sources cards should only appear when search results are being delivered, not on clarification turns. */
export function shouldExposeResearchLinks(
  links: ResearchLink[] | null | undefined,
  aiMessage: string | null | undefined
): boolean {
  if (!links?.length) return false
  if (!aiMessage?.trim()) return false
  if (responseRequestsSearchClarification(aiMessage)) return false
  return true
}

export function formatResearchForPrompt(links: ResearchLink[]): string {
  if (!links.length) {
    return "No live sources were found. Be honest about that — do not invent URLs. Ask a clarifying question instead."
  }
  return links
    .map((l, i) => `${i + 1}. ${l.title}\n   URL: ${l.url}\n   Note: ${l.note || "(no snippet)"}`)
    .join("\n")
}

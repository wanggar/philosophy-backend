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

Use the full conversation context. Example: if the user previously said "help me search Cornell's vibe" and now replies "both" to a Reddit-vs-official question, shouldSearch=true.

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

    if (!parsed.shouldSearch) {
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
      max_results: 4,
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
      input: `Find 3–4 high-quality sources to help someone verify this claim or research need. Prefer recent student testimonials, Niche/Reddit threads, official department pages, or faculty listings when relevant. Return useful links only — do not decide for the user.\n\nQuery: ${query}`,
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

    return links.slice(0, 4)
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

  const merged: ResearchLink[] = []
  const seen = new Set<string>()

  for (const link of [...tavily, ...openai]) {
    const key = link.url.replace(/\/$/, "").toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({
      title: link.title.slice(0, 120),
      url: link.url,
      note: link.note.slice(0, 160),
    })
    if (merged.length >= 4) break
  }

  return merged
}

export function formatResearchForPrompt(links: ResearchLink[]): string {
  if (!links.length) {
    return "No live sources were found. Be honest about that — do not invent URLs. Ask a clarifying question instead."
  }
  return links
    .map((l, i) => `${i + 1}. ${l.title}\n   URL: ${l.url}\n   Note: ${l.note || "(no snippet)"}`)
    .join("\n")
}

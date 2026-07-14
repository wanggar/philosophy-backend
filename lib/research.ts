// Research helpers: Tavily (primary) + OpenAI web search (secondary).
import OpenAI from "openai"
import type { ResearchLink } from "./types"

type TavilyResult = {
  title?: string
  url?: string
  content?: string
}

type TavilyResponse = {
  results?: TavilyResult[]
}

// Direct search commands — no prior offer required.
const EXPLICIT_SEARCH_RE =
  /\b(look\s*(it|that|this|them|that up)?\s*up|search\s+(for|up)|google\b|pull\s+up\b|check\s+(online|reddit|niche|youtube))\b/i

// User asks for external facts, links, listings, or summaries from the web.
const RESEARCH_REQUEST_RE =
  /\b(?:(?:could|can|would)\s+you|please)\s+(?:\w+\s+){0,3}?(?:list(?:\s+out)?|find|search|look\s*up|pull(?:\s+up)?|get|show(?:\s+me)?|share|summarize|tell\s+me)\b|\b(?:list\s+out|look\s+up|search\s+for|find\s+(?:me\s+)?(?:some\s+)?|more\s+(?:info|information)|additional\s+information)\b|\b(?:links?|sources?|info(?:rmation)?|professors?|faculty|testimonials?|reviews?|department\s+pages?|student\s+takes?)\b.*\b(?:list|find|search|summarize|share|show)\b|\b(?:list|find|search|summarize|share|show)\b.*\b(?:links?|sources?|professors?|faculty|testimonials?|reviews?|department\s+pages?|student\s+takes?)\b|\bi(?:'d| would)\s+(?:also\s+)?appreciate\b/i

// Assistant offered to look something up (matches varied natural phrasing).
const SEARCH_OFFER_RE =
  /\b(?:want\s+me\s+to|have\s+me|let\s+me|i\s+can|i\s+could|shall\s+i)\s+(?:\w+\s+){0,4}?(?:look|check|search|find|pull|grab)\b|\b(?:pull|find|look\s+up)\s+(?:a\s+few|some|recent)\b|\bor\s+have\s+me\s+(?:pull|look|find|search)\b/i

// User accepts an offer — allows leading filler ("oh yeah sure…").
const AFFIRMATIVE_INTENT_RE =
  /^(?:oh\s+|um\s+|well\s+)?(?:(?:yeah|yes)\s+)?(?:sure|yep|ok|okay|please|go\s+ahead|definitely|absolutely)\b|^(?:that['']d|that\s+would)\s+be\s+(?:great|helpful|good)\b|^sounds\s+good\b|^(?:yes|yeah)\s+please\b|\b(?:yes|yeah|yep|sure|ok|okay|please|go\s+ahead|definitely|absolutely|that['']d\s+be\s+(?:great|helpful|good)|that\s+would\s+be\s+(?:great|helpful|good)|sounds\s+good)\b/i

function lastAssistantMessage(history: { role: string; content: string }[]) {
  return [...history].reverse().find((m) => m.role === "assistant")
}

export function isExplicitSearchRequest(
  message: string,
  history: { role: string; content: string }[]
): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false

  // Standalone explicit command or clear research ask.
  if (EXPLICIT_SEARCH_RE.test(trimmed) || RESEARCH_REQUEST_RE.test(trimmed)) {
    return true
  }

  const lastAssistant = lastAssistantMessage(history)
  if (!lastAssistant || !SEARCH_OFFER_RE.test(lastAssistant.content)) {
    return false
  }

  // Prior turn offered search — short yes, or elaboration that still wants lookup.
  return AFFIRMATIVE_INTENT_RE.test(trimmed) || RESEARCH_REQUEST_RE.test(trimmed)
}

export function buildSearchQuery(
  message: string,
  history: { role: string; content: string }[]
): string {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")
  const context = lastAssistant?.content?.slice(0, 280) ?? ""
  const combined = `${message} ${context}`.replace(/\s+/g, " ").trim()
  return combined.slice(0, 400)
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

    // Fallback: scrape markdown-style links from output_text
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

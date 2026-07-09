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

const EXPLICIT_SEARCH_RE =
  /\b(look\s*(it|that|this)?\s*up|search\s+(for|up)|find\s+(me\s+)?(some\s+)?(links?|info|information|sources?|professors?|testimonials?|reviews?)|can you (check|verify|look|search|find)|please (check|verify|look|search|find)|pull up|google\b|check (online|reddit|niche|youtube))\b/i

const AFFIRMATIVE_RE =
  /^(yes|yeah|yep|sure|ok|okay|please|go ahead|do it|sounds good|that'd be great|that would be great|yes please|yeah please)\b/i

const OFFER_RE =
  /\b(want me to (look|check|search|find|pull)|i can (look|check|search|find|pull)|shall i (look|check|search|find)|i could (look|check|search|find))\b/i

export function isExplicitSearchRequest(
  message: string,
  history: { role: string; content: string }[]
): boolean {
  const trimmed = message.trim()
  if (EXPLICIT_SEARCH_RE.test(trimmed)) return true

  if (AFFIRMATIVE_RE.test(trimmed)) {
    const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")
    if (lastAssistant && OFFER_RE.test(lastAssistant.content)) return true
  }

  return false
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

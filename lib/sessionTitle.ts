import type OpenAI from "openai"

const INVALID_TITLE = /^(untitled|new session|tmp|test|n\/a|null)$/i
const PATH_LIKE = /^[/\\]|https?:\/|\b\/tmp\b|\.tmp\b/i

export function isValidSessionTitle(title: string | null | undefined): boolean {
  if (!title) return false
  const trimmed = title.trim()
  if (trimmed.length < 3 || trimmed.length > 60) return false
  if (INVALID_TITLE.test(trimmed)) return false
  if (PATH_LIKE.test(trimmed)) return false
  // Reject single-token path fragments like "tmp/tmp"
  if (trimmed.includes("/") && !trimmed.includes(" ")) return false
  return true
}

export function fallbackTitleFromMessage(message: string): string {
  const words = message
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
  if (words.length === 0) return "New session"
  const title = words.join(" ")
  if (title.length <= 60) return title
  return `${title.slice(0, 57).trim()}…`
}

function languageInstruction(preferredLanguage: string): string {
  switch (preferredLanguage) {
    case "zh-Hans":
    case "zh":
      return "Write the title in Simplified Chinese."
    case "es":
      return "Write the title in Spanish."
    case "fr":
      return "Write the title in French."
    default:
      return "Write the title in English."
  }
}

export async function generateSessionTitle(
  client: OpenAI,
  message: string,
  preferredLanguage: string = "en"
): Promise<string> {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: `You name decision-making conversations. Given the user's first message, write a short title (3–6 words) that summarizes their dilemma — the choice, conflict, or situation they're torn about. ${languageInstruction(preferredLanguage)} No quotes, punctuation at the end, file paths, URLs, or placeholders.`,
      },
      { role: "user", content: message },
    ],
    max_output_tokens: 30,
  })

  return response.output_text?.trim() ?? ""
}

export async function resolveSessionTitle(
  client: OpenAI,
  message: string,
  modelTitle: string | null | undefined,
  preferredLanguage: string = "en"
): Promise<string> {
  if (isValidSessionTitle(modelTitle)) {
    return modelTitle!.trim()
  }

  try {
    const generated = await generateSessionTitle(client, message, preferredLanguage)
    if (isValidSessionTitle(generated)) {
      return generated.trim()
    }
  } catch (err) {
    console.error("[sessionTitle] generation failed:", err)
  }

  return fallbackTitleFromMessage(message)
}

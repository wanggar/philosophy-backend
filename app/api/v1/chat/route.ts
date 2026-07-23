import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { buildSystemPrompt } from "@/lib/prompts"
import { normalizeAiMessage } from "@/lib/normalizeMessage"
import {
  samplePhilosopherCandidates,
  usedPerspectiveNamesFromArtifacts,
} from "@/lib/philosopherPool"
import {
  evaluateSearchIntent,
  formatResearchForPrompt,
  gatherResearchLinks,
  shouldExposeResearchLinks,
} from "@/lib/research"
import { resolveSessionTitle } from "@/lib/sessionTitle"
import { enforceStageArtifactGuards } from "@/lib/stageGuards"
import type { ChatRequest, ChatResponse, ResearchLink } from "@/lib/types"

const client = new OpenAI()

// Zod schema — enforces structured output from the LLM.
// Must stay in sync with ChatResponse in lib/types.ts and AgentResponse on iOS.
const responseSchema = z.object({
  aiMessage: z
    .string()
    .describe(
      "The AI companion's reply. Warm, direct, max 4 sentences. Write natively in the user's preferredLanguage. Use natural punctuation for that language (for English: don't, I'll, What's — never dont/Ill/Whats or merged words). Usually ends with an uptake+depth question (pick up their words; ask why / what it might mean) — avoid defaulting to A-or-B rankings. If nextStage is set (except review): acknowledge + deepening question only — no soft aside about tools/panels/chips. On clash→review: acknowledge + soft close + Review orienting line. When researchLinks are present, do not paste URLs; ask what resonates."
    ),
  sessionTitle: z
    .string()
    .nullable()
    .describe(
      "Short conversation title (3–6 words) summarizing the user's dilemma — the choice or conflict they're torn about. Required on the first user message only; null on all later turns."
    ),
  nextStage: z
    .enum(["initial", "fog", "ledger", "clash", "review"])
    .nullable()
    .describe(
      "Advance to this stage, or null to stay. When set (except review): aiMessage is acknowledge + question only — no tool soft aside. Set nextStage to review ONLY when the user explicitly indicates readiness/comfort to decide (not merely because tensions exist). On review: acknowledge + soft close + Review line."
    ),
  fogUpdates: z
    .array(
      z.object({
        text: z
          .string()
          .max(36)
          .describe(
            "Verbatim emotionally honest phrase, 2–5 words, max 36 characters. Re-emit an existing scrap when the user repeats it (client grows size)."
          ),
        isItalic: z.boolean().describe("True for reflective/internal phrases, false for factual ones."),
        size: z
          .number()
          .min(12)
          .max(28)
          .describe("Optional visual-weight hint (12=quiet, 28=loud); client may override from repetition."),
      })
    )
    .nullable()
    .describe(
      "Verbatim scraps for Your words. Required (≥1) on initial→fog unlock. After unlock, populate on fog/ledger/clash turns with new OR repeated phrases. Null on review or when nothing quotable."
    ),
  clashUpdates: z
    .array(
      z.object({
        id: z.string().describe("Short snake_case identifier e.g. loyalty, belonging, comfort. Must be unique across all clashes."),
        left: z.string().describe("Left pole of the value tension e.g. Loyalty. Must differ from all other clashes."),
        right: z.string().describe("Right pole of the value tension e.g. Becoming. Must differ from all other clashes."),
        botPosition: z
          .number()
          .min(0)
          .max(1)
          .describe("Your read of where user leans: 0=fully left, 1=fully right."),
        userPosition: z
          .number()
          .min(0)
          .max(1)
          .describe("Start same as botPosition — user will adjust on device."),
        elaboration: z
          .object({
            heading: z.string().describe("First line of the clash framing, grounded in this conversation."),
            headingAccent: z.string().describe("Second line in contrasting voice, grounded in this conversation."),
            stake: z.string().describe("What's at stake between these two values for THIS user."),
            meaning: z
              .string()
              .describe(
                "What the user's lean at userPosition means (0=fully left, 1=fully right). Interpret their verdict on the scale — reference their situation, not generic philosophy."
              ),
            carryQuestion: z.string().describe("One question for the user to sit with, specific to their dilemma."),
            perspectives: z
              .array(
                z.object({
                  name: z
                    .string()
                    .describe(
                      "Named thinker preferred (exact name from this turn's candidate pool when possible). Avoid bare -isms when a person fits."
                    ),
                  text: z
                    .string()
                    .describe(
                      "1–2 sentences (doctrine): how this philosophical lens illuminates this type of value tension in general — not personalized advice."
                    ),
                  application: z
                    .string()
                    .describe(
                      "1–2 sentences: what this thinker would notice or ask about THIS user's situation. Reference their dilemma. Illuminate, never tell them what to choose."
                    ),
                })
              )
              .min(2)
              .max(3)
              .describe(
                "2–3 lenses from this turn's candidate pool. Diversify traditions (Western, Eastern, Middle Eastern & Islamic, African & indigenous) and periods (ancient through contemporary). No name reuse within the session or across clashes in this response. Match lenses to tension type (duty, authenticity, utility, care, justice, etc.)."
              ),
          })
          .nullable()
          .describe("Elaboration content for the clash detail view. Populate when emitting clashUpdates."),
      })
    )
    .max(3)
    .nullable()
    .describe(
      "Value tension scales. On ledger→clash (nextStage=clash): REQUIRED exactly 1 tension (the clearest axis so far). On later clash turns: re-emit UPDATED existing tension(s) when understanding deepened, and/or add at most 1 NEW tension if a distinct new thread emerged (session max 3). Null during initial/fog/ledger except the ledger→clash transition."
    ),
  ledgerUpdates: z
    .array(
      z.object({
        path: z.enum(["go", "stay"]).describe("Which path this entry belongs to."),
        row: z.enum(["short", "long"]).describe("Time horizon: short-term or long-term."),
        column: z.enum(["gain", "lose"]).describe("Whether these items are gains or losses."),
        items: z
          .array(
            z.object({
              label: z
                .string()
                .max(60)
                .describe("Umbrella theme / assertion, e.g. 'academic excitement'."),
              details: z
                .array(z.string().max(40))
                .max(5)
                .describe(
                  "Concrete supporting evidence grounded in USER input (or clear logical implication of it), e.g. ['better classics', 'more courses']. Prefer 1–3 details when the user gave specifics. Never invent baseless facts or copy web-search claims. Use [] if no concrete supports yet."
                ),
            })
          )
          .max(3)
          .describe(
            "Full consolidated list for this cell (REPLACES previous). Max 3 structured items. Merge related ideas into one label with supporting details."
          ),
      })
    )
    .nullable()
    .describe(
      "Tradeoffs cell updates on fog→ledger, during ledger, and lightly during clash when new gains/losses appear. Null during initial/fog (except fog→ledger). Prefer filling empty gain/lose cells, including long-horizon rows via grounded deduction from user input, and mirror pairs across paths. Must update when the latest user message adds tradeoff detail."
    ),
  ledgerPathLabels: z
    .object({
      go: z.string().describe("Specific label for path A from the user's dilemma, e.g. 'If you choose Brown'."),
      stay: z.string().describe("Specific label for path B from the user's dilemma, e.g. 'If you choose Cornell'."),
    })
    .nullable()
    .describe("Path labels for the two ledger options. ONLY when nextStage is ledger or during ledger stage. Null during initial and fog."),
  researchLinks: z
    .array(
      z.object({
        title: z.string().describe("Source title."),
        url: z.string().describe("Full https URL from the live search — never invent."),
        note: z.string().describe("One short line on what this source offers. Empty string if none."),
      })
    )
    .max(4)
    .nullable()
    .describe(
      "Echo the live research links provided in the prompt (same URLs). Null when no search ran. Never invent links."
    ),
})

function ndjsonLine(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`
}

async function runChat(
  body: ChatRequest,
  researchLinks: ResearchLink[] | null
): Promise<ChatResponse> {
  const researchBlock =
    researchLinks && researchLinks.length > 0
      ? `\n\nLIVE RESEARCH RESULTS (share carefully; do not decide for the user; do not invent URLs; ask what resonates):\n${formatResearchForPrompt(researchLinks)}`
      : researchLinks
        ? `\n\nLIVE RESEARCH RESULTS: none found. Be honest; do not invent URLs.`
        : ""

  const usedNames = usedPerspectiveNamesFromArtifacts(body.artifacts.clashScales)
  const philosopherCandidates = samplePhilosopherCandidates({
    excludeNames: usedNames,
    count: 12,
  })

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: buildSystemPrompt(body, philosopherCandidates) + researchBlock,
      },
      ...body.history,
      { role: "user", content: body.message },
    ],
    text: {
      format: zodTextFormat(responseSchema, "chat_response"),
    },
  })

  const parsed = responseSchema.parse(JSON.parse(response.output_text)) as ChatResponse

  if (parsed.aiMessage) {
    parsed.aiMessage = normalizeAiMessage(
      parsed.aiMessage,
      body.preferredLanguage ?? "en"
    )
  }

  const isFirstUserMessage = body.history.length === 0
  if (isFirstUserMessage) {
    parsed.sessionTitle = await resolveSessionTitle(
      client,
      body.message,
      parsed.sessionTitle,
      body.preferredLanguage ?? "en"
    )
  } else {
    parsed.sessionTitle = null
  }

  // Attach search results only when the reply delivers findings — not when asking for clarification.
  if (shouldExposeResearchLinks(researchLinks, parsed.aiMessage)) {
    parsed.researchLinks = researchLinks
  } else {
    parsed.researchLinks = null
  }

  return enforceStageArtifactGuards(body, parsed)
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json()
    const wantsStream = req.headers.get("accept")?.includes("application/x-ndjson")

    const searchIntent = await evaluateSearchIntent(client, body.message, body.history)

    if (!wantsStream) {
      let researchLinks: ResearchLink[] | null = null
      if (searchIntent.shouldSearch && searchIntent.searchQuery) {
        researchLinks = await gatherResearchLinks(client, searchIntent.searchQuery)
      }
      const parsed = await runChat(body, researchLinks)
      return Response.json(parsed)
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(ndjsonLine(obj)))
        try {
          let researchLinks: ResearchLink[] | null = null
          if (searchIntent.shouldSearch && searchIntent.searchQuery) {
            send({ type: "status", status: "searching" })
            researchLinks = await gatherResearchLinks(client, searchIntent.searchQuery)
          }
          const parsed = await runChat(body, researchLinks)
          send({ type: "result", data: parsed })
        } catch (err) {
          console.error("[/api/v1/chat] stream error:", err)
          send({ type: "error", error: "Something went wrong. Please try again." })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("[/api/v1/chat] Error:", err)
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}

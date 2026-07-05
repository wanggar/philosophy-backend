import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { buildSystemPrompt } from "@/lib/prompts"
import type { ChatRequest, ChatResponse } from "@/lib/types"

const client = new OpenAI()

// Zod schema — enforces structured output from the LLM.
// Must stay in sync with ChatResponse in lib/types.ts and AgentResponse on iOS.
const responseSchema = z.object({
  aiMessage: z.string().describe("The AI companion's reply. Warm, direct, max 3 sentences."),
  sessionTitle: z
    .string()
    .nullable()
    .describe(
      "Short conversation title (3–6 words). Always set on the first user message. Update later only if the dilemma becomes clearer and the user hasn't renamed it."
    ),
  nextStage: z
    .enum(["initial", "fog", "ledger", "clash", "review"])
    .nullable()
    .describe("Advance to this stage, or null to stay in the current stage."),
  fogUpdates: z
    .array(
      z.object({
        text: z
          .string()
          .max(36)
          .describe("Unique emotionally honest phrase, 2–5 words, max 36 characters. Never duplicate existing scraps."),
        isItalic: z.boolean().describe("True for reflective/internal phrases, false for factual ones."),
        size: z.number().min(12).max(28).describe("Visual weight: 12=quiet, 28=loud."),
      })
    )
    .nullable()
    .describe("New fog scraps to add. Only populate during fog stage. Null otherwise."),
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
              .describe("What the user's current lean means — reference their situation, not generic philosophy."),
            carryQuestion: z.string().describe("One question for the user to sit with, specific to their dilemma."),
            perspectives: z
              .array(
                z.object({
                  name: z
                    .string()
                    .describe(
                      "Philosopher or tradition name e.g. 'Aristotle', 'Confucius', 'Stoicism', 'Buddhism'."
                    ),
                  text: z
                    .string()
                    .describe(
                      "1–2 sentences on how this philosophical lens illuminates this type of value tension in general — not personalized advice for this user."
                    ),
                })
              )
              .min(2)
              .max(3)
              .describe(
                "2–3 philosophical lenses. Include at least one Western and one Eastern thinker or tradition."
              ),
          })
          .nullable()
          .describe("Elaboration content for the clash detail view. Populate when emitting clashUpdates."),
      })
    )
    .nullable()
    .describe("2–3 DISTINCT value clash scales. No duplicate or near-duplicate poles. Only populate during clash stage. Null otherwise."),
  ledgerUpdates: z
    .array(
      z.object({
        path: z.enum(["go", "stay"]).describe("Which path this entry belongs to."),
        row: z.enum(["short", "long"]).describe("Time horizon: short-term or long-term."),
        column: z.enum(["gain", "lose"]).describe("Whether these items are gains or losses."),
        items: z
          .array(z.string())
          .describe("1-3 short phrases for this cell, e.g. 'a clean slate', 'sunday lunch'."),
      })
    )
    .nullable()
    .describe("Ledger cells (gains/losses per path & horizon). Only populate during ledger stage. Null otherwise."),
  ledgerPathLabels: z
    .object({
      go: z.string().describe("Specific label for path A from the user's dilemma, e.g. 'If you choose Brown'."),
      stay: z.string().describe("Specific label for path B from the user's dilemma, e.g. 'If you choose Cornell'."),
    })
    .nullable()
    .describe("Labels for the two ledger paths. Required on every ledger turn — use the user's actual options, never generic go/stay."),
})

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json()

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: [
        { role: "system", content: buildSystemPrompt(body) },
        ...body.history,
        { role: "user", content: body.message },
      ],
      text: {
        format: zodTextFormat(responseSchema, "chat_response"),
      },
    })

    const parsed: ChatResponse = responseSchema.parse(
      JSON.parse(response.output_text)
    )
    return Response.json(parsed)
  } catch (err) {
    console.error("[/api/v1/chat] Error:", err)
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}

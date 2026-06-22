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
      "Short conversation title (3–6 words) once the dilemma is clearly named. Null until then."
    ),
  nextStage: z
    .enum(["initial", "fog", "ledger", "clash", "review"])
    .nullable()
    .describe("Advance to this stage, or null to stay in the current stage."),
  fogUpdates: z
    .array(
      z.object({
        text: z.string().describe("Short emotionally honest phrase, 2-5 words."),
        isItalic: z.boolean().describe("True for reflective/internal phrases, false for factual ones."),
        size: z.number().min(12).max(28).describe("Visual weight: 12=quiet, 28=loud."),
      })
    )
    .nullable()
    .describe("New fog scraps to add. Only populate during fog stage. Null otherwise."),
  clashUpdates: z
    .array(
      z.object({
        id: z.string().describe("Short snake_case identifier e.g. loyalty, belonging, comfort."),
        left: z.string().describe("Left pole of the value tension e.g. Loyalty."),
        right: z.string().describe("Right pole of the value tension e.g. Becoming."),
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
      })
    )
    .nullable()
    .describe("Value clash scales to surface. Only populate during clash stage. Null otherwise."),
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

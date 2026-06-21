import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import { buildSystemPrompt } from "@/lib/prompts"
import type { ChatRequest, ChatResponse } from "@/lib/types"

// Zod schema — enforces structured output from the LLM.
// Must stay in sync with ChatResponse in lib/types.ts and AgentResponse on iOS.
const responseSchema = z.object({
  aiMessage: z.string().describe("The AI companion's reply. Warm, direct, max 3 sentences."),
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
    .default(null)
    .describe("New fog scraps to add. Only populate during fog stage. Omit or null otherwise."),
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
    .default(null)
    .describe("Value clash scales to surface. Only populate during clash stage. Omit or null otherwise."),
})

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json()

    const { object } = await generateObject({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      schema: responseSchema,
      messages: [
        { role: "system", content: buildSystemPrompt(body) },
        ...body.history,
        { role: "user", content: body.message },
      ],
    })

    const response: ChatResponse = object
    return Response.json(response)
  } catch (err) {
    console.error("[/api/v1/chat] Error:", err)
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}

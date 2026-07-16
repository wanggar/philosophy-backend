import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"

const client = new OpenAI()

const meaningSchema = z.object({
  meaning: z
    .string()
    .describe(
      "2–4 sentences interpreting what the user's chosen position means for their dilemma. Second person. Grounded in stake — not generic philosophy."
    ),
})

export type ClashMeaningRequest = {
  left: string
  right: string
  userPosition: number
  botPosition: number
  stake: string
  heading: string
  headingAccent: string
}

function positionLabel(left: string, right: string, position: number): string {
  const pctRight = Math.round(position * 100)
  const pctLeft = 100 - pctRight
  if (pctRight > 50) return `${pctRight}% toward ${right}`
  if (pctLeft > 50) return `${pctLeft}% toward ${left}`
  return `evenly split between ${left} and ${right}`
}

export async function generateClashMeaning(
  req: ClashMeaningRequest
): Promise<string> {
  const userLean = positionLabel(req.left, req.right, req.userPosition)
  const companionLean = positionLabel(req.left, req.right, req.botPosition)
  const moved =
    Math.abs(req.userPosition - req.botPosition) > 0.02
      ? `The user moved the slider from the companion's initial read (${companionLean}) to their own verdict (${userLean}). Interpret their verdict — not the companion's prediction.`
      : `The user placed themselves at ${userLean}.`

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "You interpret value tensions in a decision-making app. Write plainly, warmly, and specifically. Never tell the user what to choose.",
      },
      {
        role: "user",
        content: `Value tension: ${req.left} ↔ ${req.right}
Framing: ${req.heading} / ${req.headingAccent}
What's at stake: ${req.stake}
${moved}

Write "what your position means" for the USER's chosen lean.`,
      },
    ],
    text: {
      format: zodTextFormat(meaningSchema, "clash_meaning"),
    },
    max_output_tokens: 200,
  })

  const parsed = meaningSchema.parse(JSON.parse(response.output_text))
  return parsed.meaning.trim()
}

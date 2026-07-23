import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"

const client = new OpenAI()

const greetingSchema = z.object({
  homeLine1: z
    .string()
    .describe(
      "First line of the home-screen invitation. Warm, intimate, 3–8 words. Invites the user to name a stuck decision — same purpose as 'What's pulling at you'."
    ),
  homeLine2: z
    .string()
    .describe(
      "Second accent line that completes the home question (2–5 words). Together with homeLine1 it should read as one natural question. May be a short trailing phrase like 'right now?'"
    ),
  homeSupport: z
    .string()
    .describe(
      "Shorter single-line version for under 'Welcome back, Name' — same invitation, max ~12 words."
    ),
  chatOpener: z
    .string()
    .describe(
      "First chat bubble for a returning user: one short inviting question (max ~14 words). Same tone/purpose as the home lines."
    ),
})

export type GreetingCopy = z.infer<typeof greetingSchema>

function languageName(code: string): string {
  switch (code) {
    case "zh-Hans":
    case "zh":
      return "Simplified Chinese (简体中文)"
    case "es":
      return "Spanish (Español)"
    case "fr":
      return "French (Français)"
    default:
      return "English"
  }
}

function styleNotes(code: string): string {
  switch (code) {
    case "zh-Hans":
    case "zh":
      return `Write natural 口语简体中文. Prefer 纠结 / 犹豫 / 拿不定主意. Never calque English (no 拉扯着你).`
    case "es":
      return `Write natural conversational Spanish. Prefer atascarse / dudar / dar vueltas. Never calque English (no jalando).`
    case "fr":
      return `Write natural conversational French (tutoiement). Prefer bloquer / hésiter. Never calque English (no te tire).`
    default:
      return `Warm, plain English. Avoid corporate or clinical tone.`
  }
}

export function fallbackGreeting(preferredLanguage: string): GreetingCopy {
  switch (preferredLanguage) {
    case "zh-Hans":
    case "zh":
      return {
        homeLine1: "此刻，你在纠结",
        homeLine2: "什么？",
        homeSupport: "此刻，你在纠结什么？",
        chatOpener: "此刻，你在纠结什么？",
      }
    case "es":
      return {
        homeLine1: "¿En qué estás atorada",
        homeLine2: "ahora?",
        homeSupport: "¿En qué estás atorada ahora?",
        chatOpener: "¿En qué estás atorada ahora?",
      }
    case "fr":
      return {
        homeLine1: "Qu'est-ce qui te bloque",
        homeLine2: "en ce moment ?",
        homeSupport: "Qu'est-ce qui te bloque en ce moment ?",
        chatOpener: "Qu'est-ce qui te bloque en ce moment ?",
      }
    default:
      return {
        homeLine1: "What's pulling at you",
        homeLine2: "right now?",
        homeSupport: "What's pulling at you right now?",
        chatOpener: "What's pulling at you right now?",
      }
  }
}

export async function createGreeting(
  preferredLanguage: string = "en"
): Promise<GreetingCopy> {
  const lang = languageName(preferredLanguage)
  const notes = styleNotes(preferredLanguage)

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: `You write opening lines for Loom, a warm decision-making companion.

Purpose (all four fields must share this intent):
- Invite the user to vent about a decision they're stuck on
- Feel intimate and human — a trusted friend, not a coach script
- Stay short; no product feature mentions; no advice

Language: write natively in ${lang}. ${notes}
Vary wording each time — do not always reuse the same phrase.
homeLine1 + homeLine2 must form one coherent question when read together.
No quotation marks around the lines. No emoji.`,
      },
      {
        role: "user",
        content: `Generate a fresh home + chat opener set in ${lang}.`,
      },
    ],
    text: {
      format: zodTextFormat(greetingSchema, "greeting_copy"),
    },
  })

  const parsed = greetingSchema.parse(JSON.parse(response.output_text))
  if (!parsed.homeLine1?.trim() || !parsed.homeSupport?.trim() || !parsed.chatOpener?.trim()) {
    return fallbackGreeting(preferredLanguage)
  }

  return {
    homeLine1: parsed.homeLine1.trim(),
    homeLine2: (parsed.homeLine2 || "").trim(),
    homeSupport: parsed.homeSupport.trim(),
    chatOpener: parsed.chatOpener.trim(),
  }
}

import { createGreeting, fallbackGreeting } from "@/lib/greeting"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      preferredLanguage?: string
    }
    const preferredLanguage = body.preferredLanguage?.trim() || "en"

    try {
      const greeting = await createGreeting(preferredLanguage)
      return Response.json(greeting)
    } catch (err) {
      console.error("[greeting] generation failed:", err)
      return Response.json(fallbackGreeting(preferredLanguage))
    }
  } catch (err) {
    console.error("[greeting] request failed:", err)
    return Response.json(fallbackGreeting("en"), { status: 200 })
  }
}

import { generateClashMeaning } from "@/lib/clashMeaning"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const left = String(body.left ?? "").trim()
    const right = String(body.right ?? "").trim()
    const userPosition = Number(body.userPosition)
    const botPosition = Number(body.botPosition ?? body.userPosition)
    const stake = String(body.stake ?? "").trim()
    const heading = String(body.heading ?? "").trim()
    const headingAccent = String(body.headingAccent ?? "").trim()

    if (!left || !right || Number.isNaN(userPosition)) {
      return Response.json({ error: "Invalid clash meaning request." }, { status: 400 })
    }

    const meaning = await generateClashMeaning({
      left,
      right,
      userPosition: Math.min(1, Math.max(0, userPosition)),
      botPosition: Math.min(1, Math.max(0, botPosition)),
      stake,
      heading,
      headingAccent,
    })

    return Response.json({ meaning })
  } catch (err) {
    console.error("[/api/v1/clash-meaning] Error:", err)
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}

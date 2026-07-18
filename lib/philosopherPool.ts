//
// Curated philosopher / thinker pool for clash elaborations.
// The model picks 2–3 lenses per clash from a sampled shortlist.
//

export type Tradition =
  | "western"
  | "eastern"
  | "middle_eastern_islamic"
  | "african_indigenous"

export type Period =
  | "ancient"
  | "medieval"
  | "renaissance"
  | "modern"
  | "contemporary"

/** Value-tension affinities used to match lenses to clash types. */
export type TensionTag =
  | "duty"
  | "authenticity"
  | "utility"
  | "care"
  | "justice"
  | "balance"
  | "freedom"
  | "community"
  | "virtue"
  | "meaning"
  | "power"
  | "impermanence"

export type PhilosopherEntry = {
  name: string
  tradition: Tradition
  period: Period
  tensions: TensionTag[]
  /** One-line hint so the model can write accurate doctrine briefly. */
  hint: string
}

export const PHILOSOPHER_POOL: PhilosopherEntry[] = [
  // ——— Western · ancient ———
  {
    name: "Aristotle",
    tradition: "western",
    period: "ancient",
    tensions: ["virtue", "balance", "duty"],
    hint: "Virtue as a mean between extremes; practical wisdom (phronesis).",
  },
  {
    name: "Epictetus",
    tradition: "western",
    period: "ancient",
    tensions: ["freedom", "duty", "authenticity"],
    hint: "Stoic focus on what is up to us vs. what is not.",
  },
  {
    name: "Plato",
    tradition: "western",
    period: "ancient",
    tensions: ["justice", "virtue", "meaning"],
    hint: "Justice as harmony of parts; the examined life.",
  },
  // ——— Western · medieval ———
  {
    name: "Thomas Aquinas",
    tradition: "western",
    period: "medieval",
    tensions: ["duty", "virtue", "justice"],
    hint: "Natural law; ordered goods; conscience and practical reason.",
  },
  {
    name: "Hildegard of Bingen",
    tradition: "western",
    period: "medieval",
    tensions: ["care", "balance", "meaning"],
    hint: "Viriditas (greening life-force); holistic care of body and soul.",
  },
  // ——— Western · renaissance ———
  {
    name: "Michel de Montaigne",
    tradition: "western",
    period: "renaissance",
    tensions: ["authenticity", "balance", "freedom"],
    hint: "Essays, self-scrutiny, and living with uncertainty without dogma.",
  },
  {
    name: "Niccolò Machiavelli",
    tradition: "western",
    period: "renaissance",
    tensions: ["power", "duty", "virtue"],
    hint: "Virtù and fortuna; what power requires vs. what virtue praises.",
  },
  // ——— Western · modern ———
  {
    name: "Immanuel Kant",
    tradition: "western",
    period: "modern",
    tensions: ["duty", "justice", "freedom"],
    hint: "Duty and the categorical imperative; treat persons as ends.",
  },
  {
    name: "John Stuart Mill",
    tradition: "western",
    period: "modern",
    tensions: ["utility", "freedom", "justice"],
    hint: "Utilitarianism tempered by individuality and higher pleasures.",
  },
  {
    name: "Friedrich Nietzsche",
    tradition: "western",
    period: "modern",
    tensions: ["authenticity", "power", "virtue"],
    hint: "Self-overcoming; critique of herd morality; becoming who you are.",
  },
  {
    name: "Søren Kierkegaard",
    tradition: "western",
    period: "modern",
    tensions: ["authenticity", "meaning", "duty"],
    hint: "Leap of faith; anxiety of choice; the singular individual.",
  },
  {
    name: "Simone Weil",
    tradition: "western",
    period: "modern",
    tensions: ["care", "duty", "justice"],
    hint: "Attention as the rarest generosity; obligation to the afflicted.",
  },
  // ——— Western · contemporary ———
  {
    name: "Hannah Arendt",
    tradition: "western",
    period: "contemporary",
    tensions: ["freedom", "community", "power"],
    hint: "Action and plurality; the space between people where freedom appears.",
  },
  {
    name: "Martha Nussbaum",
    tradition: "western",
    period: "contemporary",
    tensions: ["care", "justice", "virtue"],
    hint: "Capabilities approach; emotions as intelligent responses to value.",
  },
  {
    name: "Bernard Williams",
    tradition: "western",
    period: "contemporary",
    tensions: ["authenticity", "duty", "meaning"],
    hint: "Moral luck; integrity; resistance to one-system moral theory.",
  },
  {
    name: "Judith Butler",
    tradition: "western",
    period: "contemporary",
    tensions: ["authenticity", "power", "community"],
    hint: "Performativity of identity; vulnerability and interdependence.",
  },
  // ——— Eastern · ancient ———
  {
    name: "Confucius",
    tradition: "eastern",
    period: "ancient",
    tensions: ["duty", "community", "virtue"],
    hint: "Ren and li; role-sensitive obligation within relationships.",
  },
  {
    name: "Zhuangzi",
    tradition: "eastern",
    period: "ancient",
    tensions: ["freedom", "impermanence", "balance"],
    hint: "Wandering free; relativizing rigid distinctions; wu-wei.",
  },
  {
    name: "Laozi",
    tradition: "eastern",
    period: "ancient",
    tensions: ["balance", "impermanence", "freedom"],
    hint: "Daoist softness, non-forcing, and returning to the natural way.",
  },
  {
    name: "Nāgārjuna",
    tradition: "eastern",
    period: "ancient",
    tensions: ["impermanence", "balance", "meaning"],
    hint: "Emptiness (śūnyatā); clinging to fixed sides fuels suffering.",
  },
  {
    name: "Buddha (Siddhartha Gautama)",
    tradition: "eastern",
    period: "ancient",
    tensions: ["impermanence", "care", "meaning"],
    hint: "Four Noble Truths; craving and aversion as roots of dukkha.",
  },
  // ——— Eastern · medieval ———
  {
    name: "Dōgen",
    tradition: "eastern",
    period: "medieval",
    tensions: ["impermanence", "authenticity", "meaning"],
    hint: "Zen practice-enlightenment; being-time; ordinary mind.",
  },
  {
    name: "Zhu Xi",
    tradition: "eastern",
    period: "medieval",
    tensions: ["duty", "virtue", "community"],
    hint: "Neo-Confucian principle (li) and self-cultivation.",
  },
  // ——— Eastern · modern / contemporary ———
  {
    name: "Nishida Kitarō",
    tradition: "eastern",
    period: "modern",
    tensions: ["authenticity", "balance", "meaning"],
    hint: "Absolute nothingness; self in the place of contradiction.",
  },
  {
    name: "Thích Nhất Hạnh",
    tradition: "eastern",
    period: "contemporary",
    tensions: ["care", "impermanence", "community"],
    hint: "Interbeing; mindful presence in ordinary action.",
  },
  // ——— Middle Eastern & Islamic ———
  {
    name: "Ibn Sina (Avicenna)",
    tradition: "middle_eastern_islamic",
    period: "medieval",
    tensions: ["virtue", "meaning", "balance"],
    hint: "Rational soul; happiness through intellectual perfection.",
  },
  {
    name: "Al-Ghazālī",
    tradition: "middle_eastern_islamic",
    period: "medieval",
    tensions: ["duty", "meaning", "authenticity"],
    hint: "Crisis of certainty; sincerity (ikhlāṣ); balancing reason and faith.",
  },
  {
    name: "Ibn Rushd (Averroes)",
    tradition: "middle_eastern_islamic",
    period: "medieval",
    tensions: ["justice", "virtue", "freedom"],
    hint: "Harmony of philosophy and revelation; demonstrative reason.",
  },
  {
    name: "Ibn Arabi",
    tradition: "middle_eastern_islamic",
    period: "medieval",
    tensions: ["meaning", "balance", "authenticity"],
    hint: "Unity of being; the heart as a polished mirror for the Real.",
  },
  {
    name: "Maimonides",
    tradition: "middle_eastern_islamic",
    period: "medieval",
    tensions: ["duty", "virtue", "balance"],
    hint: "Guide for the Perplexed; the golden mean; intellectual worship.",
  },
  {
    name: "Fatema Mernissi",
    tradition: "middle_eastern_islamic",
    period: "contemporary",
    tensions: ["freedom", "justice", "community"],
    hint: "Critique of gender power; reclaiming egalitarian readings of tradition.",
  },
  // ——— African & indigenous ———
  {
    name: "Kwame Gyekye",
    tradition: "african_indigenous",
    period: "contemporary",
    tensions: ["community", "freedom", "duty"],
    hint: "Moderate communitarianism; personhood through community without erasing individuality.",
  },
  {
    name: "Ubuntu (Nguni proverb tradition)",
    tradition: "african_indigenous",
    period: "contemporary",
    tensions: ["community", "care", "justice"],
    hint: "A person is a person through other persons; relational dignity.",
  },
  {
    name: "Sophie Oluwole",
    tradition: "african_indigenous",
    period: "contemporary",
    tensions: ["community", "virtue", "authenticity"],
    hint: "Yorùbá oral philosophy; binary complementarity rather than either/or.",
  },
  {
    name: "Vine Deloria Jr.",
    tradition: "african_indigenous",
    period: "contemporary",
    tensions: ["community", "meaning", "power"],
    hint: "Indigenous metaphysics of place, kinship, and responsibility to land.",
  },
  {
    name: "Robin Wall Kimmerer",
    tradition: "african_indigenous",
    period: "contemporary",
    tensions: ["care", "community", "duty"],
    hint: "Reciprocity with the living world; gifts and gratitude as ethics.",
  },
]

const TRADITIONS: Tradition[] = [
  "western",
  "eastern",
  "middle_eastern_islamic",
  "african_indigenous",
]

const PERIODS: Period[] = [
  "ancient",
  "medieval",
  "renaissance",
  "modern",
  "contemporary",
]

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Names already used in this session's clash elaborations. */
export function usedPerspectiveNamesFromArtifacts(
  clashScales: { elaboration?: { perspectives?: { name: string }[] } | null; perspectiveNames?: string[] }[]
): string[] {
  const names = new Set<string>()
  for (const scale of clashScales) {
    for (const p of scale.elaboration?.perspectives ?? []) {
      if (p.name) names.add(p.name)
    }
    for (const n of scale.perspectiveNames ?? []) {
      if (n) names.add(n)
    }
  }
  return [...names]
}

/**
 * Stratified sample: cover traditions + periods when possible, then fill randomly.
 * Excludes names already used in the session.
 */
export function samplePhilosopherCandidates(options?: {
  excludeNames?: string[]
  count?: number
}): PhilosopherEntry[] {
  const count = options?.count ?? 12
  const excluded = new Set(
    (options?.excludeNames ?? []).map(normalizeName)
  )

  const available = PHILOSOPHER_POOL.filter(
    (p) => !excluded.has(normalizeName(p.name))
  )
  if (available.length <= count) return shuffle(available)

  const picked: PhilosopherEntry[] = []
  const pickedNames = new Set<string>()

  const take = (entry: PhilosopherEntry | undefined) => {
    if (!entry) return
    const key = normalizeName(entry.name)
    if (pickedNames.has(key)) return
    pickedNames.add(key)
    picked.push(entry)
  }

  // One from each tradition first (when available).
  for (const tradition of shuffle(TRADITIONS)) {
    if (picked.length >= count) break
    const pool = shuffle(available.filter((p) => p.tradition === tradition))
    take(pool[0])
  }

  // Then one from each period still missing.
  const periodsPresent = new Set(picked.map((p) => p.period))
  for (const period of shuffle(PERIODS)) {
    if (picked.length >= count) break
    if (periodsPresent.has(period)) continue
    const pool = shuffle(
      available.filter(
        (p) => p.period === period && !pickedNames.has(normalizeName(p.name))
      )
    )
    const entry = pool[0]
    if (entry) {
      take(entry)
      periodsPresent.add(period)
    }
  }

  // Fill remaining from the rest.
  const remainder = shuffle(
    available.filter((p) => !pickedNames.has(normalizeName(p.name)))
  )
  for (const entry of remainder) {
    if (picked.length >= count) break
    take(entry)
  }

  return shuffle(picked)
}

export function formatPhilosopherCandidatesForPrompt(
  candidates: PhilosopherEntry[]
): string {
  if (!candidates.length) return "(pool exhausted — invent carefully diverse named thinkers)"

  return candidates
    .map(
      (p) =>
        `- ${p.name} [${formatTradition(p.tradition)}, ${p.period}] — tensions: ${p.tensions.join(", ")}. ${p.hint}`
    )
    .join("\n")
}

function formatTradition(tradition: Tradition): string {
  switch (tradition) {
    case "western":
      return "Western"
    case "eastern":
      return "Eastern"
    case "middle_eastern_islamic":
      return "Middle Eastern & Islamic"
    case "african_indigenous":
      return "African & indigenous"
  }
}

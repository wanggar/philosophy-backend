const APOSTROPHE_VARIANTS = ["\u2019", "\u2018", "`", "\u00B4"]

const CONTRACTION_FIXES: [RegExp, string][] = [
  [/\bdont\b/gi, "don't"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bisnt\b/gi, "isn't"],
  [/\barent\b/gi, "aren't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\bwerent\b/gi, "weren't"],
  [/\bhasnt\b/gi, "hasn't"],
  [/\bhavent\b/gi, "haven't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bshouldnt\b/gi, "shouldn't"],
  [/\bcouldnt\b/gi, "couldn't"],
  [/\bwouldnt\b/gi, "wouldn't"],
  [/\byoull\b/gi, "you'll"],
  [/\btheyll\b/gi, "they'll"],
  [/\byoure\b/gi, "you're"],
  [/\btheyre\b/gi, "they're"],
  [/\byouve\b/gi, "you've"],
  [/\bweve\b/gi, "we've"],
  [/\btheyve\b/gi, "they've"],
  [/\byoud\b/gi, "you'd"],
  [/\btheyd\b/gi, "they'd"],
  [/\bim\b/gi, "I'm"],
  [/\bive\b/gi, "I've"],
  [/\bits\b/gi, "it's"],
  [/\bthats\b/gi, "that's"],
  [/\bwhats\b/gi, "what's"],
  [/\bwhos\b/gi, "who's"],
  [/\bheres\b/gi, "here's"],
  [/\btheres\b/gi, "there's"],
  [/\bwheres\b/gi, "where's"],
  [/\bhows\b/gi, "how's"],
]

const ILL_CONTRACTION = new RegExp(
  String.raw`\bIll(?=\s+(?:go|be|try|think|say|let|need|want|have|get|make|do|see|come|take|keep|give|look|use|find|tell|ask|work|seem|feel|leave|call|start|stop|wait|show|put|mean|help|talk|walk|run|stay|move|pay|meet|include|continue|set|learn|change|lead|watch|follow|create|read|allow|add|spend|grow|open|win|offer|remember|consider|appear|buy|serve|send|expect|build|fall|cut|reach|pick|raise|break|hold|turn|bring|write|provide|sit|stand|lose|join|choose|decide|forget|check|explain|finish|handle|note|share|save|grab|edit|update|revisit|rethink|hold|gather|quietly|keep|surface|map|surface)\b)`,
  "gi"
)

// Common merges when the model drops a space between two short words.
const MERGED_WORD_FIXES: [RegExp, string][] = [
  [/\balreadylike\b/gi, "already like"],
  [/\balreadyjust\b/gi, "already just"],
  [/\balreadyfeel\b/gi, "already feel"],
  [/\bjustabout\b/gi, "just about"],
  [/\bjustlike\b/gi, "just like"],
  [/\bfeelslike\b/gi, "feels like"],
  [/\bfeelsreal\b/gi, "feels real"],
  [/\bthisisnt\b/gi, "this isn't"],
  [/\bthatisnt\b/gi, "that isn't"],
  [/\bthereisnt\b/gi, "there isn't"],
  [/\bwhatis\b/gi, "what is"],
  [/\bbytheway\b/gi, "by the way"],
  [
    /\b(already|just|still|really|maybe|almost|even)(like|about|this|that|when|if|but|and|so|as|to|in|on|at|for|the|what|how|where|who|feel|feels|seem|seems|know|think)\b/gi,
    "$1 $2",
  ],
]

function applyRegexFixes(text: string, fixes: [RegExp, string][]): string {
  let result = text
  for (const [pattern, replacement] of fixes) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/** Normalize LLM prose: apostrophes, contractions, and common missing spaces. */
export function normalizeAiMessage(text: string): string {
  let result = text
  for (const variant of APOSTROPHE_VARIANTS) {
    result = result.replaceAll(variant, "'")
  }

  result = applyRegexFixes(result, MERGED_WORD_FIXES)
  result = applyRegexFixes(result, CONTRACTION_FIXES)
  result = result.replace(ILL_CONTRACTION, "I'll")

  return result
}

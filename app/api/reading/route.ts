import { NextResponse } from "next/server";

const FALLBACK_READING =
  "restless in the way that precedes discovery — curious enough to sit with questions others rush past. there is a magnetism here that doesn't perform, it simply arrives.";

const anthropicText = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const maybeText = (item as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join(" ")
    .trim();

  return text.length > 0 ? text : null;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const body = (await request.json().catch(() => ({}))) as { vibeWords?: unknown };
    const vibeWords = Array.isArray(body.vibeWords)
      ? body.vibeWords.filter((word): word is string => typeof word === "string")
      : [];

    if (!apiKey || vibeWords.length === 0) {
      return NextResponse.json({ reading: FALLBACK_READING });
    }

    const prompt = `you are cléo xóchil, an intimate cultural concierge writing a private profile reading for a member before a dinner.

the member selected these energy words: ${vibeWords.join(", ")}.

write one concise, poetic reading in cléo's voice.
rules:
- 1-2 sentences only
- lowercase only
- no greeting
- no list
- no astrology clichés
- no therapy language
- no explanation
- write as if you can see the shape of their energy, not as if you are analyzing survey data`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(2500),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
        max_tokens: 120,
        temperature: 0.8,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ reading: FALLBACK_READING });
    }

    const reading = anthropicText(await response.json()) ?? FALLBACK_READING;
    return NextResponse.json({ reading: reading.toLowerCase() });
  } catch {
    return NextResponse.json({ reading: FALLBACK_READING });
  }
}

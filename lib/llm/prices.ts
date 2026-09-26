/** US dollars per million tokens, from the provider price lists (September 2026). */
type Price = { input: number; output: number }

const PRICES: Array<{ match: RegExp; price: Price }> = [
  { match: /^gpt-6-astra/, price: { input: 10, output: 50 } },
  { match: /^gpt-6-sol/, price: { input: 2, output: 10 } },
  { match: /^gpt-6-luna/, price: { input: 0.1, output: 0.5 } },
  { match: /^gpt-5\.6-terra/, price: { input: 2, output: 12 } },
  { match: /^gpt-5\.6-luna/, price: { input: 0.2, output: 1.2 } },
  { match: /^gpt-5\.6/, price: { input: 4, output: 20 } },
  { match: /^gpt-5\.5/, price: { input: 5, output: 30 } },
  { match: /^gpt-5\.4-mini/, price: { input: 0.75, output: 4.5 } },
  { match: /^gpt-5\.4/, price: { input: 2.5, output: 15 } },
  { match: /^gpt-5-mini/, price: { input: 0.25, output: 2 } },
  { match: /^gpt-5/, price: { input: 1.25, output: 10 } },
  { match: /^gpt-4\.1-mini/, price: { input: 0.4, output: 1.6 } },
  { match: /^gpt-4\.1/, price: { input: 2, output: 8 } },
  { match: /^gpt-4o-mini-tts/, price: { input: 0.6, output: 12 } },
  { match: /^gpt-4o-mini/, price: { input: 0.15, output: 0.6 } },
  { match: /^gpt-4o/, price: { input: 2.5, output: 10 } },
  { match: /^o4-mini/, price: { input: 1.1, output: 4.4 } },
  { match: /^o3-mini/, price: { input: 1.1, output: 4.4 } },
  /** Realtime voice, priced as audio. */
  { match: /^gpt-realtime.*mini/, price: { input: 10, output: 20 } },
  { match: /^gpt-realtime/, price: { input: 32, output: 64 } },
  { match: /^claude-.*opus/, price: { input: 15, output: 75 } },
  { match: /^claude-.*sonnet/, price: { input: 3, output: 15 } },
  { match: /^claude-.*haiku/, price: { input: 0.8, output: 4 } },
]

export function priceFor(model: string): Price | null {
  const id = model.toLowerCase().replace(/^[a-z-]+\//, "")
  return PRICES.find((entry) => entry.match.test(id))?.price ?? null
}

/** Cost in US dollars, or null when the model has no known price. */
export function tokenCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model)
  if (!price) return null
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

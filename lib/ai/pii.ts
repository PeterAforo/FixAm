/**
 * PII minimisation before text leaves FixAm for an AI provider.
 * Phone numbers, e-mails, Ghana Card numbers and number plates are replaced
 * with placeholders; vehicle make/model/year and symptoms stay.
 */

const RULES: { re: RegExp; tag: string }[] = [
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, tag: "[email]" },
  { re: /\bGHA-?\d{9}-?\d\b/gi, tag: "[id]" },
  // +233 / 233 / 0 followed by 9 digits, spaces or dashes allowed
  { re: /(?:\+?233|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, tag: "[phone]" },
  // Ghana plates: GR 1234-22, AS-4521-X, GT 22 RS
  { re: /\b[A-Z]{1,3}[\s-]?\d{1,4}[\s-]?(?:\d{2}|[A-Z])\b/g, tag: "[plate]" },
]

export function minimisePii(text: string): string {
  let out = text
  for (const { re, tag } of RULES) out = out.replace(re, tag)
  return out
}

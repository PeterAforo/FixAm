import type { SpeechLanguage, SpeechProvider } from "../ai/types"

/** Mock speech — fixed phrases so the voice-note flow works without keys. */
const SAMPLE: Record<SpeechLanguage, { native: string; english: string }> = {
  tw: { native: "Me kaa no bɛ nnyɛ adwuma, ɛyɛ dede bere a merebrɛ breki no.", english: "My car is not working well, it makes noise when I brake." },
  gaa: { native: "Mi lɔle lɛ feɔ gbɛ̃ kɛ mibaa breki lɛ.", english: "My car makes noise when I press the brake." },
  ee: { native: "Nye ʋua ɖea ɣli ne meɖo afɔ breki dzi.", english: "My car makes noise when I step on the brake." },
  ha: { native: "Motata tana yin kara idan na taka birki.", english: "My car makes noise when I press the brake." },
  en: { native: "My car makes noise when I brake.", english: "My car makes noise when I brake." },
}

export function createMockSpeechProvider(): SpeechProvider {
  return {
    name: "mock",
    async transcribe({ audio, language }) {
      return { text: SAMPLE[language].native, language, audioSeconds: Math.max(1, Math.round(audio.byteLength / 32000)) }
    },
    async translate({ text, from, to }) {
      if (from === to) return text
      if (to === "en") return SAMPLE[from].native === text ? SAMPLE[from].english : `[${from}→en] ${text}`
      return `[en→${to}] ${text}`
    },
    costMicroUsd() {
      return 0n
    },
  }
}

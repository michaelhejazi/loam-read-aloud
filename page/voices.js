// Google Chirp 3 HD's voice genders, shared by the Gemini TTS voice names.
// https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd (2026-11-15)
export const FEMALE_VOICES = new Set(['Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr'])
export const voiceGender = voice => FEMALE_VOICES.has(voice) ? 'Female' : 'Male'
export const voiceLabel = voice => `${voice} · ${voiceGender(voice)}`

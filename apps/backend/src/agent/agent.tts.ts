import { env } from '../config/env.js';

/**
 * Calls the ElevenLabs API to generate TTS audio for the given text.
 * Returns the audio as a base64 string.
 */
export async function generateTTS(text: string): Promise<string | null> {
  if (!env.ELEVENLABS_API_KEY) {
    console.warn('ELEVENLABS_API_KEY is not set. Skipping TTS generation.');
    return null;
  }

  const voiceId = env.ELEVENLABS_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: env.ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.38,
          similarity_boost: 0.8,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Failed to generate TTS:', error);
    return null;
  }
}

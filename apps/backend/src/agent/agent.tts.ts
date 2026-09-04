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

  // Voice ID for "Rachel" - a calm, professional female voice.
  // Can be swapped for any other voice ID from ElevenLabs.
  const voiceId = '21m00Tcm4TlvDq8ikWAM'; 
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
        model_id: 'eleven_multilingual_v2', // good for general conversational tones
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
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

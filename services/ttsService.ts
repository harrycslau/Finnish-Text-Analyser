import { Voice } from '../types';

// Hardcoded list of Finnish voices from Google Cloud TTS
export const finnishVoices: Voice[] = [
    { name: 'fi-FI-Standard-A', ssmlGender: 'FEMALE', languageCode: 'fi-FI' },
    { name: 'fi-FI-Wavenet-A', ssmlGender: 'FEMALE', languageCode: 'fi-FI' },
];

export const synthesizeSpeech = async (
  text: string, 
  voiceName: string, 
  speakingRate: number,
  apiKey: string
): Promise<string> => {
  const TTS_API_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  const voice = finnishVoices.find(v => v.name === voiceName);
  if (!voice) {
      throw new Error("Invalid voice name");
  }

  const body = {
    input: { text },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: speakingRate,
    },
  };

  try {
    const response = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Google Cloud TTS API error:", errorData);
        // Provide a clearer error message to the user.
        const message = errorData?.error?.message || `API request failed with status ${response.status}`;
        throw new Error(message);
    }

    const data = await response.json();
    if (data.audioContent) {
      return data.audioContent; // This is a base64 string
    } else {
      throw new Error("No audio content in response");
    }
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    throw error;
  }
};

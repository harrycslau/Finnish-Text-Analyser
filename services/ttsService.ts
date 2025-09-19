
import { GoogleGenAI, Modality } from "@google/genai";
import { SynthesizedSpeech } from "../types";

// Ensure the API key is available from environment variables
if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- WAV Conversion Helpers ---

/**
 * Decodes a base64 string into a Uint8Array.
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

/**
 * Encodes a Uint8Array into a base64 string.
 */
const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

/**
 * Parses audio parameters from a raw audio MIME type string.
 * e.g., "audio/L16;rate=24000"
 */
const parseAudioMimeType = (mimeType: string): { bitsPerSample: number; rate: number } => {
    // Defaults from Gemini documentation/examples
    let bitsPerSample = 16;
    let rate = 24000;

    const rateMatch = /rate=(\d+)/.exec(mimeType);
    if (rateMatch) {
        rate = parseInt(rateMatch[1], 10);
    }

    const bitsMatch = /audio\/L(\d+)/.exec(mimeType);
    if (bitsMatch) {
        bitsPerSample = parseInt(bitsMatch[1], 10);
    }

    return { bitsPerSample, rate };
};

/**
 * Creates a WAV file buffer from raw PCM data by prepending a WAV header.
 */
const createWavFile = (pcmData: Uint8Array, sampleRate: number, bitsPerSample: number): Uint8Array => {
    const numChannels = 1;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length;
    const chunkSize = 36 + dataSize;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, chunkSize, true); // true for little-endian
    writeString(8, 'WAVE');

    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size for PCM
    view.setUint16(20, 1, true); // AudioFormat 1 for PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data after the header
    const dataBytes = new Uint8Array(buffer, 44);
    dataBytes.set(pcmData);

    return new Uint8Array(buffer);
};


export const synthesizeSpeech = async (
  text: string
): Promise<SynthesizedSpeech> => {
  try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: text,
        config: {
            responseModalities: [Modality.AUDIO],
        },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
        const { data, mimeType } = part.inlineData;

        // Gemini TTS can return raw PCM audio (e.g., audio/L16;rate=24000).
        // Browsers can't play this directly. We need to wrap it in a WAV container.
        if (mimeType.startsWith('audio/L')) {
            const { bitsPerSample, rate } = parseAudioMimeType(mimeType);
            const pcmData = base64ToUint8Array(data);
            const wavData = createWavFile(pcmData, rate, bitsPerSample);
            const wavBase64 = uint8ArrayToBase64(wavData);

            return {
                data: wavBase64,
                mimeType: 'audio/wav',
            };
        } else {
            // If it's already in a standard format (e.g., mp3, ogg), pass it through.
            return { data, mimeType };
        }
      }
    }
    
    throw new Error("No audio content found in Gemini TTS response.");

  } catch (error) {
    console.error("Error synthesizing speech with Gemini:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new Error(`Gemini TTS failed: ${message}`);
  }
};

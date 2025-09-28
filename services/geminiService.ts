
import { GoogleGenAI, Type } from "@google/genai";

// Ensure the API key is available from environment variables
if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Translates a single Finnish word to English using the Gemini API.
 * @param word The Finnish word to translate.
 * @returns A promise that resolves to the English translation.
 */
export const translateWord = async (word: string): Promise<string> => {
  // Remove common punctuation from the end of the word for better translation results.
  const cleanedWord = word.replace(/[.,!?;:)"'”\]`]*$/, '');

  if (!cleanedWord) {
    return word; // Return original if it's only punctuation
  }
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Translate the following Finnish word to English: "${cleanedWord}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: {
              type: Type.STRING,
              description: "The English translation of the word.",
            },
          },
        },
      },
    });

    // FIX: The model may wrap the JSON response in markdown backticks or return an empty string.
    // This makes parsing more robust by extracting JSON from a markdown code block if present
    // and handling empty responses before attempting to parse.
    let jsonString = response.text.trim();
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(jsonString);
    if (match) {
      jsonString = match[1];
    }

    if (!jsonString) {
      return "Translation not found.";
    }
    
    const result = JSON.parse(jsonString);
    
    return result.translation || "Translation not found.";

  } catch (error) {
    console.error("Error translating word:", error);
    return "Translation failed.";
  }
};

/**
 * A type for the structured translation response from the batch translation API.
 */
type BatchTranslation = {
  finnish: string;
  english: string;
};

/**
 * Translates a batch of Finnish words to English in a single API call.
 * @param words The array of Finnish words to translate.
 * @returns A promise that resolves to a Map of Finnish words to their English translations.
 */
export const translateWordsBatch = async (words: string[]): Promise<Map<string, string>> => {
  if (words.length === 0) {
    return new Map();
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Translate the following list of Finnish words to English: ${JSON.stringify(words)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translations: {
              type: Type.ARRAY,
              description: "An array of translation objects.",
              items: {
                type: Type.OBJECT,
                properties: {
                  finnish: {
                    type: Type.STRING,
                    description: "The original Finnish word.",
                  },
                  english: {
                    type: Type.STRING,
                    description: "The English translation.",
                  },
                },
                required: ['finnish', 'english'],
              },
            },
          },
        },
      },
    });

    let jsonString = response.text.trim();
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(jsonString);
    if (match) {
      jsonString = match[1];
    }

    if (!jsonString) {
      console.warn("Batch translation returned an empty response.");
      return new Map();
    }

    const result: { translations: BatchTranslation[] } = JSON.parse(jsonString);
    const translationMap = new Map<string, string>();
    
    if (result.translations) {
      for (const item of result.translations) {
        // Normalize to lowercase for consistent cache lookups
        translationMap.set(item.finnish.toLowerCase(), item.english);
      }
    }
    
    return translationMap;

  } catch (error) {
    console.error("Error in batch translating words:", error);
    // Return an empty map on failure so the app can continue and use the fallback mechanism.
    return new Map();
  }
};

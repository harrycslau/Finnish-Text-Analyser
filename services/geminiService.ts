
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
          required: ["translation"],
        },
      },
    });

    // The response text should be a JSON string, but trim it just in case.
    const jsonString = response.text.trim();
    const result = JSON.parse(jsonString);
    
    return result.translation || "Translation not found.";

  } catch (error) {
    console.error("Error translating word:", error);
    return "Translation failed.";
  }
};

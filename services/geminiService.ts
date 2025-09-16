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
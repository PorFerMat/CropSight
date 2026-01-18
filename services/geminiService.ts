import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResponse } from "../types";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'DUMMY_KEY_FOR_BUILD' });

/**
 * Analyzes a plant image using gemini-3-pro-preview with Thinking capabilities.
 */
export const analyzePlantImage = async (
  imageBase64: string,
  cropType: string,
  growthStage: string,
  userNotes: string
): Promise<AIAnalysisResponse> => {
  try {
    const prompt = `
      Analyze this plant image.
      Context: Crop is ${cropType}, Growth Stage is ${growthStage}.
      User Notes: "${userNotes}".
      
      Identify the disease, pest, or deficiency. 
      Provide a diagnosis, a confidence score (0-100), a list of treatment steps, and prevention tips.
      Return the response in JSON format.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 32768 }, // Max thinking for deep diagnosis
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnosis: { type: Type.STRING },
            confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 100" },
            treatment: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Step by step treatment plan"
            },
            prevention: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Future prevention tips"
            }
          },
          required: ["diagnosis", "confidence", "treatment", "prevention"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AIAnalysisResponse;

  } catch (error) {
    console.error("Analysis Error:", error);
    throw new Error("Failed to analyze image. Please try again.");
  }
};

/**
 * Transcribes audio using gemini-3-flash-preview.
 */
export const transcribeAudio = async (audioBase64: string, mimeType: string = 'audio/wav'): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64,
            },
          },
          { text: "Transcribe this audio description of a plant problem exactly as spoken." },
        ],
      },
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription Error:", error);
    return "Error transcribing audio.";
  }
};

/**
 * Generates speech from text using gemini-2.5-flash-preview-tts.
 */
export const generateSpeech = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: {
        parts: [{ text: text }],
      },
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/**
 * Gets a quick agronomy tip using gemini-2.5-flash-lite-latest (Fast Model).
 */
export const getQuickTip = async (): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: "Give me one short, interesting, and useful farming tip for a general audience. Keep it under 20 words.",
    });
    return response.text || "Keep your soil healthy!";
  } catch (error) {
    return "Check your crops daily for early signs of disease.";
  }
};

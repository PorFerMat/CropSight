import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResponse, AnalysisMode, IoTData } from "../types";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

// Global instance for standard calls (fallback)
const ai = new GoogleGenAI({ apiKey: apiKey || 'DUMMY_KEY_FOR_BUILD' });

/**
 * Analyzes a plant image using gemini-3-pro-preview with Thinking capabilities and Google Search Grounding.
 */
export const analyzePlantImage = async (
  imageBase64: string,
  cropType: string,
  growthStage: string,
  userNotes: string,
  mode: AnalysisMode = 'DIAGNOSIS',
  iotData?: IoTData
): Promise<AIAnalysisResponse & { sources?: { title: string; uri: string }[] }> => {
  try {
    let prompt = "";

    if (mode === 'IDENTIFICATION') {
      prompt = `
        Act as an expert botanist. Identify the plant species in this image.
        User Notes: "${userNotes}".
        
        Task:
        1. Use Google Search to compare the visual features (leaves, flowers, bark) with known plant species.
        2. Provide the Common Name (and Scientific Name in parentheses) as the 'diagnosis'.
        3. Provide a confidence score (0-100). Be conservative.
        4. In 'treatment', list 3-4 distinct physical characteristics visible in the image that confirm this ID.
        5. In 'prevention', list 3-4 ideal growing conditions (light, water, soil) for this species.
        
        Return the response in JSON format without Markdown formatting.
      `;
    } else {
      // Construct IoT Context string if data exists
      const iotContext = iotData ? `
        Real-time IoT Sensor Data from Field:
        - Temperature: ${iotData.temperature}°C
        - Humidity: ${iotData.humidity}%
        - Soil Moisture: ${iotData.soilMoisture}%
        
        CRITICAL INSTRUCTION: Use this environmental data to support or refute your diagnosis. 
        (e.g., High humidity (>80%) favors fungal diseases like Blight or Downy Mildew. High temperature and low moisture might indicate heat stress or mites).
      ` : "No IoT sensor data available.";

      prompt = `
        Act as an expert agronomist. Analyze this plant image carefully for health issues.
        
        Context provided by farmer:
        - Crop Type: ${cropType}
        - Growth Stage: ${growthStage}
        - User Observations: "${userNotes}"
        ${iotContext}

        Instructions:
        1. **Search & Compare**: Use Google Search to find images and descriptions of diseases, pests, or deficiencies that match the *specific* visual symptoms in the image (e.g., "yellow halo spots on tomato leaves").
        2. **Verify**: Compare the uploaded image against the search results. If the symptoms match a specific disease found online, use that diagnosis.
        3. **Fallback**: If search yields no strong matches, analyze based on your internal knowledge of plant pathology.
        4. **Check for Health**: If the plant looks healthy, diagnose as "Healthy Plant".
        5. **Avoid Bias**: Do not default to "Early Blight" unless the visual evidence (e.g., concentric rings) matches online references for Early Blight.
        6. **Confidence Scoring**: Be conservative. Do not assign 100% confidence unless you find overwhelming consensus across many sources (more than 10 distinct sites). If evidence is limited, keep confidence below 90%.

        Response Requirements:
        - Diagnosis: The name of the issue or "Healthy Plant".
        - Confidence: 0-100 score.
        - Treatment: Step-by-step organic and chemical controls.
        - Prevention: Future best practices.
        - Do not include citation markers (like [1]) in the JSON strings.

        Return the response in JSON format without Markdown formatting.
      `;
    }

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
        tools: [{ googleSearch: {} }], // Enable Google Search Grounding
        thinkingConfig: { thinkingBudget: 16384 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnosis: { type: Type.STRING },
            confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 100" },
            treatment: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: mode === 'IDENTIFICATION' ? "Key characteristics" : "Step by step treatment plan"
            },
            prevention: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: mode === 'IDENTIFICATION' ? "Growing conditions" : "Future prevention tips"
            }
          },
          required: ["diagnosis", "confidence", "treatment", "prevention"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    // Extract sources from grounding metadata
    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({
            title: chunk.web.title,
            uri: chunk.web.uri
          });
        }
      });
    }

    // Filter duplicates based on URI
    const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

    const result = JSON.parse(text) as AIAnalysisResponse;

    // Enforce confidence cap if fewer than 10 sources are found
    if (uniqueSources.length <= 10) {
      if (result.confidence >= 100) {
        result.confidence = 98; // Cap below 100%
      }
    }
    
    return {
      ...result,
      sources: uniqueSources.slice(0, 3) // Return top 3 unique sources
    };

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

/**
 * Generates a demo video of the app using Veo 3.1
 */
export const generateAppDemoVideo = async (): Promise<string> => {
  // IMPORTANT: Create a new instance to ensure we use the latest API key from selection
  const veoAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    console.log("Starting video generation...");
    let operation = await veoAi.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: 'A cinematic commercial shot of a farmer in a sunny corn field holding a modern smartphone. The phone screen displays the CropSight app interface with a green checkmark and "Healthy Plant" text. High quality, photorealistic, 4k, soft lighting.',
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    console.log("Video operation started:", operation);

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      operation = await veoAi.operations.getVideosOperation({ operation: operation });
      console.log("Polling video status...");
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error("Video generation completed but no URI returned.");
    
    return uri;
  } catch (error) {
    console.error("Video Generation Error:", error);
    throw error;
  }
};
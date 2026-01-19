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
 * Analyzes plant images using gemini-3-pro-preview with Thinking capabilities and Google Search Grounding.
 */
export const analyzePlantImage = async (
  imagesBase64: string[],
  cropType: string,
  growthStage: string,
  userNotes: string,
  mode: AnalysisMode = 'DIAGNOSIS',
  iotData?: IoTData
): Promise<AIAnalysisResponse & { sources?: { title: string; uri: string }[] }> => {
  try {
    let prompt = "";
    
    // Common instructions for robust source verification
    const verificationInstructions = `
      VERIFICATION RULES (CRITICAL):
      1. **Source Quality**: You MUST prioritize information from University Agricultural Extensions (.edu), Government Agricultural Departments (.gov), and established botanical organizations (.org).
      2. **Cross-Reference**: Do not confirm a diagnosis unless visual symptoms match descriptions from AT LEAST 4 distinct, high-quality sources found via Google Search.
      3. **Visual Confirmation**: Compare the specific lesions, yellowing patterns, or bug morphology in the image against the images/descriptions found in your search. If they don't match, lower the confidence score.
    `;

    // New instruction for checking if the image originates from the web
    const sourceCheckInstructions = `
      PRIORITY CHECK: REVERSE IMAGE LOOKUP
      1. First, use Google Search to check if any of these exact images exist online.
      2. If you find the image on a website (e.g., a blog, article, or database):
         - Trust the information from that source for the Diagnosis/Identification.
         - Cite that specific website in the response logic.
         - Set confidence to 95-100%.
         - Set confidenceReason to "Exact image match found online".
      3. If the images are unique (not found online):
         - Proceed with standard visual analysis and symptom matching.
    `;

    if (mode === 'IDENTIFICATION') {
      prompt = `
        Act as a Senior Botanist.
        
        STEP 1: VALIDATION
        Do the provided images contain a plant, flower, fruit, vegetable, or crop? 
        - If NO (e.g., it's a person, car, building, or blurry non-plant object): Return diagnosis: "Not a Plant", confidence: 0, confidenceReason: "No plant detected", treatment: [], prevention: [].
        - If YES: Proceed.

        STEP 2: SOURCE CHECK & IDENTIFICATION
        ${sourceCheckInstructions}

        STEP 3: STANDARD ANALYSIS (If unique image)
        User Notes: "${userNotes}".
        
        1. Use Google Search to identify the species.
        2. ${verificationInstructions}
        3. Provide the Common Name (and Scientific Name) as the 'diagnosis'.
        4. In 'treatment', list 3 distinct physical characteristics visible in the photo that confirm this ID.
        5. In 'prevention', list 3 ideal growing conditions.
        
        Return JSON.
      `;
    } else {
      // Construct IoT Context string if data exists
      const iotContext = iotData ? `
        Real-time IoT Sensor Data:
        - Temp: ${iotData.temperature}°C
        - Humidity: ${iotData.humidity}%
        - Soil Moisture: ${iotData.soilMoisture}%
        (Use this to validate disease likelihood. E.g., Fungal diseases thrive in high humidity).
      ` : "No IoT sensor data available.";

      prompt = `
        Act as a Senior Plant Pathologist.
        
        STEP 1: VALIDATION (CRITICAL)
        Analyze the provided images. Do they contain a plant, leaf, crop, fruit, or soil?
        - If the images are unrelated to agriculture/botany (e.g., a selfie, furniture, animal): Return diagnosis: "Not a Plant", confidence: 0, confidenceReason: "No plant detected", treatment: [], prevention: []. STOP HERE.

        STEP 2: SOURCE CHECK & DIAGNOSIS
        ${sourceCheckInstructions}

        STEP 3: STANDARD ANALYSIS (If unique image)
        Context: Crop: ${cropType}, Stage: ${growthStage}, Notes: "${userNotes}".
        ${iotContext}

        1. **Search & Compare**: Use Google Search to find diseases matching the VISUAL SYMPTOMS (e.g., "concentric rings on tomato leaves"). Use all provided images to get a complete view.
        2. ${verificationInstructions}
        3. **Healthy Check**: If the plant has no visible necrotic spots, wilting, or pests, diagnosis MUST be "Healthy Plant". Do not hallucinate a disease on a healthy leaf.
        4. **Treatment**: Provide specific, actionable organic and chemical controls.
        
        Response Requirements:
        - Diagnosis: Name of disease or "Healthy Plant".
        - Confidence: 0-100. (If exact image found, 100. If < 4 matching sources, cap confidence at 80%).
        - ConfidenceReason: A short explanation (max 15 words) of why this score was given. (e.g. "Verified by 4+ university sources", "Symptoms unclear, low match").
        - Treatment: Array of steps.
        - Prevention: Array of tips.
        
        Return JSON.
      `;
    }

    // Construct parts array with multiple images
    const parts: any[] = imagesBase64.map(img => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: img,
      },
    }));
    
    // Add text prompt
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: parts,
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
            confidenceReason: { type: Type.STRING, description: "Explanation for the confidence score" },
            treatment: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Treatment steps or Characteristics"
            },
            prevention: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Prevention tips or Growing conditions"
            }
          },
          required: ["diagnosis", "confidence", "confidenceReason", "treatment", "prevention"],
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

    return {
      ...result,
      sources: uniqueSources.slice(0, 5) // Return top 5 unique sources
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
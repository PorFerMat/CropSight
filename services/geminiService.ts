import { GoogleGenAI, Type, Chat } from "@google/genai";
import { AIAnalysisResponse, AnalysisMode, IoTData, AnalysisResult } from "../types";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

// Global instance
const ai = new GoogleGenAI({ apiKey: apiKey || 'DUMMY_KEY_FOR_BUILD' });

/**
 * AGENT 1: THE ANALYZER (Vision Specialist)
 * Role: Describes the image in high detail, focusing on symptoms. 
 * Does not diagnose, only observes.
 */
const runAnalyzerAgent = async (imagesBase64: string[]): Promise<string> => {
  const prompt = `
    Act as a Computer Vision Specialist for Agriculture.
    
    Task: Analyze the provided plant images and generate a rigorous visual description.
    
    1. First, verify if this is a plant, crop, or soil. If not, output "NOT_A_PLANT".
    2. If it is a plant, describe:
       - Leaf color patterns (chlorosis, necrosis, mottling).
       - Lesion shapes (concentric rings, irregular, water-soaked).
       - Presence of pests or eggs.
       - Stem/Fruit condition.
       - Image Quality: State if the image is blurry, too dark, or lacks focus on the symptom.
    
    Output Format: Pure text description. Be clinical and precise. Do not provide a diagnosis.
  `;

  const parts: any[] = imagesBase64.map(img => ({
    inlineData: { mimeType: 'image/jpeg', data: img },
  }));
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image', // Optimized for vision
    contents: { parts },
    config: {
      temperature: 0.2, // Low temperature for factual observation
    }
  });

  return response.text || "";
};

/**
 * AGENT 2: THE CLASSIFIER (Pathologist & Researcher)
 * Role: Takes the visual description and context, searches the web, and identifies the disease.
 * STRICT: Enforces confidence scoring based on source verification.
 * UPDATED: Prioritizes .edu/.gov sources and asks "Gap Filling" questions.
 */
const runClassifierAgent = async (
  visualDescription: string,
  context: string,
  mode: AnalysisMode
): Promise<{ 
  diagnosis: string; 
  confidence: number; 
  confidenceReason: string; 
  sources: { title: string; uri: string }[];
  missingInfo?: string[];
}> => {
  const systemInstruction = `
    You are Agent 2 (The Classifier). Your goal is to identify the plant/disease based on Agent 1's visual description.
    
    INPUT DATA:
    - Visual Observations: "${visualDescription}"
    - User Context: "${context}"
    
    SOURCE PRIORITY (HIERARCHY OF TRUTH):
    1. **High Authority**: .edu (Universities), .gov (Agricultural Extensions), .org (Research Institutes).
    2. **Medium Authority**: Established gardening publications (e.g., RHS, Farmer's Almanac).
    3. **Low Authority**: Generic blogs, AI-generated content sites.
    
    PROTOCOL:
    
    1. **CHECK FOR USER ANSWERS**: 
       - Look for "USER ANSWERS:" in the User Context.
       - **IF FOUND**: You MUST provide a diagnosis. Do **NOT** ask more questions. Use the answers to finalize the "Best Guess" diagnosis.
    
    2. **RESEARCH & GAP ANALYSIS**:
       - Search for the visual symptoms, specifically looking for matches on **High Authority** domains.
       - **Compare**: Do the Visual Observations match the "Key Identification Characteristics" listed on trusted sites?
       - **Identify the Gap**: If High Authority sources suggest two similar diseases (e.g., Early Blight vs. Septoria) that require non-visual info to distinguish (e.g., "Did it start at the bottom of the plant?", "Is there a smell?"), this is a GAP.
    
    3. **DECISION**:
       - **Option A (Clear Match)**: If Visuals + High Authority Sources align > 85%, provide Diagnosis.
       - **Option B (Gap Detected)**: If you need to fill a specific gap to distinguish between likely diagnoses found on .edu/.gov sites:
         - Populate 'missingInfo' with 3 specific questions.
         - Questions must be SIMPLE and directed at the user (e.g., "Rub the leaf. Does it smell like rotting fish?").
       - **Option C (Ambiguous)**: If image is blurry or generic, ask for better photos or context.
    
    4. **CONFIDENCE SCORING**:
       - **90-100%**: Diagnosis confirmed by multiple .edu/.gov sources matching the visuals exactly.
       - **70-89%**: Strong match, but sources are mixed authority.
       - **<70%**: Best guess based on visuals alone.
    
    If Visual Observations were "NOT_A_PLANT", return diagnosis: "Not a Plant", confidence: 0.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "Identify the subject. Prioritize .edu/.gov research. If a gap exists, ask questions.",
    config: {
      systemInstruction: systemInstruction,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          diagnosis: { type: Type.STRING },
          confidence: { 
            type: Type.NUMBER,
            description: "A number between 0 and 100 representing percentage confidence." 
          },
          confidenceReason: { type: Type.STRING },
          missingInfo: { 
             type: Type.ARRAY, 
             items: { type: Type.STRING },
             description: "Questions to fill the research gap. LEAVE EMPTY if diagnosis is clear or User Answers are present."
          }
        },
        required: ["diagnosis", "confidence", "confidenceReason"],
      },
    },
  });

  // Extract Sources
  const sources: { title: string; uri: string }[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web?.uri && chunk.web?.title) {
        sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      }
    });
  }

  const json = JSON.parse(response.text || "{}");
  
  // Normalize confidence score (handle 0-1 vs 0-100 inconsistency)
  let confidence = json.confidence || 0;
  if (confidence <= 1 && confidence > 0) {
      confidence = Math.round(confidence * 100);
  }

  return { ...json, confidence, sources };
};

/**
 * AGENT 3: THE ADVISOR (Agronomist)
 * Role: Generates actionable advice based on the diagnosis and specific crop context.
 */
const runAdvisorAgent = async (
  diagnosis: string,
  visualDescription: string,
  cropType: string,
  iotData?: IoTData
): Promise<{ treatment: string[]; prevention: string[] }> => {
  
  if (diagnosis === "Not a Plant") return { treatment: [], prevention: [] };

  const iotContext = iotData 
    ? `Current Conditions: ${iotData.temperature}°C, ${iotData.humidity}% humidity.` 
    : "No sensor data.";

  const prompt = `
    You are Agent 3 (The Advisor).
    
    INPUT:
    - Diagnosis: "${diagnosis}"
    - Visual Severity: "${visualDescription}"
    - Crop: ${cropType}
    - Environment: ${iotContext}
    
    TASK:
    Provide a practical treatment plan.
    1. Treatment: 3 distinct steps. Start with organic/cultural, then chemical if needed.
    2. Prevention: 3 distinct long-term strategies.
    
    **CRITICAL**: You MUST provide output for Treatment and Prevention, even if the diagnosis is general (e.g., "Fungal Infection"). Do not leave arrays empty.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          treatment: { type: Type.ARRAY, items: { type: Type.STRING } },
          prevention: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["treatment", "prevention"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};

/**
 * ORCHESTRATOR
 * Coordinates the Multi-Agent System.
 */
export const analyzePlantImage = async (
  imagesBase64: string[],
  cropType: string,
  growthStage: string,
  userNotes: string,
  mode: AnalysisMode = 'DIAGNOSIS',
  iotData?: IoTData,
  onStatusUpdate?: (status: string) => void
): Promise<AIAnalysisResponse & { sources?: { title: string; uri: string }[] }> => {
  try {
    // --- Step 1: Analyzer Agent ---
    if (onStatusUpdate) onStatusUpdate("Agent 1 (Analyzer): Detecting visual symptoms...");
    const visualDescription = await runAnalyzerAgent(imagesBase64);
    
    if (visualDescription.includes("NOT_A_PLANT")) {
       return {
         diagnosis: "Not a Plant",
         confidence: 0,
         confidenceReason: "Agent 1 could not detect valid plant structures.",
         treatment: [],
         prevention: []
       };
    }

    // --- Step 2: Classifier Agent ---
    if (onStatusUpdate) onStatusUpdate("Agent 2 (Classifier): Researching trusted .edu/.gov databases...");
    const context = `Crop: ${cropType}, Stage: ${growthStage}, User Notes: ${userNotes}, IoT: ${iotData ? JSON.stringify(iotData) : 'None'}`;
    const classification = await runClassifierAgent(visualDescription, context, mode);

    // CHECK FOR MISSING INFO / AMBIGUITY
    // Important: Agent 2 is instructed NOT to return missingInfo if 'USER ANSWERS' are in the notes.
    if (classification.missingInfo && classification.missingInfo.length > 0) {
      return {
        diagnosis: classification.diagnosis || "Ambiguous",
        confidence: classification.confidence || 0,
        confidenceReason: classification.confidenceReason || "More information required.",
        treatment: [],
        prevention: [],
        missingInfo: classification.missingInfo,
        sources: []
      };
    }

    // --- Step 3: Advisor Agent ---
    // This runs if missingInfo is empty (meaning we have a diagnosis or forced guess)
    if (onStatusUpdate) onStatusUpdate("Agent 3 (Advisor): Formulating treatment plan...");
    const advice = await runAdvisorAgent(classification.diagnosis, visualDescription, cropType, iotData);

    // Combine Results
    return {
      diagnosis: classification.diagnosis,
      confidence: classification.confidence,
      confidenceReason: classification.confidenceReason,
      treatment: advice.treatment || [],
      prevention: advice.prevention || [],
      sources: classification.sources
    };

  } catch (error) {
    console.error("Multi-Agent Analysis Error:", error);
    throw new Error("Analysis failed.");
  }
};

/**
 * Initializes a chat session with context from the analysis result.
 */
export const createChatSession = (result: AnalysisResult): Chat => {
  const iotContext = result.iotData 
    ? `Sensor Data: ${result.iotData.temperature}°C, ${result.iotData.humidity}% humidity, ${result.iotData.soilMoisture}% moisture.` 
    : "";

  const systemInstruction = `
    You are an expert Agronomist and Plant Pathologist.
    
    CONTEXT OF CURRENT DIAGNOSIS:
    - Crop: ${result.cropType} (${result.growthStage})
    - Diagnosis: ${result.diagnosis}
    - Confidence: ${result.confidence}% (${result.confidenceReason || 'N/A'})
    - Recommended Treatment: ${result.treatment.join('; ')}
    - Prevention Tips: ${result.prevention.join('; ')}
    - User Notes: "${result.description}"
    - ${iotContext}
    
    GOAL:
    Answer the user's follow-up questions specifically about this diagnosis. 
    - Be practical, safety-conscious, and encouraging. 
    - If the user asks about chemical treatments, mention safety intervals (PHI).
    - Keep answers concise (under 3 sentences) unless asked for details.
  `;

  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: systemInstruction,
    },
  });
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
 * Gets a quick agronomy tip using gemini-flash-lite-latest (Fast Model).
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

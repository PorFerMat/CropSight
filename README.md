# 🌿 CropSight: The Pocket-Sized Agronomist

**CropSight** (also known as Plant Doctor) is an AI-powered Progressive Web App (PWA) designed to help farmers and gardening enthusiasts instantly diagnose plant diseases, identify species, and receive actionable treatment plans. By leveraging the multimodal capabilities of **Google's Gemini API**, CropSight acts as a field expert in your pocket.

## 💻 Getting Started

To run this project locally, follow these steps:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    *   Create a `.env` file in the root directory.
    *   Add your Google Gemini API key (ensure it is a paid tier key if using Veo video generation features):
        ```env
        API_KEY=your_actual_api_key_here
        ```

3.  **Run the App**:
    ```bash
    npm run dev
    ```

## 💡 Inspiration

Agriculture is the backbone of civilization, yet farmers lose approximately **20-40%** of their crops to pests and diseases annually. In many rural areas, access to professional agronomists is expensive or non-existent.

I was inspired to build CropSight to bridge this gap. The goal was to democratize agricultural expertise using specific, context-aware AI. I wanted to move beyond simple image classification and create a tool that "reasons" like a human expert—taking into account visual symptoms, environmental data, and geographic context.

## 🛠️ How I Built It

CropSight is built on a modern web stack, heavily relying on the **Google GenAI SDK** for its intelligence.

### Tech Stack
*   **Frontend**: React (TypeScript) for a responsive, component-based UI.
*   **Styling**: Tailwind CSS for a clean, nature-inspired aesthetic.
*   **AI Engine**: Google Gemini API via `@google/genai`.
*   **Visualization**: Recharts for confidence score visualization.
*   **Icons**: Lucide React.

### Core AI Features
1.  **Multimodal Diagnosis**:
    The app uses `gemini-3-pro-preview` with **Search Grounding**. It doesn't just "guess"; it searches the web to verify visual symptoms against known databases.
    
    The probability logic can be conceptualized as:
    $$ P(Diagnosis | Image, Context, Search) $$
    
    Where context includes user notes and IoT sensor data.

2.  **Transparent Confidence Scoring**:
    The confidence score is calculated based on strict verification tiers:
    *   **Tier 1 (95-100%)**: **Reverse Image Lookup**. If the specific image is found on a trusted agricultural database or article via Google Search, the diagnosis is treated as "Ground Truth".
    *   **Tier 2 (0-80%)**: **Unique Analysis**. If the image is unique, the AI searches for symptoms. The score is strictly **capped at 80%** unless the AI can cross-reference the symptoms against **at least 4 distinct high-quality sources** (University extensions, Gov websites).

3.  **IoT Integration**:
    I implemented a simulated IoT connection that feeds environmental variables (Temperature $T$, Humidity $H$, Soil Moisture $M$) into the AI prompt. The model uses this to refine its diagnosis (e.g., favoring fungal pathogens when $H > 80\%$).

4.  **Voice & Audio**:
    *   **Input**: Uses `gemini-3-flash-preview` to transcribe spoken user notes.
    *   **Output**: Uses `gemini-2.5-flash-preview-tts` to read diagnoses aloud for accessibility in the field.

## 🧠 Challenges I Faced

### 1. The "Hallucination" Problem
Early versions of the AI would confidently diagnose a healthy plant with a rare disease.
*   **Solution**: I implemented **Google Search Grounding**. The AI now has to find matching images and descriptions online before confirming a diagnosis. I also added logic to cap the confidence score at $98\%$ if fewer than 10 verified sources are found, ensuring the user remains cautious.

### 2. Context Blindness
A picture of a yellow leaf could be lack of water or a virus. Visuals alone aren't enough.
*   **Solution**: I added the "IoT Sensor" feature and distinct user inputs for **Crop Type** and **Growth Stage**. This prompts the AI to act as a specialist (Agronomist) rather than a generalist.

### 3. Audio Handling in the Browser
Streaming raw PCM audio from the Gemini API and decoding it for playback in the browser was technically tricky.
*   **Solution**: I implemented a custom `WAV` header construction and used the Web Audio API (`AudioContext`) to decode the raw binary strings returned by the model.

## 📚 What I Learned

*   **Prompt Engineering is Key**: The difference between "Analyze this image" and "Act as an expert agronomist... look for concentric rings indicating Early Blight" is massive.
*   **The Power of Grounding**: Giving the AI access to tools (Google Search) transforms it from a creative writer into a research assistant.
*   **User Experience in AI**: Showing *where* the information came from (Sources) is just as important as the answer itself. It builds trust.

## 🚀 Future Roadmap
*   **Offline Mode**: Caching common diseases for offline diagnosis using TensorFlow.js.
*   **Community Map**: Visualizing disease outbreaks on a map to warn nearby farmers.
*   **Real IoT Hardware**: Integrating with ESP32 sensors via MQTT.
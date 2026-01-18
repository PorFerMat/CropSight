import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { transcribeAudio } from '../services/geminiService';

interface AudioInputProps {
  onTranscription: (text: string) => void;
  className?: string;
}

const AudioInput: React.FC<AudioInputProps> = ({ onTranscription, className }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' }); // Default to webm/wav
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      // Use standard MIME type, let Gemini handle decoding
      const text = await transcribeAudio(base64Audio, blob.type);
      onTranscription(text);
      setIsProcessing(false);
    };
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center shadow-sm border ${
          isRecording 
            ? 'bg-red-100 border-red-200 text-red-600 animate-pulse' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
        }`}
        title={isRecording ? "Stop Recording" : "Start Recording"}
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={20} />
        ) : isRecording ? (
          <Square size={20} fill="currentColor" />
        ) : (
          <Mic size={20} />
        )}
      </button>
      {isRecording && <span className="text-xs text-red-600 font-medium animate-pulse">Recording...</span>}
      {isProcessing && <span className="text-xs text-emerald-600 font-medium">Transcribing...</span>}
    </div>
  );
};

export default AudioInput;
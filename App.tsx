import React, { useState, useEffect } from 'react';
import { 
  Sprout, 
  History as HistoryIcon, 
  Camera as CameraIcon, 
  ChevronRight, 
  AlertTriangle,
  Leaf,
  ThermometerSun,
  Volume2,
  Loader
} from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

import { ViewState, CropType, GrowthStage, AnalysisResult, HistoryItem } from './types';
import { analyzePlantImage, generateSpeech, getQuickTip } from './services/geminiService';
import Camera from './components/Camera';
import AudioInput from './components/AudioInput';

// --- Helper Components (Defined here to keep file count low per instructions, normally separate) ---

const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-emerald-50 px-6 text-center">
    <div className="relative">
      <div className="w-24 h-24 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-6"></div>
      <Sprout className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-emerald-600" size={32} />
    </div>
    <h2 className="text-xl font-bold text-gray-800 mb-2">Analyzing your plant...</h2>
    <p className="text-gray-600 text-sm max-w-xs">
      Our AI agronomist is thinking deeply about the diagnosis. This usually takes 10-15 seconds.
    </p>
  </div>
);

const ResultCard: React.FC<{ result: AnalysisResult; onBack: () => void }> = ({ result, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const handlePlayAudio = async () => {
    if (isPlaying && audio) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (audio) {
      audio.play();
      setIsPlaying(true);
      return;
    }

    setLoadingAudio(true);
    try {
      const textToSpeak = `Diagnosis: ${result.diagnosis}. Treatment: ${result.treatment.join('. ')}`;
      const audioBase64 = await generateSpeech(textToSpeak);
      
      // Decode audio data using Web Audio API as suggested in guidelines
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      const binaryString = atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      
      // For simple playback, we can still use an Audio element via blob if simpler, 
      // but to strictly follow the "Audio Decoding" section of the prompt guidelines 
      // which uses AudioContext for playback:
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      setIsPlaying(true);
      source.onended = () => setIsPlaying(false);

    } catch (err) {
      console.error("Audio playback failed", err);
      alert("Could not generate audio.");
    } finally {
      setLoadingAudio(false);
    }
  };

  const chartData = [{ name: 'Confidence', value: result.confidence, fill: '#10b981' }];

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto pb-20">
      <div className="relative h-64 bg-gray-900">
        <img src={`data:image/jpeg;base64,${result.imageUrl}`} alt="Scan" className="w-full h-full object-cover opacity-90" />
        <div className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/60 to-transparent">
          <button onClick={onBack} className="text-white hover:text-emerald-300 font-medium flex items-center gap-1">
            ← Back
          </button>
        </div>
        <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <h1 className="text-2xl font-bold text-white mb-1">{result.diagnosis}</h1>
          <div className="flex items-center gap-2 text-emerald-300 text-sm">
            <span className="bg-emerald-900/60 px-2 py-1 rounded backdrop-blur-md border border-emerald-500/30">
              {result.cropType}
            </span>
            <span className="bg-emerald-900/60 px-2 py-1 rounded backdrop-blur-md border border-emerald-500/30">
              {result.growthStage}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Confidence & Audio */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
             <div className="w-16 h-16 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius="70%" outerRadius="100%" data={chartData} startAngle={90} endAngle={-270} barSize={6}>
                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-600">
                  {result.confidence}%
                </div>
             </div>
             <div className="flex flex-col">
               <span className="text-sm text-gray-500 font-medium">Confidence Score</span>
               <span className="text-xs text-gray-400">Based on visual analysis</span>
             </div>
          </div>
          
          <button 
            onClick={handlePlayAudio}
            disabled={loadingAudio}
            className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-emerald-200 transition-colors"
          >
            {loadingAudio ? <Loader size={20} className="animate-spin" /> : <Volume2 size={24} />}
          </button>
        </div>

        {/* Treatment */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Leaf size={20} className="text-emerald-500" /> Treatment Plan
          </h3>
          <ul className="space-y-3">
            {result.treatment.map((step, idx) => (
              <li key={idx} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 font-bold flex items-center justify-center text-xs">
                  {idx + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        {/* Prevention */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" /> Prevention
          </h3>
          <ul className="space-y-2">
            {result.prevention.map((tip, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-gray-600">
                <span className="text-emerald-500">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-xs text-amber-800 leading-relaxed">
          <strong>Disclaimer:</strong> This is an AI-generated diagnosis. Always consult with a local agricultural expert or extension office before applying chemical treatments.
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.HOME);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('cropSightHistory');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Form State
  const [selectedCrop, setSelectedCrop] = useState<string>(CropType.TOMATO);
  const [selectedStage, setSelectedStage] = useState<string>(GrowthStage.VEGETATIVE);
  const [userNotes, setUserNotes] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [quickTip, setQuickTip] = useState<string>("Loading daily tip...");

  // Load quick tip on mount
  useEffect(() => {
    getQuickTip().then(setQuickTip);
  }, []);

  // Save history
  useEffect(() => {
    localStorage.setItem('cropSightHistory', JSON.stringify(history));
  }, [history]);

  const handleCapture = (base64: string) => {
    setCapturedImage(base64);
    setIsCameraOpen(false);
    setView(ViewState.SCAN);
  };

  const handleAnalyze = async () => {
    if (!capturedImage) return;
    
    setIsAnalyzing(true);
    try {
      const response = await analyzePlantImage(
        capturedImage, 
        selectedCrop, 
        selectedStage, 
        userNotes
      );

      const result: AnalysisResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageUrl: capturedImage,
        cropType: selectedCrop,
        growthStage: selectedStage,
        diagnosis: response.diagnosis,
        confidence: response.confidence,
        treatment: response.treatment,
        prevention: response.prevention,
        description: userNotes,
      };

      setHistory(prev => [result, ...prev]);
      setCurrentResult(result);
      setView(ViewState.RESULT);
    } catch (error) {
      alert("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startNewScan = () => {
    setCapturedImage(null);
    setUserNotes('');
    setIsCameraOpen(true);
  };

  // Render Views
  if (isCameraOpen) {
    return <Camera onCapture={handleCapture} onClose={() => setIsCameraOpen(false)} />;
  }

  if (isAnalyzing) {
    return <LoadingScreen />;
  }

  if (view === ViewState.RESULT && currentResult) {
    return <ResultCard result={currentResult} onBack={() => setView(ViewState.HOME)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900 pb-20">
      
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-700">
          <Sprout size={28} />
          <h1 className="text-xl font-bold tracking-tight">CropSight</h1>
        </div>
        <div className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
          Plant Doctor
        </div>
      </header>

      <main className="flex-1 p-6 max-w-lg mx-auto w-full">
        
        {view === ViewState.HOME && (
          <div className="space-y-8 animate-fade-in">
            {/* Hero CTA */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-6 text-white shadow-xl shadow-emerald-200/50">
              <h2 className="text-2xl font-bold mb-2">Healthy crops start here.</h2>
              <p className="text-emerald-100 mb-6 text-sm">Snap a photo to detect diseases instantly using advanced AI.</p>
              <button 
                onClick={startNewScan}
                className="w-full bg-white text-emerald-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 transition-all active:scale-95 shadow-lg"
              >
                <CameraIcon size={20} />
                Scan Plant
              </button>
            </div>

            {/* Quick Tip */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
               <div className="flex items-start gap-3">
                 <ThermometerSun className="text-amber-500 shrink-0 mt-1" size={20} />
                 <div>
                   <h3 className="font-bold text-gray-800 text-sm mb-1">Agronomy Tip of the Day</h3>
                   <p className="text-gray-600 text-sm italic">"{quickTip}"</p>
                 </div>
               </div>
            </div>

            {/* Recent History Preview */}
            {history.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-800">Recent Scans</h3>
                  <button onClick={() => setView(ViewState.HISTORY)} className="text-emerald-600 text-sm font-medium hover:underline">
                    View All
                  </button>
                </div>
                <div className="space-y-3">
                  {history.slice(0, 3).map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => { setCurrentResult(item); setView(ViewState.RESULT); }}
                      className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 cursor-pointer hover:border-emerald-200 transition-colors"
                    >
                      <img src={`data:image/jpeg;base64,${item.imageUrl}`} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-800 text-sm truncate">{item.diagnosis}</h4>
                        <p className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleDateString()}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === ViewState.HISTORY && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Scan History</h2>
            {history.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <HistoryIcon size={48} className="mx-auto mb-4 opacity-50" />
                <p>No scans yet.</p>
              </div>
            ) : (
              history.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => { setCurrentResult(item); setView(ViewState.RESULT); }}
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-4 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <img src={`data:image/jpeg;base64,${item.imageUrl}`} alt="" className="w-20 h-20 rounded-lg object-cover bg-gray-100" />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-gray-800">{item.diagnosis}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.confidence > 80 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {item.confidence}%
                      </span>
                    </div>
                    <p className="text-xs text-emerald-600 font-medium mt-1">{item.cropType} • {item.growthStage}</p>
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                       Treatment: {item.treatment[0]}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === ViewState.SCAN && (
          <div className="animate-fade-in">
             <div className="mb-6 relative h-48 rounded-xl overflow-hidden bg-black group">
                {capturedImage && (
                  <img src={`data:image/jpeg;base64,${capturedImage}`} alt="Preview" className="w-full h-full object-cover" />
                )}
                <button 
                  onClick={startNewScan}
                  className="absolute bottom-3 right-3 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg backdrop-blur-sm text-xs font-medium flex items-center gap-1"
                >
                  <CameraIcon size={14} /> Retake
                </button>
             </div>

             <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
                <h3 className="font-bold text-lg text-gray-800 border-b border-gray-100 pb-2">Plant Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Crop Type</label>
                    <div className="relative">
                      <select 
                        value={selectedCrop} 
                        onChange={(e) => setSelectedCrop(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg py-3 px-3 appearance-none text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        {Object.values(CropType).map(crop => <option key={crop} value={crop}>{crop}</option>)}
                      </select>
                      <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">
                        <ChevronRight size={14} className="rotate-90" />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Growth Stage</label>
                    <div className="relative">
                      <select 
                        value={selectedStage} 
                        onChange={(e) => setSelectedStage(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg py-3 px-3 appearance-none text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        {Object.values(GrowthStage).map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                       <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">
                        <ChevronRight size={14} className="rotate-90" />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Observations</label>
                  <div className="relative">
                    <textarea 
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="Describe spots, wilting, or pests..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg py-3 px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                    />
                    <div className="absolute bottom-2 right-2">
                       <AudioInput onTranscription={(text) => setUserNotes(prev => prev + (prev ? ' ' : '') + text)} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleAnalyze}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all transform active:scale-[0.98]"
                >
                  Analyze Plant
                </button>
             </div>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 py-3 px-8 flex justify-between items-center z-40 safe-area-bottom">
        <button 
          onClick={() => setView(ViewState.HOME)}
          className={`flex flex-col items-center gap-1 ${view === ViewState.HOME ? 'text-emerald-600' : 'text-gray-400'}`}
        >
          <Sprout size={24} strokeWidth={view === ViewState.HOME ? 2.5 : 2} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        
        <div className="relative -top-6">
          <button 
            onClick={startNewScan}
            className="w-16 h-16 bg-emerald-600 rounded-full text-white shadow-xl shadow-emerald-200 flex items-center justify-center transform hover:scale-105 transition-transform"
          >
            <CameraIcon size={28} />
          </button>
        </div>

        <button 
          onClick={() => setView(ViewState.HISTORY)}
          className={`flex flex-col items-center gap-1 ${view === ViewState.HISTORY ? 'text-emerald-600' : 'text-gray-400'}`}
        >
          <HistoryIcon size={24} strokeWidth={view === ViewState.HISTORY ? 2.5 : 2} />
          <span className="text-[10px] font-medium">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
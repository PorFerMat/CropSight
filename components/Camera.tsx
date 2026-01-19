import React, { useRef, useState, useEffect } from 'react';
import { Camera as CameraIcon, X, RefreshCw, Image as ImageIcon, Check, Plus } from 'lucide-react';

interface CameraProps {
  onCapture: (base64Images: string[]) => void;
  onClose: () => void;
}

const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const MAX_IMAGES = 3;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleStream = (stream: MediaStream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    setError('');
  };

  const startCamera = async () => {
    stopCamera();
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      });
      handleStream(stream);
    } catch (err) {
      console.warn(`Camera start failed for mode ${facingMode}:`, err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        handleStream(fallbackStream);
      } catch (fallbackErr) {
        console.error("All camera attempts failed:", fallbackErr);
        setError('Camera not found. Please upload a file.');
      }
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const takePhoto = () => {
    if (capturedImages.length >= MAX_IMAGES) return;

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
        const pureBase64 = imageBase64.split(',')[1];
        
        setCapturedImages(prev => [...prev, pureBase64]);
      }
    }
  };

  const handleFinish = () => {
    if (capturedImages.length > 0) {
      stopCamera();
      onCapture(capturedImages);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const pureBase64 = result.split(',')[1];
        
        // Add file upload to list and finish immediately if it's the first one, or add to queue? 
        // For simplicity, let's just treat upload as "Add one"
        setCapturedImages(prev => {
            const newImages = [...prev, pureBase64];
            // If we want to allow mixing camera and upload, we just add it.
            return newImages; 
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col justify-between">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-black/40 backdrop-blur-sm absolute top-0 w-full z-10">
        <button onClick={onClose} className="text-white p-2 rounded-full hover:bg-white/20">
          <X size={24} />
        </button>
        <div className="flex flex-col items-center">
             <span className="text-white font-medium">Take Photo</span>
             <span className="text-[10px] text-emerald-400 font-medium tracking-wide">
                 {capturedImages.length}/{MAX_IMAGES} CAPTURED
             </span>
        </div>
        <button onClick={toggleCamera} className="text-white p-2 rounded-full hover:bg-white/20">
          <RefreshCw size={24} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-white text-center px-6 max-w-xs">
            <div className="bg-red-500/20 text-red-100 p-4 rounded-xl mb-6 border border-red-500/50">
               <p className="text-sm font-medium mb-1">Camera Error</p>
               <p className="text-xs opacity-90">{error}</p>
            </div>
            <label className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl cursor-pointer font-medium transition-colors w-full block">
              Upload from Gallery
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Thumbnail Tray */}
      {capturedImages.length > 0 && (
          <div className="bg-black/80 h-20 flex items-center px-4 gap-3 overflow-x-auto absolute bottom-32 w-full z-20 backdrop-blur-sm border-t border-white/10">
            {capturedImages.map((img, idx) => (
                <div key={idx} className="relative w-12 h-16 flex-shrink-0 border border-emerald-500/50 rounded-md overflow-hidden">
                    <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" alt={`capture ${idx}`} />
                    <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[8px] px-1 font-bold">
                        {idx + 1}
                    </div>
                </div>
            ))}
            {capturedImages.length < MAX_IMAGES && (
                 <div className="text-white/30 text-xs italic ml-2">
                    Tap shutter to add more
                 </div>
            )}
          </div>
      )}

      {/* Controls */}
      <div className="h-32 bg-black flex items-center justify-around px-8 pb-4 relative z-30">
        <label className="flex flex-col items-center text-white/70 gap-1 cursor-pointer hover:text-white transition-colors">
          <div className="p-3 bg-white/10 rounded-full">
            <ImageIcon size={24} />
          </div>
          <span className="text-xs font-medium">Gallery</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>

        {/* Shutter Button */}
        <button 
          onClick={takePhoto} 
          disabled={!!error || capturedImages.length >= MAX_IMAGES}
          className={`w-18 h-18 p-1 rounded-full border-4 transition-all transform active:scale-95 flex items-center justify-center
            ${error || capturedImages.length >= MAX_IMAGES 
               ? 'border-gray-600 opacity-50' 
               : 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
            }`}
        >
           <div className={`w-16 h-16 rounded-full border-2 border-black flex items-center justify-center
             ${error ? 'bg-gray-500' : 'bg-white'}`} 
           >
              {capturedImages.length >= MAX_IMAGES && <Check className="text-emerald-600" size={32} />}
           </div>
        </button>

        {/* Done Button (Conditional) */}
        {capturedImages.length > 0 ? (
             <button 
                onClick={handleFinish}
                className="flex flex-col items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors animate-fade-in"
             >
                <div className="p-3 bg-emerald-900/50 rounded-full border border-emerald-500/30">
                    <Check size={24} strokeWidth={3} />
                </div>
                <span className="text-xs font-bold">DONE</span>
             </button>
        ) : (
            <div className="w-12" /> // Spacer
        )}
      </div>
    </div>
  );
};

export default Camera;
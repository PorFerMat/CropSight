import React, { useRef, useState, useEffect } from 'react';
import { Camera as CameraIcon, X, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface CameraProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
}

const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref to track the stream so cleanup functions always access the current stream
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    stopCamera(); // Ensure any previous stream is stopped
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      });
      streamRef.current = newStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not access camera. Please allow permissions.');
    }
  };

  useEffect(() => {
    startCamera();
    // Cleanup function runs on unmount or when facingMode changes
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
        const pureBase64 = imageBase64.split(',')[1];
        
        stopCamera(); // Stop the stream immediately
        onCapture(pureBase64);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const pureBase64 = result.split(',')[1];
        stopCamera(); // Stop the stream immediately
        onCapture(pureBase64);
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
        <span className="text-white font-medium">Take Photo</span>
        <button onClick={toggleCamera} className="text-white p-2 rounded-full hover:bg-white/20">
          <RefreshCw size={24} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-white text-center px-6">
            <p className="mb-4">{error}</p>
            <label className="bg-emerald-600 text-white px-4 py-2 rounded-lg cursor-pointer">
              Upload Image Instead
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

      {/* Controls */}
      <div className="h-32 bg-black flex items-center justify-around px-8 pb-4">
        <label className="flex flex-col items-center text-white/70 gap-1 cursor-pointer hover:text-white">
          <div className="p-3 bg-white/10 rounded-full">
            <ImageIcon size={24} />
          </div>
          <span className="text-xs">Gallery</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>

        <button 
          onClick={takePhoto} 
          disabled={!!error}
          className="w-16 h-16 rounded-full bg-white border-4 border-emerald-500 shadow-lg flex items-center justify-center transform active:scale-95 transition-all"
        >
          <div className="w-14 h-14 bg-white rounded-full border-2 border-black" />
        </button>

        <div className="w-12" /> {/* Spacer for balance */}
      </div>
    </div>
  );
};

export default Camera;
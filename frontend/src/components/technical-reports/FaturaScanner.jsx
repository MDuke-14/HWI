import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { jsPDF } from 'jspdf';
import { Button } from '../ui/button';
import { Camera, ScanLine, RotateCw, Sun, Contrast, Check, X, ZoomIn, ZoomOut, Upload, FileText } from 'lucide-react';

// Canvas-based image processing utilities
const applyEnhancement = (canvas, settings) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const { brightness, contrast, sharpness, grayscale } = settings;

  // Apply brightness and contrast
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r += brightness;
    g += brightness;
    b += brightness;

    // Contrast
    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    b = factor * (b - 128) + 128;

    // Grayscale
    if (grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);

  // Sharpness (unsharp mask - lightweight)
  if (sharpness > 0) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.filter = `blur(1px)`;
    tempCtx.drawImage(canvas, 0, 0);
    ctx.globalAlpha = sharpness / 100;
    ctx.globalCompositeOperation = 'difference';
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Re-read blended result and add to original
    const sharpData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const origData = imageData;
    for (let i = 0; i < data.length; i += 4) {
      sharpData.data[i] = Math.min(255, origData.data[i] + sharpData.data[i] * (sharpness / 50));
      sharpData.data[i+1] = Math.min(255, origData.data[i+1] + sharpData.data[i+1] * (sharpness / 50));
      sharpData.data[i+2] = Math.min(255, origData.data[i+2] + sharpData.data[i+2] * (sharpness / 50));
    }
    ctx.putImageData(sharpData, 0, 0);
  }
};

const getCroppedImg = (imageSrc, pixelCrop) => {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0,
        pixelCrop.width, pixelCrop.height
      );
      resolve(canvas);
    };
    image.src = imageSrc;
  });
};

const SCANNER_PRESETS = {
  auto: { brightness: 15, contrast: 40, sharpness: 30, grayscale: false },
  bw: { brightness: 20, contrast: 60, sharpness: 40, grayscale: true },
  high_contrast: { brightness: 5, contrast: 80, sharpness: 50, grayscale: false },
  original: { brightness: 0, contrast: 0, sharpness: 0, grayscale: false },
};

const FaturaScanner = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState('capture'); // capture | crop | enhance | preview
  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [enhancedPreview, setEnhancedPreview] = useState(null);
  const [activePreset, setActivePreset] = useState('auto');
  const [processing, setProcessing] = useState(false);

  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const enhanceCanvasRef = useRef(null);

  // Step 1: Capture
  const handleCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImage(ev.target.result);
      setStep('crop');
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Step 2: Crop complete callback
  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropConfirm = async () => {
    if (!croppedAreaPixels || !rawImage) return;
    setProcessing(true);
    try {
      const canvas = await getCroppedImg(rawImage, croppedAreaPixels);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCroppedImage(dataUrl);
      // Auto-apply enhancement preset
      await applyPreset('auto', canvas);
      setStep('enhance');
    } finally {
      setProcessing(false);
    }
  };

  // Step 3: Enhancement
  const applyPreset = async (preset, sourceCanvas = null) => {
    setActivePreset(preset);
    const settings = SCANNER_PRESETS[preset];
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      applyEnhancement(canvas, settings);
      enhanceCanvasRef.current = canvas;
      setEnhancedPreview(canvas.toDataURL('image/jpeg', 0.92));
    };
    
    if (sourceCanvas) {
      img.src = sourceCanvas.toDataURL('image/jpeg', 0.95);
    } else {
      img.src = croppedImage;
    }
  };

  // Step 4: Generate PDF and return
  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const canvas = enhanceCanvasRef.current;
      if (!canvas) return;

      // Generate PDF with jsPDF
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // A4 dimensions in mm
      const a4Width = 210;
      const a4Height = 297;
      
      // Calculate scaling to fit A4 with margins
      const margin = 10;
      const maxWidth = a4Width - (margin * 2);
      const maxHeight = a4Height - (margin * 2);
      
      let pdfWidth = maxWidth;
      let pdfHeight = (imgHeight / imgWidth) * maxWidth;
      
      if (pdfHeight > maxHeight) {
        pdfHeight = maxHeight;
        pdfWidth = (imgWidth / imgHeight) * maxHeight;
      }
      
      const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
      
      const pageW = orientation === 'landscape' ? a4Height : a4Width;
      const pageH = orientation === 'landscape' ? a4Width : a4Height;
      const maxW = pageW - (margin * 2);
      const maxH = pageH - (margin * 2);
      
      pdfWidth = maxW;
      pdfHeight = (imgHeight / imgWidth) * maxW;
      if (pdfHeight > maxH) {
        pdfHeight = maxH;
        pdfWidth = (imgWidth / imgHeight) * maxH;
      }
      
      const x = (pageW - pdfWidth) / 2;
      const y = (pageH - pdfHeight) / 2;
      
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', x, y, pdfWidth, pdfHeight);
      
      const pdfBase64 = pdf.output('datauristring');
      const filename = `fatura_scan_${new Date().toISOString().slice(0,10)}.pdf`;
      
      onComplete({
        factura_data: pdfBase64,
        factura_filename: filename,
        factura_mimetype: 'application/pdf'
      });
    } finally {
      setProcessing(false);
    }
  };

  // Capture step
  if (step === 'capture') {
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <ScanLine className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-white text-lg font-semibold">Scanner de Fatura</h3>
          <p className="text-gray-400 text-sm mt-1">Tire uma foto da fatura ou selecione um ficheiro</p>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-emerald-600/50 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-900/20 transition-all"
            data-testid="scanner-camera-btn"
          >
            <Camera className="w-8 h-8 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium text-center">Tirar Foto</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-800/30 transition-all"
            data-testid="scanner-file-btn"
          >
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-gray-400 text-sm font-medium text-center">Escolher Ficheiro</span>
          </button>
        </div>
        
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} className="hidden" />
        <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleCapture} className="hidden" />
        
        <Button type="button" variant="outline" onClick={onCancel} className="w-full border-gray-600 text-gray-400">
          Cancelar
        </Button>
      </div>
    );
  }

  // Crop step
  if (step === 'crop') {
    return (
      <div className="space-y-3">
        <div className="text-center">
          <h3 className="text-white text-base font-semibold">Recortar Documento</h3>
          <p className="text-gray-400 text-xs">Ajuste a área de recorte para enquadrar a fatura</p>
        </div>
        
        <div className="relative w-full h-[340px] bg-black rounded-lg overflow-hidden">
          <Cropper
            image={rawImage}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={210 / 297}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { borderRadius: '0.5rem' },
            }}
          />
        </div>
        
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <ZoomOut className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min={1} max={3} step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="border-gray-600"
          >
            <RotateCw className="w-4 h-4 mr-1" />
            Rodar
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => { setStep('capture'); setRawImage(null); }} className="flex-1 border-gray-600">
            Voltar
          </Button>
          <Button type="button" onClick={handleCropConfirm} disabled={processing} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {processing ? 'A processar...' : 'Recortar e Melhorar'}
          </Button>
        </div>
      </div>
    );
  }

  // Enhance step
  if (step === 'enhance') {
    return (
      <div className="space-y-3">
        <div className="text-center">
          <h3 className="text-white text-base font-semibold">Melhorar Documento</h3>
          <p className="text-gray-400 text-xs">Escolha o modo de digitalização</p>
        </div>
        
        {enhancedPreview && (
          <div className="relative w-full max-h-[280px] overflow-hidden rounded-lg border border-gray-700 flex items-center justify-center bg-black">
            <img src={enhancedPreview} alt="Preview" className="max-w-full max-h-[280px] object-contain" />
          </div>
        )}
        
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'auto', label: 'Auto', icon: <ScanLine className="w-4 h-4" /> },
            { key: 'bw', label: 'P&B', icon: <Contrast className="w-4 h-4" /> },
            { key: 'high_contrast', label: 'Alto Contraste', icon: <Sun className="w-4 h-4" /> },
            { key: 'original', label: 'Original', icon: <FileText className="w-4 h-4" /> },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium transition-all ${
                activePreset === key
                  ? 'bg-emerald-600 text-white border border-emerald-500'
                  : 'bg-[#0f0f0f] text-gray-400 border border-gray-700 hover:border-gray-500'
              }`}
              data-testid={`scanner-preset-${key}`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
        
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setStep('crop')} className="flex-1 border-gray-600">
            Voltar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={processing} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {processing ? 'A gerar PDF...' : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Confirmar
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default FaturaScanner;

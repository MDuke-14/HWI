import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Button } from '../ui/button';
import { Camera, Upload, X, FileText, Loader2 } from 'lucide-react';

const FaturaScanner = ({ onComplete, onCancel }) => {
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onComplete({
          factura_data: ev.target.result,
          factura_filename: file.name,
          factura_mimetype: 'application/pdf'
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreview({ src: ev.target.result, name: file.name });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setProcessing(true);
    try {
      const img = new Image();
      img.onload = () => {
        const orient = img.width > img.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' });
        const pageW = orient === 'landscape' ? 297 : 210;
        const pageH = orient === 'landscape' ? 210 : 297;
        const margin = 8;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        let w = maxW;
        let h = (img.height / img.width) * w;
        if (h > maxH) { h = maxH; w = (img.width / img.height) * h; }
        pdf.addImage(preview.src, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
        const filename = `fatura_${new Date().toISOString().slice(0, 10)}.pdf`;
        onComplete({
          factura_data: pdf.output('datauristring'),
          factura_filename: filename,
          factura_mimetype: 'application/pdf'
        });
      };
      img.src = preview.src;
    } catch {
      setProcessing(false);
    }
  };

  if (preview) {
    return (
      <div className="space-y-3">
        <p className="text-white text-sm font-medium text-center">Pré-visualização</p>
        <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-black flex items-center justify-center" style={{ maxHeight: '300px' }}>
          <img src={preview.src} alt="Preview" className="max-w-full max-h-[300px] object-contain" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(null)} className="flex-1 border-gray-600" data-testid="scanner-back-btn">
            <X className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={processing} className="flex-1 bg-emerald-600 hover:bg-emerald-700" data-testid="scanner-confirm-btn">
            {processing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            {processing ? 'A gerar...' : 'Guardar'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center py-2">
        <p className="text-white text-sm font-semibold">Anexar Fatura</p>
        <p className="text-gray-400 text-xs">Tire uma foto ou selecione um ficheiro</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-emerald-600/50 rounded-xl hover:border-emerald-400 hover:bg-emerald-900/20 transition-all"
          data-testid="scanner-camera-btn">
          <Camera className="w-7 h-7 text-emerald-400" />
          <span className="text-emerald-400 text-xs font-medium">Tirar Foto</span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-gray-600 rounded-xl hover:border-gray-400 hover:bg-gray-800/30 transition-all"
          data-testid="scanner-file-btn">
          <Upload className="w-7 h-7 text-gray-400" />
          <span className="text-gray-400 text-xs font-medium">Escolher Ficheiro</span>
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
      <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} className="hidden" />
      <Button type="button" variant="outline" onClick={onCancel} className="w-full border-gray-600 text-gray-400" data-testid="scanner-cancel-btn">
        Cancelar
      </Button>
    </div>
  );
};

export default FaturaScanner;

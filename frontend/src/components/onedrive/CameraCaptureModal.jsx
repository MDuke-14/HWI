import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCw, X, Check, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Câmara in-app usando `navigator.mediaDevices.getUserMedia`.
 * - Live preview com facing traseira por defeito (móvel).
 * - Multi-shot: cada disparo entra numa fila; utilizador pode rever/remover.
 * - Ao "Concluir", devolve `File[]` para o componente pai via `onCapture(files)`.
 * - Nenhum ficheiro toca no sistema de ficheiros do dispositivo — só existem
 *   em memória até serem enviados.
 */
export default function CameraCaptureModal({ open, onOpenChange, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [shots, setShots] = useState([]); // [{id, dataUrl, file}]
  const [busy, setBusy] = useState(false);
  const [flashKey, setFlashKey] = useState(0); // dispara animação após cada captura

  // Só reseta os shots quando o modal ABRE (não quando muda facingMode).
  useEffect(() => {
    if (open) {
      setShots([]);
      setError(null);
    }
  }, [open]);

  // Inicializar / reinicializar o stream sempre que abrir ou mudar de câmara.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      setReady(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Câmara não suportada neste browser');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setError(e?.message || 'Não foi possível aceder à câmara');
      }
    };
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facingMode]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast.error('Câmara ainda a inicializar');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      toast.error('Falha a capturar');
      return;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `foto_${ts}.jpg`;
    const file = new File([blob], filename, { type: 'image/jpeg' });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // preview mais leve
    setShots((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, dataUrl, file }]);
    // Feedback visual (flash branco rápido)
    setFlashKey((k) => k + 1);
  };

  const removeShot = (id) => setShots((prev) => prev.filter((s) => s.id !== id));

  const flip = () => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));

  const confirm = async () => {
    if (shots.length === 0) {
      toast.error('Tira pelo menos uma fotografia primeiro');
      return;
    }
    setBusy(true);
    try {
      await onCapture?.(shots.map((s) => s.file));
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="bg-[#0a0a0a] border-gray-800 text-white max-w-2xl h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-3 border-b border-gray-800 shrink-0 flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <Camera className="w-4 h-4 text-blue-400" />
            Câmara HWI
          </DialogTitle>
          <button
            className="text-gray-400 hover:text-white p-1"
            onClick={() => { if (!busy) onOpenChange(false); }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Video area */}
          <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center">
            {error ? (
              <div className="text-red-400 text-sm p-6 text-center">
                {error}
                <p className="text-xs text-gray-500 mt-2">Verifica se autorizaste o acesso à câmara.</p>
              </div>
            ) : !ready ? (
              <div className="text-gray-400 text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> A abrir câmara…
              </div>
            ) : null}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`max-h-full max-w-full ${!ready ? 'hidden' : ''}`}
              data-testid="camera-live-video"
            />
            {/* Flash overlay a cada captura */}
            {flashKey > 0 && (
              <div
                key={flashKey}
                className="absolute inset-0 pointer-events-none bg-white opacity-70 animate-camera-flash"
                style={{ animation: 'cameraFlash 300ms ease-out forwards' }}
              />
            )}
            {/* Badge com contagem de fotos tiradas — sempre visível */}
            {ready && (
              <div className="absolute top-2 right-2 bg-black/70 rounded-full px-2 py-1 text-[11px] text-white flex items-center gap-1 backdrop-blur-sm">
                <ImageIcon className="w-3 h-3" />
                {shots.length} {shots.length === 1 ? 'foto' : 'fotos'}
              </div>
            )}
            <style>{`
              @keyframes cameraFlash {
                0% { opacity: 0.7; }
                100% { opacity: 0; }
              }
            `}</style>
          </div>

          {/* Shot strip */}
          {shots.length > 0 && (
            <div className="border-t border-gray-800 p-2 overflow-x-auto shrink-0 bg-[#0f0f0f]">
              <div className="flex gap-2">
                {shots.map((s) => (
                  <div key={s.id} className="relative shrink-0">
                    <img src={s.dataUrl} alt="captura" className="h-16 w-16 object-cover rounded border border-gray-700" />
                    <button
                      className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5"
                      onClick={() => removeShot(s.id)}
                      aria-label="Remover"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="border-t border-gray-800 p-3 flex items-center justify-between gap-2 shrink-0 bg-[#0a0a0a]">
            <Button variant="outline" size="icon" onClick={flip} disabled={!ready || busy} className="border-gray-700 h-11 w-11" title="Virar câmara">
              <RotateCw className="w-5 h-5" />
            </Button>

            <Button
              onClick={capture}
              disabled={!ready || busy}
              className="bg-white hover:bg-gray-100 text-black rounded-full h-14 w-14 p-0 shadow-lg"
              data-testid="camera-capture-btn"
              aria-label="Capturar"
            >
              <Camera className="w-6 h-6" />
            </Button>

            <Button
              onClick={confirm}
              disabled={shots.length === 0 || busy}
              className="bg-emerald-600 hover:bg-emerald-700 h-11 disabled:opacity-40"
              data-testid="camera-confirm-btn"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Concluir{shots.length > 0 ? ` (${shots.length})` : ''}
            </Button>
          </div>

          {/* Instrução — sempre visível para reforçar o multi-shot */}
          {!error && (
            <p className="text-[11px] text-gray-400 text-center pb-2 flex items-center justify-center gap-1 shrink-0">
              <ImageIcon className="w-3 h-3" />
              {shots.length === 0
                ? 'Toca no botão redondo para tirar a 1ª foto. Podes tirar várias antes de concluir.'
                : `${shots.length} fotografia(s) prontas — toca no botão redondo para tirar mais ou em Concluir quando terminares.`}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

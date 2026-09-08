import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Camera, Cloud, Smartphone, ChevronLeft } from 'lucide-react';

/**
 * Modal para adicionar fotografia(s) ao Pedido de Cotação (PC).
 *
 * Fluxo em 2 passos:
 *   Passo 1 (menu): escolher a fonte:
 *     • Câmara — OneDrive: abre a câmara integrada e sincroniza com o OneDrive.
 *     • Ficheiros do OneDrive: abre o picker do OneDrive.
 *     • Ficheiros do telemóvel: input file local (multi).
 *   Passo 2 (ficheiro local): descrição + botão de submeter.
 *
 * Callbacks:
 *   • onOpenCamera()        — abre CameraCaptureModal (que fará upload + OneDrive mirror).
 *   • onOpenOneDrive()      — abre OneDrivePickerModal (ficheiros já em OneDrive).
 *   • onUpload(files, opts) — upload dos ficheiros locais (com opção OneDrive mirror).
 */
const AddFotoPCModal = ({
  open,
  onOpenChange,
  onUpload,
  onOpenOneDrive,
  onOpenCamera,
  uploading = false,
  onCancel,
}) => {
  const [step, setStep] = useState('menu'); // 'menu' | 'local'
  const [files, setFiles] = useState([]);
  const [descricao, setDescricao] = useState('');
  const [mirrorToOneDrive, setMirrorToOneDrive] = useState(true);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep('menu');
    setFiles([]);
    setDescricao('');
    setMirrorToOneDrive(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (val) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleCancel = () => {
    reset();
    if (onCancel) onCancel();
  };

  const handleSubmitLocal = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    await onUpload(files, { descricao, mirrorToOneDrive });
    reset();
  };

  const openCamera = () => { handleClose(false); onOpenCamera && onOpenCamera(); };
  const openOneDrive = () => { handleClose(false); onOpenOneDrive && onOpenOneDrive(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {step === 'local' && (
              <button type="button" onClick={() => setStep('menu')} className="text-gray-400 hover:text-white" data-testid="pc-foto-back">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {step === 'menu' ? 'Adicionar Fotografia ao PC' : 'Escolher do telemóvel'}
          </DialogTitle>
          <DialogDescription className="sr-only">Adiciona fotografias ao PC via câmara, OneDrive ou ficheiro local.</DialogDescription>
        </DialogHeader>

        {step === 'menu' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={openCamera}
              disabled={uploading}
              className="w-full flex items-center gap-3 p-4 bg-[#0f0f0f] border border-gray-700 hover:border-blue-500 hover:bg-blue-500/5 rounded-lg transition-colors text-left disabled:opacity-50"
              data-testid="pc-foto-source-camera"
            >
              <div className="p-2 bg-blue-500/20 rounded">
                <Camera className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Câmara — OneDrive</p>
                <p className="text-gray-500 text-xs">Abre a câmara integrada e guarda no OneDrive automaticamente.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={openOneDrive}
              disabled={uploading}
              className="w-full flex items-center gap-3 p-4 bg-[#0f0f0f] border border-gray-700 hover:border-blue-500 hover:bg-blue-500/5 rounded-lg transition-colors text-left disabled:opacity-50"
              data-testid="pc-foto-source-onedrive"
            >
              <div className="p-2 bg-blue-500/20 rounded">
                <Cloud className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Ficheiros do OneDrive</p>
                <p className="text-gray-500 text-xs">Escolhe fotografias já existentes na tua conta OneDrive.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStep('local')}
              disabled={uploading}
              className="w-full flex items-center gap-3 p-4 bg-[#0f0f0f] border border-gray-700 hover:border-emerald-500 hover:bg-emerald-500/5 rounded-lg transition-colors text-left disabled:opacity-50"
              data-testid="pc-foto-source-local"
            >
              <div className="p-2 bg-emerald-500/20 rounded">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Ficheiros do telemóvel</p>
                <p className="text-gray-500 text-xs">Selecciona fotografias/ficheiros guardados no dispositivo.</p>
              </div>
            </button>

            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
              className="w-full border-gray-600 mt-2"
              disabled={uploading}
              data-testid="pc-foto-cancelar"
            >
              Cancelar
            </Button>
          </div>
        )}

        {step === 'local' && (
          <form onSubmit={handleSubmitLocal} className="space-y-4">
            <div>
              <Label htmlFor="foto_pc_file" className="text-gray-300 flex items-center gap-2 mb-1">
                <Smartphone className="w-4 h-4" /> Ficheiro(s) do dispositivo
              </Label>
              <Input
                id="foto_pc_file"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                data-testid="pc-foto-file"
              />
              {files.length > 0 && (
                <p className="text-xs text-emerald-400 mt-1">{files.length} ficheiro(s) selecionado(s)</p>
              )}
            </div>

            <div>
              <Label htmlFor="foto_pc_descricao" className="text-gray-300">Descrição (opcional)</Label>
              <Input
                id="foto_pc_descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Vista frontal do equipamento"
                data-testid="pc-foto-descricao"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={mirrorToOneDrive}
                onChange={(e) => setMirrorToOneDrive(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
                data-testid="pc-foto-mirror-onedrive"
              />
              <Cloud className="w-4 h-4 text-blue-400" />
              Guardar também no OneDrive
            </label>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setStep('menu')}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={uploading}
                data-testid="pc-foto-voltar"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                disabled={uploading || files.length === 0}
                data-testid="pc-foto-adicionar"
              >
                {uploading ? 'A enviar...' : `Adicionar${files.length > 1 ? ` (${files.length})` : ''}`}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddFotoPCModal;

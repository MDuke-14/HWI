import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, Camera, Cloud } from 'lucide-react';

/**
 * Modal para adicionar fotografia(s) ao Pedido de Cotação (PC).
 *
 * Suporta 3 fontes:
 *  - Ficheiros locais (input file, multi-selecção)
 *  - Câmara in-app (callback para abrir o CameraCaptureModal via `onOpenCamera`)
 *  - OneDrive picker (callback para abrir o OneDrivePickerModal via `onOpenOneDrive`)
 *
 * Ao guardar, invoca `onUpload(files, { descricao, mirrorToOneDrive })` — o pai
 * trata do upload e do espelhamento para OneDrive.
 */
const AddFotoPCModal = ({
  open,
  onOpenChange,
  onUpload,          // (files: File[], { descricao, mirrorToOneDrive }) => Promise
  onOpenOneDrive,    // () => void (opens OneDrivePickerModal in parent)
  onOpenCamera,      // () => void (opens CameraCaptureModal in parent)
  uploading = false,
  onCancel,
}) => {
  const [files, setFiles] = useState([]);
  const [descricao, setDescricao] = useState('');
  const [mirrorToOneDrive, setMirrorToOneDrive] = useState(true);
  const fileInputRef = useRef(null);

  const reset = () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    await onUpload(files, { descricao, mirrorToOneDrive });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Adicionar Fotografia ao PC</DialogTitle>
          <DialogDescription className="sr-only">Adiciona fotografias ao PC via ficheiro, câmara ou OneDrive.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fontes rápidas: Câmara / OneDrive */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => { handleClose(false); onOpenCamera && onOpenCamera(); }}
              variant="outline"
              className="border-gray-600 text-white hover:bg-gray-800 flex items-center justify-center gap-2 py-6"
              data-testid="pc-foto-camera"
              disabled={uploading}
            >
              <Camera className="w-5 h-5" />
              <span className="text-sm">Câmara</span>
            </Button>
            <Button
              type="button"
              onClick={() => { handleClose(false); onOpenOneDrive && onOpenOneDrive(); }}
              variant="outline"
              className="border-blue-700 text-blue-300 hover:bg-blue-900/30 flex items-center justify-center gap-2 py-6"
              data-testid="pc-foto-onedrive"
              disabled={uploading}
            >
              <Cloud className="w-5 h-5" />
              <span className="text-sm">OneDrive</span>
            </Button>
          </div>

          <div className="text-center text-gray-500 text-xs uppercase tracking-wider">ou</div>

          {/* Ficheiro local */}
          <div>
            <Label htmlFor="foto_pc_file" className="text-gray-300 flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4" /> Escolher ficheiro(s) do dispositivo
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

          {/* OneDrive mirror checkbox */}
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
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-gray-600"
              disabled={uploading}
              data-testid="pc-foto-cancelar"
            >
              Cancelar
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
      </DialogContent>
    </Dialog>
  );
};

export default AddFotoPCModal;

import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Image as ImageIcon, Calendar } from 'lucide-react';

export const FotoUploadModal = ({
  open, onOpenChange, onSubmit, onCancel,
  fotoFile, fotoFiles, onFotoFileChange, fotoDescricao, setFotoDescricao, uploadingFoto
}) => {
  const files = (fotoFiles && fotoFiles.length > 0) ? fotoFiles : (fotoFile ? [fotoFile] : []);
  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white">
          <ImageIcon className="w-5 h-5 text-blue-400" />
          Adicionar Fotografia(s)
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4 mt-4">
        <div>
          <Label htmlFor="foto_file" className="text-gray-300">Selecionar Fotografia(s) *</Label>
          <Input
            id="foto_file" type="file"
            accept="image/*"
            multiple
            onChange={onFotoFileChange}
            className="bg-[#0f0f0f] border-gray-700 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
            required
            data-testid="foto-upload-input"
          />
          <p className="text-xs text-gray-500 mt-1">Formatos aceitos: JPG, PNG, GIF, WEBP, HEIC, HEIF (máximo 25MB por foto). Pode seleccionar várias.</p>
          {files.length > 0 && (
            <p className="text-sm text-green-400 mt-2" data-testid="foto-upload-count">
              {files.length} imagem(ns) seleccionada(s) ({(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>
        {files.length > 0 && (
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-2">Pré-visualização:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative bg-black/40 rounded overflow-hidden aspect-square">
                  <img src={URL.createObjectURL(f)} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label htmlFor="foto_descricao" className="text-gray-300">
            Descrição inicial <span className="text-gray-500 text-xs">(opcional — aplicada a todas; pode editar depois)</span>
          </Label>
          <textarea
            id="foto_descricao" defaultValue={fotoDescricao}
            onBlur={(e) => setFotoDescricao(e.target.value)}
            className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[80px]"
            placeholder="Descrição comum a todas (opcional)..."
          />
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="button" onClick={onCancel} variant="outline" className="flex-1 border-gray-600" disabled={uploadingFoto}>Cancelar</Button>
          <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600" disabled={uploadingFoto} data-testid="foto-upload-submit">
            {uploadingFoto ? <><span className="animate-spin mr-2">...</span>Enviando...</> : <><Plus className="w-4 h-4 mr-1" />Adicionar {files.length > 1 ? `(${files.length})` : ''}</>}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
  );
};

export const FotoEditModal = ({
  open, onOpenChange, selectedFoto, editFotoDescricao, setEditFotoDescricao,
  editFotoData, setEditFotoData, onSave, onCancel, apiUrl
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white">
          <Edit className="w-5 h-5 text-blue-400" />
          Editar Fotografia
        </DialogTitle>
      </DialogHeader>
      {selectedFoto && (
        <div className="space-y-4 mt-4">
          <div className="bg-black/30 rounded-lg p-3">
            <img src={`${apiUrl}${selectedFoto.foto_url}`} alt={selectedFoto.descricao || 'Fotografia'} className="w-full max-h-48 object-contain rounded" />
          </div>
          <div>
            <Label className="text-gray-300 flex items-center gap-2"><Calendar className="w-4 h-4" />Data da Fotografia</Label>
            <Input type="datetime-local" value={editFotoData} onChange={(e) => setEditFotoData(e.target.value)} className="bg-[#0f0f0f] border-gray-700 text-white mt-1" data-testid="edit-foto-data" />
          </div>
          <div>
            <Label className="text-gray-300">Descrição / Observações</Label>
            <textarea value={editFotoDescricao} onChange={(e) => setEditFotoDescricao(e.target.value)} className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px] mt-1" placeholder="Descreva o componente ou situação na fotografia..." data-testid="edit-foto-descricao" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={onCancel} variant="outline" className="flex-1 border-gray-600">Cancelar</Button>
            <Button onClick={onSave} className="flex-1 bg-blue-500 hover:bg-blue-600" data-testid="save-foto-descricao">Guardar</Button>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export const FotoPreviewModal = ({ open, onOpenChange, selectedFotoUrl }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl p-2">
      {selectedFotoUrl && (
        <img src={selectedFotoUrl} alt="Fotografia" className="w-full max-h-[70vh] object-contain rounded" data-testid="foto-preview-image" />
      )}
    </DialogContent>
  </Dialog>
);

// Modal para adicionar/editar descrições em lote após multi-upload.
// Mostra um card por foto (thumbnail + textarea) e um botão "Guardar todas".
// Suporta arrastar cards (HTML5 native DnD) para reordenar; a nova ordem é
// enviada ao backend via `PUT /fotografias/reorder`.
export const FotoBulkEditModal = ({
  open, onOpenChange, fotos, onDescricaoChange, onReorder, onSave, onCancel, apiUrl, saving,
}) => {
  // dragIndex mantém o índice do card que está a ser arrastado no momento.
  // hoverIndex é o slot alvo para dar feedback visual antes do drop.
  const dragIndex = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const handleDragStart = (idx) => (e) => {
    dragIndex.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Necessário para Firefox iniciar o drag
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* noop */ }
  };
  const handleDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverIndex !== idx) setHoverIndex(idx);
  };
  const handleDragLeave = () => {
    setHoverIndex(null);
  };
  const handleDrop = (dropIdx) => (e) => {
    e.preventDefault();
    const from = dragIndex.current;
    dragIndex.current = null;
    setHoverIndex(null);
    if (from === null || from === undefined || from === dropIdx) return;
    if (typeof onReorder === 'function') onReorder(from, dropIdx);
  };
  const handleDragEnd = () => {
    dragIndex.current = null;
    setHoverIndex(null);
  };

  // Setas ↑/↓ como fallback (mobile / acessibilidade)
  const move = (idx, direction) => {
    const target = idx + direction;
    if (target < 0 || target >= (fotos || []).length) return;
    if (typeof onReorder === 'function') onReorder(idx, target);
  };

  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white">
          <Edit className="w-5 h-5 text-blue-400" />
          Descrições das Fotografias ({fotos?.length || 0})
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-gray-400 mt-2">
        Adicione uma descrição para cada foto. <span className="text-blue-300">Arraste os cards</span> ou use as setas <span className="text-blue-300">↑ ↓</span> para reordenar — esta é a ordem em que aparecerão no PDF.
      </p>
      <div className="space-y-3 mt-4">
        {(fotos || []).map((foto, idx) => (
          <div
            key={foto.id}
            draggable
            onDragStart={handleDragStart(idx)}
            onDragOver={handleDragOver(idx)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop(idx)}
            onDragEnd={handleDragEnd}
            className={`bg-[#0f0f0f] border rounded-lg p-3 flex flex-col sm:flex-row gap-3 transition-colors ${
              hoverIndex === idx ? 'border-blue-400 bg-blue-900/10' : 'border-gray-700'
            }`}
            data-testid={`bulk-foto-card-${idx}`}
          >
            <div className="flex items-center justify-center sm:flex-col gap-2 text-gray-400">
              <span
                className="cursor-grab active:cursor-grabbing select-none px-2 py-1 rounded hover:bg-gray-800 text-lg leading-none"
                title="Arrastar para reordenar"
                aria-label="Drag handle"
              >
                ⋮⋮
              </span>
              <div className="flex sm:flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Mover para cima"
                  data-testid={`bulk-foto-up-${idx}`}
                >↑</button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === (fotos.length - 1)}
                  className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Mover para baixo"
                  data-testid={`bulk-foto-down-${idx}`}
                >↓</button>
              </div>
            </div>
            <div className="sm:w-40 flex-shrink-0">
              <img
                src={`${apiUrl}${foto.foto_url}${foto.foto_url.includes('?') ? '&' : '?'}thumb=true`}
                alt={`Foto ${idx + 1}`}
                className="w-full h-32 sm:h-40 object-cover rounded"
                onError={(e) => { e.currentTarget.src = `${apiUrl}${foto.foto_url}`; }}
              />
              <p className="text-xs text-gray-500 mt-1 text-center">Posição {idx + 1}</p>
            </div>
            <div className="flex-1">
              <Label className="text-gray-300 text-sm">Descrição / Observações</Label>
              <textarea
                value={foto.descricao || ''}
                onChange={(e) => onDescricaoChange(foto.id, e.target.value)}
                className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-md p-3 min-h-[100px] mt-1"
                placeholder="Descreva o componente ou situação na fotografia..."
                data-testid={`bulk-foto-descricao-${idx}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-4 sticky bottom-0 bg-[#1a1a1a] pb-2">
        <Button onClick={onCancel} variant="outline" className="flex-1 border-gray-600" disabled={saving}>
          Fechar sem guardar
        </Button>
        <Button onClick={onSave} className="flex-1 bg-blue-500 hover:bg-blue-600" disabled={saving} data-testid="bulk-foto-save">
          {saving ? 'A guardar...' : 'Guardar todas'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
  );
};

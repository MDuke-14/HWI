import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Image as ImageIcon, Calendar } from 'lucide-react';

export const FotoUploadModal = ({
  open, onOpenChange, onSubmit, onCancel,
  fotoFile, onFotoFileChange, fotoDescricao, setFotoDescricao, uploadingFoto
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white">
          <ImageIcon className="w-5 h-5 text-blue-400" />
          Adicionar Fotografia
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4 mt-4">
        <div>
          <Label htmlFor="foto_file" className="text-gray-300">Selecionar Fotografia *</Label>
          <Input
            id="foto_file" type="file"
            accept="image/*"
            onChange={onFotoFileChange}
            className="bg-[#0f0f0f] border-gray-700 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
            required
            data-testid="foto-upload-input"
          />
          <p className="text-xs text-gray-500 mt-1">Formatos aceitos: JPG, PNG, GIF, WEBP, HEIC, HEIF (máximo 10MB)</p>
          {fotoFile && (
            <p className="text-sm text-green-400 mt-2">
              {fotoFile.name} ({(fotoFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>
        {fotoFile && (
          <div className="bg-black/30 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-2">Pré-visualização:</p>
            <img src={URL.createObjectURL(fotoFile)} alt="Preview" className="w-full max-h-64 object-contain rounded" />
          </div>
        )}
        <div>
          <Label htmlFor="foto_descricao" className="text-gray-300">
            Descrição / Observações <span className="text-gray-500 text-xs">(opcional)</span>
          </Label>
          <textarea
            id="foto_descricao" defaultValue={fotoDescricao}
            onBlur={(e) => setFotoDescricao(e.target.value)}
            className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
            placeholder="Descreva o componente ou situação na fotografia..."
          />
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="button" onClick={onCancel} variant="outline" className="flex-1 border-gray-600" disabled={uploadingFoto}>Cancelar</Button>
          <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600" disabled={uploadingFoto}>
            {uploadingFoto ? <><span className="animate-spin mr-2">...</span>Enviando...</> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

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

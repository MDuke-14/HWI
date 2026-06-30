import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal para adicionar fotografia ao Picking de Compras (PC).
 */
const AddFotoPCModal = ({
  open,
  onOpenChange,
  onSubmit,
  onFileChange,
  descricao,
  setDescricao,
  uploading,
  onCancel,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Adicionar Fotografia ao PC</DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="foto_pc_file" className="text-gray-300">Selecionar Imagem</Label>
            <Input
              id="foto_pc_file"
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              required
              data-testid="pc-foto-file"
            />
          </div>

          <div>
            <Label htmlFor="foto_pc_descricao" className="text-gray-300">Descrição</Label>
            <Input
              id="foto_pc_descricao"
              defaultValue={descricao}
              onBlur={(e) => setDescricao(e.target.value)}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: Vista frontal do equipamento"
              data-testid="pc-foto-descricao"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onCancel}
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
              disabled={uploading}
              data-testid="pc-foto-adicionar"
            >
              {uploading ? 'Enviando...' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddFotoPCModal;

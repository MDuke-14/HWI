import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal para editar material do Picking de Compras (PC).
 */
const EditMaterialPCModal = ({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Editar Material</DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-300">Descrição</Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              placeholder="Descrição do material"
              data-testid="pc-edit-material-descricao"
            />
          </div>
          <div>
            <Label className="text-gray-300">Quantidade</Label>
            <Input
              type="number"
              min="1"
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: parseInt(e.target.value) || 1 })}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              data-testid="pc-edit-material-quantidade"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 border-gray-600"
              data-testid="pc-edit-material-cancelar"
            >
              Cancelar
            </Button>
            <Button
              onClick={onSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              data-testid="pc-edit-material-guardar"
            >
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMaterialPCModal;

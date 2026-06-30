import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal de confirmação para eliminação de cliente (soft delete).
 */
const DeleteClienteModal = ({
  open,
  onOpenChange,
  cliente,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <Trash2 className="w-5 h-5" />
            Confirmar Eliminação
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>

        {cliente && (
          <div className="space-y-4 mt-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-white mb-2">
                Tem certeza que deseja eliminar este cliente?
              </p>
              <div className="bg-[#0f0f0f] p-3 rounded mt-3">
                <p className="text-white font-semibold">{cliente.nome}</p>
                {cliente.nif && (
                  <p className="text-gray-400 text-sm">NIF: {cliente.nif}</p>
                )}
                {cliente.email && (
                  <p className="text-gray-400 text-sm">{cliente.email}</p>
                )}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-amber-200 text-sm">
                <strong>⚠️ Atenção:</strong> Esta ação não pode ser desfeita. O cliente será marcado como inativo.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={onCancel}
                variant="outline"
                className="flex-1 border-gray-600"
                data-testid="delete-cliente-cancelar"
              >
                Cancelar
              </Button>
              <Button
                onClick={onConfirm}
                className="flex-1 bg-red-500 hover:bg-red-600"
                data-testid="delete-cliente-confirmar"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar Cliente
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeleteClienteModal;

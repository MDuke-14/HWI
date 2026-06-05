import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal de confirmação para eliminar uma OT/FS.
 * Aviso destrutivo permanente.
 */
const DeleteRelatorioModal = ({
  open,
  onOpenChange,
  relatorioToDelete,
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
          <DialogDescription className="sr-only">
            Confirmação de eliminação permanente da ordem de trabalho.
          </DialogDescription>
        </DialogHeader>

        {relatorioToDelete && (
          <div className="space-y-4 mt-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-white mb-2">Tem certeza que deseja eliminar esta OT?</p>
              <div className="bg-[#0f0f0f] p-3 rounded mt-3">
                <p className="text-white font-semibold">
                  Relatório #{relatorioToDelete.numero_assistencia}
                </p>
                <p className="text-gray-400 text-sm">{relatorioToDelete.cliente_nome}</p>
                <p className="text-gray-400 text-sm">
                  {new Date(relatorioToDelete.data_servico).toLocaleDateString('pt-PT')}
                </p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-amber-200 text-sm">
                <strong>Atenção:</strong> Esta ação não pode ser desfeita. A FS e todos os dados
                associados (técnicos, fotos, materiais) serão permanentemente eliminados.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={onCancel}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button onClick={onConfirm} className="flex-1 bg-red-500 hover:bg-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar OT
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeleteRelatorioModal;

import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getTechnicalReportStatusColor,
  getTechnicalReportStatusLabel,
} from './utils/labels';

/**
 * Modal para alterar o status de uma FS/OT.
 * Apenas admins podem mudar para 'facturado'.
 */
const StatusChangeModal = ({
  open,
  onOpenChange,
  selectedStatusRelatorio,
  onChangeStatus,
  onCancel,
  isAdmin,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-blue-400" />
            Alterar Status da OT
          </DialogTitle>
        </DialogHeader>

        {selectedStatusRelatorio && (
          <div className="space-y-4 mt-4">
            <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
              <p className="text-white font-semibold mb-2">
                FS #{selectedStatusRelatorio.numero_assistencia}
              </p>
              <p className="text-gray-400 text-sm">{selectedStatusRelatorio.cliente_nome}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-500 text-xs">Status atual:</span>
                <span
                  className={`text-xs px-2 py-1 rounded ${getTechnicalReportStatusColor(
                    selectedStatusRelatorio.status
                  )}`}
                >
                  {getTechnicalReportStatusLabel(selectedStatusRelatorio.status)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-gray-300 text-sm mb-3">Selecione o novo status:</p>

              <Button
                onClick={() => onChangeStatus('orcamento')}
                className="w-full justify-start bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <span>Orçamento</span>
                </div>
              </Button>

              <Button
                onClick={() => onChangeStatus('em_execucao')}
                className="w-full justify-start bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  <span>Em Execução</span>
                </div>
              </Button>

              <Button
                onClick={() => onChangeStatus('concluido')}
                className="w-full justify-start bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span>Concluído</span>
                </div>
              </Button>

              {isAdmin && (
                <Button
                  onClick={() => onChangeStatus('facturado')}
                  className="w-full justify-start bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                    <span>Facturado</span>
                    <span className="ml-auto text-xs bg-purple-400/20 px-2 py-0.5 rounded">Admin</span>
                  </div>
                </Button>
              )}
            </div>

            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="w-full border-gray-600 mt-4"
            >
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StatusChangeModal;

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal de confirmação para cancelar uma PC.
 * Exige motivo (obrigatório) e chama onConfirm(motivo) quando o utilizador confirma.
 */
const CancelarPCModal = ({ open, onOpenChange, pc, onConfirm, sending }) => {
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (open) setMotivo('');
  }, [open]);

  const canSubmit = motivo.trim().length > 0 && !sending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-red-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Cancelar Pedido de Cotação
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            PC {pc?.numero_pc} · Esta ação muda o estado para <b className="text-red-300">Cancelado</b> e regista o motivo no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-gray-300">
              Motivo do cancelamento <span className="text-red-400">*</span>
            </Label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Ex.: cliente desistiu, material fora de stock, PC duplicado…"
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1 text-sm"
              data-testid="pc-cancelar-motivo"
              autoFocus
            />
            <p className="text-[11px] text-gray-500 mt-1">{motivo.length}/500</p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300"
              onClick={() => onOpenChange(false)}
              disabled={sending}
              data-testid="pc-cancelar-voltar"
            >
              <X className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => onConfirm(motivo.trim())}
              disabled={!canSubmit}
              data-testid="pc-cancelar-confirmar"
            >
              {sending ? 'A cancelar…' : 'Cancelar PC'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CancelarPCModal;

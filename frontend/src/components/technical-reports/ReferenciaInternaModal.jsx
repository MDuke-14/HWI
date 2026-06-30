import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal para introduzir referência interna do cliente para uma FS.
 */
const ReferenciaInternaModal = ({
  open,
  value,
  setValue,
  onIgnorar,
  onGravar,
}) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onIgnorar(); }}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md" data-testid="modal-ref-interna">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">
            Referência Interna do Cliente
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-gray-400 text-sm">
            Existe referência interna do cliente para esta FS?
          </p>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-[#0f0f0f] border-gray-700 text-white"
            placeholder="Nº encomenda, referência interna, etc."
            autoFocus
            data-testid="input-ref-interna"
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300"
              onClick={onIgnorar}
              data-testid="btn-ignorar-ref"
            >
              Ignorar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-blue-500 hover:bg-blue-600"
              onClick={onGravar}
              disabled={!value.trim()}
              data-testid="btn-gravar-ref"
            >
              Gravar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferenciaInternaModal;

import React from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const DEFAULT_PC_EMAILS = ['geral@hwi.pt', 'pedro.duarte@hwi.pt', 'miguel.moreira@hwi.pt'];

/**
 * Modal para envio de PDF do Picking de Compras (PC) por email.
 */
const EmailPCModal = ({
  open,
  onOpenChange,
  onSend,
  sending,
  emails = DEFAULT_PC_EMAILS,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Enviar PDF por Email</DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-300">Selecione o email de destino:</p>
          <div className="space-y-2">
            {emails.map((email) => (
              <Button
                key={email}
                onClick={() => onSend(email)}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={sending}
                data-testid={`pc-email-send-${email}`}
              >
                <Mail className="w-4 h-4 mr-2" />
                {email}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPCModal;

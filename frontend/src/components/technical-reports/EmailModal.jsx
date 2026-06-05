import React from 'react';
import { Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal de envio de FS por email.
 * Permite selecionar emails registados no cliente + adicionar emails extra.
 */
const EmailModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  emailsCliente,
  toggleEmailSelection,
  emailsAdicionais,
  setEmailsAdicionais,
  sendingEmail,
  onSend,
}) => {
  const selectedCount = emailsCliente.filter((e) => e.selected).length;
  const additionalCount = emailsAdicionais.trim()
    ? emailsAdicionais.split(/[;,]/).filter((e) => e.trim()).length
    : 0;
  const totalRecipients = selectedCount + additionalCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Mail className="w-5 h-5 text-purple-400" />
            Enviar FS Por Email
          </DialogTitle>
          <DialogDescription className="sr-only">
            Selecione os destinatários para envio da Folha de Serviço por email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Emails do Cliente */}
          <div>
            <Label className="text-gray-300 mb-2 block">Destinatários</Label>
            {emailsCliente.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Nenhum email registado para este cliente</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {emailsCliente.map((item, index) => (
                  <label
                    key={index}
                    data-testid={`email-option-${index}`}
                    className={`flex items-center gap-3 p-3 bg-[#0f0f0f] border rounded-lg cursor-pointer transition ${
                      item.is_hwi
                        ? 'border-amber-600/50 hover:border-amber-400/70'
                        : 'border-gray-700 hover:border-purple-500/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleEmailSelection(index)}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-white">{item.email}</span>
                    {item.is_hwi && (
                      <span className="ml-auto text-[10px] uppercase font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded">
                        HWI · Teste
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Emails Adicionais */}
          <div>
            <Label className="text-gray-300 mb-2 block">
              Emails Adicionais <span className="text-gray-500 text-xs">(separados por vírgula)</span>
            </Label>
            <Input
              value={emailsAdicionais}
              onChange={(e) => setEmailsAdicionais(e.target.value)}
              placeholder="email1@exemplo.com, email2@exemplo.com"
              className="bg-[#0f0f0f] border-gray-700 text-white"
            />
          </div>

          {/* Resumo */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
            <p className="text-sm text-purple-300">
              <strong>FS #{selectedRelatorio?.numero_assistencia}</strong> será enviada para {totalRecipients} email(s)
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 border-gray-600"
              disabled={sendingEmail}
            >
              Cancelar
            </Button>
            <Button
              onClick={onSend}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={sendingEmail || (selectedCount === 0 && !emailsAdicionais.trim())}
              data-testid="confirmar-enviar-email"
            >
              {sendingEmail ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  A enviar...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailModal;

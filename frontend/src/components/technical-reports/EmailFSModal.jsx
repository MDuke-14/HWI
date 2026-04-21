import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Send, FileText, Globe } from 'lucide-react';

const EmailFSModal = ({
  open, onOpenChange, selectedRelatorio,
  emailDestinatario, setEmailDestinatario,
  emailCC, setEmailCC,
  idiomaEmail, setIdiomaEmail,
  docsSelecionados, setDocsSelecionados,
  handleEnviarEmail, handleSendEmail, handleConfirmSendEmail, sendingEmail,
  relatoriosAssistencia, equipamentosOT,
  showFolhaHorasConfirm, setShowFolhaHorasConfirm,
  emailsAdicionais, setEmailsAdicionais
}) => {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Mail className="w-5 h-5 text-purple-400" />
              Enviar FS Por Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Emails do Cliente */}
            <div>
              <Label className="text-gray-300 mb-2 block">Emails do Cliente</Label>
              {emailsCliente.length === 0 ? (
                <p className="text-gray-500 text-sm italic">Nenhum email registado para este cliente</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {emailsCliente.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-3 p-3 bg-[#0f0f0f] border border-gray-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleEmailSelection(index)}
                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-white">{item.email}</span>
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
                <strong>FS #{selectedRelatorio?.numero_assistencia}</strong> será enviada para {emailsCliente.filter(e => e.selected).length + (emailsAdicionais.trim() ? emailsAdicionais.split(/[;,]/).filter(e => e.trim()).length : 0)} email(s)
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
                onClick={handleSendEmail}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                disabled={sendingEmail || (emailsCliente.filter(e => e.selected).length === 0 && !emailsAdicionais.trim())}
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

      {/* Popup 2 — Seleção de Documentos a Enviar */}
      <Dialog open={showFolhaHorasConfirm} onOpenChange={(open) => {
        if (!open) setShowFolhaHorasConfirm(false);
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-amber-400" />
              Documentos a Enviar
            </DialogTitle>
          </DialogHeader>
          <p className="text-gray-400 text-sm">Selecione os documentos que pretende anexar ao email:</p>

          <div className="space-y-2 mt-3">
            {/* Relatório PDF */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                docsSelecionados.relatorio ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
              }`}
              data-testid="doc-select-relatorio"
            >
              <input
                type="checkbox"
                checked={docsSelecionados.relatorio || false}
                onChange={(e) => setDocsSelecionados({ ...docsSelecionados, relatorio: e.target.checked })}
                className="accent-blue-500 w-4 h-4"
              />
              <div>
                <span className="text-white text-sm font-medium">PDF do Relatório</span>
                <p className="text-gray-500 text-xs">Relatório técnico da FS</p>
              </div>
            </label>

            {/* Folha de Horas */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                docsSelecionados.folha_horas ? 'border-amber-500 bg-amber-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
              }`}
              data-testid="doc-select-folha-horas"
            >
              <input
                type="checkbox"
                checked={docsSelecionados.folha_horas || false}
                onChange={(e) => setDocsSelecionados({ ...docsSelecionados, folha_horas: e.target.checked })}
                className="accent-amber-500 w-4 h-4"
              />
              <div>
                <span className="text-white text-sm font-medium">Folha de Horas</span>
                <p className="text-gray-500 text-xs">Registo de mão de obra e custos</p>
              </div>
            </label>

            {/* PCs */}
            {pedidosCotacao && pedidosCotacao.length > 0 && (
              <>
                <div className="border-t border-gray-800 pt-2 mt-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Pedidos de Cotação</p>
                </div>
                {pedidosCotacao.map((pc) => (
                  <label
                    key={pc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      docsSelecionados[`pc:${pc.id}`] ? 'border-yellow-500 bg-yellow-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
                    }`}
                    data-testid={`doc-select-pc-${pc.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={docsSelecionados[`pc:${pc.id}`] || false}
                      onChange={(e) => setDocsSelecionados({ ...docsSelecionados, [`pc:${pc.id}`]: e.target.checked })}
                      className="accent-yellow-500 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium">{pc.numero_pc}</span>
                      {pc.primeiro_material && (
                        <p className="text-gray-500 text-xs truncate">{pc.primeiro_material}</p>
                      )}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                      pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                      'bg-blue-600/20 text-blue-400'
                    }`}>{pc.status}</span>
                  </label>
                ))}
              </>
            )}
          </div>


          {/* Seleção de Idioma do Email */}
          <div className="border-t border-gray-800 pt-3 mt-1">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Idioma do Email</p>
            <div className="flex gap-2">
              {[
                { value: 'pt', label: 'Português', flag: '🇵🇹' },
                { value: 'es', label: 'Español', flag: '🇪🇸' },
                { value: 'en', label: 'English', flag: '🇬🇧' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setIdiomaEmail(lang.value)}
                  data-testid={`lang-select-${lang.value}`}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm transition-all ${
                    idiomaEmail === lang.value
                      ? 'border-green-500 bg-green-600/10 text-white font-medium'
                      : 'border-gray-700 bg-[#0f0f0f] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => setShowFolhaHorasConfirm(false)}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:text-white"
              data-testid="doc-select-cancelar"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSendEmail}
              disabled={!Object.values(docsSelecionados).some(v => v)}
              className="flex-1 bg-green-600 hover:bg-green-700"
              data-testid="doc-select-enviar"
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar ({Object.values(docsSelecionados).filter(v => v).length} doc{Object.values(docsSelecionados).filter(v => v).length !== 1 ? 's' : ''})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmailFSModal;

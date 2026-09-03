import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, Paperclip, Mail, X, Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MANUAL_KEY = '__manual__';

/**
 * Modal para envio de Pedido de Cotação.
 *
 * Modos:
 *  - Global (initialMaterialIds vazio): multi-select de fornecedores + lista
 *    de emails manuais + checkbox "Anexar FS.pdf". Envia 1 email por
 *    destinatário e acrescenta entradas em `cotacoes_solicitadas[]` de cada
 *    material selecionado (não sobrescreve o fornecedor "vencedor").
 *  - Individual (1 material via botão da linha): 1 fornecedor OU 1 email
 *    manual — sobrescreve fornecedor do material (comportamento Fase 4).
 */
const EnviarPedidoCotacaoModal = ({
  open,
  onOpenChange,
  pc,
  initialMaterialIds = [],
  documentos = [],
  onSent,
}) => {
  const [fornecedores, setFornecedores] = useState([]);
  const [loadingForn, setLoadingForn] = useState(false);

  // --- Individual (Fase 4) ---
  const [fornecedorSelected, setFornecedorSelected] = useState('');
  const [emailManual, setEmailManual] = useState('');
  const [nomeManual, setNomeManual] = useState('');

  // --- Global multi (Fase 5) ---
  const [multiFornIds, setMultiFornIds] = useState(new Set());
  const [multiManuais, setMultiManuais] = useState([]); // [{email,nome}]
  const [manualDraftEmail, setManualDraftEmail] = useState('');
  const [manualDraftNome, setManualDraftNome] = useState('');
  const [incluirFsPdf, setIncluirFsPdf] = useState(false);

  // Comuns
  const [ccStr, setCcStr] = useState('');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [selectedMats, setSelectedMats] = useState(new Set());
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [sending, setSending] = useState(false);

  const materiais = pc?.materiais || [];
  const isGlobal = initialMaterialIds.length === 0;

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;

    const preSel = new Set(
      isGlobal ? materiais.map((m) => m.id) : initialMaterialIds
    );
    setSelectedMats(preSel);

    setAssunto(`Pedido de Cotação - PC ${pc?.numero_pc || ''}`.trim());
    setMensagem('');
    setCcStr('');
    setSelectedDocs(new Set());

    setFornecedorSelected('');
    setEmailManual('');
    setNomeManual('');

    setMultiFornIds(new Set());
    setMultiManuais([]);
    setManualDraftEmail('');
    setManualDraftNome('');
    setIncluirFsPdf(false);

    setLoadingForn(true);
    axios
      .get(`${API}/fornecedores?ativo=true`)
      .then((r) => setFornecedores(r.data || []))
      .catch(() => setFornecedores([]))
      .finally(() => setLoadingForn(false));
  }, [open, pc?.id]);

  const fornecedorObj = useMemo(
    () => fornecedores.find((f) => f.id === fornecedorSelected),
    [fornecedores, fornecedorSelected]
  );

  const toggleMat = (id) => {
    setSelectedMats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDoc = (id) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMultiForn = (id) => {
    setMultiFornIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addManualEmail = () => {
    const em = manualDraftEmail.trim();
    if (!em) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error('Email inválido');
      return;
    }
    if (multiManuais.some((m) => m.email.toLowerCase() === em.toLowerCase())) {
      toast.error('Email já adicionado');
      return;
    }
    setMultiManuais((prev) => [...prev, { email: em, nome: manualDraftNome.trim() || undefined }]);
    setManualDraftEmail('');
    setManualDraftNome('');
  };

  const removeManualEmail = (email) => {
    setMultiManuais((prev) => prev.filter((m) => m.email !== email));
  };

  const totalDestinatariosMulti = multiFornIds.size + multiManuais.length;

  const canSend = () => {
    if (selectedMats.size === 0) return false;
    if (isGlobal) {
      return totalDestinatariosMulti > 0;
    }
    // Individual
    if (fornecedorSelected === MANUAL_KEY) return !!emailManual.trim();
    return !!fornecedorSelected;
  };

  const handleSend = async () => {
    if (!canSend()) {
      toast.error('Selecciona pelo menos um material e um destinatário');
      return;
    }
    setSending(true);
    try {
      const allSelected = selectedMats.size === materiais.length && materiais.length > 0;
      const sendGlobalPayload = isGlobal && allSelected;

      const payload = {
        material_ids: sendGlobalPayload ? [] : Array.from(selectedMats),
        // Modo explícito — evita que o backend confunda "global com subset"
        // com "individual" só por `material_ids != []`.
        envio_modo: isGlobal ? 'global' : 'individual',
        cc: ccStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        assunto: assunto.trim() || undefined,
        mensagem: mensagem.trim() || undefined,
        anexos_doc_ids: Array.from(selectedDocs),
      };

      if (isGlobal) {
        payload.fornecedor_ids = Array.from(multiFornIds);
        payload.emails_manuais = multiManuais;
        payload.incluir_fs_pdf = incluirFsPdf;
      } else {
        if (fornecedorSelected === MANUAL_KEY) {
          payload.fornecedor_email_custom = emailManual.trim();
          if (nomeManual.trim()) payload.fornecedor_nome_custom = nomeManual.trim();
        } else {
          payload.fornecedor_id = fornecedorSelected;
        }
      }

      const r = await axios.post(
        `${API}/pedidos-cotacao/${pc.id}/enviar-cotacao`,
        payload
      );
      const data = r.data || {};
      if (data.falhas > 0) {
        toast.warning(data.message || 'Enviado com falhas parciais');
      } else {
        toast.success(data.message || 'Pedido enviado');
      }
      onOpenChange(false);
      onSent && onSent();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao enviar pedido');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-yellow-400" />
            {isGlobal ? 'Enviar Pedido de Cotação (Global)' : 'Enviar Pedido de Cotação'}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            PC {pc?.numero_pc} · FS #{pc?.numero_ot || pc?.ot_numero || '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* =============================
              MODO GLOBAL — multi fornecedor
              ============================= */}
          {isGlobal ? (
            <div className="space-y-3">
              {/* Fornecedores DB (multi-select) */}
              <div>
                <Label className="text-gray-300">
                  Fornecedores da BD ({multiFornIds.size} selecionado(s))
                </Label>
                <div
                  className="mt-1 max-h-40 overflow-y-auto border border-gray-700 rounded-md divide-y divide-gray-800"
                  data-testid="pc-envio-forn-multi-list"
                >
                  {loadingForn && (
                    <p className="p-3 text-sm text-gray-500 italic">A carregar…</p>
                  )}
                  {!loadingForn && fornecedores.length === 0 && (
                    <p className="p-3 text-sm text-gray-500 italic">
                      Sem fornecedores ativos. Adiciona um email manual.
                    </p>
                  )}
                  {fornecedores.map((f) => {
                    const hasEmail = !!f.email;
                    return (
                      <label
                        key={f.id}
                        className={`flex items-center gap-2 p-2 text-sm ${
                          hasEmail
                            ? 'hover:bg-white/[0.03] cursor-pointer'
                            : 'opacity-50 cursor-not-allowed'
                        }`}
                        data-testid={`pc-envio-forn-row-${f.id}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!hasEmail}
                          checked={multiFornIds.has(f.id)}
                          onChange={() => hasEmail && toggleMultiForn(f.id)}
                          className="accent-yellow-400"
                          data-testid={`pc-envio-forn-cb-${f.id}`}
                        />
                        <span className="text-white truncate flex-1">{f.nome}</span>
                        <span className="text-xs text-gray-500 truncate">
                          {f.email || '(sem email)'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Emails manuais */}
              <div>
                <Label className="text-gray-300">
                  Emails manuais ({multiManuais.length})
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mt-1">
                  <Input
                    value={manualDraftEmail}
                    onChange={(e) => setManualDraftEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualEmail();
                      }
                    }}
                    placeholder="email@fornecedor.com"
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    data-testid="pc-envio-manual-email"
                  />
                  <Input
                    value={manualDraftNome}
                    onChange={(e) => setManualDraftNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualEmail();
                      }
                    }}
                    placeholder="Nome (opcional)"
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    data-testid="pc-envio-manual-nome"
                  />
                  <Button
                    type="button"
                    onClick={addManualEmail}
                    variant="outline"
                    className="border-gray-600 text-blue-300 hover:bg-blue-500/10"
                    data-testid="pc-envio-manual-add"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {multiManuais.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {multiManuais.map((m) => (
                      <div
                        key={m.email}
                        className="flex items-center gap-2 p-1.5 bg-[#0a0a0a] border border-gray-800 rounded text-sm"
                        data-testid={`pc-envio-manual-item-${m.email}`}
                      >
                        <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className="text-white truncate flex-1">
                          {m.nome ? `${m.nome} <${m.email}>` : m.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeManualEmail(m.email)}
                          className="text-red-400 hover:text-red-300 p-1"
                          data-testid={`pc-envio-manual-remove-${m.email}`}
                          aria-label="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Anexar FS.pdf */}
              <label
                className="flex items-center gap-2 p-2 bg-[#0f0f0f] border border-gray-700 rounded-md cursor-pointer hover:bg-white/[0.02]"
                data-testid="pc-envio-fs-pdf-toggle"
              >
                <input
                  type="checkbox"
                  checked={incluirFsPdf}
                  onChange={(e) => setIncluirFsPdf(e.target.checked)}
                  className="accent-yellow-400"
                  data-testid="pc-envio-fs-pdf-cb"
                />
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-white text-sm">
                  Anexar automaticamente o PDF da FS
                </span>
              </label>
            </div>
          ) : (
            /* =============================
               MODO INDIVIDUAL (Fase 4)
               ============================= */
            <div>
              <Label className="text-gray-300">Fornecedor</Label>
              <select
                value={fornecedorSelected}
                onChange={(e) => setFornecedorSelected(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1"
                data-testid="pc-envio-fornecedor-select"
              >
                <option value="">
                  {loadingForn ? 'A carregar…' : 'Selecionar fornecedor…'}
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id} disabled={!f.email}>
                    {f.nome}
                    {f.email ? ` · ${f.email}` : ' (sem email)'}
                  </option>
                ))}
                <option value={MANUAL_KEY}>✉️ E-Mail manual…</option>
              </select>

              {fornecedorSelected === MANUAL_KEY && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <Input
                    value={emailManual}
                    onChange={(e) => setEmailManual(e.target.value)}
                    placeholder="email@fornecedor.com"
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    data-testid="pc-envio-email-manual"
                  />
                  <Input
                    value={nomeManual}
                    onChange={(e) => setNomeManual(e.target.value)}
                    placeholder="Nome (opcional)"
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    data-testid="pc-envio-nome-manual"
                  />
                </div>
              )}

              {fornecedorObj && (
                <p className="text-xs text-gray-500 mt-1">
                  Destinatário: {fornecedorObj.email}
                </p>
              )}
            </div>
          )}

          {/* CC */}
          <div>
            <Label className="text-gray-300">CC (opcional)</Label>
            <Input
              value={ccStr}
              onChange={(e) => setCcStr(e.target.value)}
              placeholder="email1@x.com, email2@y.com"
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              data-testid="pc-envio-cc"
            />
          </div>

          {/* Assunto */}
          <div>
            <Label className="text-gray-300">Assunto</Label>
            <Input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              data-testid="pc-envio-assunto"
            />
          </div>

          {/* Mensagem */}
          <div>
            <Label className="text-gray-300">Mensagem</Label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder='Deixe vazio para usar: "Solicito cotação para os seguintes materiais: [lista]"'
              rows={5}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1 text-sm"
              data-testid="pc-envio-mensagem"
            />
          </div>

          {/* Materiais */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">
                Materiais ({selectedMats.size}/{materiais.length})
              </Label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedMats(new Set(materiais.map((m) => m.id)))}
                  className="text-blue-400 hover:underline"
                  data-testid="pc-envio-mats-selecionar-todos"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMats(new Set())}
                  className="text-gray-400 hover:underline"
                  data-testid="pc-envio-mats-limpar"
                >
                  Nenhum
                </button>
              </div>
            </div>
            <div className="mt-1 max-h-52 overflow-y-auto border border-gray-700 rounded-md divide-y divide-gray-800">
              {materiais.length === 0 && (
                <p className="p-3 text-sm text-gray-500 italic">
                  Nenhum material nesta PC.
                </p>
              )}
              {materiais.map((m) => {
                return (
                  <label
                    key={m.id}
                    className="flex items-start gap-2 p-2 hover:bg-white/[0.03] cursor-pointer"
                    data-testid={`pc-envio-mat-row-${m.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMats.has(m.id)}
                      onChange={() => toggleMat(m.id)}
                      className="mt-1 accent-yellow-400"
                      data-testid={`pc-envio-mat-cb-${m.id}`}
                    />
                    <div className="flex-1 text-sm">
                      <div className="text-white">
                        {m.quantidade} {m.unidade || 'Un'} · {m.descricao}
                      </div>
                      {(m.codigo || m.posicao) && (
                        <div className="text-xs text-gray-500">
                          {m.codigo ? `Cód: ${m.codigo}` : ''}
                          {m.codigo && m.posicao ? ' · ' : ''}
                          {m.posicao ? `Pos: ${m.posicao}` : ''}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Anexos */}
          {documentos.length > 0 && (
            <div>
              <Label className="text-gray-300 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" /> Anexos da PC ({selectedDocs.size}/{documentos.length})
              </Label>
              <div className="mt-1 max-h-32 overflow-y-auto border border-gray-700 rounded-md divide-y divide-gray-800">
                {documentos.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 p-2 hover:bg-white/[0.03] cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(d.id)}
                      onChange={() => toggleDoc(d.id)}
                      className="accent-yellow-400"
                      data-testid={`pc-envio-doc-cb-${d.id}`}
                    />
                    <span className="text-white truncate">
                      {d.original_name || d.filename}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {d.size ? `${Math.round(d.size / 1024)} KB` : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300"
              onClick={() => onOpenChange(false)}
              disabled={sending}
              data-testid="pc-envio-cancelar"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleSend}
              disabled={sending || !canSend()}
              data-testid="pc-envio-enviar"
            >
              <Mail className="w-4 h-4 mr-1" />
              {sending
                ? 'A enviar…'
                : isGlobal && totalDestinatariosMulti > 1
                ? `Enviar (${totalDestinatariosMulti} destinatários)`
                : 'Enviar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnviarPedidoCotacaoModal;

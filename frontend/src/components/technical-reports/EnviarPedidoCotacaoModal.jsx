import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, Paperclip, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MANUAL_KEY = '__manual__';

/**
 * Modal para envio de Pedido de Cotação por material.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Object} props.pc                 Selected PC (com id, numero_pc, materiais, ...)
 * @param {Array<string>} props.initialMaterialIds  Materiais pré-selecionados (se vazio => todos)
 * @param {Array} props.documentos          Documentos disponíveis para anexar (pc_documentos)
 * @param {Function} props.onSent           Callback após envio bem-sucedido
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
  const [fornecedorSelected, setFornecedorSelected] = useState(''); // id do fornecedor OR MANUAL_KEY
  const [emailManual, setEmailManual] = useState('');
  const [nomeManual, setNomeManual] = useState('');
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

    // Materiais pré-selecionados
    const preSel = new Set(
      isGlobal
        ? materiais.map((m) => m.id)
        : initialMaterialIds
    );
    setSelectedMats(preSel);

    // Assunto padrão
    setAssunto(`Pedido de Cotação - PC ${pc?.numero_pc || ''}`.trim());

    // Mensagem: deixar vazia — backend usa template simples se ficar vazia
    setMensagem('');

    setFornecedorSelected('');
    setEmailManual('');
    setNomeManual('');
    setCcStr('');
    setSelectedDocs(new Set());

    // Carregar fornecedores ativos
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

  const canSend = () => {
    if (selectedMats.size === 0) return false;
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
      // Global só quando o modal foi aberto como global E o utilizador não
      // desmarcou nenhum material (payload vazio == "todos" no backend).
      const sendGlobal = isGlobal && allSelected;
      const payload = {
        material_ids: sendGlobal ? [] : Array.from(selectedMats),
        cc: ccStr
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
        assunto: assunto.trim() || undefined,
        mensagem: mensagem.trim() || undefined,
        anexos_doc_ids: Array.from(selectedDocs),
      };
      if (fornecedorSelected === MANUAL_KEY) {
        payload.fornecedor_email_custom = emailManual.trim();
        if (nomeManual.trim()) payload.fornecedor_nome_custom = nomeManual.trim();
      } else {
        payload.fornecedor_id = fornecedorSelected;
      }

      const r = await axios.post(
        `${API}/pedidos-cotacao/${pc.id}/enviar-cotacao`,
        payload
      );
      toast.success(r.data?.message || 'Pedido enviado');
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
          {/* Fornecedor */}
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
                const jaTemForn = !!(m.fornecedor_nome || m.fornecedor_email);
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
                      {jaTemForn && (
                        <div className="text-[11px] text-amber-400 mt-0.5">
                          ⚠ Já tem fornecedor: {m.fornecedor_nome || m.fornecedor_email}
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
              {sending ? 'A enviar…' : 'Enviar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnviarPedidoCotacaoModal;

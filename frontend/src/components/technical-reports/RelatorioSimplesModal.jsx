import React, { useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import axios from 'axios';
import { toast } from 'sonner';
import {
  FileText, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Plus, Trash2, Download, Save, Loader2, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ----- Toolbar para o editor estilo Word -----
const EditorToolbar = ({ onCommand }) => {
  const btn = 'px-2 py-1 rounded text-gray-700 hover:bg-gray-200 hover:text-gray-900 active:bg-gray-300 transition border border-transparent hover:border-gray-300';
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-300 bg-gray-50 rounded-t">
      <button type="button" className={btn} title="Negrito (Ctrl+B)"
        onMouseDown={(e) => { e.preventDefault(); onCommand('bold'); }}
        data-testid="editor-btn-bold">
        <Bold className="w-4 h-4" />
      </button>
      <button type="button" className={btn} title="Itálico (Ctrl+I)"
        onMouseDown={(e) => { e.preventDefault(); onCommand('italic'); }}
        data-testid="editor-btn-italic">
        <Italic className="w-4 h-4" />
      </button>
      <button type="button" className={btn} title="Sublinhado (Ctrl+U)"
        onMouseDown={(e) => { e.preventDefault(); onCommand('underline'); }}
        data-testid="editor-btn-underline">
        <UnderlineIcon className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <button type="button" className={btn} title="Lista com pontos"
        onMouseDown={(e) => { e.preventDefault(); onCommand('insertUnorderedList'); }}
        data-testid="editor-btn-ul">
        <List className="w-4 h-4" />
      </button>
      <button type="button" className={btn} title="Lista numerada"
        onMouseDown={(e) => { e.preventDefault(); onCommand('insertOrderedList'); }}
        data-testid="editor-btn-ol">
        <ListOrdered className="w-4 h-4" />
      </button>
    </div>
  );
};

// Config DOMPurify — permitir formatação básica de texto (bold/italic/lists),
// bloquear tudo o que possa executar código.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a'],
  ALLOWED_ATTR: ['href', 'style', 'class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

const sanitizeHtml = (html) => DOMPurify.sanitize(html || '', SANITIZE_CONFIG);

// ----- Editor contenteditable controlado -----
const RichTextEditor = ({ value, onChange, placeholder, testid }) => {
  const ref = useRef(null);
  const lastExternal = useRef(null);

  // Atualizar o DOM só quando o valor externo muda (evita reset do cursor)
  useEffect(() => {
    if (!ref.current) return;
    if (value === lastExternal.current) return;
    const safeValue = sanitizeHtml(value);
    if (safeValue === ref.current.innerHTML) {
      lastExternal.current = value;
      return;
    }
    // HTML já sanitizado com DOMPurify em `safeValue`
    ref.current.innerHTML = safeValue;
    lastExternal.current = value;
  }, [value]);

  const handleInput = () => {
    if (ref.current) {
      const html = ref.current.innerHTML;
      lastExternal.current = html;
      onChange(html);
    }
  };

  const exec = (cmd) => {
    document.execCommand(cmd, false, null);
    if (ref.current) {
      ref.current.focus();
      handleInput();
    }
  };

  return (
    <div className="border border-gray-300 rounded bg-white">
      <EditorToolbar onCommand={exec} />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-testid={testid}
        className="p-4 min-h-[180px] focus:outline-none text-gray-800 leading-relaxed prose-rs"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        data-placeholder={placeholder}
      />
      <style>{`
        .prose-rs:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .prose-rs ul { list-style: disc; padding-left: 24px; margin: 6px 0; }
        .prose-rs ol { list-style: decimal; padding-left: 24px; margin: 6px 0; }
        .prose-rs li { margin: 2px 0; }
        .prose-rs p { margin: 4px 0; }
      `}</style>
    </div>
  );
};

// ----- Pré-visualização estilo página A4 -----
const A4Preview = ({ titulo, secoes, clienteNome, fsNumero, equipamentos, incluirEquipamentos, equipamentoIds }) => {
  const equipsToShow = incluirEquipamentos
    ? (equipamentoIds && equipamentoIds.length
        ? equipamentos.filter((e) => equipamentoIds.includes(e.id))
        : equipamentos)
    : [];

  return (
    <div className="bg-gray-200 p-4 overflow-y-auto h-full">
      <div
        className="mx-auto bg-white shadow-lg"
        style={{
          width: '210mm',
          minHeight: '297mm',
          maxWidth: '100%',
          padding: '15mm 18mm',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#222',
        }}
      >
        {/* Header escuro com logo space + título */}
        <div className="flex items-center justify-between -mx-[18mm] -mt-[15mm] px-6 py-4 bg-gray-800 text-white mb-6">
          <div className="text-white text-2xl font-bold tracking-wide" style={{ fontFamily: 'Helvetica, sans-serif' }}>
            RELATÓRIO
            <div className="text-xs font-normal text-gray-300 mt-0.5">FS #{fsNumero || '—'}</div>
          </div>
          <div className="text-xs text-gray-300" style={{ fontFamily: 'Helvetica, sans-serif' }}>
            {new Date().toLocaleDateString('pt-PT')}
          </div>
        </div>

        {/* Cliente */}
        <div className="text-sm text-gray-700 mb-1">
          <strong>Cliente:</strong> {clienteNome || '—'}
        </div>
        <hr className="border-gray-300 my-3" />

        {/* Título */}
        <h1 className="text-center text-2xl font-bold my-5">{titulo || 'Sem título'}</h1>

        {/* Secções */}
        {!secoes?.length && (
          <p className="text-gray-400 italic text-center">(Sem conteúdo)</p>
        )}
        {secoes?.map((s) => (
          <div key={s.id} className="mb-5">
            {s.titulo?.trim() && (
              <>
                <h2 className="text-lg font-bold mt-3 mb-1">{s.titulo}</h2>
                <hr className="w-2/5 border-gray-400 mb-2" />
              </>
            )}
            <div
              className="text-[15px] leading-relaxed text-justify prose-rs"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.corpo_html) }}
            />
          </div>
        ))}

        {/* Equipamentos */}
        {equipsToShow.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-bold mb-1">Equipamentos</h2>
            <hr className="w-2/5 border-gray-400 mb-2" />
            <table className="w-full text-sm border-collapse" style={{ fontFamily: 'Helvetica, sans-serif' }}>
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="text-left p-2 border border-gray-400">Marca</th>
                  <th className="text-left p-2 border border-gray-400">Modelo</th>
                  <th className="text-left p-2 border border-gray-400">Nº de Série</th>
                </tr>
              </thead>
              <tbody>
                {equipsToShow.map((eq, i) => (
                  <tr key={eq.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="p-2 border border-gray-300">{eq.marca || '—'}</td>
                    <td className="p-2 border border-gray-300">{eq.modelo || '—'}</td>
                    <td className="p-2 border border-gray-300">{eq.numero_serie || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ----- Modal principal -----
const RelatorioSimplesModal = ({ open, onOpenChange, relatorio, clienteNome }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [secoes, setSecoes] = useState([]);
  const [incluirEquipamentos, setIncluirEquipamentos] = useState(false);
  const [equipamentos, setEquipamentos] = useState([]);
  const [equipamentoIds, setEquipamentoIds] = useState([]);

  const newSecao = useCallback(() => ({
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `tmp-${Math.random().toString(36).slice(2)}`,
    titulo: '',
    corpo_html: '',
  }), []);

  // Carregar dados quando o modal abre
  useEffect(() => {
    if (!open || !relatorio?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rsRes, eqRes] = await Promise.all([
          axios.get(`${API}/relatorios-simples/by-fs/${relatorio.id}`),
          axios.get(`${API}/relatorios-simples/by-fs/${relatorio.id}/equipamentos`),
        ]);
        if (cancelled) return;
        setEquipamentos(eqRes.data || []);
        if (rsRes.data) {
          setTitulo(rsRes.data.titulo || '');
          setSecoes(rsRes.data.secoes?.length ? rsRes.data.secoes : [newSecao()]);
          setIncluirEquipamentos(!!rsRes.data.incluir_equipamentos);
          setEquipamentoIds(rsRes.data.equipamento_ids || []);
        } else {
          setTitulo('');
          setSecoes([newSecao()]);
          setIncluirEquipamentos(false);
          setEquipamentoIds([]);
        }
      } catch (err) {
        toast.error(`Erro a carregar relatório: ${err.response?.data?.detail || err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, relatorio?.id, newSecao]);

  const updateSecao = (id, patch) => {
    setSecoes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSecao = () => setSecoes((prev) => [...prev, newSecao()]);
  const removeSecao = (id) => setSecoes((prev) => prev.filter((s) => s.id !== id));
  const moveSecao = (id, dir) => {
    setSecoes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!relatorio?.id) return;
    setSaving(true);
    try {
      await axios.post(`${API}/relatorios-simples/by-fs/${relatorio.id}`, {
        titulo,
        secoes: secoes.map((s) => ({
          id: s.id,
          titulo: s.titulo || '',
          corpo_html: s.corpo_html || '',
        })),
        incluir_equipamentos: incluirEquipamentos,
        equipamento_ids: equipamentoIds,
      });
      toast.success('Relatório guardado');
      return true;
    } catch (err) {
      toast.error(`Erro a guardar: ${err.response?.data?.detail || err.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!relatorio?.id) return;
    // Garantir que está guardado antes de fazer download
    const ok = await handleSave();
    if (!ok) return;
    setDownloading(true);
    try {
      const res = await axios.get(`${API}/relatorios-simples/by-fs/${relatorio.id}/pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Relatorio_FS_${relatorio.numero_assistencia || relatorio.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('PDF gerado');
    } catch (err) {
      toast.error(`Erro a gerar PDF: ${err.response?.data?.detail || err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#1a1a1a] border-gray-700 text-white p-0"
        style={{ maxWidth: '95vw', width: '95vw', height: '92vh' }}
      >
        <DialogHeader className="px-5 pt-4 pb-2 border-b border-gray-700">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-blue-400" />
            Relatório Simples — FS #{relatorio?.numero_assistencia || '—'}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Cliente: <strong className="text-gray-200">{clienteNome || relatorio?.cliente_nome || '—'}</strong>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            A carregar…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden" style={{ height: 'calc(92vh - 130px)' }}>
            {/* COLUNA EDITOR */}
            <div className="overflow-y-auto p-5 space-y-4 border-r border-gray-700">
              <div>
                <Label className="text-gray-300 mb-1 block">Título do Relatório</Label>
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Relatório de Intervenção Técnica"
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  data-testid="rs-titulo"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-300">Secções</Label>
                  <Button
                    type="button"
                    onClick={addSecao}
                    size="sm"
                    variant="outline"
                    className="border-gray-600 bg-blue-600/10 text-blue-300 hover:bg-blue-600/20"
                    data-testid="rs-add-secao"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nova Secção
                  </Button>
                </div>

                {secoes.map((s, idx) => (
                  <div key={s.id} className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={s.titulo}
                        onChange={(e) => updateSecao(s.id, { titulo: e.target.value })}
                        placeholder={`Título da secção #${idx + 1} (opcional)`}
                        className="bg-[#1a1a1a] border-gray-700 text-white text-sm flex-1"
                        data-testid={`rs-secao-titulo-${idx}`}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSecao(s.id, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-white h-8 w-8"
                        title="Mover para cima"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSecao(s.id, 1)}
                        disabled={idx === secoes.length - 1}
                        className="text-gray-400 hover:text-white h-8 w-8"
                        title="Mover para baixo"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeSecao(s.id)}
                        className="text-red-400 hover:text-red-300 h-8 w-8"
                        title="Apagar secção"
                        data-testid={`rs-secao-delete-${idx}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <RichTextEditor
                      value={s.corpo_html}
                      onChange={(html) => updateSecao(s.id, { corpo_html: html })}
                      placeholder="Escreva o conteúdo desta secção…"
                      testid={`rs-secao-corpo-${idx}`}
                    />
                  </div>
                ))}
              </div>

              {/* Equipamentos */}
              <div className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rs-incluir-eq"
                    checked={incluirEquipamentos}
                    onCheckedChange={(v) => setIncluirEquipamentos(!!v)}
                    data-testid="rs-incluir-equipamentos"
                  />
                  <label htmlFor="rs-incluir-eq" className="text-gray-300 cursor-pointer">
                    Incluir equipamentos da FS
                  </label>
                  <span className="text-gray-500 text-xs ml-auto">
                    {equipamentos.length} disponíve{equipamentos.length === 1 ? 'l' : 'is'}
                  </span>
                </div>

                {incluirEquipamentos && equipamentos.length === 0 && (
                  <p className="text-amber-400 text-xs italic">
                    Esta FS não tem equipamentos associados.
                  </p>
                )}

                {incluirEquipamentos && equipamentos.length > 0 && (
                  <div className="space-y-1 mt-1">
                    <p className="text-gray-500 text-xs">
                      Selecione quais equipamentos incluir (vazio = todos):
                    </p>
                    {equipamentos.map((eq) => {
                      const selected = equipamentoIds.includes(eq.id);
                      return (
                        <label
                          key={eq.id}
                          className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded border border-gray-700 cursor-pointer hover:border-gray-500"
                          data-testid={`rs-eq-${eq.id}`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(v) => {
                              setEquipamentoIds((prev) => v
                                ? [...prev, eq.id]
                                : prev.filter((x) => x !== eq.id));
                            }}
                          />
                          <div className="flex-1 text-sm">
                            <span className="text-white">{eq.marca || '—'} / {eq.modelo || '—'}</span>
                            <span className="text-gray-500 ml-2 text-xs">
                              S/N: {eq.numero_serie || '—'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA PREVIEW */}
            <div className="overflow-hidden hidden lg:block">
              <A4Preview
                titulo={titulo}
                secoes={secoes}
                clienteNome={clienteNome || relatorio?.cliente_nome}
                fsNumero={relatorio?.numero_assistencia}
                equipamentos={equipamentos}
                incluirEquipamentos={incluirEquipamentos}
                equipamentoIds={equipamentoIds}
              />
            </div>
          </div>
        )}

        {/* Footer com ações */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700 bg-[#141414]">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-600"
            data-testid="rs-fechar"
          >
            Fechar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-gray-700 hover:bg-gray-600 text-white"
            data-testid="rs-guardar"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar
          </Button>
          <Button
            onClick={handleDownloadPDF}
            disabled={downloading || loading}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="rs-gerar-pdf"
          >
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Gerar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RelatorioSimplesModal;

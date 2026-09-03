import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Mail, Edit, RotateCcw, Loader2, X, Save } from 'lucide-react';

/**
 * Gestor de templates de email (aba Admin > Emails).
 * Permite editar assunto e corpo (com placeholders `{variavel}`) de cada
 * template registado no backend.
 */
export default function EmailTemplatesAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // template completo
  const [form, setForm] = useState({ assunto: '', corpo_html: '' });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/email-templates`);
      setItems(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a carregar templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEdit = (tpl) => {
    setEditing(tpl);
    setForm({ assunto: tpl.assunto || '', corpo_html: tpl.corpo_html || '' });
  };

  const handleSave = async () => {
    if (!form.assunto.trim() || !form.corpo_html.trim()) {
      toast.error('Assunto e corpo são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/email-templates/${editing.key}`, {
        assunto: form.assunto,
        corpo_html: form.corpo_html,
      });
      toast.success('Template guardado');
      setEditing(null);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (tpl) => {
    if (!window.confirm(`Repor o template "${tpl.nome}" para o valor original?\n\nAs alterações feitas serão perdidas.`)) return;
    setResetting(tpl.key);
    try {
      await axios.post(`${API}/email-templates/${tpl.key}/reset`);
      toast.success('Template reposto');
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a repor');
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Mail className="w-6 h-6 text-blue-400" /> Templates de Email
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Gerir os corpos dos emails enviados pela app. Usa <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-blue-300">{'{nome_variavel}'}</code> para substituir por valores em runtime.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> A carregar…
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 rounded-lg border border-dashed border-gray-700 text-center text-gray-400">
          Sem templates registados.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => (
            <div key={t.key} className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 flex flex-col gap-2" data-testid={`email-template-card-${t.key}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{t.nome}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{t.key}</p>
                </div>
              </div>
              {t.descricao && <p className="text-xs text-gray-400 line-clamp-2">{t.descricao}</p>}
              <div className="text-xs">
                <span className="text-gray-500">Assunto:</span>
                <p className="text-gray-200 truncate">{t.assunto}</p>
              </div>
              {t.variaveis?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.variaveis.map((v) => (
                    <span key={v} className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5 font-mono">
                      {'{' + v + '}'}
                    </span>
                  ))}
                </div>
              )}
              {t.updated_by && t.updated_by !== 'system' && (
                <p className="text-[10px] text-gray-500 mt-auto pt-1 border-t border-gray-800">
                  Editado por {t.updated_by} · {new Date(t.updated_at).toLocaleString('pt-PT')}
                </p>
              )}
              <div className="flex gap-2 pt-2 border-t border-gray-800">
                <Button size="sm" onClick={() => openEdit(t)} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs" data-testid={`email-template-edit-${t.key}`}>
                  <Edit className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => handleReset(t)}
                  disabled={resetting === t.key}
                  className="text-gray-400 hover:text-white h-7 text-xs"
                  data-testid={`email-template-reset-${t.key}`}
                >
                  {resetting === t.key
                    ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    : <RotateCcw className="w-3 h-3 mr-1" />}
                  Repor
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal edição */}
      <Dialog open={!!editing} onOpenChange={(v) => !saving && !v && setEditing(null)}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Mail className="w-5 h-5 text-blue-400" />
              Editar template — {editing?.nome}
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs">
              Chave: <code className="text-blue-300">{editing?.key}</code>
              {editing?.variaveis?.length > 0 && (
                <>
                  <br />Variáveis disponíveis:{' '}
                  {editing.variaveis.map((v) => (
                    <code key={v} className="text-blue-300 mr-1">{'{' + v + '}'}</code>
                  ))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-gray-300 text-xs">Assunto</Label>
              <Input
                value={form.assunto}
                onChange={(e) => setForm((p) => ({ ...p, assunto: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                data-testid="email-template-assunto"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Corpo (HTML)</Label>
              <textarea
                value={form.corpo_html}
                onChange={(e) => setForm((p) => ({ ...p, corpo_html: e.target.value }))}
                rows={16}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 mt-1 text-sm font-mono"
                data-testid="email-template-corpo"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Suporta HTML e placeholders <code>{'{nome_variavel}'}</code>. Placeholders desconhecidos ficam como estão.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving} className="border-gray-600 text-gray-300" data-testid="email-template-cancelar">
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="email-template-guardar">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

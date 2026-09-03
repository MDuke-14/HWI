import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, Search, Edit2, Trash2, X, Loader2, Users,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Página de gestão de Fornecedores (admin).
 * CRUD contra /api/fornecedores. Soft-delete preserva referências históricas.
 */
export default function FornecedoresPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // fornecedor a editar (ou null p/ criar)
  const [form, setForm] = useState({
    nome: '', email: '', contacto: '', nif: '', morada: '', observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? { q: search } : {};
      const { data } = await axios.get(`${API}/fornecedores`, { params });
      setItems(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a carregar fornecedores');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openCreate = () => {
    setEditing(null);
    setForm({ nome: '', email: '', contacto: '', nif: '', morada: '', observacoes: '' });
    setShowModal(true);
  };
  const openEdit = (f) => {
    setEditing(f);
    setForm({
      nome: f.nome || '', email: f.email || '', contacto: f.contacto || '',
      nif: f.nif || '', morada: f.morada || '', observacoes: f.observacoes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/fornecedores/${editing.id}`, form);
        toast.success('Fornecedor atualizado');
      } else {
        await axios.post(`${API}/fornecedores`, form);
        toast.success('Fornecedor criado');
      }
      setShowModal(false);
      fetchList();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Desativar o fornecedor "${f.nome}"?\n\nOs materiais que o referenciam continuam a mostrar o nome (snapshot).`)) return;
    try {
      const { data } = await axios.delete(`${API}/fornecedores/${f.id}`);
      toast.success(`Desativado. ${data.referencias_em_materiais} material(is) mantêm referência histórica.`);
      fetchList();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a desativar');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Fornecedores
          </h2>
          <p className="text-sm text-gray-400">Gerir os fornecedores usados nos pedidos de cotação.</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700" data-testid="btn-add-fornecedor">
          <Plus className="w-4 h-4 mr-1" /> Novo Fornecedor
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome, email ou NIF…"
          className="pl-9 bg-[#0f0f0f] border-gray-700 text-white"
          data-testid="fornecedor-search"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> A carregar…
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 rounded-lg border border-dashed border-gray-700 text-center text-gray-400">
          {search ? 'Nenhum fornecedor encontrado.' : 'Sem fornecedores criados. Clica em "Novo Fornecedor".'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((f) => (
            <div
              key={f.id}
              className={`p-4 rounded-lg border ${f.ativo ? 'bg-[#0f0f0f] border-gray-700' : 'bg-[#0a0a0a] border-gray-800 opacity-60'} flex flex-col gap-2`}
              data-testid={`fornecedor-card-${f.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{f.nome}</p>
                  {f.email && <p className="text-xs text-blue-300 truncate">{f.email}</p>}
                </div>
                {!f.ativo && (
                  <span className="text-[10px] uppercase tracking-wider bg-red-900/30 text-red-300 rounded px-1.5 py-0.5 border border-red-700/40">
                    Inativo
                  </span>
                )}
              </div>
              {(f.contacto || f.nif) && (
                <div className="text-xs text-gray-400 space-y-0.5">
                  {f.contacto && <div>Contacto: <span className="text-gray-300">{f.contacto}</span></div>}
                  {f.nif && <div>NIF: <span className="text-gray-300">{f.nif}</span></div>}
                </div>
              )}
              {f.morada && <p className="text-xs text-gray-500 truncate">{f.morada}</p>}
              <div className="flex gap-2 mt-1 pt-2 border-t border-gray-800">
                <Button size="sm" variant="ghost" onClick={() => openEdit(f)} className="text-blue-300 h-7 px-2 text-xs">
                  <Edit2 className="w-3 h-3 mr-1" /> Editar
                </Button>
                {f.ativo && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(f)} className="text-red-300 h-7 px-2 text-xs">
                    <Trash2 className="w-3 h-3 mr-1" /> Desativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={showModal} onOpenChange={(v) => !saving && setShowModal(v)}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Users className="w-5 h-5 text-blue-400" />
              {editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3 mt-2">
            <div>
              <Label className="text-gray-300 text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required data-testid="fornecedor-nome-input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Email</Label>
                <Input
                  type="email" value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  data-testid="fornecedor-email-input"
                />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Contacto</Label>
                <Input
                  value={form.contacto}
                  onChange={(e) => setForm((p) => ({ ...p, contacto: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">NIF</Label>
              <Input
                value={form.nif}
                onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Morada</Label>
              <Input
                value={form.morada}
                onChange={(e) => setForm((p) => ({ ...p, morada: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Observações</Label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 text-sm min-h-[70px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={saving} className="border-gray-600">
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="fornecedor-save-btn">
                {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> A guardar…</> : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

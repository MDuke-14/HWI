import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit2, AlertCircle, Clock, History } from 'lucide-react';

const TIPO_LABEL = {
  entrada_tardia: 'Entrada Tardia',
  saida_antecipada: 'Saída Antecipada',
};
const TIPO_COLOR = {
  entrada_tardia: 'amber',
  saida_antecipada: 'rose',
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function fmtDatePT(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-PT');
}

const emptyForm = () => ({
  data: todayISO(),
  hora_inicio: '13:00',
  hora_fim: '17:30',
  tipo: 'saida_antecipada',
  regressa_servico: false,
  observacoes: '',
  aviso_minutos_antes: 60,
});

/**
 * Modal de gestão de Indisponibilidades.
 * - Utilizador normal: vê e gere as suas.
 * - Admin: vê todas + histórico por utilizador.
 */
const IndisponibilidadesModal = ({ open, onOpenChange, user, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  // Admin filter por user
  const [userFilter, setUserFilter] = useState('');
  const [allUsers, setAllUsers] = useState([]);

  const isAdmin = !!user?.is_admin;

  const fetchList = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const params = userFilter ? { user_id: userFilter } : {};
        const r = await axios.get(`${API}/indisponibilidades`, { params });
        setList(r.data || []);
      } else {
        const r = await axios.get(`${API}/indisponibilidades/me`);
        setList(r.data || []);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a carregar');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const r = await axios.get(`${API}/admin/users`);
      setAllUsers(r.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (open) { fetchList(); fetchUsers(); }
    // eslint-disable-next-line
  }, [open, userFilter]);

  const submitForm = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        data: form.data,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        tipo: form.tipo,
        regressa_servico: !!form.regressa_servico,
        observacoes: form.observacoes?.trim() || null,
        aviso_minutos_antes: parseInt(form.aviso_minutos_antes, 10) || 60,
      };
      if (editingId) {
        await axios.put(`${API}/indisponibilidades/${editingId}`, payload);
        toast.success('Indisponibilidade atualizada');
      } else {
        await axios.post(`${API}/indisponibilidades`, payload);
        toast.success('Indisponibilidade registada');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await fetchList();
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a guardar');
    }
  };

  const startEdit = (i) => {
    setEditingId(i.id);
    setForm({
      data: (i.data || '').split('T')[0],
      hora_inicio: i.hora_inicio,
      hora_fim: i.hora_fim,
      tipo: i.tipo,
      regressa_servico: !!i.regressa_servico,
      observacoes: i.observacoes || '',
      aviso_minutos_antes: i.aviso_minutos_antes ?? 60,
    });
    setShowForm(true);
  };

  const removeOne = async (id) => {
    if (!window.confirm('Eliminar esta indisponibilidade?')) return;
    try {
      await axios.delete(`${API}/indisponibilidades/${id}`);
      toast.success('Eliminada');
      await fetchList();
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro');
    }
  };

  const groupedByUser = useMemo(() => {
    if (!isAdmin) return null;
    const m = {};
    list.forEach((i) => {
      const k = i.user_id;
      (m[k] = m[k] || { username: i.username || k, items: [] }).items.push(i);
    });
    return m;
  }, [list, isAdmin]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0a0a0a] border border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="indisponibilidades-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            {isAdmin ? 'Indisponibilidades — Gestão' : 'As Minhas Indisponibilidades'}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Entrada tardia ou saída antecipada com aviso por email no próprio dia.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-400">Filtrar:</Label>
              <Select value={userFilter || 'all'} onValueChange={(v) => setUserFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="bg-[#121212] border-white/10 text-white w-56" data-testid="ind-user-filter">
                  <SelectValue placeholder="Todos os utilizadores" />
                </SelectTrigger>
                <SelectContent className="bg-[#121212] border-white/10 text-white">
                  <SelectItem value="all">Todos</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true); }}
            className="bg-amber-600 hover:bg-amber-700 ml-auto"
            data-testid="ind-add-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> Nova
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {loading && <div className="text-gray-500 text-sm py-6 text-center">A carregar...</div>}
          {!loading && list.length === 0 && (
            <div className="text-gray-500 text-sm py-6 text-center">Sem registos.</div>
          )}

          {!isAdmin && list.map((i) => (
            <ItemRow key={i.id} i={i} onEdit={startEdit} onDel={removeOne} canEdit />
          ))}

          {isAdmin && groupedByUser && Object.entries(groupedByUser).map(([uid, g]) => (
            <div key={uid} className="border border-white/10 rounded-lg p-2 bg-[#0f0f0f]">
              <div className="flex items-center gap-2 mb-1 text-sm font-semibold">
                <History className="w-4 h-4 text-sky-400" />
                {g.username}
                <span className="text-xs text-gray-500 ml-auto">{g.items.length} registo(s)</span>
              </div>
              <div className="space-y-1">
                {g.items.map((i) => (
                  <ItemRow key={i.id} i={i} onEdit={startEdit} onDel={removeOne} canEdit />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Form sub-modal */}
        <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingId(null); } }}>
          <DialogContent className="bg-[#0a0a0a] border border-white/10 text-white max-w-md" data-testid="ind-form">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Indisponibilidade' : 'Nova Indisponibilidade'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitForm} className="space-y-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger className="bg-[#121212] border-white/10 text-white" data-testid="ind-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-white/10 text-white">
                    <SelectItem value="entrada_tardia">Entrada Tardia</SelectItem>
                    <SelectItem value="saida_antecipada">Saída Antecipada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data *</Label>
                <Input
                  required type="date" value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="bg-[#121212] border-white/10 text-white"
                  data-testid="ind-data"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hora Início *</Label>
                  <Input
                    required type="time" value={form.hora_inicio}
                    onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
                    className="bg-[#121212] border-white/10 text-white"
                    data-testid="ind-hora-inicio"
                  />
                </div>
                <div>
                  <Label>Hora Fim *</Label>
                  <Input
                    required type="time" value={form.hora_fim}
                    onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
                    className="bg-[#121212] border-white/10 text-white"
                    data-testid="ind-hora-fim"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.regressa_servico}
                  onCheckedChange={(v) => setForm({ ...form, regressa_servico: v })}
                  data-testid="ind-regressa"
                />
                <Label className="cursor-pointer">Regressa ao serviço depois</Label>
              </div>
              <div>
                <Label>Aviso por email (min antes)</Label>
                <Input
                  type="number" min="0" max="1440" value={form.aviso_minutos_antes}
                  onChange={(e) => setForm({ ...form, aviso_minutos_antes: e.target.value })}
                  className="bg-[#121212] border-white/10 text-white"
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="bg-[#121212] border-white/10 text-white"
                  rows={2}
                  data-testid="ind-obs"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" className="bg-amber-600 hover:bg-amber-700" data-testid="ind-submit">
                  {editingId ? 'Atualizar' : 'Registar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

const ItemRow = ({ i, onEdit, onDel, canEdit }) => {
  const cor = TIPO_COLOR[i.tipo] || 'amber';
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded border bg-[#121212] border-${cor}-500/30`}
      data-testid={`ind-row-${i.id}`}
    >
      <AlertCircle className={`w-4 h-4 text-${cor}-400 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className={`font-bold text-${cor}-300`}>{TIPO_LABEL[i.tipo]}</span>
          <span className="text-gray-400"> · </span>
          <span className="font-mono">{fmtDatePT(i.data)} {i.hora_inicio}–{i.hora_fim}</span>
          {i.regressa_servico && <span className="ml-2 text-emerald-400 text-xs">↩ regressa</span>}
        </div>
        {i.observacoes && <div className="text-xs text-gray-400 truncate">{i.observacoes}</div>}
      </div>
      {canEdit && (
        <>
          <Button variant="ghost" size="sm" onClick={() => onEdit(i)} data-testid={`ind-edit-${i.id}`}>
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDel(i.id)} data-testid={`ind-del-${i.id}`}>
            <Trash2 className="w-3 h-3 text-rose-400" />
          </Button>
        </>
      )}
    </div>
  );
};

export default IndisponibilidadesModal;

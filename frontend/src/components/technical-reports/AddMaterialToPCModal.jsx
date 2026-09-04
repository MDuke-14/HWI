import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Package, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal simples para adicionar material a uma PC específica.
 * Diferente do modal de material da FS: só pede descrição, quantidade,
 * posição, código e data. Envia sempre `fornecido_por="Cotação"` + `pc_id`
 * da PC atual — o material fica agregado apenas nesta PC.
 */
const AddMaterialToPCModal = ({ open, onOpenChange, pc, relatorioId, onAdded }) => {
  const [form, setForm] = useState({
    descricao: '',
    quantidade: '',
    unidade: 'Un',
    posicao: '',
    codigo: '',
    data_utilizacao: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        descricao: '',
        quantidade: '',
        unidade: 'Un',
        posicao: '',
        codigo: '',
        data_utilizacao: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open]);

  const canSubmit = form.descricao.trim() && parseFloat(form.quantidade) > 0 && !saving;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) {
      toast.error('Descrição e quantidade > 0 são obrigatórias');
      return;
    }
    if (!pc?.id || !relatorioId) {
      toast.error('PC ou FS inválidas');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        descricao: form.descricao.trim(),
        quantidade: parseFloat(form.quantidade),
        unidade: form.unidade || 'Un',
        posicao: form.posicao.trim() || null,
        codigo: form.codigo.trim() || null,
        data_utilizacao: form.data_utilizacao || null,
        fornecido_por: 'Cotação',
        pc_id: pc.id,  // agrega directamente a ESTA PC
      };
      await axios.post(`${API}/relatorios-tecnicos/${relatorioId}/materiais`, payload);
      toast.success('Material adicionado à PC');
      onOpenChange(false);
      onAdded && onAdded();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a adicionar material');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            Adicionar material à PC
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            PC {pc?.numero_pc} · O material fica agregado apenas nesta PC.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-gray-300 text-xs">
              Descrição <span className="text-red-400">*</span>
            </Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Ex.: Rolamento SKF 6205"
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              autoFocus
              data-testid="add-mat-pc-descricao"
            />
          </div>

          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <Label className="text-gray-300 text-xs">
                Quantidade <span className="text-red-400">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.quantidade}
                onChange={(e) => setForm((p) => ({ ...p, quantidade: e.target.value }))}
                placeholder="0"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                data-testid="add-mat-pc-quantidade"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Unidade</Label>
              <select
                value={form.unidade}
                onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1 h-10 text-sm"
                data-testid="add-mat-pc-unidade"
              >
                <option value="Un">Un</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
                <option value="cx">cx</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-gray-300 text-xs">Posição</Label>
              <Input
                value={form.posicao}
                onChange={(e) => setForm((p) => ({ ...p, posicao: e.target.value }))}
                placeholder="Ex.: P1"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                data-testid="add-mat-pc-posicao"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
                placeholder="Ex.: 6205-2RS"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                data-testid="add-mat-pc-codigo"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-300 text-xs">Data</Label>
            <Input
              type="date"
              value={form.data_utilizacao}
              onChange={(e) => setForm((p) => ({ ...p, data_utilizacao: e.target.value }))}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              data-testid="add-mat-pc-data"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 border-gray-600 text-gray-300"
              data-testid="add-mat-pc-cancelar"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              data-testid="add-mat-pc-guardar"
            >
              <Plus className="w-4 h-4 mr-1" /> {saving ? 'A guardar…' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddMaterialToPCModal;

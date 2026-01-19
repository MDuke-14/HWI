import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Package, Plus, Edit } from 'lucide-react';

const MaterialModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  isEditing = false,
  selectedMaterial = null,
  onSaved
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    descricao: '',
    quantidade: 1,
    unidade: 'un',
    referencia: '',
    observacoes: ''
  });

  useEffect(() => {
    if (isEditing && selectedMaterial) {
      setFormData({
        descricao: selectedMaterial.descricao || '',
        quantidade: selectedMaterial.quantidade || 1,
        unidade: selectedMaterial.unidade || 'un',
        referencia: selectedMaterial.referencia || '',
        observacoes: selectedMaterial.observacoes || ''
      });
    } else {
      resetForm();
    }
  }, [isEditing, selectedMaterial, open]);

  const resetForm = () => {
    setFormData({
      descricao: '',
      quantidade: 1,
      unidade: 'un',
      referencia: '',
      observacoes: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    if (!formData.descricao.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    setLoading(true);

    try {
      if (isEditing && selectedMaterial) {
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais/${selectedMaterial.id}`,
          formData
        );
        toast.success('Material atualizado!');
      } else {
        await axios.post(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais`,
          formData
        );
        toast.success('Material adicionado!');
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar material');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Material' : 'Adicionar Material'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label className="text-gray-300">Descrição *</Label>
            <Input
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: Parafuso M8x20"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Quantidade *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) || 1 })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-gray-300">Unidade</Label>
              <select
                value={formData.unidade}
                onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2"
              >
                <option value="un">Unidade (un)</option>
                <option value="kg">Quilograma (kg)</option>
                <option value="m">Metro (m)</option>
                <option value="l">Litro (l)</option>
                <option value="cx">Caixa (cx)</option>
                <option value="pc">Peça (pc)</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Referência</Label>
            <Input
              value={formData.referencia}
              onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: REF-123"
            />
          </div>

          <div>
            <Label className="text-gray-300">Observações</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Notas adicionais..."
              rows={2}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={`flex-1 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {loading ? 'A guardar...' : (isEditing ? 'Atualizar' : 'Adicionar')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialModal;

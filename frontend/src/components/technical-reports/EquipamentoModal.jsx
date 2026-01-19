import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Package, Plus, Edit, Settings } from 'lucide-react';

const EquipamentoModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  cliente,
  equipamentosCliente = [],
  isEditing = false,
  selectedEquipamento = null,
  onSaved
}) => {
  const [loading, setLoading] = useState(false);
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState('novo');
  const [criarNaBaseCliente, setCriarNaBaseCliente] = useState(true);
  const [formData, setFormData] = useState({
    tipologia: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    ano_fabrico: ''
  });

  useEffect(() => {
    if (isEditing && selectedEquipamento) {
      setFormData({
        tipologia: selectedEquipamento.tipologia || '',
        marca: selectedEquipamento.marca || '',
        modelo: selectedEquipamento.modelo || '',
        numero_serie: selectedEquipamento.numero_serie || '',
        ano_fabrico: selectedEquipamento.ano_fabrico || ''
      });
    } else {
      resetForm();
    }
  }, [isEditing, selectedEquipamento, open]);

  const resetForm = () => {
    setEquipamentoSelecionado('novo');
    setCriarNaBaseCliente(true);
    setFormData({
      tipologia: '',
      marca: '',
      modelo: '',
      numero_serie: '',
      ano_fabrico: ''
    });
  };

  const handleEquipamentoChange = (value) => {
    setEquipamentoSelecionado(value);
    
    if (value === 'novo') {
      setCriarNaBaseCliente(true);
      setFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: ''
      });
    } else if (value === 'apenas_ot') {
      setCriarNaBaseCliente(false);
      setFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: ''
      });
    } else {
      const equipamento = equipamentosCliente.find(e => e.id === value);
      if (equipamento) {
        setFormData({
          tipologia: equipamento.tipologia || '',
          marca: equipamento.marca || '',
          modelo: equipamento.modelo || '',
          numero_serie: equipamento.numero_serie || '',
          ano_fabrico: equipamento.ano_fabrico || ''
        });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    if (!formData.tipologia.trim()) {
      toast.error('Tipologia é obrigatória');
      return;
    }

    setLoading(true);

    try {
      if (isEditing && selectedEquipamento) {
        // Atualizar equipamento existente na OT
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos/${selectedEquipamento.id}`,
          {
            tipologia: formData.tipologia,
            marca: formData.marca,
            modelo: formData.modelo,
            numero_serie: formData.numero_serie,
            ano_fabrico: formData.ano_fabrico
          }
        );
        toast.success('Equipamento atualizado!');
      } else {
        // Adicionar novo equipamento
        const isExisting = equipamentoSelecionado !== 'novo' && equipamentoSelecionado !== 'apenas_ot';
        
        await axios.post(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos`,
          {
            equipamento_id: isExisting ? equipamentoSelecionado : null,
            tipologia: formData.tipologia,
            marca: formData.marca,
            modelo: formData.modelo,
            numero_serie: formData.numero_serie,
            ano_fabrico: formData.ano_fabrico,
            criar_na_base_cliente: criarNaBaseCliente && !isExisting
          }
        );
        toast.success('Equipamento adicionado!');
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar equipamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Equipamento' : 'Adicionar Equipamento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Seleção de Equipamento (apenas para adicionar) */}
          {!isEditing && (
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Equipamento
              </Label>
              <select
                value={equipamentoSelecionado}
                onChange={(e) => handleEquipamentoChange(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
              >
                <option value="novo">➕ Criar novo equipamento (guardar na BD)</option>
                <option value="apenas_ot">📝 Adicionar apenas à OT (sem guardar na BD)</option>
                {equipamentosCliente.length > 0 && (
                  <optgroup label="Equipamentos existentes do cliente">
                    {equipamentosCliente.map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.tipologia} - {eq.marca} {eq.modelo}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              
              {equipamentoSelecionado === 'apenas_ot' && (
                <p className="text-xs text-yellow-400 mt-1">
                  ⚠️ Este equipamento será adicionado apenas a esta OT e não ficará registado na base de dados do cliente.
                </p>
              )}
            </div>
          )}

          {/* Campos do Equipamento */}
          <div className="space-y-3">
            <div>
              <Label className="text-gray-300">Tipologia *</Label>
              <Input
                value={formData.tipologia}
                onChange={(e) => setFormData({ ...formData, tipologia: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Compressor, Motor, Bomba..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Marca</Label>
                <Input
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: Siemens"
                />
              </div>
              <div>
                <Label className="text-gray-300">Modelo</Label>
                <Input
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: XYZ-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Nº Série</Label>
                <Input
                  value={formData.numero_serie}
                  onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: SN123456"
                />
              </div>
              <div>
                <Label className="text-gray-300">Ano Fabrico</Label>
                <Input
                  value={formData.ano_fabrico}
                  onChange={(e) => setFormData({ ...formData, ano_fabrico: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 2020"
                />
              </div>
            </div>
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

export default EquipamentoModal;

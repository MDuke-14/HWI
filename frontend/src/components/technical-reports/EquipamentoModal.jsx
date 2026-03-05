import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Edit } from 'lucide-react';

const EquipamentoModal = ({
  open,
  onOpenChange,
  isEditing = false,
  equipamentoFormData,
  setEquipamentoFormData,
  equipamentoOTSelecionado,
  handleEquipamentoOTChange,
  equipamentosClienteOT = [],
  onSubmit,
  onCancel,
  editEquipamentoFormData,
  setEditEquipamentoFormData,
  editingEquipamentoPrincipal = false,
  loading = false
}) => {
  // Para modo Adicionar
  if (!isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-green-400" />
              Adicionar Equipamento
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            {/* Dropdown para selecionar equipamento existente ou criar novo */}
            <div>
              <Label className="text-gray-300 mb-2 block flex items-center gap-2">
                <Package className="w-4 h-4" />
                Selecionar Equipamento
              </Label>
              <select
                value={equipamentoOTSelecionado}
                onChange={(e) => handleEquipamentoOTChange(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2"
              >
                <option value="novo">➕ Criar novo equipamento (guardar na BD do cliente)</option>
                <option value="apenas_ot">📋 Adicionar apenas à OT (sem guardar na BD)</option>
                {equipamentosClienteOT.length > 0 && (
                  <option disabled className="text-gray-500">────── Equipamentos do Cliente ──────</option>
                )}
                {equipamentosClienteOT.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.marca} {eq.modelo} {eq.numero_serie ? `(S/N: ${eq.numero_serie})` : ''}
                  </option>
                ))}
              </select>
              {equipamentoOTSelecionado === 'novo' && (
                <p className="text-sm text-green-400 mt-1">
                  ✓ O equipamento será guardado na base de dados do cliente
                </p>
              )}
              {equipamentoOTSelecionado === 'apenas_ot' && (
                <p className="text-sm text-orange-400 mt-1">
                  ⚠ O equipamento será associado apenas a esta OT (não fica na BD do cliente)
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Tipologia</Label>
                <Input
                  value={equipamentoFormData.tipologia}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, tipologia: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
              <div>
                <Label className="text-gray-300">Marca</Label>
                <Input
                  value={equipamentoFormData.marca}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, marca: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Modelo</Label>
                <Input
                  value={equipamentoFormData.modelo}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, modelo: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
              <div>
                <Label className="text-gray-300">Número de Série</Label>
                <Input
                  value={equipamentoFormData.numero_serie}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, numero_serie: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Ano de Fabrico</Label>
                <Input
                  value={equipamentoFormData.ano_fabrico}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, ano_fabrico: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 2020, 03/2020, 03-2020"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
              <div>
                <Label className="text-gray-300">Horas de Funcionamento</Label>
                <Input
                  value={equipamentoFormData.horas_funcionamento}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, horas_funcionamento: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 1500"
                  disabled={equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot'}
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {loading ? 'A guardar...' : 'Adicionar Equipamento'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Para modo Editar
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Edit className="w-5 h-5 text-blue-400" />
            Editar Equipamento {editingEquipamentoPrincipal ? '(Principal)' : ''}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Tipologia</Label>
              <Input
                value={editEquipamentoFormData.tipologia}
                onChange={(e) => setEditEquipamentoFormData({...editEquipamentoFormData, tipologia: e.target.value})}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Marca</Label>
              <Input
                value={editEquipamentoFormData.marca}
                onChange={(e) => setEditEquipamentoFormData({...editEquipamentoFormData, marca: e.target.value})}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Modelo</Label>
              <Input
                value={editEquipamentoFormData.modelo}
                onChange={(e) => setEditEquipamentoFormData({...editEquipamentoFormData, modelo: e.target.value})}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Número de Série</Label>
              <Input
                value={editEquipamentoFormData.numero_serie}
                onChange={(e) => setEditEquipamentoFormData({...editEquipamentoFormData, numero_serie: e.target.value})}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Ano de Fabrico</Label>
            <Input
              value={editEquipamentoFormData.ano_fabrico}
              onChange={(e) => setEditEquipamentoFormData({...editEquipamentoFormData, ano_fabrico: e.target.value})}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: 2020, 03/2020, 03-2020"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'A guardar...' : 'Guardar Alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EquipamentoModal;

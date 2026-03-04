import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Edit, Calendar } from 'lucide-react';

const MaterialModal = ({
  open,
  onOpenChange,
  isEditing = false,
  materialFormData,
  setMaterialFormData,
  onSubmit,
  onCancel,
  loading = false
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Material' : 'Adicionar Material'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="descricao_material" className="text-gray-300">
              Descrição do Material *
            </Label>
            <Input
              id="descricao_material"
              value={materialFormData.descricao}
              onChange={(e) => setMaterialFormData({ ...materialFormData, descricao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: Parafuso M8x20"
              required
            />
          </div>

          <div>
            <Label htmlFor="quantidade_material" className="text-gray-300">
              Quantidade *
            </Label>
            <Input
              id="quantidade_material"
              type="number"
              min="1"
              value={materialFormData.quantidade}
              onChange={(e) => setMaterialFormData({ ...materialFormData, quantidade: e.target.value === '' ? '' : (parseInt(e.target.value) || '') })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              placeholder="Ex: 1"
              required
            />
          </div>

          <div>
            <Label htmlFor="fornecido_por" className="text-gray-300">
              Fornecido Por
            </Label>
            <select
              id="fornecido_por"
              value={materialFormData.fornecido_por}
              onChange={(e) => setMaterialFormData({ ...materialFormData, fornecido_por: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2"
              required
            >
              <option value="Cliente">Cliente</option>
              <option value="HWI">HWI</option>
              <option value="Cotação">Cotação</option>
            </select>
          </div>

          {materialFormData.fornecido_por === 'Cotação' && (
            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                ℹ️ Um Pedido de Cotação será criado automaticamente para este material
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="data_utilizacao" className="text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Data de Utilização
            </Label>
            <Input
              id="data_utilizacao"
              type="date"
              value={materialFormData.data_utilizacao || ''}
              onChange={(e) => setMaterialFormData({ ...materialFormData, data_utilizacao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
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
              className={`flex-1 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {loading ? 'A guardar...' : (isEditing ? 'Guardar' : 'Adicionar')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialModal;

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
  loading = false,
  equipamentosOT = [],
  selectedEquipOTIds = [],
  onEquipOTIdsChange,
  onOpenDespesa
}) => {
  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const isCotacao = materialFormData.fornecido_por === 'Cotação';
  const isHWI = materialFormData.fornecido_por === 'HWI';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Material' : 'Adicionar Material'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="descricao_material" className="text-gray-300">
              Descrição do Material *
            </Label>
            <Input
              id="descricao_material"
              data-testid="material-descricao-input"
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
            <div className="flex gap-2">
              <Input
                id="quantidade_material"
                data-testid="material-quantidade-input"
                type="number"
                min="0.01"
                step="any"
                value={materialFormData.quantidade}
                onChange={(e) => setMaterialFormData({ ...materialFormData, quantidade: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white flex-1"
                placeholder="Ex: 5"
                required
              />
              <select
                data-testid="material-unidade-select"
                value={materialFormData.unidade || 'Un'}
                onChange={(e) => setMaterialFormData({ ...materialFormData, unidade: e.target.value })}
                className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 w-24"
              >
                <option value="Un">Un</option>
                <option value="L">L</option>
                <option value="M">M</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="fornecido_por" className="text-gray-300">
              Fornecido Por
            </Label>
            <select
              id="fornecido_por"
              data-testid="material-fornecido-select"
              value={materialFormData.fornecido_por}
              onChange={(e) => {
                setMaterialFormData({ ...materialFormData, fornecido_por: e.target.value });
              }}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2"
              required
            >
              <option value="Cliente">Cliente</option>
              <option value="HWI">HWI</option>
              <option value="Cotação">Cotação</option>
            </select>
          </div>

          {/* PC choice removed — backend decides automatically: reuses existing
              PC of this FS if any, else creates a new one. */}

          {isCotacao && isEditing && (
            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                Este material está associado a um Pedido de Cotação
              </p>
            </div>
          )}

          {/* Equipment selection for PC - only when Cotação */}
          {isCotacao && !isEditing && equipamentosOT.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-600/50 rounded-lg p-3 space-y-2">
              <p className="text-amber-400 text-sm font-medium flex items-center gap-2">
                <Package className="w-4 h-4" />
                Equipamentos da FS para esta PC
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {equipamentosOT.map((eq) => (
                  <label
                    key={eq.id}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all text-sm ${
                      selectedEquipOTIds.includes(eq.id)
                        ? 'border-amber-500 bg-amber-600/10'
                        : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEquipOTIds.includes(eq.id)}
                      onChange={(e) => {
                        if (onEquipOTIdsChange) {
                          if (e.target.checked) {
                            onEquipOTIdsChange([...selectedEquipOTIds, eq.id]);
                          } else {
                            onEquipOTIdsChange(selectedEquipOTIds.filter(id => id !== eq.id));
                          }
                        }
                      }}
                      className="accent-amber-500"
                    />
                    <span className="text-white">
                      {eq.marca} {eq.modelo}
                      {eq.numero_serie ? <span className="text-gray-400 ml-1">(S/N: {eq.numero_serie})</span> : ''}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-gray-500 text-xs">Selecione os equipamentos relevantes para esta cotação</p>
            </div>
          )}

          {/* Campos Posição e Código - apenas quando Cotação selecionado */}
          {isCotacao && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="posicao" className="text-gray-300 text-sm">
                  Posição
                </Label>
                <Input
                  id="posicao"
                  data-testid="material-posicao-input"
                  value={materialFormData.posicao || ''}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, posicao: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: A1"
                />
              </div>
              <div>
                <Label htmlFor="codigo" className="text-gray-300 text-sm">
                  Código
                </Label>
                <Input
                  id="codigo"
                  data-testid="material-codigo-input"
                  value={materialFormData.codigo || ''}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, codigo: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: REF-001"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="data_utilizacao" className="text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Data de Utilização
            </Label>
            <Input
              id="data_utilizacao"
              data-testid="material-data-input"
              type="date"
              value={materialFormData.data_utilizacao || ''}
              onChange={(e) => setMaterialFormData({ ...materialFormData, data_utilizacao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
            />
          </div>

          {/* Aviso HWI */}
          {isHWI && !isEditing && onOpenDespesa && (
            <div className="bg-emerald-900/20 border border-emerald-600/50 rounded-lg p-3 text-emerald-300 text-xs">
              Material fornecido pela HWI: ao adicionar, o material fica registado no relatório do cliente e abre o popup de Despesa para lançar o custo interno.
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 border-gray-600"
            >
              Cancelar
            </Button>
            {isHWI && !isEditing && onOpenDespesa ? (
              <Button
                type="button"
                onClick={() => onOpenDespesa(materialFormData)}
                data-testid="material-open-despesa-btn"
                disabled={!materialFormData.descricao || !materialFormData.quantidade}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Despesa
              </Button>
            ) : (
              <Button
                type="submit"
                data-testid="material-submit-btn"
                disabled={loading}
                className={`flex-1 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {loading ? 'A guardar...' : (isEditing ? 'Guardar' : 'Adicionar')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialModal;

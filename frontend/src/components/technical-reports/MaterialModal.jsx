import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Edit, Calendar, FileText } from 'lucide-react';

const MaterialModal = ({
  open,
  onOpenChange,
  isEditing = false,
  materialFormData,
  setMaterialFormData,
  onSubmit,
  onCancel,
  loading = false,
  existingPCs = [],
  selectedPCId,
  onPCIdChange
}) => {
  const [pcChoice, setPcChoice] = useState('new'); // 'new' or 'existing'

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const isCotacao = materialFormData.fornecido_por === 'Cotação';
  const hasPCs = existingPCs.length > 0;

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
                if (e.target.value !== 'Cotação') {
                  setPcChoice('new');
                  if (onPCIdChange) onPCIdChange(null);
                }
              }}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2"
              required
            >
              <option value="Cliente">Cliente</option>
              <option value="HWI">HWI</option>
              <option value="Cotação">Cotação</option>
            </select>
          </div>

          {/* PC Choice Section - only when Cotação is selected */}
          {isCotacao && !isEditing && (
            <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-3 space-y-3">
              <p className="text-yellow-400 text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Pedido de Cotação
              </p>

              {hasPCs ? (
                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-all ${
                      pcChoice === 'new'
                        ? 'border-yellow-500 bg-yellow-600/10'
                        : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
                    }`}
                    data-testid="pc-choice-new"
                  >
                    <input
                      type="radio"
                      name="pc_choice"
                      value="new"
                      checked={pcChoice === 'new'}
                      onChange={() => {
                        setPcChoice('new');
                        if (onPCIdChange) onPCIdChange(null);
                      }}
                      className="accent-yellow-500"
                    />
                    <div>
                      <span className="text-white text-sm font-medium">Criar novo PC</span>
                      <p className="text-gray-400 text-xs">Cria um novo Pedido de Cotação</p>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-all ${
                      pcChoice === 'existing'
                        ? 'border-yellow-500 bg-yellow-600/10'
                        : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
                    }`}
                    data-testid="pc-choice-existing"
                  >
                    <input
                      type="radio"
                      name="pc_choice"
                      value="existing"
                      checked={pcChoice === 'existing'}
                      onChange={() => setPcChoice('existing')}
                      className="accent-yellow-500"
                    />
                    <div>
                      <span className="text-white text-sm font-medium">Agregar a PC existente</span>
                      <p className="text-gray-400 text-xs">Adiciona material a um PC já criado</p>
                    </div>
                  </label>

                  {pcChoice === 'existing' && (
                    <div className="mt-2">
                      <select
                        data-testid="pc-select-existing"
                        value={selectedPCId || ''}
                        onChange={(e) => {
                          if (onPCIdChange) onPCIdChange(e.target.value || null);
                        }}
                        className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
                        required={pcChoice === 'existing'}
                      >
                        <option value="">Selecione um PC...</option>
                        {existingPCs.map((pc) => (
                          <option key={pc.id} value={pc.id}>
                            {pc.numero_pc} - {pc.status} ({pc.materiais_count || 0} materiais)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-yellow-400/70 text-xs">
                  Um novo Pedido de Cotação será criado automaticamente
                </p>
              )}
            </div>
          )}

          {isCotacao && isEditing && (
            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                Este material está associado a um Pedido de Cotação
              </p>
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
            <Button
              type="submit"
              data-testid="material-submit-btn"
              disabled={loading || (isCotacao && !isEditing && pcChoice === 'existing' && hasPCs && !selectedPCId)}
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

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit } from 'lucide-react';

const IntervencaoModal = ({
  open,
  onOpenChange,
  isEditing = false,
  formData,
  setFormData,
  onSubmit,
  onCancel,
  equipamentosOT = []
}) => {
  const groupedEquipments = equipamentosOT.reduce((groups, eq) => {
    const marca = eq.marca || 'Sem Marca';
    if (!groups[marca]) groups[marca] = [];
    groups[marca].push(eq);
    return groups;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Intervenção' : 'Nova Intervenção'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="data_intervencao" className="text-gray-300">
              Data da Intervenção *
            </Label>
            <Input
              id="data_intervencao"
              type="date"
              value={formData.data_intervencao}
              onChange={(e) => setFormData({ ...formData, data_intervencao: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              required
              data-testid="intervencao-date-input"
            />
          </div>

          <div>
            <Label htmlFor="equipamento_intervencao" className="text-gray-300">
              Equipamento Relacionado
            </Label>
            <select
              id="equipamento_intervencao"
              value={formData.equipamento_id || ''}
              onChange={(e) => setFormData({ ...formData, equipamento_id: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3"
              data-testid="intervencao-equipment-select"
            >
              <option value="">-- Selecionar Equipamento (opcional) --</option>
              {Object.entries(groupedEquipments).sort(([a], [b]) => a.localeCompare(b)).map(([marca, equips]) => (
                <optgroup key={marca} label={`--- ${marca} ---`}>
                  {equips.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.modelo} {eq.numero_serie ? `(S/N: ${eq.numero_serie})` : ''} {eq.tipologia ? `[${eq.tipologia}]` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Selecione o equipamento ao qual esta intervenção se refere
            </p>
          </div>

          <div>
            <Label htmlFor="motivo_assistencia" className="text-gray-300">
              Motivo da Assistência *
            </Label>
            <textarea
              id="motivo_assistencia"
              value={formData.motivo_assistencia}
              onChange={(e) => setFormData({ ...formData, motivo_assistencia: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
              placeholder="Descreva o motivo da assistência..."
              required
              data-testid="intervencao-motivo-input"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="flex-1 border-gray-600"
            >
              Cancelar
            </Button>
            <Button type="submit" className={`flex-1 ${isEditing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'}`}>
              {isEditing ? <Edit className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEditing ? 'Guardar' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default IntervencaoModal;

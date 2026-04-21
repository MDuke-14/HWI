import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText } from 'lucide-react';

const EquipmentCheckboxList = ({ formData, setFormData, selectedRelatorio, equipamentosOT }) => (
  <div>
    <Label className="text-gray-300 mb-2 block">Equipamentos Relacionados</Label>
    <div className="space-y-2 max-h-[200px] overflow-y-auto">
      {selectedRelatorio?.equipamento_marca && (
        <label className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-700 cursor-pointer hover:border-purple-500/50">
          <Checkbox
            checked={formData.equipamento_ids.includes('principal')}
            onCheckedChange={(checked) => {
              setFormData(prev => ({
                ...prev,
                equipamento_ids: checked
                  ? [...prev.equipamento_ids, 'principal']
                  : prev.equipamento_ids.filter(id => id !== 'principal')
              }));
            }}
            className="border-purple-500 data-[state=checked]:bg-purple-600"
          />
          <span className="text-sm text-gray-300">
            <span className="text-purple-400 text-xs mr-1">(Principal)</span>
            {selectedRelatorio.equipamento_tipologia ? `${selectedRelatorio.equipamento_tipologia} - ` : ''}
            {selectedRelatorio.equipamento_marca} {selectedRelatorio.equipamento_modelo}
          </span>
        </label>
      )}
      {equipamentosOT.map(eq => (
        <label key={eq.id} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-700 cursor-pointer hover:border-purple-500/50">
          <Checkbox
            checked={formData.equipamento_ids.includes(eq.id)}
            onCheckedChange={(checked) => {
              setFormData(prev => ({
                ...prev,
                equipamento_ids: checked
                  ? [...prev.equipamento_ids, eq.id]
                  : prev.equipamento_ids.filter(id => id !== eq.id)
              }));
            }}
            className="border-purple-500 data-[state=checked]:bg-purple-600"
          />
          <span className="text-sm text-gray-300">
            {eq.tipologia ? `${eq.tipologia} - ` : ''}{eq.marca} {eq.modelo}
            {eq.numero_serie && <span className="text-gray-500 ml-1">(SN: {eq.numero_serie})</span>}
          </span>
        </label>
      ))}
      {!selectedRelatorio?.equipamento_marca && equipamentosOT.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-2">Nenhum equipamento nesta OT</p>
      )}
    </div>
  </div>
);

const RelAssistModal = ({
  open, onOpenChange, isEditing = false,
  formData, setFormData, onSubmit, onCancel,
  selectedRelatorio, equipamentosOT = []
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-orange-400" />
          {isEditing ? 'Editar' : 'Adicionar'} Relatório de Assistência
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4 mt-4">
        <div>
          <Label className="text-gray-300">Data da Intervenção *</Label>
          <Input
            type="date" value={formData.data_intervencao}
            onChange={(e) => setFormData(prev => ({ ...prev, data_intervencao: e.target.value }))}
            className="bg-[#0f0f0f] border-gray-700 text-white mt-1" required
            data-testid="rel-assist-date-input"
          />
        </div>
        <div>
          <Label className="text-gray-300">Texto *</Label>
          <textarea
            value={formData.texto}
            onChange={(e) => setFormData(prev => ({ ...prev, texto: e.target.value }))}
            className="w-full mt-1 bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 min-h-[120px] text-sm"
            placeholder="Descreva o trabalho realizado..." required
            data-testid="rel-assist-texto-input"
          />
        </div>
        <EquipmentCheckboxList formData={formData} setFormData={setFormData} selectedRelatorio={selectedRelatorio} equipamentosOT={equipamentosOT} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} className="border-gray-600">Cancelar</Button>
          <Button type="submit" className="bg-orange-500 hover:bg-orange-600">{isEditing ? 'Guardar' : 'Adicionar'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

export default RelAssistModal;

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText } from 'lucide-react';

const RelAssistModal = ({
  open, onOpenChange, isEditing = false,
  formData, setFormData, onSubmit, onCancel,
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
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} className="border-gray-600">Cancelar</Button>
          <Button type="submit" className="bg-orange-500 hover:bg-orange-600">{isEditing ? 'Guardar' : 'Adicionar'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

export default RelAssistModal;

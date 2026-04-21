import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, FileText, ScanLine, X, Camera, Upload } from 'lucide-react';
import FaturaScanner from './FaturaScanner';

const DespesaForm = ({
  formData, setFormData, tiposDespesa, allSystemUsers,
  children, onCancel, onSubmit, submitLabel = 'Adicionar', isEditing = false
}) => (
  <form onSubmit={onSubmit} className="space-y-4 mt-4">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-gray-300">Tipo *</Label>
        <select value={formData.tipo} onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value }))} className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1" required>
          {tiposDespesa.map(tipo => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-gray-300">Data *</Label>
        <Input type="date" value={formData.data} onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))} className="bg-[#0f0f0f] border-gray-700 text-white mt-1" required />
      </div>
    </div>
    <div>
      <Label className="text-gray-300">Descrição {formData.tipo === 'outras' || isEditing ? '*' : ''}</Label>
      <Input value={formData.descricao} onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))} placeholder={formData.tipo === 'outras' ? 'Obrigatório' : 'Opcional'} className="bg-[#0f0f0f] border-gray-700 text-white mt-1" required={formData.tipo === 'outras' || isEditing} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-gray-300">Valor (€) *</Label>
        <Input type="number" step="0.01" min="0.01" value={formData.valor} onChange={(e) => setFormData(prev => ({ ...prev, valor: parseFloat(e.target.value) || '' }))} placeholder="0.00" className="bg-[#0f0f0f] border-gray-700 text-white mt-1" required />
      </div>
      <div>
        <Label className="text-gray-300">N.º Fatura *</Label>
        <Input value={formData.numero_fatura || ''} onChange={(e) => setFormData(prev => ({ ...prev, numero_fatura: e.target.value }))} placeholder="Ex: FT 2026/001" className="bg-[#0f0f0f] border-gray-700 text-white mt-1" required={!isEditing} data-testid="despesa-numero-fatura" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-gray-300">Pago por *</Label>
        <select value={formData.tecnico_id} onChange={(e) => setFormData(prev => ({ ...prev, tecnico_id: e.target.value }))} className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1" required>
          <option value="">Selecionar...</option>
          {allSystemUsers.map(user => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-gray-300">Data Fatura</Label>
        <Input type="date" value={formData.data_fatura || ''} onChange={(e) => setFormData(prev => ({ ...prev, data_fatura: e.target.value }))} className="bg-[#0f0f0f] border-gray-700 text-white mt-1" />
        <p className="text-xs text-gray-500 mt-0.5">Recomendado</p>
      </div>
    </div>
    {children}
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} className="border-gray-600">Cancelar</Button>
      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700"><Receipt className="w-4 h-4 mr-1" />{submitLabel}</Button>
    </div>
  </form>
);

export const AddDespesaModal = ({
  open, onOpenChange, formData, setFormData, onSubmit, onCancel,
  tiposDespesa, allSystemUsers, showScanner, setShowScanner
}) => (
  <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setShowScanner(false); }}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white"><Receipt className="w-5 h-5 text-emerald-400" />Nova Despesa</DialogTitle>
      </DialogHeader>
      <DespesaForm formData={formData} setFormData={setFormData} tiposDespesa={tiposDespesa} allSystemUsers={allSystemUsers} onCancel={onCancel} onSubmit={onSubmit} submitLabel="Gerar Despesa">
        <div>
          <Label className="text-gray-300 flex items-center gap-2"><ScanLine className="w-4 h-4 text-emerald-400" />Fatura Digitalizada *</Label>
          <div className="mt-2">
            {formData.factura_filename ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-900/20 border border-emerald-700 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-emerald-400 text-sm font-medium block truncate">{formData.factura_filename}</span>
                  <span className="text-emerald-600 text-xs">PDF digitalizado</span>
                </div>
                <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:text-red-300 shrink-0" onClick={() => { setFormData(prev => ({ ...prev, factura_data: null, factura_filename: null, factura_mimetype: null })); setShowScanner(false); }} data-testid="despesa-remove-fatura"><X className="w-4 h-4" /></Button>
              </div>
            ) : showScanner ? (
              <div className="border border-gray-700 rounded-lg p-4 bg-[#0f0f0f]">
                <FaturaScanner onComplete={(result) => { setFormData(prev => ({ ...prev, factura_data: result.factura_data, factura_filename: result.factura_filename, factura_mimetype: result.factura_mimetype })); setShowScanner(false); }} onCancel={() => setShowScanner(false)} />
              </div>
            ) : (
              <button type="button" onClick={() => setShowScanner(true)} className="w-full flex items-center justify-center gap-3 p-5 border-2 border-dashed border-emerald-600/50 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-900/10 transition-all" data-testid="despesa-open-scanner">
                <ScanLine className="w-7 h-7 text-emerald-400" />
                <div className="text-left"><span className="text-emerald-400 text-sm font-semibold block">Digitalizar Fatura</span><span className="text-gray-500 text-xs">Tire uma foto ou selecione um ficheiro</span></div>
              </button>
            )}
          </div>
        </div>
      </DespesaForm>
    </DialogContent>
  </Dialog>
);

export const EditDespesaModal = ({
  open, onOpenChange, formData, setFormData, onSubmit, onCancel,
  tiposDespesa, allSystemUsers, editCameraInputRef, editFileInputRef,
  handleFacturaUpload, uploadingFactura
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white"><Receipt className="w-5 h-5 text-emerald-400" />Editar Despesa</DialogTitle>
      </DialogHeader>
      <DespesaForm formData={formData} setFormData={setFormData} tiposDespesa={tiposDespesa} allSystemUsers={allSystemUsers} onCancel={onCancel} onSubmit={onSubmit} submitLabel="Guardar Alterações" isEditing>
        <div>
          <Label className="text-gray-300 flex items-center gap-2"><ScanLine className="w-4 h-4 text-emerald-400" />Fatura Digitalizada</Label>
          <div className="mt-2">
            {formData.factura_filename ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-900/20 border border-emerald-700 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 text-sm font-medium flex-1 truncate">{formData.factura_filename}</span>
                <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:text-red-300 shrink-0" onClick={() => setFormData(prev => ({ ...prev, factura_data: null, factura_filename: null, factura_mimetype: null }))}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => editCameraInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-emerald-600/50 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-900/20 transition-colors" data-testid="edit-despesa-scan-btn"><Camera className="w-6 h-6 text-emerald-400" /><span className="text-emerald-400 text-xs font-medium text-center">Tirar Foto</span></button>
                <button type="button" onClick={() => editFileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-800/30 transition-colors" data-testid="edit-despesa-file-btn"><Upload className="w-6 h-6 text-gray-400" /><span className="text-gray-400 text-xs font-medium text-center">Escolher Ficheiro</span></button>
                <input ref={editCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFacturaUpload} className="hidden" disabled={uploadingFactura} />
                <input ref={editFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFacturaUpload} className="hidden" disabled={uploadingFactura} />
              </div>
            )}
          </div>
        </div>
      </DespesaForm>
    </DialogContent>
  </Dialog>
);

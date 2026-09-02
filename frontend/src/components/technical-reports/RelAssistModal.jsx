import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Sparkles, Loader2, RotateCcw } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RelAssistModal = ({
  open, onOpenChange, isEditing = false,
  formData, setFormData, onSubmit, onCancel,
}) => {
  const [aiLoading, setAiLoading] = useState(false);
  const [originalBeforeAi, setOriginalBeforeAi] = useState(null);
  const [aiAlteracoes, setAiAlteracoes] = useState('');

  const handleAiImprove = async () => {
    const texto = (formData?.texto || '').trim();
    if (!texto) {
      toast.error('Escreve primeiro o texto para a IA melhorar.');
      return;
    }
    setAiLoading(true);
    const toastId = toast.loading('A melhorar texto com IA…');
    try {
      const { data } = await axios.post(`${API}/ai/improve-relatorio-assistencia`, {
        texto,
        data_intervencao: formData?.data_intervencao || null,
      });
      const melhorado = data?.texto_melhorado || '';
      if (!melhorado) {
        toast.error('A IA não devolveu conteúdo válido.', { id: toastId });
        return;
      }
      setOriginalBeforeAi(texto);
      setAiAlteracoes(data?.alteracoes_principais || '');
      setFormData((prev) => ({ ...prev, texto: melhorado }));
      toast.success('Texto atualizado pela IA. Podes editar antes de guardar.', { id: toastId });
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao chamar a IA';
      toast.error(msg, { id: toastId });
    } finally {
      setAiLoading(false);
    }
  };

  const handleRevertAi = () => {
    if (originalBeforeAi == null) return;
    setFormData((prev) => ({ ...prev, texto: originalBeforeAi }));
    setOriginalBeforeAi(null);
    setAiAlteracoes('');
    toast.info('Texto revertido para o original.');
  };

  const handleDialogChange = (v) => {
    if (!v) {
      // reset AI state on close
      setOriginalBeforeAi(null);
      setAiAlteracoes('');
    }
    onOpenChange?.(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
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
            <div className="flex items-center justify-between mb-1">
              <Label className="text-gray-300">Texto *</Label>
              <div className="flex items-center gap-1">
                {originalBeforeAi != null && (
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={handleRevertAi}
                    className="text-gray-400 hover:text-white h-7 text-xs px-2"
                    data-testid="rel-assist-ai-revert"
                    title="Reverter para o texto original"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reverter
                  </Button>
                )}
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={handleAiImprove} disabled={aiLoading}
                  className="text-purple-300 hover:text-purple-200 h-7 text-xs px-2 disabled:opacity-50"
                  data-testid="rel-assist-ai-improve"
                  title="Melhorar profissionalmente com IA"
                >
                  {aiLoading ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> A melhorar…</>
                  ) : (
                    <><Sparkles className="w-3 h-3 mr-1" /> Melhorar com IA</>
                  )}
                </Button>
              </div>
            </div>
            <textarea
              value={formData.texto}
              onChange={(e) => setFormData(prev => ({ ...prev, texto: e.target.value }))}
              className="w-full mt-1 bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 min-h-[140px] text-sm"
              placeholder="Descreve o trabalho realizado (o botão 'Melhorar com IA' reescreve profissionalmente sem inventar factos)…"
              required
              data-testid="rel-assist-texto-input"
            />
            {aiAlteracoes && (
              <p className="text-[11px] text-purple-300/80 mt-1 flex items-start gap-1">
                <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{aiAlteracoes}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="border-gray-600">Cancelar</Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600">{isEditing ? 'Guardar' : 'Adicionar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RelAssistModal;

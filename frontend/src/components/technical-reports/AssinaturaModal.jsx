import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { PenTool, Trash2, Calendar, User, Plus, Edit } from 'lucide-react';

const AssinaturaModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  assinaturas,
  onAssinaturaSaved
}) => {
  const [assinaturaCanvas, setAssinaturaCanvas] = useState(null);
  const [assinaturaNome, setAssinaturaNome] = useState({ primeiro: '', ultimo: '' });
  const [assinaturaDataIntervencao, setAssinaturaDataIntervencao] = useState(new Date().toISOString().split('T')[0]);
  const [uploadingAssinatura, setUploadingAssinatura] = useState(false);
  const [editingAssinatura, setEditingAssinatura] = useState(null);
  const sigCanvasRef = useRef(null);

  const clearCanvas = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  const handleSaveAssinaturaDigital = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      toast.error('Por favor, desenhe sua assinatura');
      return;
    }

    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      const canvas = sigCanvasRef.current.getCanvas();
      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'assinatura.png');
        formData.append('primeiro_nome', assinaturaNome.primeiro);
        formData.append('ultimo_nome', assinaturaNome.ultimo);
        formData.append('data_intervencao', assinaturaDataIntervencao);

        try {
          await axios.post(
            `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );

          toast.success('Assinatura digital salva com sucesso!');
          resetForm();
          onAssinaturaSaved();
        } catch (error) {
          toast.error(error.response?.data?.detail || 'Erro ao salvar assinatura');
        } finally {
          setUploadingAssinatura(false);
        }
      }, 'image/png');
    } catch (error) {
      toast.error('Erro ao processar assinatura');
      setUploadingAssinatura(false);
    }
  };

  const handleSaveAssinaturaManual = async () => {
    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      const formData = new FormData();
      formData.append('primeiro_nome', assinaturaNome.primeiro);
      formData.append('ultimo_nome', assinaturaNome.ultimo);
      formData.append('data_intervencao', assinaturaDataIntervencao);

      await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-manual`,
        formData
      );

      toast.success('Assinatura manual salva com sucesso!');
      resetForm();
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar assinatura');
    } finally {
      setUploadingAssinatura(false);
    }
  };

  const handleDeleteAssinatura = async (assinaturaId) => {
    if (!window.confirm('Tem certeza que deseja eliminar esta assinatura?')) return;
    
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}`);
      toast.success('Assinatura removida com sucesso!');
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao remover assinatura');
    }
  };

  const handleUpdateAssinaturaData = async (assinaturaId, novaData) => {
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}/data`,
        { data_intervencao: novaData }
      );
      toast.success('Data da assinatura atualizada!');
      setEditingAssinatura(null);
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar data');
    }
  };

  const resetForm = () => {
    setAssinaturaNome({ primeiro: '', ultimo: '' });
    setAssinaturaDataIntervencao(new Date().toISOString().split('T')[0]);
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <PenTool className="w-5 h-5 text-blue-400" />
            Assinaturas - OT #{selectedRelatorio?.numero_assistencia}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Lista de Assinaturas Existentes */}
          {assinaturas && assinaturas.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-400">Assinaturas Existentes ({assinaturas.length})</h4>
              {assinaturas.map((ass, index) => (
                <div key={ass.id || index} className="bg-[#0f0f0f] p-3 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {ass.assinatura_base64 && (
                      <img
                        src={`data:image/png;base64,${ass.assinatura_base64}`}
                        alt="Assinatura"
                        className="h-10 bg-white rounded"
                      />
                    )}
                    <div>
                      <p className="text-white font-medium">
                        {ass.primeiro_nome} {ass.ultimo_nome}
                      </p>
                      {editingAssinatura === ass.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="date"
                            defaultValue={ass.data_intervencao?.split('T')[0]}
                            className="bg-[#1a1a1a] border-gray-700 text-white h-8 w-40"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUpdateAssinaturaData(ass.id, e.target.value);
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingAssinatura(null)}
                            className="h-8 text-gray-400"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {ass.data_intervencao ? new Date(ass.data_intervencao).toLocaleDateString('pt-PT') : 'Sem data'}
                          <button
                            onClick={() => setEditingAssinatura(ass.id)}
                            className="ml-2 text-blue-400 hover:text-blue-300"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteAssinatura(ass.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar Nova Assinatura */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Nova Assinatura
            </h4>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-gray-400 text-sm">Primeiro Nome *</Label>
                <Input
                  value={assinaturaNome.primeiro}
                  onChange={(e) => setAssinaturaNome({ ...assinaturaNome, primeiro: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: João"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Último Nome *</Label>
                <Input
                  value={assinaturaNome.ultimo}
                  onChange={(e) => setAssinaturaNome({ ...assinaturaNome, ultimo: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: Silva"
                />
              </div>
            </div>

            <div className="mb-4">
              <Label className="text-gray-400 text-sm">Data da Intervenção *</Label>
              <Input
                type="date"
                value={assinaturaDataIntervencao}
                onChange={(e) => setAssinaturaDataIntervencao(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white w-48"
              />
            </div>

            <Tabs defaultValue="digital" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#0f0f0f]">
                <TabsTrigger value="digital" className="data-[state=active]:bg-blue-600">
                  Assinatura Digital
                </TabsTrigger>
                <TabsTrigger value="manual" className="data-[state=active]:bg-blue-600">
                  Apenas Nome
                </TabsTrigger>
              </TabsList>

              <TabsContent value="digital" className="mt-4">
                <div className="bg-white rounded-lg p-2 mb-3">
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    canvasProps={{
                      width: 500,
                      height: 150,
                      className: 'signature-canvas w-full'
                    }}
                    backgroundColor="white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={clearCanvas}
                    className="border-gray-600"
                  >
                    Limpar
                  </Button>
                  <Button
                    onClick={handleSaveAssinaturaDigital}
                    disabled={uploadingAssinatura}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {uploadingAssinatura ? 'A guardar...' : 'Guardar Assinatura Digital'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="manual" className="mt-4">
                <p className="text-gray-400 text-sm mb-3">
                  A assinatura será registada apenas com o nome fornecido, sem imagem.
                </p>
                <Button
                  onClick={handleSaveAssinaturaManual}
                  disabled={uploadingAssinatura}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {uploadingAssinatura ? 'A guardar...' : 'Guardar Assinatura Manual'}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssinaturaModal;

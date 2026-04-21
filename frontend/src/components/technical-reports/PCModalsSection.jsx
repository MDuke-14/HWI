import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Download, Send, Trash2, Image as ImageIcon, Plus, Save, Eye, EyeOff, X, Upload, ChevronDown } from 'lucide-react';

/**
 * PC Modals Section - Pedidos de Cotação detail, photos, email, material edit
 * Extracted from TechnicalReports.jsx for maintainability.
 * Receives all required state/handlers via props object.
 */
const PCModalsSection = (props) => {
  const {
    showPCModal, setShowPCModal, selectedPC, setSelectedPC,
    fotografiasPC, setFotografiasPC, 
    handleUpdatePC, setPCFormData, triggerPCDownload,
    showAddFotoPCModal, setShowAddFotoPCModal, 
    fotoPCFile, setFotoPCFile, fotoPCDescricao, setFotoPCDescricao,
    handleFotoPCFileChange, handleUploadFotoPC, handleDeleteFotoPC,
    showEmailPCModal, setShowEmailPCModal, triggerPCEmail,
    setIdiomaEmail, emailPCDestinatario, setEmailPCDestinatario,
    emailPCCC, setEmailPCCC,
    showEditMaterialPCModal, setShowEditMaterialPCModal,
    editMaterialPCForm, setEditMaterialPCForm, handleUpdateMaterialPC,
    handleDeleteFatura, handleUploadFatura, handleViewFatura,
    faturaFile, setFaturaFile, faturaDescricao, setFaturaDescricao,
    showHideClientPopup, setShowHideClientPopup,
    API
  } = props;

  return (
    <>
      {/* PC Modal */}
      <Dialog open={showPCModal} onOpenChange={(open) => {
        setShowPCModal(open);
        if (!open) {
          setSelectedPC(null);
          setFotografiasPC([]);
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-white">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-yellow-400" />
                {selectedPC?.numero_pc} - Pedido de Cotação
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={() => triggerPCDownload(selectedPC?.id)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download PDF
                </Button>
                <Button
                  onClick={() => setShowEmailPCModal(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Send className="w-4 h-4 mr-1" />
                  Enviar Email
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedPC && (
            <div className="space-y-4 mt-4">
              {/* Informações da FS */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-blue-700">
                <h4 className="text-blue-400 font-semibold mb-3">Informações da Folha de Serviço</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Número FS:</span>
                    <span className="text-white ml-2 font-medium">#{selectedPC.numero_ot || selectedPC.ot_numero || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Cliente:</span>
                    <span className="text-white ml-2">{selectedPC.cliente_nome || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Dados da Máquina */}
              {(selectedPC.equipamento_tipologia || selectedPC.equipamento_marca || selectedPC.equipamento_modelo) && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                  <h4 className="text-yellow-400 font-semibold mb-3">Dados da Máquina</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Tipologia:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_tipologia || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Marca:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_marca || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Modelo:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_modelo || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Nº Série:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_numero_serie || 'N/A'}</span>
                    </div>
                    {selectedPC.equipamento_ano_fabrico && (
                      <div>
                        <span className="text-gray-400">Ano:</span>
                        <span className="text-white ml-2">{selectedPC.equipamento_ano_fabrico}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <Label className="text-gray-300">Status do PC</Label>
                <select
                  value={pcFormData.status}
                  onChange={(e) => setPCFormData({ ...pcFormData, status: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1"
                >
                  <option value="Em Espera">Em Espera</option>
                  <option value="Cotação Pedida">Cotação Pedida</option>
                  <option value="A Caminho">A Caminho</option>
                  <option value="Em Armazém">Em Armazém</option>
                  <option value="Terminado">Terminado</option>
                </select>
              </div>

              {/* Materiais */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-3">Material para Cotação</h4>
                {selectedPC.materiais?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPC.materiais.map((mat) => (
                      <div key={mat.id} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                        <div className="flex-1">
                          <span className="text-white">{mat.descricao}</span>
                          <span className="text-gray-400 ml-3">Qtd: {mat.quantidade} {mat.unidade || 'Un'}</span>
                          {(mat.posicao || mat.codigo) && (
                            <div className="flex gap-3 mt-0.5">
                              {mat.posicao && <span className="text-white text-sm">Posição: {mat.posicao}</span>}
                              {mat.codigo && <span className="text-white text-sm">Código: {mat.codigo}</span>}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => openEditMaterialPCModal(mat)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Nenhum material associado</p>
                )}
              </div>

              {/* Fotografias */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-blue-400 font-semibold">Fotografias</h4>
                  <Button
                    onClick={() => setShowAddFotoPCModal(true)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Foto
                  </Button>
                </div>

                {fotografiasPC.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {fotografiasPC.map((foto) => (
                      <div key={foto.id} className="relative group">
                        <img
                          src={`${API}${foto.foto_url}`}
                          alt={foto.descricao}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <Button
                            onClick={() => handleDeleteFotoPC(foto.id)}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-gray-300 text-sm mt-1">{foto.descricao}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhuma fotografia</p>
                )}
              </div>

              {/* Observações */}
              <div>
                <Label className="text-gray-300">Observações</Label>
                <textarea
                  value={pcFormData.observacoes}
                  onChange={(e) => setPCFormData({ ...pcFormData, observacoes: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1 min-h-[100px]"
                  placeholder="Adicione observações sobre este pedido de cotação..."
                />
              </div>

              {/* Faturas */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-amber-400 font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Faturas de Peças
                  </h4>
                </div>

                {/* Upload Form */}
                <form onSubmit={handleUploadFatura} className="mb-4 p-3 bg-[#0a0a0a] rounded-lg border border-gray-700">
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label className="text-gray-300 text-sm">Ficheiro (PDF, Imagem)</Label>
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                        onChange={(e) => setFaturaFile(e.target.files[0])}
                        className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Descrição (opcional)</Label>
                      <Input
                        value={faturaDescricao}
                        onChange={(e) => setFaturaDescricao(e.target.value)}
                        className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                        placeholder="Ex: Fatura peça X, Orçamento fornecedor Y"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={!faturaFile || uploadingFatura}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingFatura ? 'A carregar...' : 'Carregar Fatura'}
                    </Button>
                  </div>
                </form>

                {/* Lista de Faturas */}
                {faturasPC.length > 0 ? (
                  <div className="space-y-2">
                    {faturasPC.map((fatura) => (
                      <div 
                        key={fatura.id} 
                        className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg border border-gray-700 hover:border-amber-500/50 transition"
                      >
                        <div 
                          className="flex-1 cursor-pointer hover:text-amber-400 transition"
                          onClick={() => handleViewFatura(fatura)}
                          title="Clique para ver"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-amber-400" />
                            <span className="text-white font-medium">{fatura.nome_ficheiro}</span>
                          </div>
                          {fatura.descricao && (
                            <p className="text-gray-400 text-sm mt-1 ml-6">{fatura.descricao}</p>
                          )}
                          <p className="text-gray-500 text-xs mt-1 ml-6">
                            {fatura.uploaded_by && `Por ${fatura.uploaded_by} • `}
                            {fatura.uploaded_at && new Date(fatura.uploaded_at).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleViewFatura(fatura)}
                            size="sm"
                            variant="outline"
                            className="border-gray-600 text-gray-300 hover:text-white"
                            title="Ver fatura"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteFatura(fatura.id)}
                            size="sm"
                            variant="destructive"
                            title="Remover fatura"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhuma fatura carregada</p>
                )}
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowPCModal(false)}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Fechar
                </Button>
                <Button
                  onClick={handleUpdatePC}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Guardar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Foto PC Modal */}
      <Dialog open={showAddFotoPCModal} onOpenChange={setShowAddFotoPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar Fotografia ao PC</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadFotoPC} className="space-y-4">
            <div>
              <Label htmlFor="foto_pc_file" className="text-gray-300">Selecionar Imagem</Label>
              <Input
                id="foto_pc_file"
                type="file"
                accept="image/*"
                onChange={handleFotoPCFileChange}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="foto_pc_descricao" className="text-gray-300">Descrição</Label>
              <Input
                id="foto_pc_descricao"
                defaultValue={fotoPCDescricao}
                onBlur={(e) => setFotoPCDescricao(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Vista frontal do equipamento"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddFotoPCModal(false);
                  setFotoPCFile(null);
                  setFotoPCDescricao('');
                }}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={uploadingFotoPC}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                disabled={uploadingFotoPC}
              >
                {uploadingFotoPC ? 'Enviando...' : 'Adicionar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email PC Modal */}
      <Dialog open={showEmailPCModal} onOpenChange={setShowEmailPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Enviar PDF por Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">Selecione o email de destino:</p>
            <div className="space-y-2">
              {['geral@hwi.pt', 'pedro.duarte@hwi.pt', 'miguel.moreira@hwi.pt'].map((email) => (
                <Button
                  key={email}
                  onClick={() => triggerPCEmail(email)}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={sendingEmailPC}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {email}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup: Esconder nome do cliente no PC */}
      <Dialog open={showHideClientPopup} onOpenChange={setShowHideClientPopup}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Dados do Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Deseja ocultar o nome do cliente no documento?
          </p>
          <p className="text-gray-500 text-xs mt-1">
            O nome será substituído por uma barra preta de confidencialidade.
          </p>

          {/* Idioma do Email (só aparece para envio de email, não download) */}
          {hideClientAction?.type === 'email' && (
            <div className="border-t border-gray-800 pt-3 mt-3">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Idioma do Email</p>
              <div className="flex gap-2">
                {[
                  { value: 'pt', label: 'PT', flag: '🇵🇹' },
                  { value: 'es', label: 'ES', flag: '🇪🇸' },
                  { value: 'en', label: 'EN', flag: '🇬🇧' },
                ].map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setIdiomaEmail(lang.value)}
                    data-testid={`pc-lang-${lang.value}`}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm transition-all ${
                      idiomaEmail === lang.value
                        ? 'border-green-500 bg-green-600/10 text-white font-medium'
                        : 'border-gray-700 bg-[#0f0f0f] text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => executeHideClientAction(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-700"
              data-testid="pc-client-show"
            >
              Mostrar Cliente
            </Button>
            <Button
              onClick={() => executeHideClientAction(true)}
              className="flex-1 bg-gray-900 hover:bg-black border border-gray-600"
              data-testid="pc-client-hide"
            >
              Ocultar Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Material PC Modal */}
      <Dialog open={showEditMaterialPCModal} onOpenChange={setShowEditMaterialPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Descrição</Label>
              <Input
                value={editMaterialPCForm.descricao}
                onChange={(e) => setEditMaterialPCForm({ ...editMaterialPCForm, descricao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                placeholder="Descrição do material"
              />
            </div>
            <div>
              <Label className="text-gray-300">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={editMaterialPCForm.quantidade}
                onChange={(e) => setEditMaterialPCForm({ ...editMaterialPCForm, quantidade: parseInt(e.target.value) || 1 })}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setShowEditMaterialPCModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateMaterialPC}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </>
  );
};

export default PCModalsSection;

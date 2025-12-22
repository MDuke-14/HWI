import React, { useState, useEffect } from 'react';
import { Info, X, Building2, Phone, Globe, Mail, MapPin, CreditCard, Smartphone, Edit, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CompanyInfoCard = ({ user }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companyData, setCompanyData] = useState({
    nome_empresa: 'HWI UNIPESSOAL LDA',
    telefone: '518176657',
    telemovel: '+351 913008138',
    website: 'www.hwi.pt',
    email: 'geral@hwi.pt',
    morada_linha1: 'Rua Mário Pereira 7 RC ESQ',
    morada_linha2: '2830-493 Barreiro, PT',
    iban: 'PT50 0007 0000 0074 9942 1152 3'
  });

  const [editData, setEditData] = useState({ ...companyData });

  // Buscar dados da empresa ao abrir o modal
  useEffect(() => {
    if (showInfo) {
      fetchCompanyInfo();
    }
  }, [showInfo]);

  const fetchCompanyInfo = async () => {
    try {
      const response = await axios.get(`${API}/company-info`);
      setCompanyData(response.data);
      setEditData(response.data);
    } catch (error) {
      console.error('Erro ao buscar dados da empresa:', error);
      toast.error('Erro ao carregar informações da empresa');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/company-info`, editData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCompanyData(editData);
      setIsEditing(false);
      toast.success('Informações atualizadas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao atualizar informações');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditData({ ...companyData });
    setIsEditing(false);
  };

  const isAdmin = user?.is_admin === true;

  return (
    <>
      {/* Botão Flutuante */}
      <button
        onClick={() => setShowInfo(true)}
        className="relative group"
        title="Informações da Empresa"
      >
        <div className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-xl">
          <Info className="w-5 h-5 text-white" />
        </div>
        
        {/* Tooltip */}
        <div className="absolute hidden group-hover:block bottom-full mb-2 right-0 whitespace-nowrap">
          <div className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg">
            Info da Empresa
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </button>

      {/* Modal com InfoCard */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                Informações da Empresa
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && !isEditing && (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
                {isEditing && (
                  <>
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Salvar
                    </Button>
                    <Button
                      onClick={handleCancel}
                      className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-3 py-1"
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                <button
                  onClick={() => {
                    setShowInfo(false);
                    setIsEditing(false);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Nome da Empresa */}
            <div className="text-center pb-4 border-b border-gray-700">
              {isEditing ? (
                <div className="space-y-2">
                  <Label className="text-gray-300">Nome da Empresa</Label>
                  <Input
                    value={editData.nome_empresa}
                    onChange={(e) => setEditData({ ...editData, nome_empresa: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white text-center text-xl font-bold"
                  />
                </div>
              ) : (
                <h2 className="text-2xl font-bold text-blue-400 mb-2">
                  {companyData.nome_empresa}
                </h2>
              )}
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="bg-white p-3 rounded-lg">
                  <svg viewBox="0 0 200 80" className="w-32 h-12">
                    <text x="10" y="50" fontFamily="Arial Black, sans-serif" fontSize="32" fontWeight="900" fill="#1e40af">HWI</text>
                    <text x="10" y="75" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="bold" fill="#64748b">HARDWORK</text>
                    <text x="110" y="75" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="bold" fill="#64748b">INDUSTRY</text>
                  </svg>
                </div>
              </div>
            </div>

            {/* Informações de Contato */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{isEditing ? (
                <>
                  {/* Telefone - Edit */}
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-blue-400" />
                      Telefone
                    </Label>
                    <Input
                      value={editData.telefone}
                      onChange={(e) => setEditData({ ...editData, telefone: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  {/* Telemóvel - Edit */}
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-400" />
                      Telemóvel
                    </Label>
                    <Input
                      value={editData.telemovel}
                      onChange={(e) => setEditData({ ...editData, telemovel: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  {/* Website - Edit */}
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-purple-400" />
                      Website
                    </Label>
                    <Input
                      value={editData.website}
                      onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>

                  {/* Email - Edit */}
                  <div className="space-y-2">
                    <Label className="text-gray-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-red-400" />
                      Email
                    </Label>
                    <Input
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Telefone - View */}
                  <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Telefone</p>
                      <p className="text-white font-semibold">{companyData.telefone}</p>
                    </div>
                  </div>

                  {/* Telemóvel - View */}
                  <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
                      <Smartphone className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Telemóvel</p>
                      <p className="text-white font-semibold">{companyData.telemovel}</p>
                    </div>
                  </div>

                  {/* Website - View */}
                  <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Website</p>
                      <a 
                        href={`http://${companyData.website}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                      >
                        {companyData.website}
                      </a>
                    </div>
                  </div>

                  {/* Email - View */}
                  <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Email</p>
                      <a 
                        href={`mailto:${companyData.email}`}
                        className="text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                      >
                        {companyData.email}
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Morada */}
            {isEditing ? (
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-yellow-400" />
                  Morada
                </Label>
                <Input
                  value={editData.morada_linha1}
                  onChange={(e) => setEditData({ ...editData, morada_linha1: e.target.value })}
                  placeholder="Linha 1"
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <Input
                  value={editData.morada_linha2}
                  onChange={(e) => setEditData({ ...editData, morada_linha2: e.target.value })}
                  placeholder="Linha 2"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Morada</p>
                  <p className="text-white font-semibold">
                    {companyData.morada_linha1}<br />
                    {companyData.morada_linha2}
                  </p>
                </div>
              </div>
            )}

            {/* IBAN */}
            {isEditing ? (
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400" />
                  IBAN
                </Label>
                <Input
                  value={editData.iban}
                  onChange={(e) => setEditData({ ...editData, iban: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white font-mono"
                />
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-cyan-600/20 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">IBAN</p>
                  <p className="text-white font-mono text-sm font-semibold break-all">
                    {companyData.iban}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-700 text-center">
            <p className="text-gray-400 text-xs">
              © 2025 HWI Unipessoal, Lda. Todos os direitos reservados.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompanyInfoCard;

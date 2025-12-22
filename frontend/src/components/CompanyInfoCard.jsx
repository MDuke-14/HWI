import React, { useState } from 'react';
import { Info, X, Building2, Phone, Globe, Mail, MapPin, CreditCard, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CompanyInfoCard = () => {
  const [showInfo, setShowInfo] = useState(false);

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
        <DialogContent className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                Informações da Empresa
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Nome da Empresa */}
            <div className="text-center pb-4 border-b border-gray-700">
              <h2 className="text-2xl font-bold text-blue-400 mb-2">
                HWI UNIPESSOAL LDA
              </h2>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Telefone */}
              <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Telefone</p>
                  <p className="text-white font-semibold">518176657</p>
                </div>
              </div>

              {/* Telemóvel */}
              <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Telemóvel</p>
                  <p className="text-white font-semibold">+351 913008138</p>
                </div>
              </div>

              {/* Website */}
              <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Website</p>
                  <a 
                    href="http://www.hwi.pt" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                  >
                    www.hwi.pt
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
                <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <a 
                    href="mailto:geral@hwi.pt"
                    className="text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                  >
                    geral@hwi.pt
                  </a>
                </div>
              </div>
            </div>

            {/* Morada */}
            <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Morada</p>
                <p className="text-white font-semibold">
                  Rua Mário Pereira 7 RC ESQ<br />
                  2830-493 Barreiro, PT
                </p>
              </div>
            </div>

            {/* IBAN */}
            <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-full bg-cyan-600/20 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">IBAN</p>
                <p className="text-white font-mono text-sm font-semibold break-all">
                  PT50 0007 0000 0074 9942 1152 3
                </p>
              </div>
            </div>
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

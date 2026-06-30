import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const LANG_OPTIONS = [
  { value: 'pt', label: 'PT', flag: '🇵🇹' },
  { value: 'es', label: 'ES', flag: '🇪🇸' },
  { value: 'en', label: 'EN', flag: '🇬🇧' },
];

/**
 * Popup para decidir esconder ou mostrar nome do cliente no PC,
 * com escolha de idioma quando ação é envio de email.
 */
const HideClientPopup = ({
  open,
  onOpenChange,
  actionType,
  idiomaEmail,
  setIdiomaEmail,
  onExecute,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Dados do Cliente</DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>
        <p className="text-gray-300 text-sm">
          Deseja ocultar o nome do cliente no documento?
        </p>
        <p className="text-gray-500 text-xs mt-1">
          O nome será substituído por uma barra preta de confidencialidade.
        </p>

        {actionType === 'email' && (
          <div className="border-t border-gray-800 pt-3 mt-3">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Idioma do Email</p>
            <div className="flex gap-2">
              {LANG_OPTIONS.map((lang) => (
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
            onClick={() => onExecute(false)}
            className="flex-1 bg-gray-600 hover:bg-gray-700"
            data-testid="pc-client-show"
          >
            Mostrar Cliente
          </Button>
          <Button
            onClick={() => onExecute(true)}
            className="flex-1 bg-gray-900 hover:bg-black border border-gray-600"
            data-testid="pc-client-hide"
          >
            Ocultar Cliente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HideClientPopup;

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User, Mail } from 'lucide-react';
import OneDriveConnectButton from './onedrive/OneDriveConnectButton';

/**
 * Modal de perfil para desktop — mostra info básica do utilizador e cartão OneDrive.
 * O change-password fica fora deste escopo (existe já no fluxo obrigatório de first-login).
 */
const DesktopProfileModal = ({ open, onOpenChange, user }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-white">
          <User className="w-5 h-5 text-blue-400" />
          O meu perfil
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 mt-2">
        {/* Info */}
        <div className="p-3 rounded-lg border border-gray-700 bg-[#0f0f0f] space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400">Utilizador:</span>
            <span className="text-white font-medium" data-testid="profile-username">{user?.username || '—'}</span>
          </div>
          {user?.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400">Email:</span>
              <span className="text-white truncate">{user.email}</span>
            </div>
          )}
          {user?.full_name && (
            <div className="text-xs text-gray-400">Nome: <span className="text-gray-300">{user.full_name}</span></div>
          )}
        </div>

        {/* Integrações */}
        <div className="p-3 rounded-lg border border-gray-700 bg-[#0f0f0f] space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Integrações</h3>
          <OneDriveConnectButton variant="card" />
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Liga a tua conta Microsoft para importar fotografias diretamente do teu OneDrive nas FS.
            Cada utilizador liga a sua própria conta — ninguém acede aos ficheiros dos outros.
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default DesktopProfileModal;

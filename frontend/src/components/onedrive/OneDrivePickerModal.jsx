import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cloud, Folder, ImageIcon, ChevronLeft, Loader2, Search, Check } from 'lucide-react';
import OneDriveConnectButton from './OneDriveConnectButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * File picker OneDrive — navega pastas, mostra thumbnails de imagens e
 * devolve os *bytes* das imagens selecionadas ao componente pai via
 * onPick(files: File[]).
 */
export default function OneDrivePickerModal({ open, onOpenChange, onPick }) {
  const [connected, setConnected] = useState(null); // null=unknown, true, false
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [folderStack, setFolderStack] = useState([{ id: null, name: 'OneDrive' }]);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState({}); // {itemId: {name, mime}}
  const [importing, setImporting] = useState(false);

  const currentFolder = folderStack[folderStack.length - 1];

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/onedrive/status`);
      setConnected(!!data.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  const loadFolder = useCallback(async (folderId, search) => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      else if (folderId) params.folder_id = folderId;
      const { data } = await axios.get(`${API}/onedrive/list`, { params });
      setItems(data.items || []);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 || e?.response?.status === 401) {
        setConnected(false);
        toast.error(detail || 'Precisas de ligar a tua conta OneDrive');
      } else {
        toast.error(detail || 'Erro a listar OneDrive');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected({});
    setSearchQ('');
    setFolderStack([{ id: null, name: 'OneDrive' }]);
    checkStatus();
  }, [open, checkStatus]);

  useEffect(() => {
    if (open && connected) loadFolder(currentFolder.id, null);
  }, [open, connected, currentFolder.id, loadFolder]);

  const enterFolder = (item) => {
    setFolderStack((prev) => [...prev, { id: item.id, name: item.name }]);
  };

  const goBack = () => {
    if (folderStack.length <= 1) return;
    setFolderStack((prev) => prev.slice(0, -1));
  };

  const toggleSelect = (item) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { name: item.name, mime: item.mime_type || 'image/jpeg' };
      return next;
    });
  };

  const runSearch = (e) => {
    e.preventDefault();
    if (!searchQ.trim()) {
      loadFolder(currentFolder.id, null);
      return;
    }
    setFolderStack([{ id: null, name: `Pesquisa: "${searchQ}"` }]);
    loadFolder(null, searchQ);
  };

  const handleImport = async () => {
    const ids = Object.keys(selected);
    if (!ids.length) return;
    setImporting(true);
    const toastId = toast.loading(`A importar ${ids.length} imagem(ns) do OneDrive…`);
    const files = [];
    try {
      for (const id of ids) {
        const meta = selected[id];
        const resp = await axios.get(`${API}/onedrive/download/${id}`, { responseType: 'blob' });
        const file = new File([resp.data], meta.name, { type: resp.data.type || meta.mime });
        files.push(file);
      }
      toast.success(`${files.length} imagem(ns) importada(s)`, { id: toastId });
      onPick?.(files);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao importar', { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  const numSelected = Object.keys(selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl h-[85vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 border-b border-gray-700 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Cloud className="w-5 h-5 text-blue-400" />
            Escolher imagens do OneDrive
          </DialogTitle>
        </DialogHeader>

        {connected === false ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <Cloud className="w-14 h-14 text-blue-400/60" />
            <p className="text-gray-300 text-center">
              Ainda não ligaste a tua conta OneDrive.<br />
              <span className="text-xs text-gray-500">Cada utilizador liga a sua própria conta — o Miguel nunca acede aos ficheiros dos outros.</span>
            </p>
            <OneDriveConnectButton variant="card" onConnected={() => setConnected(true)} />
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={goBack} disabled={folderStack.length <= 1} className="text-gray-300 h-8 px-2">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 text-sm text-gray-300 truncate flex items-center gap-1">
                <Folder className="w-4 h-4 text-blue-400" />
                <span className="truncate">
                  {folderStack.map((f, i) => (
                    <span key={i}>{i > 0 && <span className="text-gray-600 mx-1">/</span>}{f.name}</span>
                  ))}
                </span>
              </div>
              <form onSubmit={runSearch} className="flex items-center gap-1">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Pesquisar…"
                  className="bg-[#0f0f0f] border-gray-700 text-white h-8 w-40 text-xs"
                />
              </form>
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> A carregar…
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-gray-500 py-16">Pasta vazia ou sem imagens.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {items.map((item) => {
                    const isSel = !!selected[item.id];
                    if (item.is_folder) {
                      return (
                        <button
                          key={item.id}
                          onClick={() => enterFolder(item)}
                          className="p-3 rounded-lg border border-gray-700 bg-[#0f0f0f] hover:bg-blue-500/10 hover:border-blue-500/40 transition flex flex-col items-center gap-2 text-center"
                        >
                          <Folder className="w-10 h-10 text-blue-400" />
                          <span className="text-xs text-gray-200 truncate w-full" title={item.name}>{item.name}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleSelect(item)}
                        className={`p-2 rounded-lg border transition flex flex-col items-center gap-2 relative ${isSel ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-blue-500/40'}`}
                        data-testid={`onedrive-item-${item.id}`}
                      >
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} className="w-full h-24 object-cover rounded" loading="lazy" />
                        ) : (
                          <div className="w-full h-24 rounded bg-[#181818] flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-gray-600" />
                          </div>
                        )}
                        <span className="text-[11px] text-gray-200 truncate w-full" title={item.name}>{item.name}</span>
                        {isSel && (
                          <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-800 p-3 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-400">
                {numSelected > 0 ? `${numSelected} imagem(ns) selecionada(s)` : 'Selecionar imagens para importar'}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-600">Cancelar</Button>
                <Button
                  onClick={handleImport}
                  disabled={numSelected === 0 || importing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  data-testid="onedrive-import-btn"
                >
                  {importing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> A importar…</> : `Importar (${numSelected})`}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

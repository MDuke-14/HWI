import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Edit, Trash2, FileDown, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

const History = ({ user, onLogout }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForms, setEditForms] = useState({}); // Store edit state for each individual entry

  // Helper function to format decimal hours as HH:MM
  const formatHours = (decimalHours) => {
    if (!decimalHours) return '0h00m';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  };

  useEffect(() => {
    fetchEntries();
  }, [startDate, endDate]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = format(startDate, 'yyyy-MM-dd');
      if (endDate) params.end_date = format(endDate, 'yyyy-MM-dd');
      
      const response = await axios.get(`${API}/time-entries/list`, { params });
      setEntries(response.data);
    } catch (error) {
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setEditForm({
      start_time: entry.start_time ? entry.start_time.split('.')[0] : '',
      end_time: entry.end_time ? entry.end_time.split('.')[0] : '',
      observations: entry.observations || ''
    });
  };

  const handleSaveEdit = async () => {
    try {
      const updateData = {
        observations: editForm.observations
      };
      
      if (editForm.start_time) {
        updateData.start_time = new Date(editForm.start_time).toISOString();
      }
      if (editForm.end_time) {
        updateData.end_time = new Date(editForm.end_time).toISOString();
      }

      await axios.put(`${API}/time-entries/${editingEntry.id}`, updateData);
      toast.success('Registo atualizado!');
      setEditingEntry(null);
      fetchEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar');
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Tem certeza que deseja eliminar este registo?')) return;
    
    try {
      await axios.delete(`${API}/time-entries/${entryId}`);
      toast.success('Registo eliminado');
      fetchEntries();
    } catch (error) {
      toast.error('Erro ao eliminar registo');
    }
  };

  const exportToCSV = () => {
    if (entries.length === 0) {
      toast.error('Não há dados para exportar');
      return;
    }

    const headers = ['Data', 'Início', 'Fim', 'Total Horas', 'Status', 'Observações'];
    const rows = entries.map(entry => [
      entry.date,
      entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT') : '',
      entry.end_time ? new Date(entry.end_time).toLocaleTimeString('pt-PT') : '',
      entry.total_hours || '',
      entry.status,
      entry.observations || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registos_ponto_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    
    toast.success('Ficheiro exportado!');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="history" />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="fade-in">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white">Histórico de Registos</h1>
            <Button
              data-testid="export-button"
              onClick={exportToCSV}
              className="bg-green-600 hover:bg-green-700 text-white rounded-full"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>

          {/* Filters */}
          <div className="glass-effect p-6 mb-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300 mb-2 block">Data Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      data-testid="start-date-picker"
                      className="w-full justify-start bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'PPP', { locale: pt }) : 'Selecionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border-gray-700">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-gray-300 mb-2 block">Data Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      data-testid="end-date-picker"
                      className="w-full justify-start bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP', { locale: pt }) : 'Selecionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border-gray-700">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(startDate || endDate) && (
              <Button
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
                className="mt-4 bg-gray-700 hover:bg-gray-600 text-white rounded-full"
              >
                Limpar Filtros
              </Button>
            )}
          </div>

          {/* Entries List */}
          {loading ? (
            <div className="text-center text-gray-400 py-12">A carregar...</div>
          ) : entries.length === 0 ? (
            <div className="glass-effect p-12 text-center">
              <p className="text-gray-400 text-lg">Nenhum registo encontrado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="glass-effect p-6 hover:bg-[#1f1f1f] transition-colors" data-testid="entry-card">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-1">
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          entry.status === 'completed' ? 'bg-gray-700 text-gray-300' :
                          entry.status === 'active' ? 'bg-green-700 text-green-200' :
                          'bg-amber-700 text-amber-200'
                        }`}>
                          {entry.status === 'completed' ? 'Concluído' :
                           entry.status === 'active' ? 'Ativo' : 'Em Pausa'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            data-testid={`edit-button-${entry.date}`}
                            onClick={() => handleEdit(entry)}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2"
                            size="sm"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        {editingEntry?.date === entry.date && (
                          <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Detalhes do Dia - {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 mt-4">
                              {/* Summary */}
                              <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-blue-400 mb-2">Resumo do Dia</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-400">Total de Entradas:</span>
                                    <span className="ml-2 text-white font-semibold">{entry.entry_count || 1}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">Total de Horas:</span>
                                    <span className="ml-2 text-white font-semibold">{formatHours(entry.total_hours)}</span>
                                  </div>
                                  {entry.regular_hours > 0 && (
                                    <div>
                                      <span className="text-gray-400">Horas Normais:</span>
                                      <span className="ml-2 text-blue-400 font-semibold">{formatHours(entry.regular_hours)}</span>
                                    </div>
                                  )}
                                  {entry.overtime_hours > 0 && (
                                    <div>
                                      <span className="text-gray-400">Horas Extras:</span>
                                      <span className="ml-2 text-amber-400 font-semibold">{formatHours(entry.overtime_hours)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Individual Entries */}
                              <div>
                                <h3 className="text-lg font-semibold text-white mb-3">Registos Individuais</h3>
                                <div className="space-y-3">
                                  {entry.entries && entry.entries.map((individualEntry, idx) => (
                                    <div key={individualEntry.id || idx} className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="text-sm font-semibold text-gray-400">
                                          Entrada #{idx + 1}
                                        </div>
                                        <div className="text-sm font-bold text-green-400">
                                          {formatHours(individualEntry.total_hours)}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                          <div className="text-gray-500 text-xs">Início</div>
                                          <div className="text-white font-semibold">
                                            {individualEntry.start_time ? new Date(individualEntry.start_time).toLocaleTimeString('pt-PT', {
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            }) : '-'}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-gray-500 text-xs">Fim</div>
                                          <div className="text-white font-semibold">
                                            {individualEntry.end_time ? new Date(individualEntry.end_time).toLocaleTimeString('pt-PT', {
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            }) : '-'}
                                          </div>
                                        </div>
                                      </div>
                                      {individualEntry.observations && (
                                        <div className="mt-3 pt-3 border-t border-gray-700">
                                          <div className="text-gray-500 text-xs mb-1">Observações</div>
                                          <div className="text-white text-sm italic">{individualEntry.observations}</div>
                                        </div>
                                      )}
                                      {individualEntry.is_overtime_day && (
                                        <div className="mt-2">
                                          <span className="text-xs px-2 py-1 bg-amber-900/30 border border-amber-600 rounded text-amber-400">
                                            {individualEntry.overtime_reason}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {entry.observations && (
                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                  <div className="text-sm text-gray-400 mb-1">Observações Gerais do Dia</div>
                                  <div className="text-white italic">{entry.observations}</div>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                      <Button
                        data-testid={`delete-button-${entry.id}`}
                        onClick={() => handleDelete(entry.id)}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {entry.is_overtime_day && (
                    <div className="mb-3 inline-block px-3 py-1 bg-amber-900/30 border border-amber-600 rounded-full text-amber-400 text-xs font-semibold">
                      {entry.overtime_reason}
                    </div>
                  )}

                  {entry.outside_residence_zone && (
                    <div className="mb-3 ml-2 inline-block px-3 py-1 bg-blue-900/30 border border-blue-600 rounded-full text-blue-400 text-xs font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Fora de Zona: {entry.location_description}
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4 text-gray-300">
                    {entry.entry_count && entry.entry_count > 1 && (
                      <div className="col-span-2">
                        <div className="px-3 py-2 bg-blue-900/20 border border-blue-600 rounded-lg text-blue-400 text-sm">
                          📊 Total do dia com {entry.entry_count} registos (múltiplas entradas agregadas)
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-gray-400">Início (primeiro registo)</div>
                      <div className="font-semibold text-white">
                        {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT') : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Fim (último registo)</div>
                      <div className="font-semibold text-white">
                        {entry.end_time ? new Date(entry.end_time).toLocaleTimeString('pt-PT') : '-'}
                      </div>
                    </div>
                    {entry.regular_hours > 0 && (
                      <div>
                        <div className="text-sm text-gray-400">Horas Normais (Total do Dia)</div>
                        <div className="font-bold text-blue-400 text-lg">{formatHours(entry.regular_hours)}</div>
                      </div>
                    )}
                    {entry.overtime_hours > 0 && (
                      <div>
                        <div className="text-sm text-gray-400">Horas Extras (Total do Dia)</div>
                        <div className="font-bold text-amber-400 text-lg">{formatHours(entry.overtime_hours)}</div>
                      </div>
                    )}
                    {entry.total_hours && (
                      <div>
                        <div className="text-sm text-gray-400">Total do Dia</div>
                        <div className="font-bold text-green-400 text-lg">{formatHours(entry.total_hours)}</div>
                      </div>
                    )}
                    {entry.pauses && entry.pauses.length > 0 && (
                      <div>
                        <div className="text-sm text-gray-400">Pausas</div>
                        <div className="font-semibold text-white">{entry.pauses.length} pausa(s)</div>
                      </div>
                    )}
                  </div>

                  {entry.observations && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-sm text-gray-400 mb-1">Observações</div>
                      <div className="text-white italic">{entry.observations}</div>
                    </div>
                  )}

                  {/* Payment Type Info */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Tipo de Pagamento</div>
                    <div className="text-white font-semibold">
                      {entry.outside_residence_zone ? (
                        <span className="text-blue-400">
                          ✓ Ajuda de Custas - {entry.location_description}
                        </span>
                      ) : (
                        <span className="text-green-400">
                          ✓ Subsídio de Alimentação
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default History;
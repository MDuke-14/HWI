import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { TrendingUp, Calendar, Clock, BarChart3, FileText, Edit, Upload } from 'lucide-react';

const Reports = ({ user, onLogout }) => {
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [billingReport, setBillingReport] = useState(null);
  const [detailedMonthlyReport, setDetailedMonthlyReport] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // States for month/year selection
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  // Import dialog states
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importUserId, setImportUserId] = useState('');

  // Edit dialog states
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForms, setEditForms] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);

  // Helper function to format decimal hours as HH:MM
  const formatHours = (decimalHours) => {
    if (!decimalHours) return '0h00m';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  };

  useEffect(() => {
    fetchReports();
    fetchDetailedMonthlyReport();
  }, []);

  useEffect(() => {
    fetchDetailedMonthlyReport();
  }, [selectedMonth, selectedYear]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [weekResponse, monthResponse, billingResponse] = await Promise.all([
        axios.get(`${API}/time-entries/reports`, { params: { period: 'week' } }),
        axios.get(`${API}/time-entries/reports`, { params: { period: 'month' } }),
        axios.get(`${API}/time-entries/reports`, { params: { period: 'billing' } })
      ]);
      setWeeklyReport(weekResponse.data);
      setMonthlyReport(monthResponse.data);
      setBillingReport(billingResponse.data);
    } catch (error) {
      toast.error('Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedMonthlyReport = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/reports/monthly-detailed`, {
        params: {
          month: selectedMonth,
          year: selectedYear
        }
      });
      setDetailedMonthlyReport(response.data);
    } catch (error) {
      console.error('Erro ao carregar relatório detalhado:', error);
      toast.error('Erro ao carregar relatório mensal detalhado');
    }
  };

  const downloadPdfReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/time-entries/reports/monthly-pdf`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          month: selectedMonth,
          year: selectedYear
        },
        responseType: 'blob'
      });

      // Create a download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'Relatorio_Mensal.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Relatório PDF exportado com sucesso!');
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error('Erro ao exportar relatório PDF');
    }
  };

  const handleImportReport = async () => {
    if (!importFile) {
      toast.error('Selecione um ficheiro');
      return;
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (importUserId) {
        formData.append('user_id', importUserId);
      }
      
      const response = await axios.post(`${API}/admin/time-entries/import-excel`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success(
        `Importação concluída!\n` +
        `Importados: ${response.data.imported}\n` +
        `Ignorados (já existiam): ${response.data.skipped}\n` +
        `Erros: ${response.data.errors}`
      );
      
      setShowImportDialog(false);
      setImportFile(null);
      setImportUserId('');
      fetchDetailedMonthlyReport(); // Refresh report after import
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao importar ficheiro');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (day) => {
    setEditingEntry(day);
    setDialogOpen(true);
    // Initialize edit forms for all individual entries
    const forms = {};
    if (day.entries && Array.isArray(day.entries)) {
      day.entries.forEach(individualEntry => {
        forms[individualEntry.id] = {
          start_time: individualEntry.start_time ? individualEntry.start_time.split('.')[0] : '',
          end_time: individualEntry.end_time ? individualEntry.end_time.split('.')[0] : '',
          observations: individualEntry.observations || ''
        };
      });
    }
    setEditForms(forms);
  };

  const handleUpdateIndividualEntry = (entryId, field, value) => {
    setEditForms(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value
      }
    }));
  };

  const handleSaveIndividualEntry = async (entryId) => {
    try {
      const formData = editForms[entryId];
      const updateData = {
        observations: formData.observations
      };
      
      if (formData.start_time) {
        updateData.start_time = new Date(formData.start_time).toISOString();
      }
      if (formData.end_time) {
        updateData.end_time = new Date(formData.end_time).toISOString();
      }

      await axios.put(`${API}/time-entries/${entryId}`, updateData);
      toast.success('Registo atualizado!');
      fetchDetailedMonthlyReport(); // Refresh report after edit
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar');
    }
  };

  const ReportCard = ({ report, title, icon: Icon }) => {
    if (!report) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>

        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Total de Horas</div>
            <div className="text-3xl font-bold text-white" data-testid="total-hours">{formatHours(report.total_hours)}</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Horas Normais</div>
            <div className="text-3xl font-bold text-blue-400" data-testid="regular-hours">{formatHours(report.regular_hours)}</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Horas Extras</div>
            <div className="text-sm text-gray-500">(Dias Úteis)</div>
            <div className="text-3xl font-bold text-amber-400" data-testid="overtime-hours">{formatHours(report.overtime_hours)}</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Horas Especiais</div>
            <div className="text-sm text-gray-500">(Feriados/Fins Semana)</div>
            <div className="text-3xl font-bold text-purple-400" data-testid="special-hours">{formatHours(report.special_hours || 0)}</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Dias Trabalhados</div>
            <div className="text-3xl font-bold text-green-400" data-testid="total-days">{report.total_days}</div>
          </div>
        </div>

        <div className="glass-effect p-6 rounded-xl">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Detalhes do Período
          </h3>
          <div className="space-y-2 text-gray-300">
            <div className="flex justify-between">
              <span>Início do Período:</span>
              <span className="font-semibold text-white">
                {new Date(report.start_date + 'T00:00:00').toLocaleDateString('pt-PT', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Fim do Período:</span>
              <span className="font-semibold text-white">
                {new Date(report.end_date + 'T00:00:00').toLocaleDateString('pt-PT', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        {report.entries && report.entries.length > 0 && (
          <div className="glass-effect p-6 rounded-xl">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Registos do Período
            </h3>
            <div className="space-y-3">
              {report.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-[#1a1a1a] p-4 rounded-lg flex justify-between items-center"
                  data-testid="report-entry"
                >
                  <div>
                    <div className="text-white font-semibold">
                      {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                      })}
                    </div>
                    <div className="text-sm text-gray-400">
                      {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                      {' → '}
                      {entry.end_time ? new Date(entry.end_time).toLocaleTimeString('pt-PT', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-bold text-lg">
                      {formatHours(entry.total_hours)}
                    </div>
                    {entry.pauses && entry.pauses.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {entry.pauses.length} pausa(s)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="reports" />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="fade-in">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <TrendingUp className="w-10 h-10" />
              Relatórios
            </h1>
          </div>

          {loading && !weeklyReport && !monthlyReport ? (
            <div className="text-center text-gray-400 py-12">A carregar relatórios...</div>
          ) : (
            <Tabs defaultValue="billing" className="w-full">
              <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-3 bg-[#1a1a1a] mb-8">
                <TabsTrigger
                  data-testid="billing-tab"
                  value="billing"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Faturação (26-25)
                </TabsTrigger>
                <TabsTrigger
                  data-testid="week-tab"
                  value="week"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Última Semana
                </TabsTrigger>
                <TabsTrigger
                  data-testid="month-tab"
                  value="month"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Último Mês
                </TabsTrigger>
              </TabsList>

              <TabsContent value="billing">
                {detailedMonthlyReport ? (
                  <div className="space-y-6">
                    {/* Month/Year Selector */}
                    <div className="glass-effect p-4 rounded-xl">
                      <div className="flex gap-4 items-center">
                        <div className="flex-1">
                          <label className="text-gray-400 text-sm mb-2 block">Mês</label>
                          <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2"
                          >
                            <option value={1}>Janeiro</option>
                            <option value={2}>Fevereiro</option>
                            <option value={3}>Março</option>
                            <option value={4}>Abril</option>
                            <option value={5}>Maio</option>
                            <option value={6}>Junho</option>
                            <option value={7}>Julho</option>
                            <option value={8}>Agosto</option>
                            <option value={9}>Setembro</option>
                            <option value={10}>Outubro</option>
                            <option value={11}>Novembro</option>
                            <option value={12}>Dezembro</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-gray-400 text-sm mb-2 block">Ano</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2"
                          >
                            {[2024, 2025, 2026].map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 flex gap-2 items-end">
                          {user?.is_admin && (
                            <Button
                              data-testid="import-report-button"
                              onClick={() => setShowImportDialog(true)}
                              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-full"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Importar
                            </Button>
                          )}
                          <Button
                            data-testid="export-pdf-button"
                            onClick={downloadPdfReport}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            PDF
                          </Button>
                          <Button
                            data-testid="refresh-button"
                            onClick={fetchDetailedMonthlyReport}
                            disabled={loading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                          >
                            {loading ? 'A atualizar...' : 'Atualizar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* User Info Header */}
                    {detailedMonthlyReport.full_name && (
                      <div className="glass-effect p-4 rounded-xl text-center">
                        <div className="text-gray-400 text-sm">Colaborador</div>
                        <div className="text-2xl font-bold text-white">{detailedMonthlyReport.full_name}</div>
                      </div>
                    )}
                    
                    {/* Summary Cards */}
                    <div className="grid md:grid-cols-5 gap-4">
                      <div className="glass-effect p-6 rounded-xl">
                        <div className="text-gray-400 text-sm mb-2">Total Horas Trabalhadas</div>
                        <div className="text-3xl font-bold text-white">{formatHours(detailedMonthlyReport.summary.total_worked_hours)}</div>
                      </div>
                      <div className="glass-effect p-6 rounded-xl">
                        <div className="text-gray-400 text-sm mb-2">Horas Extras</div>
                        <div className="text-sm text-gray-500">(Dias Úteis)</div>
                        <div className="text-3xl font-bold text-amber-400">{formatHours(detailedMonthlyReport.summary.total_overtime_hours)}</div>
                      </div>
                      <div className="glass-effect p-6 rounded-xl">
                        <div className="text-gray-400 text-sm mb-2">Horas Especiais</div>
                        <div className="text-sm text-gray-500">(Feriados/Fins Semana)</div>
                        <div className="text-3xl font-bold text-purple-400">{formatHours(detailedMonthlyReport.summary.total_special_hours || 0)}</div>
                      </div>
                      <div className="glass-effect p-6 rounded-xl">
                        <div className="text-gray-400 text-sm mb-2">Subsídio Alimentação</div>
                        <div className="text-2xl font-bold text-green-400">
                          {detailedMonthlyReport.summary.days_with_meal_allowance} dias × 10€
                        </div>
                        <div className="text-xl font-bold text-white mt-1">
                          = {detailedMonthlyReport.summary.total_meal_allowance_value}€
                        </div>
                      </div>
                      <div className="glass-effect p-6 rounded-xl">
                        <div className="text-gray-400 text-sm mb-2">Ajuda de Custos</div>
                        <div className="text-2xl font-bold text-blue-400">
                          {detailedMonthlyReport.summary.days_with_travel_allowance} dias × 50€
                        </div>
                        <div className="text-xl font-bold text-white mt-1">
                          = {detailedMonthlyReport.summary.total_travel_allowance_value}€
                        </div>
                      </div>
                    </div>

                    {/* Daily Records Table */}
                    <div className="glass-effect p-6 overflow-x-auto">
                      <h3 className="text-xl font-bold text-white mb-4">
                        Período: {new Date(detailedMonthlyReport.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} - {new Date(detailedMonthlyReport.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}
                      </h3>
                      <div className="space-y-2">
                        {detailedMonthlyReport.daily_records.map((day) => (
                          <div key={day.date} className={`border rounded-lg p-4 ${
                            day.status === 'FOLGA' ? 'bg-gray-800/30 border-gray-600' :
                            day.status === 'FERIADO' ? 'bg-amber-900/20 border-amber-600' :
                            day.status === 'TRABALHADO' ? 'bg-green-900/20 border-green-600' :
                            'bg-gray-800/10 border-gray-700'
                          }`}>
                            <div className="grid md:grid-cols-12 gap-4 items-center">
                              {/* Date and Day */}
                              <div className="md:col-span-2">
                                <div className="font-bold text-white">{day.day_of_week}</div>
                                <div className="text-gray-400 text-sm">Dia {day.day_number}</div>
                              </div>

                              {/* Status / Entries */}
                              <div className="md:col-span-3">
                                {day.status === 'FOLGA' && (
                                  <div className="text-gray-400 font-semibold">🏖️ FOLGA</div>
                                )}
                                {day.status === 'FERIADO' && (
                                  <div className="text-amber-400 font-semibold">🎉 FERIADO - {day.holiday_name}</div>
                                )}
                                {day.status === 'NÃO TRABALHADO' && (
                                  <div className="text-gray-500 font-semibold">❌ Não Trabalhado</div>
                                )}
                                {day.status === 'TRABALHADO' && day.entries && (
                                  <div className="space-y-1">
                                    {day.entries.map((entry, idx) => (
                                      <div key={idx} className="text-sm text-gray-300">
                                        {entry.start_time && entry.end_time && (
                                          <span>
                                            {new Date(entry.start_time).toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'})} - {new Date(entry.end_time).toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'})}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Total Hours */}
                              <div className="md:col-span-2 text-center">
                                <div className="text-xs text-gray-400">Total</div>
                                <div className="font-bold text-white">{day.total_hours > 0 ? formatHours(day.total_hours) : '-'}</div>
                              </div>

                              {/* Overtime */}
                              <div className="md:col-span-2 text-center">
                                <div className="text-xs text-gray-400">Horas Extra</div>
                                <div className="font-bold text-amber-400">{day.overtime_hours > 0 ? formatHours(day.overtime_hours) : '0h00m'}</div>
                              </div>

                              {/* Payment Type */}
                              <div className="md:col-span-2 text-right">
                                {day.payment_type && (
                                  <div>
                                    <div className={`text-sm font-semibold ${day.payment_type === 'Ajuda de Custos' ? 'text-blue-400' : 'text-green-400'}`}>
                                      {day.payment_type}
                                    </div>
                                    <div className="text-xs text-gray-400">{day.payment_value}€</div>
                                    {day.location && <div className="text-xs text-gray-500">{day.location}</div>}
                                  </div>
                                )}
                              </div>

                              {/* Edit Button (Admin only) */}
                              {user?.is_admin && day.status === 'TRABALHADO' && day.entries && day.entries.length > 0 && (
                                <div className="md:col-span-1 text-right">
                                  <Button
                                    onClick={() => handleEdit(day)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2"
                                    size="sm"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-12">A carregar relatório detalhado...</div>
                )}
              </TabsContent>

              <TabsContent value="week">
                <ReportCard report={weeklyReport} title="Relatório Semanal" icon={Clock} />
              </TabsContent>

              <TabsContent value="month">
                <ReportCard report={monthlyReport} title="Relatório Mensal" icon={Calendar} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Ficheiro Excel ou PDF</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.pdf"
                onChange={(e) => setImportFile(e.target.files[0])}
                className="bg-[#0a0a0a] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-400 mt-2">
                Formatos aceites: Excel (.xlsx, .xls) ou PDF (.pdf)
              </p>
            </div>
            <div>
              <Label>Utilizador (opcional - detecta "Miguel" automaticamente)</Label>
              <Input
                type="text"
                value={importUserId}
                onChange={(e) => setImportUserId(e.target.value)}
                placeholder="ID do utilizador"
                className="bg-[#0a0a0a] border-gray-700 text-white"
              />
            </div>
            <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                ℹ️ A importação irá:
                <br/>• Ler todas as datas com horários
                <br/>• Detectar localizações (Madrid, Valencia)
                <br/>• Calcular horas extras automaticamente
                <br/>• Ignorar dias que já têm entradas
              </p>
            </div>
            <Button 
              onClick={handleImportReport} 
              disabled={loading || !importFile} 
              className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-full"
            >
              {loading ? 'A importar...' : 'Importar Relatório'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDialogOpen(false);
          setEditingEntry(null);
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
          {editingEntry && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Editar Entradas - {editingEntry.day_of_week} Dia {editingEntry.day_number}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 mt-4">
                {/* Summary */}
                <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">Resumo do Dia</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Total de Horas:</span>
                      <span className="ml-2 text-white font-semibold">{formatHours(editingEntry.total_hours)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Horas Extras:</span>
                      <span className="ml-2 text-amber-400 font-semibold">{formatHours(editingEntry.overtime_hours)}</span>
                    </div>
                  </div>
                </div>

                {/* Individual Entries */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Registos Individuais</h3>
                  {(!editingEntry.entries || editingEntry.entries.length === 0) ? (
                    <div className="bg-red-900/20 border border-red-600 rounded-lg p-4 text-red-400">
                      ⚠️ Nenhum registo individual encontrado
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editingEntry.entries.map((individualEntry, idx) => (
                        <div key={individualEntry.id || idx} className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-sm font-semibold text-gray-400">
                              Entrada #{idx + 1}
                            </div>
                            <div className="text-sm font-bold text-green-400">
                              {formatHours(individualEntry.total_hours)}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div>
                              <Label className="text-gray-500 text-xs">Início</Label>
                              <Input
                                type="datetime-local"
                                value={editForms[individualEntry.id]?.start_time || ''}
                                onChange={(e) => handleUpdateIndividualEntry(individualEntry.id, 'start_time', e.target.value)}
                                className="bg-[#0a0a0a] border-gray-600 text-white text-sm mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-gray-500 text-xs">Fim</Label>
                              <Input
                                type="datetime-local"
                                value={editForms[individualEntry.id]?.end_time || ''}
                                onChange={(e) => handleUpdateIndividualEntry(individualEntry.id, 'end_time', e.target.value)}
                                className="bg-[#0a0a0a] border-gray-600 text-white text-sm mt-1"
                              />
                            </div>
                          </div>
                          <div className="mb-3">
                            <Label className="text-gray-500 text-xs">Observações</Label>
                            <Textarea
                              value={editForms[individualEntry.id]?.observations || ''}
                              onChange={(e) => handleUpdateIndividualEntry(individualEntry.id, 'observations', e.target.value)}
                              className="bg-[#0a0a0a] border-gray-600 text-white text-sm mt-1"
                              rows={2}
                            />
                          </div>
                          <Button
                            onClick={() => handleSaveIndividualEntry(individualEntry.id)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2"
                          >
                            Guardar Entrada #{idx + 1}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
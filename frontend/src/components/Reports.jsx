import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { TrendingUp, Calendar, Clock, BarChart3, FileDown } from 'lucide-react';

const Reports = ({ user, onLogout }) => {
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [billingReport, setBillingReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

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

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Total de Horas</div>
            <div className="text-3xl font-bold text-white" data-testid="total-hours">{report.total_hours}h</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Horas Normais</div>
            <div className="text-3xl font-bold text-blue-400" data-testid="regular-hours">{report.regular_hours}h</div>
          </div>
          <div className="glass-effect p-6 rounded-xl">
            <div className="text-gray-400 text-sm mb-2">Horas Extras</div>
            <div className="text-3xl font-bold text-amber-400" data-testid="overtime-hours">{report.overtime_hours}h</div>
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
                      {entry.total_hours}h
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
            <Button
              data-testid="refresh-button"
              onClick={fetchReports}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
            >
              {loading ? 'A atualizar...' : 'Atualizar'}
            </Button>
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
                <ReportCard report={billingReport} title="Relatório de Faturação (Dia 26 a 25)" icon={TrendingUp} />
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
    </div>
  );
};

export default Reports;
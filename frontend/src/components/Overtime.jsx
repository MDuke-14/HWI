import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Clock, Calendar, TrendingUp, AlertCircle } from 'lucide-react';

// Helper function to convert decimal hours to HH:MM format
const formatHours = (decimalHours) => {
  if (!decimalHours || decimalHours === 0) return '0h00';
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return minutes > 0 ? `${hours}h${minutes.toString().padStart(2, '0')}` : `${hours}h00`;
};

const Overtime = ({ user, onLogout }) => {
  const [overtimeSummary, setOvertimeSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchOvertimeSummary();
  }, []);

  const fetchOvertimeSummary = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/time-entries/overtime`);
      setOvertimeSummary(response.data);
    } catch (error) {
      toast.error('Erro ao carregar horas extras');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="overtime" />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="fade-in">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <Clock className="w-10 h-10" />
              Controlo de Horas Extras
            </h1>
            <Button
              data-testid="refresh-overtime-button"
              onClick={fetchOvertimeSummary}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
            >
              {loading ? 'A atualizar...' : 'Atualizar'}
            </Button>
          </div>

          {loading && !overtimeSummary ? (
            <div className="text-center text-gray-400 py-12">A carregar...</div>
          ) : overtimeSummary ? (
            <>
              {/* Billing Period Info */}
              {overtimeSummary.billing_period_start && overtimeSummary.billing_period_end && (
                <div className="glass-effect p-4 rounded-xl mb-6 bg-blue-900/20 border border-blue-600">
                  <div className="text-center">
                    <div className="text-sm text-blue-400 mb-1">Período de Faturação Atual</div>
                    <div className="text-white font-semibold">
                      {new Date(overtimeSummary.billing_period_start + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(overtimeSummary.billing_period_end + 'T00:00:00').toLocaleDateString('pt-PT')}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      As horas extras reiniciam a cada dia 26
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="glass-effect p-8 rounded-xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4 rounded-xl">
                      <TrendingUp className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm">Horas Extras</div>
                      <div className="text-xs text-gray-500">(Dias Úteis)</div>
                      <div className="text-4xl font-bold text-amber-400" data-testid="total-overtime-hours">
                        {formatHours(overtimeSummary.total_overtime_hours)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-effect p-8 rounded-xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-4 rounded-xl">
                      <Clock className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm">Horas Especiais</div>
                      <div className="text-xs text-gray-500">(Fins Semana/Feriados)</div>
                      <div className="text-4xl font-bold text-purple-400" data-testid="total-special-hours">
                        {formatHours(overtimeSummary.total_special_hours || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-effect p-8 rounded-xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-gradient-to-br from-green-500 to-teal-600 p-4 rounded-xl">
                      <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm">Dias Trabalhados</div>
                      <div className="text-xs text-gray-500">(Fins Semana/Feriados)</div>
                      <div className="text-4xl font-bold text-green-400" data-testid="total-overtime-days">
                        {overtimeSummary.total_overtime_days}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Alert */}
              <div className="glass-effect p-6 rounded-xl mb-8 border-l-4 border-amber-500">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-semibold mb-2">Informação sobre Horas Extras</h3>
                    <ul className="text-gray-300 text-sm space-y-1">
                      <li>• <strong>Horas Extras</strong>: Trabalho acima de 8h em dias úteis</li>
                      <li>• <strong>Horas Especiais</strong>: Todo o trabalho em Sábados, Domingos e Feriados</li>
                      <li>• <strong>Reinício</strong>: A contagem reinicia a cada dia 26 (novo período de faturação)</li>
                      <li>• <strong>Relatórios</strong>: Períodos anteriores disponíveis na página de Relatórios</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Overtime Entries List */}
              {overtimeSummary.entries && overtimeSummary.entries.length > 0 ? (
                <div className="glass-effect p-6 rounded-xl">
                  <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Calendar className="w-6 h-6" />
                    Registos de Horas Extras
                  </h2>
                  <div className="space-y-4">
                    {overtimeSummary.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="bg-[#1a1a1a] p-5 rounded-lg hover:bg-[#252525] transition-colors"
                        data-testid="overtime-entry"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="text-white font-semibold text-lg mb-1">
                              {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-700 text-amber-200">
                                {entry.overtime_reason}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-amber-400 font-bold text-2xl">
                              {formatHours(entry.overtime_hours || entry.total_hours)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-400 mt-3">
                          <div>
                            <span className="text-gray-500">Início:</span>{' '}
                            <span className="text-white">
                              {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT') : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Fim:</span>{' '}
                            <span className="text-white">
                              {entry.end_time ? new Date(entry.end_time).toLocaleTimeString('pt-PT') : '-'}
                            </span>
                          </div>
                        </div>
                        
                        {entry.observations && (
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Observações:</div>
                            <div className="text-white text-sm italic">{entry.observations}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="glass-effect p-12 text-center">
                  <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Ainda não há registos de horas extras</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Overtime;
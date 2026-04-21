import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Trash2, RefreshCw, Filter, ChevronDown, ChevronUp, X } from 'lucide-react';

const ErrorLog = ({ user, onLogout }) => {
  const [errors, setErrors] = useState([]);
  const [stats, setStats] = useState({ total: 0, unresolved: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('unresolved'); // 'all', 'unresolved', 'resolved'
  const [contextFilter, setContextFilter] = useState('');
  const [expandedError, setExpandedError] = useState(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '200');
      if (filter === 'unresolved') params.append('resolved', 'false');
      if (filter === 'resolved') params.append('resolved', 'true');
      if (contextFilter) params.append('context_filter', contextFilter);

      const response = await axios.get(`${API}/admin/errors?${params.toString()}`);
      setErrors(response.data.errors || []);
      setStats(response.data.stats || {});
    } catch (error) {
      toast.error('Erro ao carregar logs de erros');
    } finally {
      setLoading(false);
    }
  }, [filter, contextFilter]);

  useEffect(() => { fetchErrors(); }, [fetchErrors]);

  const handleResolve = async (errorId) => {
    try {
      await axios.put(`${API}/admin/errors/${errorId}/resolve`);
      toast.success('Erro marcado como resolvido');
      fetchErrors();
    } catch (error) {
      toast.error('Erro ao resolver');
    }
  };

  const handleClearResolved = async () => {
    if (!window.confirm('Eliminar todos os erros resolvidos?')) return;
    try {
      const res = await axios.delete(`${API}/admin/errors/resolved`);
      toast.success(res.data.message);
      fetchErrors();
    } catch (error) {
      toast.error('Erro ao limpar');
    }
  };

  const getContextColor = (ctx) => {
    if (!ctx) return 'text-gray-400';
    if (ctx.startsWith('FS')) return 'text-blue-400';
    if (ctx.includes('Ponto')) return 'text-green-400';
    if (ctx.includes('Cronómetro') || ctx.includes('Cronometro')) return 'text-amber-400';
    if (ctx.includes('PC') || ctx.includes('Cotação')) return 'text-yellow-400';
    if (ctx.includes('Equipamento')) return 'text-purple-400';
    return 'text-gray-400';
  };

  const getContextBg = (ctx) => {
    if (!ctx) return 'bg-gray-600/20';
    if (ctx.startsWith('FS')) return 'bg-blue-600/15';
    if (ctx.includes('Ponto')) return 'bg-green-600/15';
    if (ctx.includes('Cronómetro') || ctx.includes('Cronometro')) return 'bg-amber-600/15';
    if (ctx.includes('PC') || ctx.includes('Cotação')) return 'bg-yellow-600/15';
    if (ctx.includes('Equipamento')) return 'bg-purple-600/15';
    return 'bg-gray-600/15';
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-7 h-7 text-red-400" />
              Log de Erros
            </h1>
            <p className="text-gray-500 text-sm mt-1">Monitorização de erros da aplicação</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={fetchErrors} className="bg-gray-800 hover:bg-gray-700 text-gray-300" data-testid="refresh-errors-btn">
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            {stats.resolved > 0 && (
              <Button size="sm" onClick={handleClearResolved} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800" data-testid="clear-resolved-btn">
                <Trash2 className="w-4 h-4 mr-1" /> Limpar Resolvidos ({stats.resolved})
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-red-400 text-2xl font-bold">{stats.unresolved}</div>
            <div className="text-gray-500 text-xs mt-1">Por Resolver</div>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-green-400 text-2xl font-bold">{stats.resolved}</div>
            <div className="text-gray-500 text-xs mt-1">Resolvidos</div>
          </div>
          <div className="glass-effect rounded-xl p-4 text-center">
            <div className="text-gray-400 text-2xl font-bold">{stats.total}</div>
            <div className="text-gray-500 text-xs mt-1">Total</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          {['unresolved', 'all', 'resolved'].map((f) => (
            <Button
              key={f}
              size="sm"
              onClick={() => setFilter(f)}
              className={`rounded-full text-xs ${filter === f ? 'bg-white/10 text-white border border-white/20' : 'bg-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {f === 'unresolved' ? 'Por Resolver' : f === 'resolved' ? 'Resolvidos' : 'Todos'}
            </Button>
          ))}
          <div className="relative ml-auto">
            <input
              type="text"
              placeholder="Filtrar por contexto (FS, Ponto...)"
              value={contextFilter}
              onChange={(e) => setContextFilter(e.target.value)}
              className="bg-[#0f0f0f] border border-gray-800 text-white text-xs rounded-lg px-3 py-1.5 w-48 md:w-64 focus:border-gray-600 focus:outline-none"
              data-testid="context-filter-input"
            />
            {contextFilter && (
              <button onClick={() => setContextFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Error List */}
        {loading ? (
          <div className="text-center text-gray-500 py-12">A carregar...</div>
        ) : errors.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3 opacity-50" />
            <p className="text-gray-500">Sem erros {filter === 'unresolved' ? 'por resolver' : ''}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {errors.map((err) => {
              const isExpanded = expandedError === err.id;
              return (
                <div key={err.id} className={`glass-effect rounded-lg overflow-hidden border ${err.resolved ? 'border-green-900/30' : 'border-red-900/30'}`}>
                  <button
                    onClick={() => setExpandedError(isExpanded ? null : err.id)}
                    className="w-full text-left p-3 md:p-4 hover:bg-white/5 transition"
                    data-testid={`error-row-${err.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status indicator */}
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${err.resolved ? 'bg-green-500' : 'bg-red-500'}`} />
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getContextBg(err.context)} ${getContextColor(err.context)}`}>
                            {err.context}
                          </span>
                          <span className="text-gray-500 text-xs">{err.action}</span>
                          <span className="text-gray-700 text-xs ml-auto">{formatTimestamp(err.timestamp)}</span>
                        </div>
                        <p className="text-gray-300 text-sm truncate">{err.error_message}</p>
                        {err.username && <span className="text-gray-600 text-xs">por {err.username}</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!err.resolved && (
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleResolve(err.id); }}
                            className="bg-green-900/30 hover:bg-green-900/50 text-green-400 text-xs px-2 py-1 h-auto"
                            data-testid={`resolve-btn-${err.id}`}
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 p-3 md:p-4 bg-[#0a0a0a]">
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Mensagem Completa</h4>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap break-all">{err.error_message}</p>
                        </div>
                        {err.details && Object.keys(err.details).length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Detalhes</h4>
                            {err.details.traceback && (
                              <pre className="text-xs text-red-400/80 bg-red-900/10 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                                {err.details.traceback}
                              </pre>
                            )}
                            {err.details.path && (
                              <p className="text-xs text-gray-500 mt-1">Endpoint: <span className="text-gray-400">{err.details.method} {err.details.path}</span></p>
                            )}
                            {err.details.relatorio_id && (
                              <p className="text-xs text-gray-500 mt-1">Relatório ID: <span className="text-gray-400">{err.details.relatorio_id}</span></p>
                            )}
                          </div>
                        )}
                        {err.resolved && (
                          <div className="text-xs text-green-500">
                            Resolvido por {err.resolved_by} em {formatTimestamp(err.resolved_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorLog;

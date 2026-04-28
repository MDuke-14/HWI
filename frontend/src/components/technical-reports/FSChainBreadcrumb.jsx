import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link2, ChevronRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FSChainBreadcrumb = ({ relatorioId, onJumpTo }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!relatorioId) {
      setData(null);
      return;
    }
    setLoading(true);
    axios
      .get(`${API}/relatorios-tecnicos/${relatorioId}/cadeia`)
      .then((r) => {
        if (alive) setData(r.data);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [relatorioId]);

  if (loading) return null;
  if (!data || !data.cadeia || data.cadeia.length <= 1) return null;

  return (
    <div
      className="mb-3 px-3 py-2 rounded-md bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-500/30 flex items-center gap-1.5 text-xs flex-wrap"
      data-testid="fs-chain-breadcrumb"
    >
      <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <span className="text-gray-400 mr-1">Cadeia ({data.cadeia.length} FSs):</span>
      {data.cadeia.map((node, idx) => {
        const isAtual = node.is_atual;
        return (
          <React.Fragment key={node.id}>
            {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />}
            <button
              type="button"
              onClick={() => !isAtual && onJumpTo && onJumpTo(node.id)}
              disabled={isAtual}
              data-testid={`fs-chain-link-${idx}`}
              title={`FS #${node.numero_assistencia}${isAtual ? ' (atual)' : ' — clica para abrir'}`}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                isAtual
                  ? 'bg-blue-600 text-white cursor-default'
                  : 'bg-[#1a1a1a] text-blue-300 hover:bg-blue-700 hover:text-white border border-blue-500/40 cursor-pointer'
              }`}
            >
              FS #{node.numero_assistencia}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default FSChainBreadcrumb;

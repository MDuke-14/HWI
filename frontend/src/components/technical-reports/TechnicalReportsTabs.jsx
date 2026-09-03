import React from 'react';
import { Building2, FileText, Link2, Search, Users } from 'lucide-react';

const TechnicalReportsTabs = ({
  activeTab,
  isMobile,
  user,
  borderColor,
  textPrimary,
  textSecondary,
  setActiveTab,
  fetchAllPCs,
  fetchRefTokens,
}) => {
  // Definição centralizada dos itens (facilita render em ambos os modos)
  const items = [
    { key: 'clientes', label: 'Clientes', icon: Building2, color: 'blue' },
    { key: 'relatorios', label: isMobile ? "FS's" : 'Folhas de Serviço', icon: FileText, color: 'blue' },
    ...(user?.is_admin ? [{ key: 'facturados', label: 'Facturados', icon: FileText, color: 'purple' }] : []),
    { key: 'pesquisa', label: isMobile ? 'Estados' : 'Pesquisa por Estado', icon: Search, color: 'blue' },
    { key: 'pedidos-cotacao', label: isMobile ? 'PCs' : 'Pedidos de Cotação', icon: FileText, color: 'yellow', preload: fetchAllPCs },
    ...(user?.is_admin ? [{ key: 'fornecedores', label: 'Fornecedores', icon: Users, color: 'yellow' }] : []),
    ...(user?.is_admin ? [{ key: 'referencias', label: isMobile ? 'Refs' : 'Ref. Internas', icon: Link2, color: 'indigo', preload: fetchRefTokens }] : []),
  ];

  const handleClick = (item) => {
    setActiveTab(item.key);
    if (typeof item.preload === 'function') item.preload();
  };

  // -------- MOBILE: barra horizontal (preserva o comportamento original) --------
  if (isMobile) {
    return (
      <div className="mb-4">
        <div className={`flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide border-b ${borderColor}`}>
          {items.map(({ key, label, icon: Icon, color }) => {
            const isActive = activeTab === key;
            const activeClass = isActive
              ? `text-${color}-400 border-b-2 border-${color}-400`
              : `${textSecondary} hover:${textPrimary}`;
            return (
              <button
                key={key}
                onClick={() => handleClick({ key, preload: items.find((i) => i.key === key)?.preload })}
                className={`px-3 py-2 text-sm whitespace-nowrap flex-shrink-0 font-semibold transition ${activeClass}`}
                data-testid={`tab-${key}`}
              >
                <Icon className="w-3.5 h-3.5 inline mr-1.5" /> {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // -------- DESKTOP: sidebar vertical à esquerda --------
  return (
    <aside
      className="w-56 shrink-0 hidden md:flex flex-col gap-1 bg-[#0f0f0f] border border-gray-800 rounded-xl p-2 sticky top-24 self-start"
      data-testid="tr-sidebar"
    >
      <div className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-800 mb-1">
        Navegação
      </div>
      {items.map((item) => {
        const isActive = activeTab === item.key;
        const Icon = item.icon;
        // Classes por cor (Tailwind não aceita interpolação dinâmica em JIT sem safelist,
        // pelo que hardcoded)
        const activeBg = {
          blue: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
          purple: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
          yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
          indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
        }[item.color] || 'bg-blue-500/15 text-blue-300 border-blue-500/40';
        return (
          <button
            key={item.key}
            onClick={() => handleClick(item)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition border ${
              isActive
                ? `${activeBg}`
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            data-testid={`tab-${item.key}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
};

export default TechnicalReportsTabs;

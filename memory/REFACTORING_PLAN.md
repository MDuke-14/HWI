# Plano de Refatoração - Sistema HWI

Este documento descreve o plano de refatoração para os ficheiros críticos do sistema.

## Estado Atual (Fevereiro 2026)

### Backend - server.py
- **Tamanho:** ~10.400 linhas
- **Problema:** Ficheiro monolítico com todas as rotas, modelos e lógica de negócio

### Frontend - TechnicalReports.jsx
- **Tamanho:** ~8.300 linhas
- **Problema:** Componente gigante com muitos estados e modais

---

## Estrutura de Refatoração Backend

### Diretório: `/app/backend/routes/`

```
routes/
├── __init__.py           # Exporta todos os routers
├── dependencies.py       # ✅ CRIADO - Dependências comuns
├── auth.py              # ✅ CRIADO - Autenticação (exemplo)
├── clientes.py          # Gestão de clientes
├── equipamentos.py      # Gestão de equipamentos
├── relatorios.py        # Relatórios técnicos (OTs)
├── tecnicos.py          # Técnicos dos relatórios
├── intervencoes.py      # Intervenções
├── materiais.py         # Materiais e despesas
├── fotografias.py       # Upload de fotos
├── assinaturas.py       # Assinaturas digitais
├── pedidos_cotacao.py   # Pedidos de cotação
├── time_entries.py      # Registos de ponto
├── vacations.py         # Férias e faltas
├── notifications.py     # Sistema de notificações
├── services.py          # Serviços e calendário
├── admin.py             # Rotas administrativas
├── reports.py           # Geração de PDFs/relatórios
├── company.py           # Configurações da empresa
└── tarifas.py           # Gestão de tarifas
```

### Migração Incremental

1. **Fase 1 - Preparação (Concluído)**
   - [x] Criar estrutura de diretórios
   - [x] Criar `dependencies.py` com funções comuns
   - [x] Criar `auth.py` como exemplo

2. **Fase 2 - Novas Features**
   - [ ] Todas as novas rotas devem ser criadas em ficheiros separados
   - [ ] Importar no server.py usando `app.include_router()`

3. **Fase 3 - Migração Gradual**
   - [ ] Migrar uma secção de cada vez (ex: clientes.py)
   - [ ] Testar cada migração antes de prosseguir
   - [ ] Manter backwards compatibility

---

## Estrutura de Refatoração Frontend

### Diretório: `/app/frontend/src/components/technical-reports/`

```
technical-reports/
├── index.js                      # Exportações
├── TechnicalReports.jsx          # Componente principal (simplificado)
├── hooks/
│   ├── index.js                  # ✅ CRIADO
│   ├── useRelatorios.js          # ✅ CRIADO - Estado dos relatórios
│   ├── useClientes.js            # ✅ CRIADO - Estado dos clientes
│   ├── useTecnicos.js            # Estado dos técnicos
│   ├── useIntervencoes.js        # Estado das intervenções
│   ├── useMateriais.js           # Estado dos materiais
│   └── useFotografias.js         # Estado das fotografias
├── modals/
│   ├── AssinaturaModal.jsx       # ✅ Já existe
│   ├── CronometroStartModal.jsx  # ✅ Já existe
│   ├── DeleteConfirmModal.jsx    # ✅ Já existe
│   ├── EquipamentoModal.jsx      # ✅ Já existe
│   ├── FolhaHorasModal.jsx       # ✅ Já existe
│   ├── MaterialModal.jsx         # ✅ Já existe
│   ├── PDFPreviewModal.jsx       # ✅ Já existe
│   ├── TecnicoModal.jsx          # ✅ Já existe
│   ├── ClienteModal.jsx          # A criar
│   ├── RelatorioModal.jsx        # A criar
│   ├── IntervencaoModal.jsx      # A criar
│   └── HTMLPreviewModal.jsx      # A criar
├── components/
│   ├── ClienteCard.jsx           # Card de cliente
│   ├── RelatorioCard.jsx         # Card de relatório
│   ├── TecnicoList.jsx           # Lista de técnicos
│   ├── IntervencaoList.jsx       # Lista de intervenções
│   ├── MaterialList.jsx          # Lista de materiais
│   ├── FotografiaGallery.jsx     # Galeria de fotos
│   └── StatusBadge.jsx           # Badge de estado
└── utils/
    ├── formatters.js             # Funções de formatação
    ├── validators.js             # Validações de formulário
    └── constants.js              # Constantes (estados, tipos, etc.)
```

### Migração Frontend

1. **Fase 1 - Hooks (Iniciado)**
   - [x] Criar hooks para estados principais
   - [ ] Migrar lógica de estado do componente principal para hooks

2. **Fase 2 - Modais**
   - [x] Modais críticos já extraídos
   - [ ] Extrair modais restantes

3. **Fase 3 - Componentes**
   - [ ] Extrair sub-componentes reutilizáveis
   - [ ] Simplificar o componente principal

---

## Prioridades

### Alta Prioridade
1. Novas features devem usar a nova estrutura
2. Bug fixes não precisam de refatoração
3. Manter o sistema funcional durante a migração

### Média Prioridade
1. Extrair modais grandes para ficheiros separados
2. Criar hooks para estados complexos
3. Documentar APIs internas

### Baixa Prioridade
1. Migrar código legacy existente
2. Otimizar imports
3. Remover código morto

---

## Notas Importantes

- **NÃO** fazer refatoração massiva de uma só vez
- Testar cada migração individualmente
- Manter backwards compatibility
- Documentar alterações no PRD.md

---

*Última atualização: 19 de Fevereiro de 2026*

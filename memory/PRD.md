# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem/oficina, e geração de relatórios PDF.

## Backlog Prioritizado

### P0 (Crítico)
- ✅ **Folha de Horas - Separação por tipo de registo** (27 Fevereiro 2026) - Corrigido agrupamento que juntava Trabalho+Viagem+Oficina com mesmo código
- ✅ **Canvas Assinatura Mobile Landscape** (25 Fevereiro 2026)
- ✅ **Tipo "Oficina" adicionado** (27 Fevereiro 2026)
- ✅ **Equipamentos no Visualizar Relatório** (27 Fevereiro 2026) - Layout mobile + Nº Série

### P0 (Pendente)
- 🔴 **PDF Generation Fails for Large Reports** - "Flowable too large" para OT#358
- 🔴 **Signature editing does not save correctly** - Campo `assinado_por`

### P1
- Completar/Testar Tabela de Preços Dinâmica
- Refactoring `window.location.reload()` hack
- Testar "Associar OT ao Calendário"
- Completar lógica "Trabalhar em Férias"
- Adaptar restantes páginas para mobile
- Integração OneDrive

### P2
- VAPID Key Mismatch, Edit OT Equipment
- Refactoring server.py e TechnicalReports.jsx
- Overtime Report, WebSockets, Metrics Dashboard, Excel/CSV Export

## Stack
- Frontend: React + shadcn/ui
- Backend: FastAPI + MongoDB
- PDF: ReportLab

## Credenciais
- Admin: `pedro` / `password`
- Test: `teste@email.com` / `teste`

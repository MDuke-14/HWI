# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem, e geração de relatórios PDF.

## Utilizadores
- **Admin**: Pedro Duarte (username: pedro), Miguel (username: miguel)
- **Técnicos**: Gichelson Leite, Nuno Santos

## Backlog Prioritizado

### P0 (Crítico)
- ✅ ~~Edição de hora início/fim em registos de tempo~~ (24 Janeiro 2026)
- ✅ ~~Funcionalidade "Justificar Dia" na Gestão de Entradas~~ (19 Fevereiro 2026)
- ✅ ~~Campos de email dinâmicos para clientes~~ (20 Fevereiro 2026)
- ✅ **Bug Assinatura Mobile Corrigido** (21 Fevereiro 2026) - Canvas e botões não respondiam a touch
- ✅ **PDF Layout Alinhado com HTML Preview** (23 Fevereiro 2026)
- ✅ **Mobile/Desktop View Persistence** (23 Fevereiro 2026)
- ✅ **Equipamentos com Campos Estruturados** (23 Fevereiro 2026)
- ✅ **Registos de Mão de Obra Ordenados Cronologicamente** (23 Fevereiro 2026)
- ✅ **Logo da Empresa no PDF** (23 Fevereiro 2026)
- ✅ **Sistema Tabela de Preço** (23 Fevereiro 2026)
- ✅ **Folha de Horas Individual por Técnico** (23 Fevereiro 2026)
- ✅ **Exclusão de Combustível da Folha de Horas** (23 Fevereiro 2026)
- ✅ **Botão Download PDF no Modal de Visualização** (23 Fevereiro 2026)
- ✅ **Visualização do Relatório Organizada por Data** (23 Fevereiro 2026)
- ✅ **Canvas Assinatura Mobile Landscape** (25 Fevereiro 2026) - Canvas responsivo após rotação de dispositivo com coordenadas normalizadas
- 🔄 **Modo Mobile PWA** - EM PROGRESSO (20 Fevereiro 2026)
  - ✅ Bottom Navigation para mobile
  - ✅ Sistema de temas (claro/escuro)
  - ✅ Menu mobile dedicado
  - ✅ Contextos de Mobile e Tema
  - ✅ Dashboard responsivo
  - ✅ Página de OTs responsiva (20 Fevereiro 2026)
  - ✅ Página de Calendário responsiva (20 Fevereiro 2026)
  - ✅ Página de Admin responsiva (20 Fevereiro 2026)
  - ✅ Assinatura Digital Mobile (21 Fevereiro 2026)
  - ⏳ Adaptar restantes páginas para mobile (Time Entries, Reports)
  - ⏳ Testes completos de offline

### P0 (Pendente)
- 🔴 **PDF Generation Fails for Large Reports** - "Flowable too large" error para OT#358 (verificação pendente)
- 🔴 **Signature editing does not save correctly** - Campo `assinado_por` não actualizado (verificação pendente)

### P1 (Alta Prioridade)
- Completar e Testar Tabela de Preços Dinâmica (herdado, nunca testado)
- Testar funcionalidade "Associar OT ao Calendário"
- Completar lógica "Trabalhar em Férias" - devolver dia de férias ao saldo
- Refactoring `window.location.reload()` hack - substituir por gestão de estado React
- Adaptar restantes páginas para mobile
- Integração OneDrive para armazenamento de ficheiros

### P2 (Média Prioridade)
- Resolver VAPID Key Mismatch para notificações push
- Corrigir falha no teste "Editar Equipamento OT"
- Refactoring de `server.py` e `TechnicalReports.jsx`
- Relatório de horas extra para admins
- Notificações em tempo real para admin (WebSockets)
- Dashboard com métricas e gráficos
- Exportação de dados para Excel/CSV

---

## Stack Tecnológico
- **Frontend**: React com shadcn/ui
- **Backend**: FastAPI (Python)
- **Base de Dados**: MongoDB
- **PDF**: ReportLab

---

## Credenciais de Teste
- **Admin**: `pedro` / `password`
- **Non-admin**: `miguel` / `password`
- **Test**: `teste@email.com` / `teste`

---

## Integrações de Terceiros
- ReportLab (geração de PDF)
- pywebpush (notificações push)
- pdfminer.six
- APScheduler (agendamento de tarefas)
- aiosmtplib (envio de emails SMTP)

---

## Arquitetura de Código

```
/app/
├── backend/
│   ├── server.py               # API FastAPI principal + APScheduler (~10K linhas)
│   ├── notifications_scheduler.py  # Lógica de notificações de ponto
│   ├── ot_pdf_report.py        # Geração de PDFs OT
│   ├── folha_horas_pdf.py      # Geração de Folha de Horas (landscape)
│   ├── cronometro_logic.py     # Lógica de cronómetros
│   ├── holidays.py             # Feriados portugueses
│   ├── migrations.py           # Migrações de dados
│   └── routes/
│       ├── __init__.py
│       ├── dependencies.py
│       └── auth.py
└── frontend/
    └── src/
        ├── components/
        │   ├── technical-reports/
        │   │   ├── AssinaturaModal.jsx    # Canvas assinatura com suporte landscape
        │   │   ├── FolhaHorasModal.jsx
        │   │   ├── TecnicoModal.jsx
        │   │   ├── EquipamentoModal.jsx
        │   │   ├── MaterialModal.jsx
        │   │   ├── CronometroStartModal.jsx
        │   │   ├── PDFPreviewModal.jsx
        │   │   └── DeleteConfirmModal.jsx
        │   ├── TechnicalReports.jsx  # (~6260 linhas - precisa refactoring)
        │   ├── AdminDashboard.jsx
        │   ├── Dashboard.jsx
        │   └── ...
        ├── layouts/
        │   └── MobileLayout.jsx      # Contém reload() hack
        └── pages/
            └── Dashboard/
                └── MobileDashboard.jsx
```

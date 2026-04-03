# HWI Unipessoal - Time Tracking & FS Management System

## Original Problem Statement
Full-stack time-tracking and work-order (FS - Folha de Servico) management application for HWI Unipessoal, Lda.

## Code Architecture
```
/app/backend/
  config.py            # Centralized configuration (from main branch)
  database.py          # MongoDB connection singleton
  models.py            # All Pydantic models
  auth_utils.py        # Auth helpers
  helpers.py           # Shared helpers
  cronometro_logic.py  # Segmentation, rounding, holiday logic
  server.py            # Main app (~10,200 lines)
  routes/              # Modular routers
/app/frontend/src/
  components/
    TechnicalReports.jsx           # Main FS component (~10,942 lines, refactoring in progress)
    technical-reports/
      TechnicalReportsTabs.jsx     # INTEGRATED - Tab navigation
      ReportsSection.jsx           # INTEGRATED - FS listing with filtering/sorting
      FacturadosSection.jsx        # INTEGRATED - Facturados tab
      ReportCard.jsx               # INTEGRATED - Individual FS card with motivo
      ClientsSection.jsx           # Available (from main), not yet integrated
      StatusSearchSection.jsx      # Available (from main), not yet integrated  
      TechnicalReportsHeader.jsx   # Available (from main), not yet integrated
      utils/                       # Shared utilities (appearance, errors, labels, reports)
      hooks/                       # Custom hooks (useRelatorios, useClientes)
      modals/                      # Extracted modals (all integrated)
      index.js                     # Central exports
```

## Core Features Implemented
- FS creation, management, and lifecycle
- Time tracking with chronometer (batch start/stop)
- Client management with NIF/email
- Equipment tracking per FS
- Intervention management with tabs
- Signature management (add, edit, delete)
- Photo management with thumbnails
- Material tracking with PC integration (Posicao/Codigo)
- PDF report generation (FS Report + Folha de Horas)
- Detailed PDF error messages (extractBlobError)
- Calendar integration
- Mobile-optimized dashboard
- Admin panel with user management, price tables, notifications
- Internal Reference System with specific email support
- Purchase Order (PC) Management System
- Facturados tab for invoiced FSs
- FS sorting by status (Em Execucao first, then Concluido)
- Motivo field visible in FS cards

## Bug Fixes Applied (2026-04-02/03)
- P0 FIXED: Travel Chronometer Auto-Calculation (minutos_trabalhados + migration fix)
- P0 FIXED: isFirstInterv temporal dead zone error
- FIXED: Km Iniciais not saved on new FS creation with chronometer
- ADDED: extractBlobError for detailed PDF error messages
- ADDED: Email-specific field for internal references
- ADDED: Facturados tab + status ordering
- ADDED: Motivo field in FS cards
- REFACTORED: Tabs, ReportsSection, FacturadosSection, ReportCard extracted from monolith

## Credentials
- Admin: pedro / teste

## Pending Issues (Prioritized)
### P1
- Continue refactoring: integrate ClientsSection, StatusSearchSection, Header
- Complete and Test Dynamic Price Table Creation
- Continue backend refactoring (server.py still ~10,200 lines)

### P2
- Recurring VAPID Key Mismatch
- Unresolved "Edit OT Equipment" Test Failure
- Refactor window.location.reload() hack in mobile

## Future Tasks
- P1: OneDrive Integration for file storage
- P1: Adapt remaining pages for mobile
- P2: Overtime Reporting
- P2: Real-time Admin Notifications (WebSockets)
- P2: Metrics Dashboard with charts
- P2: Data Export to Excel/CSV

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

## Timezone/DST Fix (2026-04-20)
- P0 FIXED: System used datetime.now(timezone.utc) everywhere, causing 1-hour offset during Portuguese summer time (DST)
- Architecture: Frontend sends `client_time` (ISO with offset e.g. `2024-03-31T09:00:00+01:00`) on time-entry start/end
- Backend parses client_time for accurate local storage; falls back to `Europe/Lisbon` timezone via pytz
- New utility functions: `get_now_local()`, `get_today_local()`, `format_time_from_iso()` in server.py
- All HH:MM display formatting uses `format_time_from_iso()` which converts to Lisbon timezone
- Frontend `toLocaleTimeString` calls hardened with `{ timeZone: 'Europe/Lisbon' }` option
- Fixed missing route decorator for `/api/time-entries/my-realtime-status`
- Fixed login auth to handle both `password` and `hashed_password` DB fields
- Backend tests: 10/10 passing (/app/backend/tests/test_timezone_dst_fix.py)

## Equipment Management Improvements (2026-04-21)
- Equipment database view per client now grouped by brand (marca) with amber headers and count badges
- Equipment selection in FS interventions (add/edit) uses `<optgroup>` to group by brand
- Backend blocks duplicate serial numbers (numero_serie) globally across all clients — returns HTTP 409 with descriptive error
- PUT endpoint also validates serial uniqueness (excluding current equipment)
- GET endpoint sorts by (marca ASC, modelo ASC) instead of last_used
- Backend tests: 9/9 passing (/app/backend/tests/test_equipamento_marca_grouping.py)

## PC Architecture Rewrite (2026-04-21)
- **Flat PC structure**: Removed parent/sub-PC hierarchy. All PCs are independent and at the same level.
- **Sequential naming**: Each new PC in a FS gets `PC_001#FS`, `PC_002#FS`, `PC_003#FS`, etc.
- **Equipment enforcement**: When aggregating material to existing PC, validates equipment matches. If different equipment is selected, returns error "Para adicionar material com equipamento diferente, crie uma nova PC".
- **Equipment selection**: MaterialModal shows checkboxes to select which FS equipment(s) to associate with the PC.
- **Uniform cards**: All PC cards in the listing have identical layout (FS number, client, materials, status, PDF/Email/Delete buttons).
- **Backend**: get_all_pedidos_cotacao returns flat list enriched with ot_numero and cliente_nome.
- **Backend**: get_pedido_cotacao uses equipamento_ot_ids for equipment lookup with fallback.

## Credentials
- Admin: pedro / teste

## Pending Issues (Prioritized)
### P0
- None (Timezone/DST fix completed)

### P1
- Continue refactoring: integrate ClientsSection, StatusSearchSection, Header
- Complete and Test Dynamic Price Table Creation (delayed 4+ forks)
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

# HWI Unipessoal - Time Tracking & FS Management System

## Original Problem Statement
Full-stack time-tracking and work-order (FS - Folha de Servico) management application for HWI Unipessoal, Lda.

## Code Architecture
```
/app/backend/
  database.py          # MongoDB connection singleton
  models.py            # All Pydantic models
  auth_utils.py        # Auth helpers
  helpers.py           # Shared helpers - email, notifications, vacation calc
  email_templates.py   # Multilingual email templates
  server.py            # Main app (~10,100 lines)
  routes/
    auth_routes.py     # Login, register, forgot-password
    clientes.py        # Client CRUD + PDF export
    equipamentos.py    # Equipment CRUD + history
    notifications.py   # Notifications + push
    pedidos_cotacao.py # PC management + invoices
    company_info.py    # Company info
    tabelas_tarifas.py # Price tables + tariffs
    references.py      # Internal reference system
/app/frontend/src/
  components/
    TechnicalReports.jsx  # Main FS component (~10,900 lines)
```

## Core Features Implemented
- FS creation, management, and lifecycle
- Time tracking with chronometer (batch start/stop for multiple technicians)
- Client management with NIF/email
- Equipment tracking per FS
- Intervention management with tabs
- Signature management (add, edit, delete) with inline editing
- Photo management: upload (with auto-compression + thumbnail), edit, delete, move between interventions
- Auto-open edit modal after photo upload for observations
- Material tracking with PC integration
- Move items (photos, materials, equipment) between interventions
- PDF report generation (FS Report + Folha de Horas)
- Calendar integration
- Mobile-optimized dashboard
- Admin panel with user management, price tables, notifications
- Internal Reference System with admin panel
- Purchase Order (PC) Management System

## Credentials
- Admin: pedro / password
- Non-admin: teste@email.com / teste

## Pending Issues (Prioritized)
### P0
- Refactor TechnicalReports.jsx (10,900+ lines) into smaller components (USER APPROVED)

### P1
- Complete and Test Dynamic Price Table Creation
- Continue backend refactoring (server.py still ~10,100 lines)
- PDF Generation - verify "Flowable too large" with production data

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

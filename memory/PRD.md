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

## Refactoring (2026-04-21)
### Backend
- Extracted `routes/time_entries.py` (~3,460 lines) from server.py
  - All time-entry endpoints: start, end, today, list, reports, PDF, Excel
  - Admin time entries: realtime-status, locations, manual entries, import, CRUD
  - server.py reduced from ~10,550 to ~7,126 lines (-32%)
### Frontend
- Extracted `IntervencaoModal.jsx` from TechnicalReports.jsx (reused for add + edit)
- TechnicalReports.jsx reduced from ~10,977 to ~10,820 lines
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

## PDF Materials & Assist Reports Isolation by Intervention (2026-02 fork)
- P0 FIXED: Materiais e Relatórios de Assistência eram duplicados no PDF quando múltiplas intervenções ocorriam na mesma data.
- Models `MaterialOT` e `RelatorioAssistencia` ganharam campo `intervencao_id`.
- `ot_pdf_report.py` filtra agora por `intervencao_id` (com fallback por data para registos antigos sem ID).
- Migração de arranque `migrate_items_intervencao_ids` em `server.py` atribuiu retroativamente `intervencao_id` aos registos existentes (10 materiais + 10 relatórios migrados).
- Validado via PDF de 3 FSs: FS com 3 intervenções na mesma data mostra cada material só 1x, na intervenção correcta.

## PC Architecture Rewrite (2026-04-21)
- **Flat PC structure**: Removed parent/sub-PC hierarchy. All PCs are independent and at the same level.
- **Sequential naming**: Each new PC in a FS gets `PC_001#FS`, `PC_002#FS`, `PC_003#FS`, etc.
- **Equipment enforcement**: When aggregating material to existing PC, validates equipment matches. If different equipment is selected, returns error "Para adicionar material com equipamento diferente, crie uma nova PC".
- **Equipment selection**: MaterialModal shows checkboxes to select which FS equipment(s) to associate with the PC.
- **Uniform cards**: All PC cards in the listing have identical layout (FS number, client, materials, status, PDF/Email/Delete buttons).
- **Backend**: get_all_pedidos_cotacao returns flat list enriched with ot_numero and cliente_nome.
- **Backend**: get_pedido_cotacao uses equipamento_ot_ids for equipment lookup with fallback.

## Credentials
- Admin: teste@email.com / teste

## Despesas Internas — Categorias UI (2026-04-29)
- Backend: `listar_ocorrencias` agora devolve `categoria_id` em cada ocorrência.
- Frontend (`DespesasInternas.jsx`):
  - Selector de Categoria no formulário Nova/Editar Despesa.
  - Modal "Gerir Categorias" (botão no header) com criação (nome + cor picker), listagem e delete.
  - Cor da categoria visível: borda esquerda colorida nas células do calendário e badge na tabela Lista.
  - Legenda de categorias por baixo do calendário.
- Validação de duplicado por (categoria_id, valor, ativo) confirmada via curl (HTTP 400 com mensagem clara).
- 9 categorias seedadas automaticamente (Renda, Eletricidade, Internet, Combustível, Salários, IVA/IRS, Seguros, Software/SaaS, Outros).

## Indisponibilidades — Sistema completo (2026-04-29)
- Backend (`routes/indisponibilidades.py`):
  - CRUD por user (POST/GET-me/PUT/DELETE) + admin (GET todas, GET historico/{user_id}, GET check)
  - Validações: tipo ∈ {entrada_tardia, saida_antecipada}, HH:MM, hora_inicio<hora_fim, anti-sobreposição
  - Endpoint `/indisponibilidades/check` recebe user_ids[]+data[+hora_inicio+hora_fim] → devolve conflitos
  - `early_leave_warning` adicionado ao response de `POST /api/time-entries/start` quando há saida_antecipada hoje
- Models (`models.py`): Indisponibilidade, IndisponibilidadeCreate, IndisponibilidadeUpdate
- Scheduler (`server.py`): 2 jobs APScheduler — matinal 07:00 (lembrete email a quem tem indisp hoje) + pré-evento a cada 5 min (alerta X min antes do início, default 60). Usa `notificacao_matinal_enviada` e `notificacao_pre_evento_enviada` para idempotência.
- Frontend:
  - `IndisponibilidadesModal.jsx`: gestão com agrupamento por user (admin vê todas, user normal vê só as suas), CRUD UI, filtro por user (admin)
  - `Calendar.jsx`: botão "Indisponibilidade" no header (visível a todos), badges rosa/amber por dia no MonthView, secção dedicada no Day Detail Modal, conflict popup ao criar Nova FS quando técnico tem indisp no dia (não bloqueia, só avisa)
  - `Dashboard.jsx`: toast warning ao picar entrada se houver saída antecipada hoje
- Testes: 13/13 backend (test_indisponibilidades.py) + frontend manual confirmado.

## IA Integrada — Claude Sonnet 4.5 via Universal LLM Key (2026-05-01)
- **Backend**: `services/ai_service.py` (analyze_error, review_fs com saída JSON estruturada)
- **Router**: `routes/ai.py` com 4 endpoints:
  - `POST /api/admin/errors/{id}/ai-resolve` — análise IA estruturada
  - `POST /api/admin/errors/{id}/ai-execute` — executa acção segura (mark_resolved, retry_email com teste SMTP real)
  - `POST /api/relatorios-tecnicos/{id}/ai-review` — analisa FS, devolve inconsistências, dados em falta, reescritas com score 0-100
  - `POST /api/relatorios-tecnicos/{id}/ai-apply-rewrite` — aplica reescrita aceite
- **Frontend**:
  - `ErrorLog.jsx`: botões "Copiar diagnóstico" e "Resolver com IA" (gradiente violeta-fuchsia). Painel "Análise da IA" com causa, explicação, solução sugerida, patch sugerido (vermelho/verde lado-a-lado, NÃO auto-aplica), botão de execução automática quando aplicável. Análise persistida em `app_errors.ai_analysis`.
  - `FSAIReviewModal.jsx`: novo componente, botão "Rever FS com IA" no header da FS. Mostra score 0-100, inconsistências, dados em falta e reescritas dos Relatórios de Assistência lado-a-lado (Original vs Proposta IA) com botões Aceitar/Rejeitar individuais.
- Modelo: `claude-sonnet-4-5-20250929` via `EMERGENT_LLM_KEY`
- Validado via curl + screenshot: resposta IA estruturada perfeita em PT-PT.

## Fix Massivo — 520 Produção + Loop de Login (2026-05-04)
Três bugs combinados que causavam o "site crasha" + "login preso" após 520 de gerar PDF:

1. **Service Worker cachava `/api/auth/me`, `/api/time-entries/today`, `/api/clientes`, `/api/relatorios-tecnicos`** → após backend 520 o SW servia cache stale com estado de autenticação incoerente, bloqueando o re-login. Removidos das CACHEABLE_APIS. **Auth endpoints (`/api/auth/*`) agora NUNCA passam por cache nem queue offline** (network-only). Bump para v3 força limpeza de caches antigos nos browsers existentes.

2. **`extractBlobError` mostrava HTML completo do Cloudflare (~5KB) num único toast** → UI travava. Agora detecta HTML/Cloudflare, limita texto a 300 chars, e devolve mensagens específicas para 502/503/504/520/521/522/523/524.

3. **Login estava excluído do retry automático** → 520 no login deixava o user bloqueado. Agora login tem **4 tentativas com backoff 800ms→3.2s** (tempo suficiente para backend reiniciar).

**Adicionado**:
- **ErrorBoundary global** (`components/ErrorBoundary.jsx`) envolvendo a App: captura qualquer exceção React, mostra ecrã amigável com botões "Recarregar" e "Limpar sessão + service workers + caches + ir para login".
- **Timeout de 90s** nos downloads de PDF principais (`handlePreviewPDF`, `handlePDFViewer`).
- **Compressão automática de fotos > 2MB** no PDF generator (ot_pdf_report.py): redimensiona para 1600px max + JPEG quality 80. Testado: 10MB → 1MB (redução 89.8%).

## Fix DEFINITIVO do 520 em Produção (2026-05-05)

Problema real detectado através da console do browser: `[SW] Service Worker loaded - v2` mesmo após deploy → **Service Worker preso** a servir código antigo. Três correções massivas:

### 1. Service Worker — força actualização sempre
- `service-worker.js`: bumped para v3, `install` chama `skipWaiting()`, `activate` chama `clients.claim()`, novo evento `message` para `SKIP_WAITING` remoto.
- `IndexedDB`: `initOfflineQueue()` agora tolera conflito de versão (o bug `VersionError: The requested version (1) is less than the existing version (2)` aparece na console) — abre sem versão, detecta DB corrupta e recria.
- `index.js`: regista listener `controllerchange` que recarrega a página UMA vez quando um novo SW fica activo. Invoca `registration.update()` em cada load.

### 2. Loop `/errors/log` — eliminado
- `App.js`: `neverRetry = url.includes('/errors/log')` — nunca retry em log.
- `shouldLog` ignora status 520/521/522/523/524 — quando o backend está down, NÃO faz sentido escrever erro no próprio backend down (criava loop visível de 3 POSTs em cada erro).

### 3. Gerador de PDF — à prova de bala
- `ot_pdf_report.py`:
  - Nova função `_safe_image_from_base64()` que **valida com `img.verify()` antes** e converte SEMPRE para JPEG RGB (evita bugs ReportLab com PNG/RGBA corrompidos). Nunca rebenta — devolve None em qualquer falha.
  - Nova função `_safe_image_from_path()` análoga para fotos em disco.
  - Todos os 3 pontos de uso (foto1/foto2 em 2 contextos + assinatura) substituídos por estas funções.
  - **`doc.build()` tem fallback**: se falhar na primeira tentativa, reconstrói o PDF SEM imagens (via `_strip_images_from_elements()`) e tenta de novo. Assim o PDF textual é SEMPRE entregue, mesmo que uma foto faça o ReportLab rebentar.
  - Log detalhado por foto: `[PDF] Foto foto1 rel=abc12345: 10MB → 480KB` ou `[PDF] Foto foto1 rel=abc12345: falhou (UnidentifiedImageError: …) — skip`.
- Threshold de compressão: 500KB (qualquer foto >500KB é reduzida para max 1400px, JPEG q82).

### Validação preview
- 3 PDFs consecutivos na FS real: HTTP 200, ~900ms, 506KB, válido.
- Smoke tests 17/17.

## Recent Fixes (2026-02)
### P0 FIXED (2026-02): `/fotografias` OOM / HTTP 520 crash
- **Root cause:** `GET /api/relatorios-tecnicos/{id}/fotografias` e `GET /api/pedidos-cotacao/{id}/fotografias` (e `GET /api/pedidos-cotacao/{id}`) retornavam todas as fotos com `foto_base64` e `thumb_base64` num único payload JSON gigante. FSs com muitas fotos causavam OOM no worker de produção e 520 no browser.
- **Fix:** Alterado o `projection` do MongoDB para excluir `foto_base64` e `thumb_base64` na listagem. Endpoints afetados:
  - `routes/relatorios.py::get_fotografias`
  - `routes/pedidos_cotacao.py::get_fotografias_pc`
  - `routes/pedidos_cotacao.py::get_pedido_cotacao` (lista embutida de fotos)
- O frontend já usa `/image?thumb=true` (thumbnail) na grid e `/image` (full) apenas ao clicar — portanto lazy loading funciona sem alterações no frontend.
- **Validação:** Payload com 3 fotos passou de centenas de KB para ~1.4 KB. Thumbs (~6 KB) e full (~89 KB) servidos individualmente via endpoint `/image` com `Cache-Control: public, max-age=86400`.

### P1 IMPLEMENTED (2026-02): Tabela de preços padrão para Folhas de Horas
- **Pedido:** Marcar uma tabela de preços em `/admin > Tabela de Preço` como padrão para que seja sempre usada automaticamente ao gerar Folhas de Horas (preview, download, email).
- **Implementação:**
  - Backend `models.py::TabelaPrecoConfig` — adicionado campo `is_default: bool = False`.
  - Backend novo endpoint `POST /api/tabelas-preco/{table_id}/set-default` (admin only) — marca a tabela como padrão e desmarca todas as outras (mutex).
  - Backend novo helper `routes/tabelas_tarifas.py::get_default_table_id()` — devolve `table_id` da tabela padrão; fallback inteligente para primeira tabela com tarifas ativas; final fallback `1`.
  - Backend `EnviarEmailRequest` e `FolhaHorasRequest`: `table_id` agora é `Optional[int] = None`. Quando `None`, o handler chama `get_default_table_id()`.
  - Backend `_enviar_pdf_worker` (email) e `/folha-horas-pdf` (preview/download) usam `get_default_table_id()` quando frontend não passa `table_id`.
  - Frontend `AdminDashboard.jsx` — botão "Definir como Padrão" (com ícone Star) no card da tabela; estrela amarela na tab da tabela padrão; botão "Eliminar" oculto para a tabela padrão (proteção); badge "Padrão" no header.
  - Frontend `FolhaHorasModal.jsx` — pré-seleciona automaticamente a tabela marcada como padrão ao abrir o modal.
  - Frontend `TechnicalReports.jsx::handleConfirmSendEmail` — passa `table_id: null` para deixar o backend escolher a padrão.
- **Validação:** Marcar tabela 2 como padrão → toast "Será usada automaticamente nas Folhas de Horas" → estrela aparece na tab "2025" → ao gerar Folha de Horas SEM `table_id`, o PDF usa as tarifas da tabela 2 (50€/h em vez de 30€/h da tabela 1). Mutex confirmado: só uma tabela é padrão de cada vez.

### P0 FIXED (2026-02): Folha de Horas no email — "h" no Resumo + valores €0
- **Sintoma:** No PDF de Folha de Horas enviado por email, o resumo do colaborador mostrava `8.00h, 1.20h` (com sufixo "h" duplicado já que o cabeçalho já indica horas) E os valores €/h por código apareciam todos a "-" (zero euros).
- **Root cause 1 (cosmético):** `f"{h:.2f}h"` no resumo. Linha 581, 585, 589 de `folha_horas_pdf.py`.
- **Root cause 2 (valores):** O endpoint `enviar-pdf` (em `routes/relatorios.py`) **hardcodava** `table_id=1` e **passava `tarifas_por_tecnico={}`** sem aceitar overrides do frontend, ao contrário do `/folha-horas-pdf` (download) que aceita `request.table_id`, `tarifas_por_tecnico`, `dados_extras`, `despesa_adjustments`. Resultado: se o utilizador configurou tarifas noutra tabela ou se as tarifas DB têm `tipo_colaborador` estrito que não bate com a `funcao_ot` do colaborador, o lookup falha e `total_valor=0`.
- **Fix:**
  - `folha_horas_pdf.py` — sufixo "h" removido das células do resumo (mantido nos cabeçalhos como contexto).
  - `models.py::EnviarEmailRequest` — adicionados `table_id`, `tarifas_por_tecnico`, `dados_extras`, `despesa_adjustments`.
  - `routes/relatorios.py::_enviar_pdf_worker` — usa `request.table_id` (não hardcoded) e os overrides do frontend; aplica também `despesa_adjustments` (exclusões/percentuais) tal como o preview.
  - **Fallback inteligente:** Se a `table_id` escolhida não tem tarifas, o backend procura automaticamente qualquer tabela ativa com tarifas e regista um warning. Evita PDFs com €0 quando o utilizador não passa `table_id`.
  - `TechnicalReports.jsx::handleConfirmSendEmail` — passa `tarifas_por_tecnico` e `dados_extras` construídos a partir do estado da Folha de Horas.
- **Validação:** Folha de Horas testada com FS `8d3a0111-...` mostra Resumo correto: `9.00 / 270.00€ / 1056.25€` — sem "h", com valores €.

### P0 FIXED (2026-02): `enviar-pdf` HTTP 520 persistente — refactor para background task
- **Sintoma:** Mesmo após mover geração de PDF para thread pool, FSs com muitas fotos+registos continuavam a dar HTTP 520 em produção (FS 57326e83). O timeout do Cloudflare ingress (~100s) é INDEPENDENTE do worker estar bloqueado ou não — qualquer request HTTP que demore mais que 100s = 520.
- **Root cause definitivo:** O fluxo síncrono "request → gerar 2-3 PDFs → enviar SMTP a N destinatários → responder" pode legitimamente ultrapassar 100s em FSs muito pesadas.
- **Fix definitivo:** Refatorado `POST /api/relatorios-tecnicos/{id}/enviar-pdf` para usar **fire-and-forget background task** (`asyncio.create_task`):
  - Endpoint valida inputs e responde **HTTP 200 em ~0.2s**.
  - Worker `_enviar_pdf_worker` corre em background gerando PDFs e enviando SMTP.
  - Erros (geração ou SMTP) são registados em `app_errors` via `log_app_error` e aparecem em `/admin/erros`.
  - Resposta inclui flag `queued: true` para o frontend informar o utilizador.
- **Frontend:** Toast atualizado: "X documento(s) em processamento para Y email(s). Se houver erro será registado em /admin/erros." Timeout reduzido para 30s.
- **Resultado:** Impossível dar 520 neste endpoint, independente de quão pesada seja a FS.
- **Validação:** Endpoint retorna 200 em 200ms. Background task verificada nos logs com erros corretos em `app_errors`.

## Pending Issues (Prioritized)
### P0
- **Re-deploy obrigatório** para aplicar os fixes de `/fotografias` e `enviar-pdf` em produção.

### P1
- Complete and Test Dynamic Price Table Creation (delayed 7+ forks)
- Continue refactoring TechnicalReports.jsx (~10.3k lines) e Calendar.jsx (~1300 lines)
- Continue backend modular router extraction

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

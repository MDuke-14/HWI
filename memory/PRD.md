# HWI Unipessoal - Field Service Management

## Original Problem Statement
Aplicação de gestão de Folhas de Serviço (FS / Ordens de Trabalho) para a HWI Unipessoal — tracking de tempo dos técnicos (cronómetros), gestão de intervenções, fotografias, materiais, equipamentos, geração de PDFs (relatório técnico + Folha de Horas), envio por email, cálculo de tarifas por código (1/2/S/D), workflows de continuidade entre FSs, autenticação, painel de admin com erros, etc.

## Stack
- **Frontend:** React (CRA + craco), TailwindCSS, shadcn/ui, axios, sonner
- **Backend:** FastAPI + Motor (MongoDB async)
- **DB:** MongoDB (collections: relatorios_tecnicos, intervencoes_relatorio, registos_tecnico_ot, fotografias, materiais, assinaturas, clientes, tarifas, app_errors, pdf_jobs + GridFS para PDFs gerados)
- **PDF:** ReportLab + PIL
- **AI:** Claude Sonnet 4.5 via emergentintegrations (revisão de FSs e análise de erros)
- **Email:** aiosmtplib (SMTP)

## Core Features Implemented
- FS creation, management, and lifecycle
- Time tracking with chronometer (batch start/stop)
- Client management with NIF/email
- **Per-client billing config: `faturar_viagens_curtas` (Feb 2026)** — toggle no modal Cliente; quando ativo, viagens <30min cobram horas + KM (ex.: Kannegiesser); quando inativo (default), cobram apenas KM com observação "Só KM (<30min)" no PDF da Folha de Horas
- Equipment tracking per FS
- Intervention management with tabs + close button (X) on each tab (Feb 2026)
- Signature management (add, edit, delete)
- Photo upload (thumb_base64 normalizadas 200x200)
- Material/expense management
- PDF generation (sync + async via job + GridFS multi-pod)
- ZIP fallback para FSs grandes (PDF + HD photos)
- AI Review de FSs
- Admin Error Log (com IA-resolve)
- Folha de Horas (Timesheet) com cálculo detalhado por código (1/2/S/D), tipo (trabalho/viagem) e função (junior/tecnico/senior)

## Sessão Atual (Feb 2026) — Resumo
29. ✅ **Fix HTTP 422 no upload de foto na FS (Feb 2026)** — bug reportado: `POST /relatorios-tecnicos/{id}/fotografias` retornava 422 com `{"loc":["body","file"],"msg":"Field required"}` em alguns browsers (Safari/iOS + mobile). Causa: 2 chamadas em `TechnicalReports.jsx` (`handleUploadFoto` linha 1861 + input file input linha 6101) passavam explicitamente `headers: {'Content-Type': 'multipart/form-data'}`. Alguns browsers **não** anexam automaticamente o `boundary=...` quando o header é definido manualmente pelo cliente → o backend não consegue parsear o body multipart → o campo `file` aparece em falta. Fix: removido o header explícito nos 2 sítios — axios/browser passam a computar e definir o Content-Type com boundary correcto ao detectar FormData. Validado via curl (upload OK, 200) e o botão de rollback (delete) também funciona.

28. ✅ **Férias dinâmicas nos relatórios mensais (Feb 2026)** — bug reportado: `/vacations` mostrava saldo FIFO correto, mas relatórios mensais PDF/Excel exibiam valores antigos vindos da coleção depreciada `vacation_balances` (ex.: Gichelson Leite). Fix:
    - `routes/time_entries.py::get_monthly_detailed_report` (endpoint JSON) — substituída consulta a `vacation_balances` por chamada a `_fetch_user_vacation_context` + `_build_year_balances` de `routes.vacations`. Import tardio para evitar ciclo.
    - `routes/time_entries.py::download_excel_report` — mesma lógica FIFO aplicada; passa `year_breakdown` completo ao gerador Excel.
    - `pdf_report.py::generate_monthly_pdf_report` — nova tabela "Detalhe de Férias por Ano" abaixo do sumário (mostra Ganhos/Gozados/Disponíveis por ano).
    - `excel_report.py::generate_monthly_report` — nova secção "Gestão de Férias" no fim da folha (Gozados/Disponíveis/Anual) + tabela "Detalhe por Ano".
    - Novo campo `summary.vacation_year_breakdown` na resposta JSON.
    - Validado E2E: Gichelson (start 13/11/2025) — antes: valores errados do `vacation_balances`; agora: 1 gozado, 23 disponíveis, 24 anuais. Match exato com `/vacations/balance`. Miguel: 4/38/42. Match exato.

## Sessão Anterior (Feb 2026) — Resumo
1. ✅ Feature `faturar_viagens_curtas` no Cliente (Kannegiesser)
2. ✅ Seed das 24 tarifas de produção em table_id=1 do preview (3 funções × 4 códigos × 2 tipos)
3. ✅ Confirmação total de horas FS#471 (Trabalho 106h15 + Viagem 33h56)
4. ✅ Identificação de discrepância tarifa Junior×Cód.1×Viagem (PDF cobrou 30€/h, correto 16€/h — diferença -49.70€)
5. ✅ X button em cada aba de intervenção para apagar diretamente
6. ✅ **RCA HTTP 520 em produção:** Memory limit 1GiB e CPU 250m no deployment causam OOMKill nos pods durante geração de PDF (preview consome 1.87GB de pico). Cloudflare devolve 520 enquanto o pod restarta.
7. ✅ Validação/redimensionamento automático no upload do logo da empresa (limite 1200×400 px) para prevenir LayoutError do ReportLab com logos enormes
8. ✅ Endpoint `DELETE /admin/errors/started-orphans` + botão UI para limpar STARTED órfãos sem afetar erros reais
9. 📨 User vai contactar support@emergent.sh para pedir aumento de recursos (Opção A)
10. ✅ Regras SA/AC unificadas Feb/2026: SA binário (≥4h=10€), AC tiered (4-6h=25€, ≥6h=50€). Helper `calcular_sa_ac` em time_entries.py + 10 testes unitários
11. ✅ Fix scroll bloqueado nos modais de Cliente — adicionado `max-h-[90vh] overflow-y-auto`
12. ✅ Sistema de autorizações refactor: emails para geral@hwi.pt em vez de push notifications aos admin; link para portal admin; periodos de ponto incluídos no email e na UI; fix do bug do botão Aprovar/Rejeitar (response.data.status check); fix do import process_authorization_decision em routes/overtime.py
13. ✅ Cleanup de código morto (9 ficheiros eliminados, 15+ bugs latentes corrigidos em `relatorios.py`, `time_entries.py`, etc.)
14. ✅ **Refactor TechnicalReports.jsx (Feb 2026)** — extração de 8 novos modais para `/app/frontend/src/components/technical-reports/`: `AddFotoPCModal`, `EmailPCModal`, `HideClientPopup`, `EditMaterialPCModal`, `ChangeTipoModal`, `DeleteClienteModal`, `ReferenciaInternaModal`, `IniciarCronoModal`. Reduzido de 10100 → ~9650 linhas (-450). Adicionalmente corrigidos 2 bugs latentes (`fetchRegistosTecnicosOT` → `fetchRegistosTecnicos`, `fetchMateriaisRelatorio` → `fetchMateriais`).
15. ✅ **Relatório Simples (Feb 2026)** — nova feature: relatório profissional sem fotografias, estilo Word.
    - Botão "Relatório Simples" em cada card de FS (lista) + modal de visualização (desktop+mobile).
    - Modal full-screen: editor estilo Word com formatação simples (negrito/itálico/sublinhado/listas), secções dinâmicas (adicionar/remover/reordenar), título do relatório, opção de incluir equipamentos da FS (Marca/Modelo/Nº Série).
    - Pré-visualização A4 lado-a-lado em tempo real.
    - Persistência: 1 versão por FS (upsert). Endpoints `GET/POST/DELETE /api/relatorios-simples/by-fs/{id}` + `GET /api/relatorios-simples/by-fs/{id}/pdf` + `GET /api/relatorios-simples/by-fs/{id}/equipamentos`.
    - Geração PDF com header de logo (igual restantes documentos), cliente, título centrado, secções, tabela equipamentos (3 colunas), rodapé com data + nome do técnico.
    - Novos ficheiros: `models.py` (RelatorioSimples + RelatorioSimplesUpsert), `routes/relatorios_simples.py`, `relatorio_simples_pdf.py`, `technical-reports/RelatorioSimplesModal.jsx`.
16. ✅ **Auth fix + Vacations filter (Feb 2026)** — eliminado utilizador duplicado em `users`; passwords reset para `miguel` (`Miguel123!`) e `teste@email.com` (`Admin123!`). Filtro `include_past` (default false) em `/vacations/my-requests` e `/admin/vacations/all-balances` esconde férias gozadas de anos anteriores. Toggles UI 'Mostrar/Esconder anos anteriores' nas secções Meus Pedidos + Admin.
27. ✅ **Fix upload de fotos em mobile nas FS (Feb 2026)** — bug reportado: upload de fotos em `TechnicalReports` falhava no telemóvel (tanto em modo mobile como em desktop-view), funcionava no PC. Causa raiz:
    - Frontend validava com `allowedTypes.includes(file.type)` strict — mas em iOS Safari e alguns Android, `file.type` vem **vazio** ou não-standard (`image/jpg`, `application/octet-stream`) para fotos da câmara e HEIC. Toast dizia "Tipo não permitido" e travava.
    - Limite 10MB era apertado — fotos modernas de iPhone em HDR facilmente ultrapassam.
    - Se browser rejeitasse decodificar HEIC no compressor Canvas, todo o handler falhava.
    - Backend usava PIL sem HEIC decoder — iPhone photos ficavam guardadas como HEIC raw impossíveis de visualizar num browser.
    - **Fixes**: 2 handlers (`handleFotoFileChange`, `handleFotoPCFileChange`) agora aceitam MIME **OU** extensão do ficheiro; limite aumentado para 25MB; compressão falha graciosamente para o original. `accept` do input passa a ser `image/*` (a lista MIME longa rejeitava seleção em alguns Android). Instalado `pillow-heif` e registado o decoder em `routes/relatorios.py` → HEIC do iPhone convertido para JPEG servido.
    - Validado E2E com JPEG 3000×2000 via curl (upload OK, foto guardada, ficheiro apagado).

26. ✅ **Link "Ver picagem" no email admin (Feb 2026)** — os emails de autorização (`overtime`, `vacation_work`, `work_holiday`, `work_weekend`, `work_special`, `early_leave`) passam a incluir um link secundário `Ver picagem no portal admin →` que aponta para `/admin/time-entries?entry_id=<id>&date=<yyyy-mm-dd>`.
    - `get_authorization_request_email_html` recebe novo parâmetro `entry_id` (opcional).
    - `send_authorization_request_email` recebe e propaga o `entry_id`.
    - 3 call sites actualizados: `check_clock_out_status`, `handle_overtime_start` (inclui vacation_work), `create_early_leave_authorization`.
    - Novo endpoint `GET /admin/time-entries/{entry_id}` para fetch de uma entrada isolada.
    - `AdminTimeEntries.jsx`: lê `?entry_id=` + `?date=` do URL, faz GET da entry para descobrir o dono, pré-selecciona o utilizador, ajusta mês/ano automaticamente, scroll até à entrada e destaca com `ring-amber-400 animate-pulse-slow`.
    - Smoke test frontend: navegação directa ao link do email leva o admin à picagem correcta em 3s.

25. ✅ **Overtime: threshold 8h15 + dedup (Feb 2026)** — 2 bugs reportados após deploy:
    - **Duplicate emails**: filtro em `check_clock_out_status` só bloqueava `status=pending`. Após admin aprovar, o ciclo seguinte encontrava 0 pending → criava novo pedido → spam. Corrigido: agora bloqueia se **existe qualquer pedido** para `user_id + date + request_type=overtime_end` (independentemente do status).
    - **Threshold 8h10 → 8h15**: constante alterada de 490 min para 495 min. Push texts + logs actualizados. Validado E2E: com 8h12 → 0 disparos; com 8h20 → 1 disparo, 2º/3º triggers após approve → 0 disparos.

24. ✅ **Fase 2A da code review (Feb 2026)** — micro-optimizações de baixo risco:
    - **useMemo em zonas quentes**: `AdminDashboard.jsx` — `pendingVacationWorkRequests` e `decidedVacationWorkRequests` memoizados, substituem 5 chamadas inline `.filter()`. `TechnicalReports.jsx` — `registosCombinados` memoiza o merge+sort de `tecnicos + registosTecnicos` (era feito 2x inline, versão mobile + desktop, ~250 linhas de código duplicado eliminadas).
    - **`key={index}` → chaves estáveis** em 15/28 sítios (todos os arrays vindos da API): `Reports.jsx` (entradas de dia), `AdminDashboard.jsx` (issues, notificationLogs, reports.users), `TechnicalReports.jsx` (equipamentos, intervenções, registos, materiais, fotografias, assinaturas, emails), `Vacations.jsx` (annual_transitions), `Calendar.jsx` + `VacationReviewModal.jsx` + `DespesasInternas.jsx` (calendar cells → `dateStr`), `CronometroPopups.jsx` (técnicos), `FSAIReviewModal.jsx` + `PublicAuthorizationDecidePage.jsx` (strings compostas). Restantes 7 sítios são cabeçalhos estáticos (7 dias da semana) ou inputs de formulário controlados — mudar exigia alterar state model (adicionar `_lid` UUID), deixado em backlog.
    - **`is` vs `==` em testes**: ruff `--select F632` diz 0 problemas. Todos os `is` são `is None/True/False` (uso correcto pythonic). Nada a corrigir — report do reviewer sobreestimou.
    - Todos os ficheiros passam lint. Smoke test em `/vacations` (admin view) confirma renderização correcta.

23. ✅ **Fase 1 da code review (Feb 2026)** — correcções críticas de segurança/estabilidade:
    - **Import circular** `server.py` ↔ `routes/public_authorizations.py` resolvido: extraída função `refund_vacation_day(user_id, reason)` para `helpers.py`. `server.py::decide_day_authorization` e `public_authorizations.py` usam agora o mesmo helper — elimina a tentativa de `from server import return_vacation_day` (função que nunca existiu; falhava em silêncio há tempo).
    - **`exec()` removido** de `tests/test_sa_ac_rules.py`: constantes `SA_FULL_VALUE`, `AC_FULL_VALUE` e função `calcular_sa_ac` extraídas para `sa_ac_rules.py` (módulo puro, sem deps); `routes/time_entries.py` re-exporta para retro-compatibilidade. Teste com 6 asserts passa.
    - **Secrets em testes** movidos para env: `test_referencia_token.py`, `test_photo_features.py`, `test_ot_relacionada_dieta.py`, `test_monthly_detailed_early_leave_credit.py`, `test_early_leave_credit_red_display.py`, `test_cronometro_bug_fix.py`, `test_auth_login_fix.py` agora lêem `TEST_ADMIN_EMAIL/PASSWORD` + `TEST_USER_USERNAME/PASSWORD` (fallback para defaults). Novo `tests/conftest.py` com fixtures `admin_credentials`, `user_credentials`, `api_base_url`.
    - **XSS em `RelatorioSimplesModal.jsx`**: adicionado `DOMPurify.sanitize` no `innerHTML` do editor (linha 68) e no `dangerouslySetInnerHTML` do preview (linha 170). Whitelist restritiva (`b/strong/i/em/u/br/p/div/span/ul/ol/li/h1-h4/a` + `href/style/class`). `HelpTooltip.jsx` já sanitizava.
    - **Stale closures em `useOfflineData.js`**: `syncPendingOperations` e `loadPendingCount` chamadas pelos event listeners `online`/`offline` (useEffect com `[]` deps) usavam a closure inicial (isSyncing sempre false). Corrigido com padrão `useRef` — refs actualizadas a cada render, listeners sempre chamam a versão mais recente.

22. ✅ **Overtime trigger a 8h10 (Feb 2026)** — regra alterada: em vez do cron das 18:15, o backend verifica a cada 15 min (dias úteis, 08h-22h) se algum utilizador acumulou **≥ 8h10 (490 min)** de trabalho no dia somando todas as picagens. Ao atingir o limite:
    - Cria pedido `overtime_end` em `overtime_authorizations` (evita duplicados por dia).
    - Email a `SMTP_FROM`/`geral@hwi.pt` com botões Aprovar/Rejeitar (7 dias válidos), com detalhe "trabalhou 8h15 hoje (entrada 09:00)".
    - Push notification ao utilizador.
    - **Regra aplica a admins também** (removido o `if is_admin: continue`).
    - Se admin **rejeita**, o ponto activo é encerrado no `start_time + (480 - minutos_já_trabalhados_noutras_sessões)` para o total do dia ficar exactamente em 8h. Antes fechava sempre às 18:00.
    - Validado E2E: miguel + admin com entrada 8h15 atrás → `notified_count=1`, email enviado.

21. ✅ **Auto-detecção "Fora de Zona" no backend (Feb 2026)** — Bug reportado: em mobile a picagem fora de Portugal não marcava "Fora de Zona" automaticamente. Causa: `MobileLayout.jsx` não faz reverse geocoding local (só o desktop `Dashboard.jsx` fazia), e o backend só usava o flag enviado pelo cliente. Fix: nova função helper `_detect_outside_residence_zone()` em `routes/time_entries.py` — o backend, após reverse geocoding, verifica `country_code != PT` OU cidade/município/região não contém Lisboa/Sintra/Setúbal e marca `outside_residence_zone=True` + preenche `location_description` (ex.: "Barrio de los Austrias, Comunidade de Madrid, Espanha"). Respeita override manual do cliente. Fonte única para desktop + mobile. Validado com coordenadas de Madrid (40.4168, -3.7038) via API.

20. ✅ **Vacation Engine — modelo FIFO com regra de 1 Janeiro (Feb 2026)** — refatorado o motor de férias para respeitar a regra correta portuguesa da empresa:
    - **Ano de admissão**: pró-rata (2 dias/mês trabalhado, máx 22).
    - **Anos seguintes ao de admissão**: **22 dias completos** atribuídos automaticamente a 1 de Janeiro (o ano corrente já ganha 22 mesmo em Julho — não pró-rata pelo mês actual).
    - **Consumo FIFO**: o total de dias gozados é alocado ao ano mais antigo primeiro; só depois transita ao seguinte. Se o consumo excede o total ganho, o último ano fica com saldo **negativo** (transita para o ano seguinte).
    - `helpers.calculate_vacation_days_by_year` alterado; `_build_year_balances` reescrito com alocação FIFO em vez de carry-over aditivo.
    - `GET /vacations/balance` devolve totais (soma de todos os anos) + `year_breakdown`.
    - `GET /admin/vacations/all-balances` também inclui `year_breakdown` por user.
    - UI `Vacations.jsx`: nova secção "Disponíveis por ano" com cards side-by-side (ex.: 2025: 16 (4/20 gastos) | 2026: 22 (0/22 gastos)); admin também mostra breakdown no header do card de cada colaborador.
    - Validado (Miguel start 14/02/2025, hoje Jul/2026, 4 gozados): 42 acumulados / 4 gozados / 38 disponíveis, 2025=16 e 2026=22.
    - Validado (Chelson start 13/11/2025, manual 29 dias/2026): 24 acumulados / 29 gozados / -5 disponíveis, 2025=0 e 2026=-5. Perfeito para transitar dívida.
    - **NOTA**: substitui a versão anterior (item 19) — o modelo com carry-over aditivo não era o que a empresa queria.

19. ✅ **Refactor Vacation Balance Engine v1 (Feb 2026)** — [SUBSTITUÍDO pelo item 20]
    - `days_earned` por ano = `helpers.calculate_vacation_days_by_year` (2 dias/mês, máx 22/ano).
    - `days_taken` por ano = **max(override_manual, contagem automática)** dos pedidos aprovados (dias úteis) menos cancelamentos.
    - **Carry-over positivo apenas** — sobra de um ano soma no seguinte; negativos ficam nesse ano e não empurram dívida.
    - **Ignora anos < company_start_date** (elimina fantasmas do modal admin, ex.: "2024=22 dias" para user que entrou em 2025).
    - `vacation_balances.days_earned/days_taken/days_available` deixa de ser fonte — só guarda `company_start_date`.
    - **`check_annual_vacation_reset()` desativado** — o rollover destrutivo (somar 22 cegos + reset taken=0) corrompia carry-over para quem entrava a meio do ano.
    - Approve/reject/cancel deixam de mexer em `vacation_balances`; a mudança de `status="approved"` no pedido é suficiente.
    - Nova migração `cleanup_orphan_vacation_taken_by_year_v1` remove entries fantasma.
    - Endpoints refatorados: `GET /vacations/balance`, `GET /admin/vacations/all-balances` (agora inclui `year_breakdown`), `GET /admin/vacations/taken-by-year/{user_id}` (agora expõe `days_taken_manual` + `days_taken_auto`), `POST /admin/vacations/taken-by-year/{user_id}` (rejeita anos < company_start_date).
    - Validado: Miguel (start 14/02/2025, hoje Jul/2026, 4 aprovados 2026 dos quais 20 dias cancelados em Março, 1 dia em 2025) → 33 acumulados, 3 gozados, **30 disponíveis** (era negativo).

18. ✅ **Vacation balance dinâmico (Feb 2026)** — `GET /vacations/balance` (user) e `GET /admin/vacations/all-balances` (admin) recalculam `days_earned`/`days_taken`/`days_available` on-the-fly usando `helpers.calculate_vacation_days_by_year()` + carry-over anual via `db.vacation_taken_by_year`. A coleção `vacation_balances` passa a ser usada apenas para `company_start_date` — valores agregados eram estáticos (ex.: 22 dias para user que entrou em Nov/2025) e agora seguem a regra legal de 2 dias/mês trabalhado com máximo de 22/ano. Valida: Chelson (start 2025-11-13, hoje Jul/2026) = 2 (2025) + 14 (2026) = 16.

17. ✅ **Saída por Ordem da Empresa (Feb 2026)** — quando o colaborador faz a 2ª picagem e tenta fechar o ponto com total < 8h, aparece checkbox "Saída por Ordem da Empresa" no Dashboard.
    - Sem checkbox: ponto fecha normalmente sem aprovação.
    - Com checkbox: ponto fecha + email automático ao admin com mesmo template/fluxo das horas extra (`request_type="early_leave"` em `overtime_authorizations`).
    - Admin aprova: sistema cria entry virtual de crédito (`is_early_leave_credit=true`) com observação rastreável para perfazer 8h.
    - Admin rejeita: mantém-se as horas efetivamente trabalhadas.
    - SessionStorage partilhada Dashboard ↔ MobileLayout para mobile usar a mesma flag.
    - Files: `models.py` (TimeEntryEnd campo `early_leave_company_order`), `routes/time_entries.py`, `notifications_scheduler.py` (handler `early_leave` + helper `create_early_leave_authorization`), `Dashboard.jsx`, `mobile/MobileLayout.jsx`.

## Production Deployment Config (CRÍTICO)
- Memory: **1 GiB** (insuficiente — picos observados 1.87 GiB)
- CPU: **250m** (insuficiente para PDF generation)
- Replicas: 2
- Uvicorn: --workers 1

## Backlog (P1/P2)
- (Aguarda Opção A) **Aumento de recursos do deployment** (pedido a support@emergent.sh)
- (P1) Continuar refactor de `TechnicalReports.jsx` (~9650 linhas; modais grandes ainda inline: `showViewRelatorioModal` ~1500 linhas, `showHTMLPreviewModal` ~500, `showAddRegistoManualModal`/`showEditRegistoModal` ~700, Add/Edit/View Cliente ~600)
- (P2) Consolidar `overtime_authorizations` + `day_authorizations`
- (P2) Refactor `excel_report.py` e `import_excel.py`
- (P2) OneDrive integration
- (P2) Mobile views
- (P2) WebSockets para notificações tempo real
- (P2) Dashboard de métricas
- (P2) Export Excel/CSV

## Testing
- `/app/backend/tests/test_faturar_viagens_curtas.py` (unit)
- `/app/backend/tests/test_faturar_viagens_curtas_api.py` (E2E)
- `/app/backend/scripts/seed_tarifas_producao.py` (seed das 24 tarifas)
- Iterations: `/app/test_reports/iteration_{33,34}.json`

## Test Credentials
- Admin: `teste@email.com` / `teste`

## Key Files
- `/app/backend/server.py` — main API (4500+ lines)
- `/app/backend/folha_horas_pdf.py` — Folha de Horas PDF generator (with `faturar_viagens_curtas` flag)
- `/app/backend/ot_pdf_report.py` — OT/FS PDF generator (with image fallback)
- `/app/backend/routes/company_info.py` — logo upload com validação de dimensões
- `/app/backend/routes/relatorios.py` — async PDF jobs + GridFS
- `/app/backend/models.py` — Cliente model com `faturar_viagens_curtas`
- `/app/frontend/src/components/TechnicalReports.jsx` — main UI (10k+ lines)
- `/app/frontend/src/components/ErrorLog.jsx` — admin error log com botão Limpar STARTED órfãos

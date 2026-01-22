# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem, e geração de relatórios PDF.

## Utilizadores
- **Admin**: Pedro Duarte (username: pedro), Miguel (username: miguel)
- **Técnicos**: Gichelson Leite, Nuno Santos

## Stack Tecnológico
- **Frontend**: React com shadcn/ui
- **Backend**: FastAPI (Python)
- **Base de Dados**: MongoDB
- **PDF**: ReportLab

---

## Funcionalidades Implementadas

### Janeiro 2026 - Sessão Atual (22 Janeiro 2026)

#### ✅ Trabalho Durante Período de Férias (P0 - Completo)
**Quando um utilizador em férias aprovadas faz clock-in:**
- Sistema detecta automaticamente que o utilizador está de férias
- Cria pedido de autorização especial (`vacation_work`)
- Envia notificação push ao admin: "⚠️ Trabalho em Férias - [Nome]"

**Se admin APROVAR:**
- Entrada de ponto é marcada como autorizada
- 1 dia de férias é devolvido ao saldo do utilizador
- Pedido de férias é atualizado com `days_voided` e `voided_dates`
- Notificação enviada ao utilizador sobre a devolução

**Se admin REJEITAR:**
- Entrada de ponto é eliminada
- Saldo de férias permanece inalterado
- Notificação enviada ao utilizador sobre a rejeição

**UI Admin Dashboard (aba Férias):**
- Nova secção "Trabalho Durante Férias" com destaque laranja
- Badge na aba mostra total de pedidos pendentes (férias + trabalho em férias)
- Botões "Autorizar" e "Rejeitar" com consequências explicadas
- Histórico de decisões anteriores

**Ficheiros modificados:**
- `/app/backend/notifications_scheduler.py` - `handle_overtime_start()` e `process_authorization_decision()`
- `/app/backend/server.py` - Endpoint `/api/time-entries/start`
- `/app/frontend/src/components/AdminDashboard.jsx` - UI completa na aba Férias
- `/app/frontend/src/components/OvertimeAuthorization.jsx` - Página de decisão (opcional)

**Testado:** ✅ Backend 100% | ✅ Frontend verificado via screenshot

---

### Janeiro 2026 - Sessão Anterior

#### ✅ Início Automático de Cronómetro após Criar OT (P0 - Completo)
- Quando o utilizador cria uma nova OT, aparece automaticamente um modal
- Modal mostra o número da OT criada (ex: "Iniciar Cronómetro - OT #362")
- Lista todos os técnicos disponíveis com checkboxes
- Permite selecionar tipo de cronómetro (Trabalho ou Viagem)
- Permite seleção múltipla de técnicos
- Botão "Ignorar" para fechar sem iniciar, "Iniciar" para começar cronómetros
- **Testado**: 9/9 testes passaram

#### ✅ Dropdown de Equipamentos ao Adicionar em OT (Completo)
- Ao adicionar equipamento a uma OT, aparece dropdown com equipamentos existentes do cliente
- Primeira opção é "Criar novo equipamento"
- Novos equipamentos são também guardados na base de dados do cliente
- Campos preenchidos automaticamente ao selecionar equipamento existente

#### ✅ Edição de Equipamentos na OT (Completo)
- Todos os equipamentos (principal e secundários) podem ser editados
- Botão de edição (ícone azul) em cada equipamento
- Modal de edição com todos os campos editáveis
- Endpoint PUT criado para equipamentos secundários

#### ✅ Dropdown de Técnicos no Registo Manual (Completo)
- No card "Mão de Obra/Deslocação", ao adicionar registo manual
- Campo "Nome do Técnico" é agora um dropdown com todos os utilizadores
- Funciona tanto para adicionar como para editar registos

#### ✅ Download de Todos os Relatórios do Cliente (Completo)
- Botão "Download Todos (X)" no modal de relatórios do cliente
- Descarrega todos os PDFs sequencialmente
- Mostra progresso e contador de sucesso/erro

#### ✅ Exportar Lista de Clientes para PDF (Completo)
- Botão "Exportar PDF" na página de Clientes (apenas admin)
- PDF contém tabela com: #, Nome, Email, NIF
- Data de exportação e total de clientes no rodapé

#### ✅ Folha de Horas - PDF Horizontal (Completo - 19 Janeiro 2026)
**Novo botão "Folha de Horas" nas OTs para gerar documento PDF horizontal com:**
- **Gestão de Tarifas no Admin Dashboard:**
  - Nova tab "Tarifas" para criar/editar/eliminar tarifas
  - Cada tarifa tem: número, nome/descrição, valor por hora (€)
  - 3 tarifas padrão criadas: Normal (30€/h), Noturna (45€/h), Premium (60€/h)
  - Endpoints: GET/POST/PUT/DELETE `/api/tarifas`
- **Modal de Configuração da Folha de Horas:**
  - Mostra cliente e localização da OT
  - Seleção de tarifa por técnico (dropdown com tarifas configuradas)
  - Preenchimento de dietas/portagens/despesas por técnico e data
  - Botão "Gerar PDF"
- **Novos campos no registo manual de técnicos:**
  - Hora de Início (HH:MM) - para Folha de Horas
  - Hora de Fim (HH:MM) - para Folha de Horas
- **PDF Gerado em Formato Horizontal (Landscape) com colunas:**
  - Data, Dia Semana, Técnico, Horas, Tarifa, Total Valor
  - Km's, Preço/Km (0,65€), Total Km
  - Início, Pausa, Fim
  - Dieta, Portagens, Despesas, Observações
  - Linha de totais e grande total
- **Endpoints:**
  - `GET /api/relatorios-tecnicos/{id}/folha-horas-data` - dados para configuração
  - `POST /api/relatorios-tecnicos/{id}/folha-horas-pdf` - gerar PDF
- **Ficheiros:**
  - `/app/backend/folha_horas_pdf.py` - gerador de PDF
  - AdminDashboard.jsx - tab Tarifas
  - TechnicalReports.jsx - botão e modal
- **Testado:** Backend 92% (12/13), Frontend 100%

#### ✅ Página Admin de Gestão de Entradas (Completo)
- Nova página `/admin/time-entries` acessível apenas para admins
- Barra de seleção rápida de utilizadores no topo
- Navegação por mês/ano com setas
- Cards de resumo (Total Horas, Dias, Entradas)
- Lista de entradas agrupadas por dia
- Modal para adicionar nova entrada
- Modal para editar entrada existente
- Botão para eliminar entradas
- Endpoints backend: GET/PUT/DELETE/POST para entradas

#### ✅ Múltiplas Assinaturas nas OTs (Completo)
- Suporte para adicionar várias assinaturas sem anular as existentes
- Campo "Data da Intervenção" editável em cada assinatura
- Lista de todas as assinaturas com contador
- Botão de eliminar individual para cada assinatura
- Todas as assinaturas aparecem no PDF com data da intervenção
- Backend: novos endpoints GET /assinaturas, DELETE /assinaturas/{id}

---

### Sessões Anteriores

#### ✅ Refactoring - Tempo em Minutos
- Convertido todo o tracking de tempo de horas decimais para minutos inteiros
- Evita erros de arredondamento e precisão

#### ✅ Edição de Registos de Cronómetro
- Modal para editar entradas de tempo geradas por cronómetro
- Inputs em formato HH:MM

#### ✅ Sistema de Migrações Automáticas
- `migrations.py` executa migrações de dados no startup do backend
- Previne re-execução de migrações já aplicadas

#### ✅ Preview de PDF
- Botão "Preview PDF" abre PDF em modal iframe
- Substituiu o botão de envio por email

#### ✅ Eliminação de PC
- Endpoint e UI para eliminar Pedidos de Cotação

#### ✅ Edição de Materiais em PC
- Editar descrição e quantidade de materiais

#### ✅ Seleção de Equipamento em Intervenções
- Dropdown para associar intervenções a equipamentos da OT

#### ✅ Cálculo de Tempo Corrigido
- Truncatura de segundos em vez de arredondamento

#### ✅ Ordenação Cronológica de Registos
- Entradas de tempo ordenadas por hora de início

#### ✅ Visibilidade de OTs
- Todas as OTs visíveis para todos os utilizadores autenticados

#### ✅ Correção do Erro ao Iniciar Cronómetro
- Resolvido erro de serialização do ObjectId

#### ✅ Fluxo de Criação de OT Simplificado
- Não auto-adiciona técnico nem mostra form de equipamento

#### ✅ Layout de PDF
- Removidas colunas "Início" e "Fim" da tabela de mão-de-obra
- Legenda atualizada

---

## Tarefas Futuras

### P1 - Prioridade Alta
- **Integração OneDrive**: Armazenar ficheiros (fotos, assinaturas, PDFs) no OneDrive em vez de Base64 no MongoDB
- **Investigar Issue "Edit OT Equipment"**: Teste anterior falhou durante edição de equipamento (adiado para focar na refatoração)

### P2 - Prioridade Média
- **Melhorar UI do Calendário**: Componente `/app/frontend/src/components/Calendar.jsx`
- **Refatoração adicional**: TechnicalReports.jsx ainda tem ~6260 linhas - considerar extrair mais componentes

### ✅ Refactoring Completado (19 Janeiro 2026)
- **TechnicalReports.jsx refatorado**: Reduzido de ~7200 linhas para ~6260 linhas (~940 linhas extraídas)
- **Componentes extraídos em `/app/frontend/src/components/technical-reports/`:**
  - `TecnicoModal.jsx` - Modal para adicionar/editar técnicos ✅ Testado
  - `EquipamentoModal.jsx` - Modal para adicionar/editar equipamentos ✅ Testado
  - `MaterialModal.jsx` - Modal para adicionar/editar materiais ✅ Testado
  - `AssinaturaModal.jsx` - Modal para assinaturas digitais/manuais ✅ Testado
  - `FolhaHorasModal.jsx` - Modal para gerar Folha de Horas PDF ✅ Testado
  - `PDFPreviewModal.jsx` - Modal para visualização de PDF ✅ Testado
  - `DeleteConfirmModal.jsx` - Modal de confirmação de eliminação
  - `CronometroStartModal.jsx` - Modal para iniciar cronómetro após criar OT
- **Resultado dos Testes:** 100% de sucesso - Todos os modais funcionam corretamente em modos Add e Edit

### ✅ Tarifas por Código no Admin Dashboard (21 Janeiro 2026)
- Adicionado dropdown para associar tarifas a códigos (1, 2, S, D)
- Badge colorido mostra o código associado a cada tarifa
- Descrição automática do horário aplicável
- Na geração da Folha de Horas, se não houver tarifa manual selecionada, o sistema aplica automaticamente a tarifa do código
- Ficheiros: `AdminDashboard.jsx`, `server.py`, `folha_horas_pdf.py`

### ✅ Campos Km's Ida/Volta no Modal de Edição de Cronómetro (21 Janeiro 2026)
- Adicionados campos de Quilómetros Ida (Km Inicial, Km Final, Total)
- Adicionados campos de Quilómetros Volta (Km Inicial, Km Final, Total)
- Card de Total de Quilómetros (Ida + Volta) com cálculo automático
- Backend atualizado para guardar os novos campos em registos_tecnico_ot
- Ficheiros: `TechnicalReports.jsx`, `server.py`

### ✅ Checkbox de Pausa Opcional no Registo Manual (20 Janeiro 2026)
- Removida a pausa automática de 1h ao preencher horas de início e fim
- Adicionado checkbox "Incluir 1 hora de pausa" que aparece quando há horários
- Se desmarcado: tempo = Fim - Início (sem desconto)
- Se marcado: tempo = Fim - Início - 1h
- Campo `incluir_pausa` guardado no backend e usado no PDF
- Ficheiros: `TecnicoModal.jsx`, `TechnicalReports.jsx`, `server.py`, `folha_horas_pdf.py`

### ✅ Correção: Todos os Registos Individuais na Folha de Horas (20 Janeiro 2026)
- Corrigido bug onde múltiplos registos do mesmo técnico no mesmo dia não apareciam
- Backend agora retorna lista `registos_individuais` com todos os registos separadamente
- Modal de Folha de Horas exibe cada registo individualmente com tipo e código próprios
- Chaves de tarifa agora incluem `tecnico_id_data_codigo` para identificação única
- Ficheiros: `server.py`, `FolhaHorasModal.jsx`

### ✅ Modal de Alteração de Tipo de Registo Clicável (20 Janeiro 2026)
- Adicionado popup modal para alterar o tipo de registo na tabela de Mão de Obra
- Funciona para registos manuais e de cronómetro
- Opções: Manual, Trabalho, Viagem
- Tipo atual é destacado no modal
- Backend atualizado para suportar alteração de tipo em registos de cronómetro
- Ficheiros: `TechnicalReports.jsx`, `server.py`

### ✅ Coluna "Registo" na Folha de Horas PDF (20 Janeiro 2026)
- Nova coluna "Registo" adicionada após "Técnico"
- Tipo removido das Observações
- Usa o tipo atual da OT (não o original)
- Ficheiro: `folha_horas_pdf.py`

### ✅ Campos de Km's Ida e Volta no Registo Manual (20 Janeiro 2026)
- Duplicados os campos de Quilómetros para registar ida e volta separadamente
- **Quilómetros - Ida**: Km's Iniciais, Km's Finais, Total Ida (azul)
- **Quilómetros - Volta**: Km's Iniciais, Km's Finais, Total Volta (laranja)
- **Total Final**: Soma automática de Ida + Volta (card verde)
- Tooltip na tabela de Mão de Obra mostra "Ida: X km | Volta: Y km"
- Ficheiros: `TecnicoModal.jsx`, `TechnicalReports.jsx`

### ✅ Tabs Responsivas no Admin Dashboard Mobile (20 Janeiro 2026)
- Corrigido problema de tabs comprimidas em versão mobile
- Implementado scroll horizontal para navegar entre as tabs
- Cada tab agora mostra o texto completo e legível
- Em desktop mantém o layout grid de 6 colunas
- Ficheiro: `/app/frontend/src/components/AdminDashboard.jsx`

### ✅ Cálculo Automático do Tempo no Cliente (20 Janeiro 2026)
- Quando o utilizador preenche "Hora de Início" e "Hora de Fim" no registo manual, o campo "Tempo no Cliente" é calculado automaticamente
- Fórmula: `(Hora Fim - Hora Início) - 1h de pausa`
- Exemplo: 07:30 → 18:30 = 11h - 1h = **10h** de tempo no cliente
- Mensagem informativa verde mostra o cálculo realizado
- Ficheiro: `/app/frontend/src/components/technical-reports/TecnicoModal.jsx`

### ✅ Pausa Automática de 1h na Folha de Horas (20 Janeiro 2026)
- Quando um registo tem hora de início e hora de fim definidas, a coluna "Pausa" no PDF mostra automaticamente **1:00** (1 hora)
- Ficheiro: `/app/backend/folha_horas_pdf.py`

### ✅ Correção UI FolhaHorasModal - Tipo/Código na Secção Tarifas (20 Janeiro 2026)
- Movida a exibição de "Tipo de Entrada" e "Código" da secção de Dietas para a secção de Tarifas
- Badge de tipo: trabalho (verde), viagem (azul), manual (cinza), cronómetro (roxo)
- Badge de código: 1 (diurno), 2 (noturno), S (sábado), D (domingo/feriado)
- Ficheiro: `/app/frontend/src/components/technical-reports/FolhaHorasModal.jsx`

### ✅ Sistema de Notificações por Email - Regras de Ponto (19 Janeiro 2026)
**Sistema automático de verificação e autorização de horas extra:**

**Verificações Automáticas (APScheduler):**
- **09:30** - Verifica utilizadores que não iniciaram ponto (dias úteis)
  - Envia email ao utilizador se: não tem ponto, não está de férias, não tem falta justificada, não é feriado
- **18:15** - Verifica utilizadores com ponto ativo após horário normal
  - Envia email ao utilizador + pedido de autorização ao admin (geral@hwi.pt)

**Autorização de Horas Extra (Sábados/Domingos/Feriados/Entradas Adicionais):**
- Quando utilizador inicia ponto em dia especial, pedido de autorização é enviado automaticamente
- **NOVO:** Quando utilizador já tem horas extra num dia e inicia novamente, também requer autorização
- Admin recebe email com botões "Autorizar" / "Não Autorizar"
- ✅ Autorizar: Ponto continua ativo, horas contam como extra
- ❌ Não Autorizar: Entrada é eliminada (início) ou ponto encerrado às 18:00 (fim do dia)

**Novos Endpoints API:**
- `POST /api/notifications/check-clock-in` - Verificação manual (admin)
- `POST /api/notifications/check-clock-out` - Verificação manual (admin)
- `GET /api/overtime/authorization/{token}` - Obter detalhes do pedido
- `POST /api/overtime/authorization/{token}/decide` - Aprovar/rejeitar
- `GET /api/overtime/authorizations` - Listar todos os pedidos
- `GET /api/notifications/logs` - Logs de notificações

**Nova Página Frontend:**
- `/authorize/:token` - Página para admin aprovar/rejeitar pedidos de horas extra

**Dashboard de Notificações no Admin (Nova Tab):**
- Verificações Manuais: botões para executar verificações de entrada/saída
- Autorizações de Horas Extra: lista com filtro (Todos/Pendentes/Aprovados/Rejeitados)
- Badge com contador de pedidos pendentes na tab
- Botões de Autorizar/Rejeitar inline
- Histórico de Notificações: tabela com logs de emails enviados

**Tecnologias:**
- APScheduler (cron jobs às 09:30 e 18:15, timezone Europe/Lisbon)
- aiosmtplib (emails via SMTP Outlook)
- Tokens seguros com validade de 24 horas

**Resultado dos Testes:** 100% de sucesso (15/15 testes passaram)

---

## Arquitetura de Código

```
/app/
├── backend/
│   ├── server.py               # API FastAPI principal + APScheduler
│   ├── notifications_scheduler.py  # ✅ NEW: Lógica de notificações de ponto
│   ├── ot_pdf_report.py        # Geração de PDFs OT
│   ├── folha_horas_pdf.py      # Geração de Folha de Horas (landscape)
│   ├── cronometro_logic.py     # Lógica de cronómetros
│   ├── holidays.py             # Feriados portugueses
│   └── migrations.py           # Migrações de dados
└── frontend/
    └── src/
        └── components/
            ├── OvertimeAuthorization.jsx  # ✅ NEW: Página de autorização
            ├── technical-reports/    # ✅ Componentes extraídos (refatoração completa)
            │   ├── FolhaHorasModal.jsx    ✅ Integrado
            │   ├── AssinaturaModal.jsx    ✅ Integrado
            │   ├── TecnicoModal.jsx       ✅ Integrado
            │   ├── EquipamentoModal.jsx   ✅ Integrado
            │   ├── MaterialModal.jsx      ✅ Integrado
            │   ├── CronometroStartModal.jsx
            │   ├── PDFPreviewModal.jsx    ✅ Integrado
            │   ├── DeleteConfirmModal.jsx
            │   └── index.js
            ├── TechnicalReports.jsx  # ~6260 linhas (reduzido de ~7200)
            ├── AdminDashboard.jsx    # Admin Dashboard com tab Tarifas
            ├── Dashboard.jsx         # Dashboard principal
            └── ...
```

## Credenciais de Teste
- **Admin**: `pedro` / `password`
- **Non-admin**: `miguel` / `password`

---

## Integrações de Terceiros
- ReportLab (geração de PDF)
- pywebpush (notificações push)
- pdfminer.six
- APScheduler (agendamento de tarefas)
- aiosmtplib (envio de emails SMTP)

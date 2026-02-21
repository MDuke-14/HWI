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

### P1 (Alta Prioridade)
- Testar funcionalidade "Associar OT ao Calendário" (implementado mas não testado formalmente)
- Completar lógica "Trabalhar em Férias" - devolver dia de férias ao saldo
- Investigar performance lenta na página `/technical-reports`
- Integração OneDrive para armazenamento de ficheiros

### P2 (Média Prioridade)
- Resolver problema de VAPID Key para notificações push em produção (pendente validação em produção)
- Corrigir falha no teste "Editar Equipamento OT"
- Refactoring de `server.py` e `TechnicalReports.jsx` (ficheiros críticos >7000 linhas)
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

## Funcionalidades Implementadas

### Fevereiro 2026 - Sessão Atual

#### ✅ Bug Crítico Assinatura Mobile (21 Fevereiro 2026) - CORRIGIDO
**Problema:** O canvas de assinatura e os botões (Limpar, Guardar, Fechar) não respondiam a eventos de toque em dispositivos móveis.

**Causa Raiz:**
- O canvas tinha `pointer-events: none` herdado do CSS
- Elemento `<P>` estava sobreposto ao canvas interceptando eventos

**Solução Implementada:**
1. Adicionado `pointerEvents: 'auto'` ao canvas e container
2. Adicionado `position: 'relative'` e `zIndex: 10` para garantir sobreposição correta
3. Mudança de mouse/touch events para Pointer Events (unificados)
4. Adicionados `data-testid` aos botões para facilitar testes

**Ficheiro modificado:** `/app/frontend/src/components/technical-reports/AssinaturaModal.jsx`

---

#### 🔄 Modo Mobile PWA (20 Fevereiro 2026) - EM PROGRESSO
**Implementação de experiência mobile dedicada com PWA completa:**

**Estrutura criada:**
- `/app/frontend/src/contexts/ThemeContext.jsx` - Gestão de temas claro/escuro com persistência
- `/app/frontend/src/contexts/MobileContext.jsx` - Detecção de dispositivo e estado mobile
- `/app/frontend/src/components/mobile/MobileBottomNav.jsx` - Navegação inferior para mobile
- `/app/frontend/src/components/mobile/MobileMenu.jsx` - Página de menu mobile completa
- `/app/frontend/src/components/mobile/MobileLayout.jsx` - Layout wrapper com bottom nav
- `/app/frontend/src/components/mobile/ThemeToggle.jsx` - Componente de toggle de tema

**Funcionalidades implementadas:**
1. **Bottom Navigation Mobile:**
   - 5 itens: Início, OTs, Ponto (botão central), Calendário, Menu
   - Botão central de ação rápida para iniciar/parar relógio
   - Animação de pulsação quando timer ativo
   - Auto-hide ao scrollar para baixo

2. **Sistema de Temas:**
   - Tema escuro (padrão)
   - Tema claro (melhor visibilidade ao sol)
   - Persistência via localStorage
   - Opção de seguir preferência do sistema

3. **Menu Mobile:**
   - Perfil do utilizador com badge admin
   - Status de conexão (online/offline)
   - Contador de ações pendentes de sync
   - Acesso a todas as secções da app
   - Toggle de tema integrado
   - Informações de versão

4. **Dashboard Mobile Optimizado:**
   - Relógio e data em formato compacto
   - **Widget "Horas Hoje"** com resumo rápido:
     - Total de horas trabalhadas no dia
     - Contador de registos
     - Badges com hora de início e duração de cada registo
     - Indicador "A trabalhar" quando timer ativo
   - Formulários adaptados para touch
   - Navegação desktop escondida em mobile
   - Floating buttons removidos (usa bottom nav)
   - Espaçamento adaptado para toque
   - Suporte completo a tema claro/escuro

5. **Optimizações CSS:**
   - Safe area padding para iOS
   - Prevenção de pull-to-refresh em PWA
   - Min-height de 44px para touch targets
   - Font-size 16px em inputs (previne zoom iOS)

**Ficheiros modificados:**
- `/app/frontend/src/App.js` - Integração dos Providers
- `/app/frontend/src/index.css` - Estilos mobile e temas
- `/app/frontend/src/components/Dashboard.jsx` - Layout responsivo com tema claro/escuro

**Próximos passos:**
- Adaptar Calendário para mobile
- Adaptar página Admin para mobile
- Adaptar Gestão de Entradas para mobile
- Testar funcionalidades offline
- Optimizar performance em dispositivos lentos

#### ✅ Página de OTs Mobile (20 Fevereiro 2026) - COMPLETADO
**Adaptação completa da página TechnicalReports.jsx para mobile:**

**Alterações estruturais:**
- Integração dos hooks `useMobile()` e `useTheme()` para detecção de dispositivo e tema
- Classes CSS dinâmicas baseadas no tema (claro/escuro)
- Navigation desktop escondido em mobile (usa bottom nav)
- Padding inferior adicional para acomodar bottom navigation (`pb-24`)

**Header responsivo:**
- Título compacto: "OTs" em mobile vs "OTs - Ordens de Trabalho" em desktop
- Ícone menor em mobile (6x6 vs 8x8)
- Indicador de estado compacto (apenas ícone em mobile)

**Tabs horizontais com scroll:**
- Tabs deslizam horizontalmente em mobile
- Nomes abreviados: "Estados" em vez de "Pesquisa por Estado", "PCs" em vez de "Pedidos de Cotação"
- Scroll suave com `-mx-4 px-4 scrollbar-hide`
- Tabs: Clientes, OTs, Estados, PCs

**Tab Clientes (adaptado):**
- Grid de coluna única em mobile (`grid-cols-1 gap-3`)
- Cards compactos com info truncada
- Botões de exportar PDF escondidos em mobile (funcionalidade admin)
- Botão "Novo Cliente" ocupa largura completa
- Cards mostram: nome, NIF, email, telefone, botões Ver/Editar/Eliminar

**Tab OTs (adaptado):**
- Grid de coluna única em mobile
- Cards com número OT (#xxx), status badge, data, cliente, local
- Botões de ação menores (p-1.5)
- Informação de equipamento simplificada
- Botão "Nova OT" em largura completa

**Tab Estados (adaptado):**
- Dropdown de pesquisa em largura completa
- Resultados em layout mobile (coluna única)
- Info de equipamento escondida em mobile para compactar

**Tab PCs (adaptado):**
- Cards de Pedidos de Cotação compactos
- Status colorido preservado
- Botões PDF/Email/Eliminar responsivos

**Modais mobile-friendly:**
- Largura máxima `max-w-[95vw] mx-2` em mobile
- Campos de formulário empilhados (não em grid de 2 colunas)
- Labels e inputs com tamanho de texto reduzido
- Scroll interno para conteúdo longo (`max-h-[90vh] overflow-y-auto`)

**Testado:** ✅ 100% (12/12 testes passaram via testing agent)
- Header responsivo ✓
- Tabs horizontais com scroll ✓
- Cards de clientes adaptados ✓
- Cards de OTs adaptados ✓
- Dropdown Estados full-width ✓
- Cards de PCs adaptados ✓
- Modal Nova OT mobile-friendly ✓
- Modal Novo Cliente mobile-friendly ✓
- Modal visualização OT funcional ✓
- Botões em largura completa ✓
- Bottom navigation presente ✓
- Modal cliente funcional ✓

**Ficheiros modificados:**
- `/app/frontend/src/components/TechnicalReports.jsx` - Adaptação completa para mobile

**Testado:** ✅ Screenshots manuais - Bottom nav, Menu, Toggle tema funcionais

---

#### ✅ Campos de Email Dinâmicos para Clientes (20 Fevereiro 2026) - NOVA FUNCIONALIDADE
**Gestão de Clientes (/technical-reports, tab Clientes) - Interface de emails secundários reformulada:**

**Antes:** Campo de texto único para emails secundários (difícil de gerir múltiplos emails)

**Agora:** Interface dinâmica com botões para adicionar/remover emails:
- Botão azul "Adicionar Email" cria campos de input individuais
- Cada campo tem botão vermelho com ícone de lixeira para remover
- Mensagem inicial: "Nenhum email adicional. Clique em 'Adicionar Email' para incluir."
- Validação de email em cada campo

**Conversão de dados:**
- Frontend mantém emails como array para facilitar manipulação
- Ao guardar: array é convertido para string separada por '; '
- Ao editar: string é convertida de volta para array

**Ficheiros modificados:**
- `/app/frontend/src/components/TechnicalReports.jsx`:
  - Estado `formData.emails_adicionais` agora é array (linha 351)
  - Funções `addEmailField()`, `removeEmailField()`, `updateEmailField()` (linhas 834-853)
  - `handleAddCliente()` e `handleEditCliente()` convertem array para string (linhas 563-597)
  - `openEditModal()` converte string para array (linhas 618-634)
  - UI dinâmica nos modais de adicionar e editar cliente (linhas 7000-7043 e 7143-7184)

**Testado:** ✅ Frontend testado via testing agent - 100% (7/7 testes passaram)
- Adicionar múltiplos campos de email ✓
- Preencher e remover campos ✓  
- Guardar cliente com emails múltiplos ✓
- Editar cliente carrega emails correctamente ✓

---

#### ✅ Funcionalidade "Justificar Dia" na Gestão de Entradas (19 Fevereiro 2026) - NOVA FUNCIONALIDADE
**Página "Gestão de Entradas" (/admin/time-entries) completamente melhorada:**

**Nova visualização de todos os dias do período de faturação:**
- Agora mostra TODOS os dias do período (26 do mês anterior até 25 do mês atual)
- Dias sem registo aparecem com badge "Sem registo" e estilo visual diferenciado
- Fins de semana (Sábado/Domingo) aparecem com badge "Fim de semana" e fundo roxo/índigo
- Dias com entradas mantêm o estilo normal com fundo escuro

**Modal "Justificar Dia" com 5 opções:**
1. **Férias** (azul) - Cria registo na coleção `vacation_requests` tipo "vacation"
2. **Dar Dia (8h automáticas)** (verde) - Remove entradas existentes e cria 2 entradas:
   - 09:00-13:00 (4h) + 14:00-18:00 (4h) = 8h totais
   - Observação: "[Dia oferecido pelo admin {nome}]"
3. **Folga** (amarelo) - Cria registo na coleção `vacation_requests` tipo "folga"
4. **Falta** (vermelho) - Cria registo na coleção `absences`
5. **Cancelamento de Férias** (ciano) - Remove férias marcadas e cria registo de cancelamento

**Cores visuais por tipo de justificação:**
- **Férias**: Fundo azul escuro, badge "Dia de Férias" em azul
- **Folga**: Fundo amarelo escuro, badge "Dia de Folga" em amarelo
- **Falta**: Fundo vermelho escuro, badge "Falta" em vermelho
- **Cancelamento de Férias**: Fundo ciano escuro, badge "Férias Canceladas" em ciano

**Logging automático:**
- Todas as justificações são registadas como observação no relatório mensal do utilizador
- Formato: "[data/hora] TIPO: dd/mm/yyyy - Justificado pelo admin {nome}"

**Backend (`server.py`):**
- Novo endpoint `POST /api/admin/time-entries/justify-day`
- Nova função `register_admin_observation()` para registar observações nos relatórios mensais
- Endpoint `GET /api/admin/time-entries/user/{user_id}` agora retorna justificações (férias, folgas, faltas, cancelamentos)
- Validação de tipo de justificação

**Frontend (`AdminTimeEntries.jsx`):**
- Nova função `generateAllDaysInPeriod()` para gerar lista de todos os dias
- Função `groupEntriesByDate()` reformulada para mostrar todos os dias e incluir justificações
- Modal "Justificar Dia" com UI colorida e botões para cada tipo
- Estilos diferenciados para cada tipo de justificação com cores específicas

**Ficheiros modificados:**
- `/app/backend/server.py` - Novos endpoints, função de logging, e retorno de justificações
- `/app/frontend/src/components/AdminTimeEntries.jsx` - UI reformulada com cores

**Testado:** ✅ Backend + Frontend testados via screenshots
- Todos os 5 tipos de justificação funcionam corretamente
- Cores e badges aparecem corretamente para cada tipo
- Observações registadas no relatório mensal

---

### Janeiro 2026 - Sessão Atual (24 Janeiro 2026)

#### ✅ Novo Serviço no Calendário com Criação de OT (24 Janeiro 2026) - NOVA FUNCIONALIDADE
**Popup "Novo Serviço" no Calendário completamente reformulado:**
- Campo "Localidade" já NÃO é preenchido automaticamente ao selecionar cliente - deve ser manual
- Novo dropdown "Tipo de Serviço" com opções: Assistência / Montagem
- Campo "Motivo de Assistência" agora é OPCIONAL
- Novo campo "Até" (data fim) para serviços de múltiplos dias
- Ao clicar "Criar Serviço", cria automaticamente uma OT associada

**Backend (`server.py`):**
- Novo modelo `ServiceWithOTCreate` com campos: client_name, client_id, location, service_type, service_reason, date, date_end
- Novo endpoint `POST /api/services/with-ot` que:
  - Cria ou usa cliente existente
  - Gera número de OT automático
  - Cria RelatorioTecnico com data_servico e data_fim
  - Cria ServiceAppointments para cada dia no intervalo
  - Envia notificações push aos técnicos atribuídos
  - Retorna dados do serviço e OT criados

**Frontend (`Calendar.jsx`):**
- `serviceForm` agora inclui: client_id, service_type, date_end
- `handleSelectClient()` não preenche mais `location` automaticamente
- `handleCreateService()` chama endpoint `/services/with-ot` para novos serviços
- Formulário com 3 colunas para datas: Data, Até (opcional), Horário

**Testado:** ✅ Backend testado via curl + Frontend testado via screenshots
- Serviços criados em Janeiro 2025 aparecem no calendário em todos os dias do intervalo
- OTs criadas com número automático (OT-360) e datas corretas

**Ficheiros modificados:**
- `/app/backend/server.py` - Novo modelo e endpoint
- `/app/frontend/src/components/Calendar.jsx` - Formulário reformulado

---

#### ✅ Segmentação Automática de Registos por Código Horário (24 Janeiro 2026) - NOVA FUNCIONALIDADE
**Lógica de segmentação implementada em `cronometro_logic.py`:**
- Registos que atravessam fronteiras de código horário são automaticamente divididos
- Códigos: 1 (07:00-19:00 dias úteis), 2 (noturno), S (Sábados todo dia), D (Domingos/Feriados todo dia)
- Feriados portugueses 2025-2027 incluídos

**Backend (`server.py`):**
- Novo endpoint POST `/api/relatorios-tecnicos/{id}/registos-tecnicos` para criar registos manuais
- Endpoint PUT atualizado para aceitar hora_inicio e hora_fim
- Verificação de sobreposição: registos com conflito vão para fim do dia
- Migração automática aplicada a registos existentes

**Frontend (`TechnicalReports.jsx`):**
- Tabela de "Registos de Mão de Obra" com colunas: Técnico, Tipo, Data, Início, Fim, Horas, KM, Código, Ações
- Ordenação cronológica por data → hora início → hora fim
- Botão "Novo Registo" para criar registos manuais
- Modal com campos: Técnico, Tipo, Data, Hora Início, Hora Fim, KM

**Migração (`migrations.py`):**
- Nova migração `segmentar_registos_codigo_horario` que:
  - Divide registos existentes que atravessam fronteiras de código
  - Atualiza códigos incorretos
  - Executa automaticamente no startup

**Ficheiros modificados:**
- `/app/backend/cronometro_logic.py` - Reescrito com nova lógica de segmentação
- `/app/backend/server.py` - Novos endpoints e updates
- `/app/backend/migrations.py` - Nova migração
- `/app/frontend/src/components/TechnicalReports.jsx` - Tabela com hora início/fim + modal novo registo

**Testado:** ✅ API testada via curl - Segmentação funcionando corretamente
- Exemplo: Viagem 06:00→10:00 num dia útil → 2 registos (06:00-07:00 código 2 + 07:00-10:00 código 1)
- Exemplo: Trabalho 06:00→10:00 num Sábado → 1 registo código S

---

#### ✅ Sistema de Autorização Diária para Dias Especiais (24 Janeiro 2026) - NOVA FUNCIONALIDADE
**Nova collection `day_authorizations` para estado diário:**
- Cada utilizador + data tem um estado: pending, authorized, rejected
- Uma decisão desbloqueia ou bloqueia o dia inteiro
- Máximo 1 notificação por utilizador por dia

**Tipos de dias especiais:**
- `ferias` - Dias de férias aprovadas
- `feriado` - Feriados nacionais portugueses
- `sabado` - Sábados
- `domingo` - Domingos

**Fluxo implementado:**
1. Primeira picagem em dia especial → cria pedido de autorização + notificação push aos admins
2. Admin aprova → desbloqueia dia inteiro (múltiplas picagens permitidas)
3. Admin rejeita → bloqueia dia inteiro (entrada eliminada + novas picagens bloqueadas)
4. Para dias de férias aprovados → devolve 1 dia de férias ao saldo

**Novos endpoints:**
- `GET /api/day-authorization/status` - Verificar estado do dia atual
- `GET /api/admin/day-authorizations` - Listar autorizações (admin)
- `GET /api/admin/day-authorizations/pending` - Listar pendentes (admin)
- `POST /api/admin/day-authorizations/{id}/decide` - Aprovar/rejeitar (admin)

**Endpoint `POST /api/time-entries/start` modificado:**
- Verifica tipo de dia especial
- Verifica estado de autorização existente
- Cria pedido de autorização na primeira picagem
- Bloqueia picagem se dia foi rejeitado
- Permite picagem sem nova notificação se dia foi aprovado

**Testado:** ✅ API testada via curl - Todos os cenários funcionando
- Primeira picagem → pedido criado
- Aprovação → múltiplas picagens permitidas
- Rejeição → entrada eliminada + novas picagens bloqueadas

---

#### ✅ Sistema de Ajuda Completo (22 Janeiro 2026)
**Componente reutilizável `HelpTooltip.jsx`:**
- Ícone de ajuda ("i" azul) que abre popup modal com informação detalhada
- Design consistente em toda a aplicação
- Conteúdo HTML renderizado com estilos adequados
- Botão "Entendi" para fechar

**Secções de Ajuda nas OTs (TechnicalReports.jsx):**
- ot_geral: Como funcionam as OTs
- tecnicos: Gestão de técnicos
- intervencoes: Registo de intervenções
- fotografias: Upload de fotos
- equipamentos: Gestão de equipamentos
- materiais: Registo de materiais
- despesas: Sistema de despesas
- pedidos_cotacao: Pedidos de cotação
- assinaturas: Obtenção de assinaturas
- cronometros: Registo de tempo
- folha_horas: Geração de folha de horas

**Secções de Ajuda no Calendário (Calendar.jsx):**
- calendario_geral: Visão geral do calendário
- calendario_servicos: Gestão de serviços agendados

**Secções de Ajuda no Admin Dashboard (AdminDashboard.jsx):**
- admin_ferias: Gestão de férias e trabalho durante férias
- admin_faltas: Gestão de faltas
- admin_utilizadores: Gestão de utilizadores
- admin_notificacoes: Sistema de notificações
- admin_tarifas: Configuração de tarifas
- admin_relatorios: Relatórios consolidados

**Ficheiros modificados:**
- `/app/frontend/src/components/HelpTooltip.jsx` - Componente reutilizável com todo o conteúdo
- `/app/frontend/src/components/Calendar.jsx` - Integração do HelpTooltip
- `/app/frontend/src/components/AdminDashboard.jsx` - Integração do HelpTooltip em todos os tabs
- `/app/frontend/src/components/TechnicalReports.jsx` - Já tinha integração (sessão anterior)

**Testado:** ✅ Frontend verificado via screenshot - Modal abre e mostra conteúdo correto

---

#### ✅ Manual de Instruções em PDF (24 Janeiro 2026) - NOVA FUNCIONALIDADE
**Gerador de PDF completo com ReportLab:**
- Manual de ~15 páginas com todas as instruções do sistema
- Formatação profissional com cores, estilos e secções
- Índice navegável

**Conteúdo do Manual:**
1. Introdução ao sistema
2. Acesso ao Sistema (Login/Registo/Recuperação)
3. Dashboard - Relógio de Ponto
4. Ordens de Trabalho (OTs) - todas as secções detalhadas
5. Calendário
6. Painel de Administração (todos os tabs)
7. Notificações
8. Sistema de Ajuda
9. Perguntas Frequentes

**Implementação:**
- Backend: `/app/backend/manual_pdf.py` - Gerador do PDF
- Backend: Endpoint `GET /api/manual/download` 
- Frontend: Botão flutuante verde no Dashboard com ícone de livro
- Download automático do ficheiro `Manual_HWI_Unipessoal.pdf`

**Ficheiros modificados:**
- `/app/backend/manual_pdf.py` - Novo ficheiro
- `/app/backend/server.py` - Novo endpoint
- `/app/frontend/src/components/Dashboard.jsx` - Botão de download

**Testado:** ✅ Backend endpoint testado via curl, Frontend botão visível no Dashboard

---

#### ✅ Calendário - Unificação para "Ordens de Trabalho" (25 Janeiro 2026)
**Removida secção "Serviços" - apenas mostra OTs:**
- Modal de detalhes do dia mostra apenas "Ordens de Trabalho"
- Ao clicar numa OT, abre em `/technical-reports?ot={id}`
- Todos os textos atualizados: "+ Nova OT", "Total OTs", "Gestão de OTs"

**Ficheiros modificados:**
- `/app/frontend/src/components/Calendar.jsx`

**Testado:** ✅ Screenshot confirmou alterações visuais

---

#### ✅ Novo Estado "Agendado" para OTs (25 Janeiro 2026) - NOVA FUNCIONALIDADE
**Estado especial para OTs criadas via Calendário:**
- Estado `agendado` (cor cyan) definido automaticamente quando OT é criada pelo Admin via Calendário
- OTs criadas por outros métodos mantêm o estado padrão `em_execucao`
- "Agendado" NÃO pode ser selecionado manualmente no dropdown de alteração de estado
- "Agendado" aparece nos filtros de pesquisa e na visualização de OTs

**Ficheiros modificados:**
- `/app/backend/server.py` - Endpoint `/services/with-ot` define `status: "agendado"`
- `/app/frontend/src/components/TechnicalReports.jsx` - Cor e label para estado agendado
- `/app/frontend/src/components/Calendar.jsx` - Cor e label para estado agendado

**Testado:** ✅ Backend via curl (OT criada via calendário = agendado, OT normal = em_execucao)

---

#### ✅ Edição de Observações de Fotografias nas OTs (25 Janeiro 2026) - NOVA FUNCIONALIDADE
**Modal de edição de descrição de fotografias:**
- Botão de edição (ícone lápis) em cada fotografia na lista
- Modal com preview da imagem e campo de texto para descrição
- Endpoint PUT corrigido para aceitar JSON body

**Ficheiros modificados:**
- `/app/frontend/src/components/TechnicalReports.jsx` - Modal de edição + botões
- `/app/backend/server.py` - Endpoint PUT corrigido

**Testado:** ✅ Backend via curl

---

#### ✅ PDF da OT - Tabela de Mão de Obra Actualizada (25 Janeiro 2026) - NOVA FUNCIONALIDADE
**Tabela de Mão de Obra/Deslocação no PDF agora inclui:**
- 8 colunas: Técnico | Tipo | Data | Início | Fim | Horas | KM | Cód
- Hora Início e Fim extraídas de `hora_inicio_segmento` e `hora_fim_segmento`
- Ordenação cronológica por data e hora início
- Legenda actualizada: 1=07h-19h | 2=19h-07h | S=Sábado | D=Domingo/Feriado

**Ficheiros modificados:**
- `/app/backend/ot_pdf_report.py` - Tabela reformulada com novas colunas

**Testado:** ✅ PDF gerado e validado via extração de dados

---

#### ✅ Checkbox de Pausa no Modal de Edição (25 Janeiro 2026) - NOVA FUNCIONALIDADE
**Modal de edição de registos agora inclui opção de pausa:**
- Checkbox "Descontar 1 hora de pausa" com styling laranja
- Ao adicionar pausa: desconta 60 minutos do total
- Ao remover pausa: adiciona 60 minutos ao total
- Backend processa `incluir_pausa` e ajusta minutos automaticamente

**Ficheiros modificados:**
- `/app/frontend/src/components/TechnicalReports.jsx` - Checkbox no modal de edição
- `/app/backend/server.py` - Endpoint PUT processa incluir_pausa

**Testado:** ✅ Backend via curl (555 -> 615 min ao remover pausa)

---

#### ✅ Bug Fix: Criação de Novo Registo de Mão de Obra (25 Janeiro 2026)
**Corrigido erro de timezone na verificação de sobreposição:**
- Erro: "can't compare offset-naive and offset-aware datetimes"
- Causa: `hora_inicio` e `hora_fim` sem timezone vs registos no DB com timezone
- Solução: Normalização de todos os datetimes para "naive" antes da comparação

**Ficheiros modificados:**
- `/app/backend/cronometro_logic.py` - Função `verificar_sobreposicao` corrigida

**Testado:** ✅ Backend via curl (criação de registos funciona)

---

#### ✅ Edição de Hora Início/Fim em Registos de Tempo (24 Janeiro 2026) - NOVA FUNCIONALIDADE
**Modal de edição de registos agora permite alterar horas:**
- Novos campos "Hora Início" e "Hora Fim" no modal de edição de registos
- Campos tipo `time` para fácil seleção de horas
- Duração recalculada automaticamente quando ambas as horas são definidas
- Campo "Tempo Trabalhado" (horas/minutos) fica desativado quando há horas definidas
- Código horário recalculado automaticamente pelo backend

**Frontend (`TechnicalReports.jsx`):**
- Função `openEditRegistoModal()` agora extrai `hora_inicio_segmento` e `hora_fim_segmento`
- Estado `editRegistoForm` inclui `hora_inicio` e `hora_fim`
- Modal com secção "Horário do Registo" destacada em azul
- Campos com `data-testid`: `edit-registo-hora-inicio` e `edit-registo-hora-fim`
- Cálculo em tempo real: ao alterar uma hora, duração é recalculada instantaneamente
- Função `handleUpdateRegisto()` envia `hora_inicio` e `hora_fim` ao backend

**Backend (`server.py`):**
- Endpoint PUT `/api/relatorios-tecnicos/{id}/registos-tecnicos/{id}` já suportava este cenário
- Quando `hora_inicio` e `hora_fim` são enviados, recalcula `minutos_trabalhados`, `horas_arredondadas` e `codigo`
- Suporta turnos noturnos (hora_fim < hora_inicio)

**Bug corrigido:**
- `useOfflineData.js`: Função `cacheData` adicionado timeout de 5 segundos para evitar carregamento infinito

**Ficheiros modificados:**
- `/app/frontend/src/components/TechnicalReports.jsx` - Modal com novos campos de hora
- `/app/frontend/src/hooks/useOfflineData.js` - Corrigido bug de timeout

**Testado:** ✅ Backend via curl (atualização de 08:00-19:00 para 09:00-18:00 funcionou) | Frontend verificado pelo testing agent

---

#### ✅ Sistema de Despesas nas OTs (22 Janeiro 2026)
**Novo card de Despesas nas OTs (não aparece no PDF da OT):**
- Campos: Descrição, Valor (€), Pago por (dropdown de técnicos), Data
- Upload de factura (PDF, JPG, PNG) - guardado em base64
- Botão "Gerar Despesa" cria registo e notifica admins
- Lista de despesas com total calculado
- Botões: Download factura, Editar, Eliminar

**Push Notification para Admins:**
- Quando uma despesa é criada, todos os admins recebem push notification
- Título: "💰 Nova Despesa - OT #X"
- Mensagem: "Despesa de XX.XX€ criada por [Técnico]"

**Notificação In-App:**
- Tipo `despesa_created` adicionado ao NotificationBell
- Cor: emerald (verde esmeralda)
- Aparece no sino do admin

**Integração com Folha de Horas:**
- Despesas são automaticamente agrupadas por técnico e data
- Ao abrir modal da Folha de Horas, campo "Despesas" é pré-preenchido
- Valor total das despesas do técnico naquele dia

**Ficheiros modificados:**
- `/app/backend/server.py` - Modelo `DespesaOT` e endpoints CRUD
- `/app/frontend/src/components/TechnicalReports.jsx` - Card de despesas e modais
- `/app/frontend/src/components/NotificationBell.jsx` - Tipo despesa_created

**Endpoints:**
- `POST /api/relatorios-tecnicos/{id}/despesas` - Criar despesa
- `GET /api/relatorios-tecnicos/{id}/despesas` - Listar despesas
- `PUT /api/relatorios-tecnicos/{id}/despesas/{despesa_id}` - Atualizar
- `DELETE /api/relatorios-tecnicos/{id}/despesas/{despesa_id}` - Eliminar

**Testado:** ✅ Backend via curl | Frontend compilado

---

#### ✅ PWA Melhorado com Offline Mode (22 Janeiro 2026)
**Service Worker v2:**
- Cache de recursos estáticos para funcionamento offline
- Queue offline para ações de ponto (sync automático quando online)
- IndexedDB para armazenar ações pendentes
- Página offline dedicada (`/offline.html`)
- Detecção automática de estado online/offline
- Notificação push quando sync completo

**Geolocalização no Clock-in:**
- Captura automática de coordenadas GPS ao iniciar ponto
- **Reverse Geocoding** - Converte coordenadas em cidade/região/país
- Usa OpenStreetMap Nominatim (gratuito)
- Armazena: latitude, longitude, precisão, timestamp, endereço
- Não bloqueia se permissão negada ou geocoding falhar
- Toast de feedback ao utilizador

**✅ Auto-detecção "Fora de Zona de Residência" (22 Janeiro 2026):**
- Ao fazer clock-in, sistema obtém GPS e faz reverse geocoding
- Se país detetado NÃO é Portugal (country_code !== 'PT'):
  - Checkbox "Fora de Zona de Residência" marcado automaticamente
  - Campo "Local da Deslocação" preenchido com "Cidade, País"
  - Toast notification: "📍 Detectado fora de Portugal: [Local]"
  - Badge visual "🌍 Fora de PT" aparece no indicador GPS
- Se utilizador já teve entrada "Fora de Zona" no mesmo dia:
  - Checkbox mantém-se marcado para próximas entradas
- Utilizador pode sempre desmarcar/editar manualmente

**UI Indicators:**
- Indicador verde "Online" / amarelo "Offline" no Dashboard
- Banner de aviso quando em modo offline
- Mostra cidade e país no card de localização quando disponível
- Link "Ver Mapa" para Google Maps
- Badge "🌍 Fora de PT" quando fora de Portugal

**Modo Offline na Página de OTs:**
- Hook `useOfflineData.js` para gestão de cache
- Componente `OfflineStatusBar.jsx` para estado de sync
- Cache automático de Clientes e OTs
- Indicador Online/Offline no header
- Operações guardadas para sync posterior

**Ficheiros modificados:**
- `/app/frontend/public/service-worker.js` - Reescrito para offline mode
- `/app/frontend/public/offline.html` - Nova página offline
- `/app/frontend/src/components/Dashboard.jsx` - Geolocalização + indicadores
- `/app/frontend/src/hooks/useOfflineData.js` - Novo hook de dados offline
- `/app/frontend/src/components/OfflineStatusBar.jsx` - Novo componente
- `/app/frontend/src/components/TechnicalReports.jsx` - Integração offline
- `/app/backend/server.py` - Reverse geocoding com httpx

---

#### ✅ Sistema de Notificações Melhorado (22 Janeiro 2026)
**Todas as notificações agora aparecem no sino do utilizador:**
- 📝 Pedido de Férias Submetido (confirmação ao utilizador)
- ✅ Férias Aprovadas / ❌ Férias Rejeitadas
- ✅ Horas Extra Autorizadas / ❌ Horas Extra Rejeitadas
- 🔄 Dia de Férias Devolvido (trabalho em férias aprovado)
- ⏰ Lembretes de Entrada/Saída
- 📅 Novo Serviço Atribuído (aos técnicos)
- ⏰ Lembrete de Serviço (1h antes)
- 📋 Novo Pedido de Cotação (aos admins)

**Push Notifications (dispositivos):**
- 📅 Admins recebem push quando alguém submete pedido de férias
- ✅/❌ Utilizadores recebem push quando férias são aprovadas/rejeitadas
- 🕐 Admins recebem push quando alguém inicia horas extra (já existia)
- ✅/❌ Utilizadores recebem push quando horas extra são autorizadas/rejeitadas
- ✅/❌ Utilizadores recebem push quando trabalho em férias é autorizado/rejeitado
- 📅 Técnicos recebem push quando são atribuídos a um serviço
- ⏰ Técnicos recebem push 1h antes do serviço (scheduler a cada 15 min)
- 📋 Admins recebem push quando um Pedido de Cotação é criado

**Scheduler Jobs:**
- 09:30 - Lembrete de entrada (dias úteis)
- 18:15 - Lembrete de saída (dias úteis)
- A cada 15 min (07:00-20:00) - Verificar serviços próximos (1h antes)

**Ficheiros modificados:**
- `/app/backend/notifications_scheduler.py` - Push notifications + `check_upcoming_services()`
- `/app/backend/server.py` - Push para serviços e PCs + scheduler job
- `/app/frontend/src/components/NotificationBell.jsx` - Novos tipos de notificação

**Testado:** ✅ Backend (logs confirmam envio de push)

---

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

---

## Sessão 19 Fevereiro 2026

### ✅ Correção Bug "Invalid Date" no Preview HTML (19 Fevereiro 2026)
**Problema:** Na seção "INTERVENÇÕES REALIZADAS" do modal de preview HTML, as datas apareciam como "Invalid Date".

**Causa:** No código `TechnicalReports.jsx`, a linha que renderizava a data usava `int.data` (campo inexistente) em vez de `int.data_intervencao` (campo correto).

**Correção aplicada em `/app/frontend/src/components/TechnicalReports.jsx`:**
- **Antes:** `new Date(int.data).toLocaleDateString('pt-PT')`
- **Depois:** `int.data_intervencao ? new Date(int.data_intervencao).toLocaleDateString('pt-PT') : '-'`

**Testado:** ✅ Verificado via screenshot - datas agora mostram corretamente (ex: 19/11/2025)

---

### ✅ Visualização de Geolocalização para Administradores (19 Fevereiro 2026)

**Funcionalidade completa implementada:**

#### 1. Mapa em Tempo Real (Admin Dashboard)
- Botão "Mapa em Tempo Real" na aba Utilizadores
- Modal com mapa OpenStreetMap mostrando todas as localizações atuais
- Legenda: A trabalhar (verde), Último registo (azul), Fora de zona (laranja)
- Lista de colaboradores com localização, endereço completo e status
- Botão "Atualizar" para refresh

#### 2. Histórico de Localização por Dia (Gestão de Entradas)
- Mapa OpenStreetMap integrado na página "Gestão de Entradas"
- Tag verde "GPS" aparece em dias com dados de geolocalização
- Cada dia mostra:
  - Mapa com marcadores de localização
  - Hora e endereço (reverse geocoding)
  - Precisão do GPS (±Xm)
  - Link para ver no OpenStreetMap.org
- Indicação visual de "Fora de Zona" para entradas fora da zona de residência

**Alterações feitas:**
- `AdminDashboard.jsx`: Removido botão "Localização" individual de cada utilizador
- `AdminDashboard.jsx`: Mantido modal "Mapa em Tempo Real" com todas as localizações
- `AdminTimeEntries.jsx`: Adicionado componente LocationMap para cada dia com GPS
- `location-map.jsx`: Componente reutilizado (já existia)

**Ficheiros modificados:**
- `/app/frontend/src/components/AdminDashboard.jsx`
- `/app/frontend/src/components/AdminTimeEntries.jsx`

**Testado:** ✅ Frontend testado via Playwright - 100% dos testes passaram
- Botão "Localização" removido com sucesso da aba Utilizadores
- Mapa em Tempo Real funciona corretamente
- Gestão de Entradas mostra mapa com GPS por dia

---

---

### ✅ Refatoração de server.py e TechnicalReports.jsx (19 Fevereiro 2026)

**Análise realizada:**
- `server.py`: 10.416 linhas - Ficheiro monolítico com todas as rotas
- `TechnicalReports.jsx`: 8.283 linhas - Componente gigante com muitos estados

**Estrutura criada para Backend:**
```
/app/backend/routes/
├── __init__.py           # Exportações
├── dependencies.py       # ✅ Funções comuns (auth, db, utils)
└── auth.py              # ✅ Exemplo de router separado
```

**Estrutura criada para Frontend:**
```
/app/frontend/src/components/technical-reports/hooks/
├── index.js              # ✅ Exportações
├── useRelatorios.js      # ✅ Hook para gestão de relatórios
└── useClientes.js        # ✅ Hook para gestão de clientes
```

**Documentação criada:**
- `/app/memory/REFACTORING_PLAN.md` - Plano completo de refatoração

**Estratégia adoptada:** Refatoração incremental
- Novas features devem usar a nova estrutura
- Migração gradual do código existente
- Manter sistema funcional durante a transição

**Próximos passos:**
1. Criar hooks para estados restantes (técnicos, intervenções, etc.)
2. Extrair mais modais do TechnicalReports.jsx
3. Migrar rotas do server.py uma secção de cada vez

---

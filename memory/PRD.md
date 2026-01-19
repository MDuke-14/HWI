# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem, e geração de relatórios PDF.

## Utilizadores
- **Admin**: Pedro Duarte (username: pedro)
- **Técnicos**: Miguel Moreira, Gichelson Leite, Nuno Santos

## Stack Tecnológico
- **Frontend**: React com shadcn/ui
- **Backend**: FastAPI (Python)
- **Base de Dados**: MongoDB
- **PDF**: ReportLab

---

## Funcionalidades Implementadas

### Janeiro 2026 - Sessão Atual

#### ✅ Início Automático de Cronómetro após Criar OT (P0 - Completo)
- Quando o utilizador cria uma nova OT, aparece automaticamente um modal
- Modal mostra o número da OT criada (ex: "Iniciar Cronómetro - OT #362")
- Lista todos os técnicos disponíveis com checkboxes
- Permite selecionar tipo de cronómetro (Trabalho ou Viagem)
- Permite seleção múltipla de técnicos
- Mostra contador de técnicos selecionados
- Botão "Ignorar" para fechar sem iniciar
- Botão "Iniciar" para começar cronómetros
- **Ficheiros modificados**: 
  - `/app/frontend/src/components/TechnicalReports.jsx` (linhas 93-97, 575-595, 1544-1576, 6300-6410)
- **Testado**: 9/9 testes passaram

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

### P2 - Prioridade Média
- **Melhorar UI do Calendário**: Componente `/app/frontend/src/components/Calendar.jsx`
- **Download Todos os Relatórios**: Botão na vista de cliente para download de todas as OTs

### Refactoring Necessário
- **TechnicalReports.jsx**: Ficheiro muito grande (6400+ linhas). Necessita ser dividido em componentes menores para melhor manutenção.

---

## Arquitetura de Código

```
/app/
├── backend/
│   ├── server.py             # API FastAPI principal
│   ├── ot_pdf_report.py      # Geração de PDFs
│   ├── cronometro_logic.py   # Lógica de cronómetros
│   └── migrations.py         # Migrações de dados
└── frontend/
    └── src/
        └── components/
            ├── TechnicalReports.jsx  # Gestão de OTs (componente principal)
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

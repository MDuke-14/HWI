# 📋 ANÁLISE COMPLETA DO SISTEMA ANTIGO DE RELATÓRIOS HWI

**Data da Análise:** 17/10/2025  
**Sistema Analisado:** https://www.hwi.pt/relatorios/app/  
**Título:** App - Gestão de Assistências Técnicas

---

## 🎯 VISÃO GERAL DO SISTEMA

O sistema antigo é uma aplicação web para gestão de assistências técnicas que permite aos técnicos:
- Criar relatórios de serviço/assistência
- Capturar assinaturas digitais (técnico e cliente)
- Registar peças/materiais utilizados
- Registar mão de obra e deslocações
- Enviar relatórios por email em formato PDF
- Gerir clientes

---

## 📱 ESTRUTURA DE NAVEGAÇÃO

### Menu Principal
1. **Página inicial** - Dashboard/home
2. **Clientes** (dropdown) - Gestão de clientes
3. **Relatórios** (dropdown) - Gestão de relatórios
4. **Meus dados** - Configurações do técnico
5. **Logout** - Sair do sistema

---

## 🔧 FUNCIONALIDADES IDENTIFICADAS

### 1. **ASSINATURA DIGITAL DO TÉCNICO**

**Tela:** "Assinatura digital"

**Campos:**
- Área de desenho grande para assinatura (canvas)
- Sem campos de texto adicionais

**Botões:**
- `LIMPAR ASSINATURA` (laranja) - Limpa o canvas para recomeçar
- `SALVAR ASSINATURA` (laranja) - Salva a assinatura desenhada

**Funcionalidade:**
- Permite ao técnico desenhar sua assinatura digital usando mouse/touch
- Assinatura pode ser limpa e refeita até estar satisfeito
- Ao salvar, armazena a assinatura (provavelmente como imagem ou SVG)

**Estrutura de Dados Necessária:**
```json
{
  "assinatura_tecnico": {
    "id": "uuid",
    "user_id": "uuid",
    "imagem_base64": "string", // ou path para arquivo
    "formato": "png|svg",
    "data_criacao": "datetime",
    "is_ativa": "boolean"
  }
}
```

---

### 2. **REGISTRO DE PEÇAS/MATERIAIS**

**Tela:** Seção "PEÇAS/MATERIAIS"

**Campos:**
- `Designação` - Nome/descrição da peça ou material utilizado
- `Quantidade` - Quantidade utilizada

**Funcionalidade:**
- Permite adicionar múltiplas linhas de peças/materiais
- Lista de peças utilizadas durante o serviço
- Provavelmente dinâmico (adicionar/remover linhas)

**Estrutura de Dados:**
```json
{
  "pecas_materiais": [
    {
      "id": "uuid",
      "relatorio_id": "uuid",
      "designacao": "string",
      "quantidade": "number"
    }
  ]
}
```

---

### 3. **MÃO DE OBRA / DESLOCAÇÃO**

**Tela:** Seção "MÃO DE OBRA/DESLOCAÇÃO"

**Campos:**
- `Técnico` - Nome do técnico que realizou o serviço
- `Horas` - Horas trabalhadas
- `Deslocação` - Local/descrição da deslocação
- `Código` - Código do serviço/projeto

**Campos Adicionais (Horário de Trabalho):**
- `Sábado` - Checkbox/indicador (S)
- `Domingos/Feriados` - Checkbox/indicador (D)
- `Dias úteis (07H-19H)` - Indicador (1)
- `Dias úteis (19H-07H)` - Indicador (2)

**Texto de Declaração:**
"Declaro que aceito os trabalhos acima descritos e que tudo foi efetuado de acordo com a folha de assistência. Assinado em 16/10/2025 por:"

**Botões de Ação:**
- `ASSINATURA DIGITAL` (laranja)
- `ASSINAR MANUALMENTE` (laranja)
- `ENVIAR PDF DA FOLHA DE SERVIÇO PARA EMAIL'S` (laranja)

**Funcionalidade:**
- Registra detalhes da mão de obra
- Indica tipo de horário (normal, noturno, fim de semana)
- Diferencia dias úteis de sábados e feriados
- Permite duas formas de assinatura (digital ou manual)
- Gera e envia PDF por email

**Estrutura de Dados:**
```json
{
  "mao_de_obra": {
    "relatorio_id": "uuid",
    "tecnico_nome": "string",
    "horas": "number",
    "deslocacao": "string",
    "codigo": "string",
    "horario": {
      "sabado": "boolean",
      "domingo_feriado": "boolean",
      "dias_uteis_diurno": "number", // 07H-19H
      "dias_uteis_noturno": "number"  // 19H-07H
    },
    "declaracao_aceite": "string",
    "data_assinatura": "datetime",
    "tipo_assinatura": "digital|manual"
  }
}
```

---

### 4. **ASSINATURA DO CLIENTE**

**Tela:** "Assinar o nome do cliente"

**Campos:**
- Título: "Assinatura manual"
- Grande área de canvas para desenho livre

**Botão:**
- `ENVIAR ASSINATURA` (laranja)

**Funcionalidade:**
- Permite ao cliente assinar manualmente no dispositivo
- Canvas para desenho da assinatura
- Envia/salva a assinatura após confirmação

**Estrutura de Dados:**
```json
{
  "assinatura_cliente": {
    "id": "uuid",
    "relatorio_id": "uuid",
    "imagem_base64": "string",
    "formato": "png|svg",
    "data_criacao": "datetime"
  }
}
```

---

### 5. **ENVIO DE RELATÓRIO POR EMAIL**

**Tela:** "Selecionar Emails"

**Seções:**

#### 5.1. Lista de Emails Pré-cadastrados
**Título:** "Selecionar Emails"

**Campos:**
- Checkbox de seleção
- Email (ex: `geral@jmonteiro.na-net.pt`, `d-mmunet@live.com.pt`)

#### 5.2. Emails Adicionais
**Título:** "Outros emails (separar com vírgulas)"

**Campos:**
- Textarea grande para inserir emails adicionais separados por vírgula

**Botão:**
- `ENVIAR` (laranja) - Envia o PDF para os emails selecionados

**Funcionalidade:**
- Selecionar múltiplos destinatários pré-cadastrados
- Adicionar emails extras manualmente
- Gera PDF do relatório
- Envia por email para todos os selecionados

**Modal de Progresso:**
"A preparar PDF para envio... 4 segundos"
- Mostra progresso/loading durante geração do PDF

**Estrutura de Dados:**
```json
{
  "envio_email": {
    "relatorio_id": "uuid",
    "emails_destinatarios": ["string"],
    "emails_adicionais": "string", // separados por vírgula
    "data_envio": "datetime",
    "status": "pendente|enviado|erro",
    "pdf_path": "string"
  }
}
```

---

## 🗂️ MODELO DE DADOS COMPLETO

### Tabela: `relatorios`
```sql
CREATE TABLE relatorios (
  id VARCHAR(36) PRIMARY KEY,
  tecnico_id VARCHAR(36) NOT NULL,
  cliente_id VARCHAR(36) NOT NULL,
  data_criacao DATETIME NOT NULL,
  data_servico DATE NOT NULL,
  codigo_servico VARCHAR(50),
  status VARCHAR(20), -- rascunho, concluido, enviado
  
  -- Mão de obra
  horas_trabalhadas DECIMAL(5,2),
  deslocacao VARCHAR(255),
  horario_sabado BOOLEAN DEFAULT FALSE,
  horario_domingo_feriado BOOLEAN DEFAULT FALSE,
  horario_dias_uteis_diurno INT DEFAULT 0,
  horario_dias_uteis_noturno INT DEFAULT 0,
  
  -- Assinaturas
  assinatura_tecnico_path VARCHAR(255),
  assinatura_cliente_path VARCHAR(255),
  data_assinatura_tecnico DATETIME,
  data_assinatura_cliente DATETIME,
  tipo_assinatura VARCHAR(20), -- digital, manual
  
  -- Declaração
  declaracao_texto TEXT,
  
  -- PDF
  pdf_gerado_path VARCHAR(255),
  data_geracao_pdf DATETIME,
  
  FOREIGN KEY (tecnico_id) REFERENCES users(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
```

### Tabela: `pecas_materiais`
```sql
CREATE TABLE pecas_materiais (
  id VARCHAR(36) PRIMARY KEY,
  relatorio_id VARCHAR(36) NOT NULL,
  designacao VARCHAR(255) NOT NULL,
  quantidade DECIMAL(10,2) NOT NULL,
  ordem INT, -- para manter ordem de inserção
  
  FOREIGN KEY (relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE
);
```

### Tabela: `clientes`
```sql
CREATE TABLE clientes (
  id VARCHAR(36) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  emails_adicionais TEXT, -- JSON array ou separado por vírgula
  telefone VARCHAR(50),
  morada VARCHAR(500),
  nif VARCHAR(20),
  ativo BOOLEAN DEFAULT TRUE,
  data_criacao DATETIME NOT NULL
);
```

### Tabela: `envios_email`
```sql
CREATE TABLE envios_email (
  id VARCHAR(36) PRIMARY KEY,
  relatorio_id VARCHAR(36) NOT NULL,
  emails_destinatarios TEXT NOT NULL, -- JSON array
  data_envio DATETIME NOT NULL,
  status VARCHAR(20), -- sucesso, erro, pendente
  mensagem_erro TEXT,
  
  FOREIGN KEY (relatorio_id) REFERENCES relatorios(id)
);
```

---

## 📄 GERAÇÃO DE PDF

### Informações que o PDF deve conter:

1. **Cabeçalho**
   - Logo da empresa HWI
   - Título: "Folha de Assistência Técnica" ou similar
   - Data e número do relatório

2. **Dados do Cliente**
   - Nome
   - Morada
   - NIF/NIPC

3. **Dados do Serviço**
   - Data do serviço
   - Código do serviço
   - Nome do técnico

4. **Peças e Materiais Utilizados**
   - Tabela com:
     - Designação
     - Quantidade

5. **Mão de Obra / Deslocação**
   - Técnico
   - Horas trabalhadas
   - Deslocação
   - Código
   - Horário de trabalho:
     - Sábados (S)
     - Domingos/Feriados (D)
     - Dias úteis diurnos (1)
     - Dias úteis noturnos (2)

6. **Declaração de Aceite**
   - Texto completo da declaração
   - Data da assinatura

7. **Assinaturas**
   - Assinatura do técnico (imagem)
   - Assinatura do cliente (imagem)

8. **Rodapé**
   - Dados da empresa
   - Contactos

---

## 🔐 FLUXO COMPLETO DE TRABALHO

```
1. TÉCNICO FAZ LOGIN
   ↓
2. CRIA NOVO RELATÓRIO
   ↓
3. SELECIONA CLIENTE (ou cria novo)
   ↓
4. PREENCHE DADOS DO SERVIÇO
   - Data
   - Código
   ↓
5. ADICIONA PEÇAS/MATERIAIS
   - Designação
   - Quantidade
   ↓
6. REGISTRA MÃO DE OBRA
   - Horas
   - Deslocação
   - Tipo de horário
   ↓
7. ASSINA DIGITALMENTE (TÉCNICO)
   - Desenha assinatura
   - Salva
   ↓
8. CLIENTE ASSINA
   - Opção A: Assinatura digital
   - Opção B: Assinatura manual
   ↓
9. GERA PDF
   - Sistema compila todas as informações
   - Cria PDF formatado
   ↓
10. ENVIA POR EMAIL
    - Seleciona destinatários
    - Adiciona emails extras
    - Envia
   ↓
11. RELATÓRIO CONCLUÍDO
```

---

## 🎨 CARACTERÍSTICAS DE UI/UX

### Cores
- **Primária:** Azul escuro (#485461 ou similar)
- **Secundária:** Laranja/Amarelo (#F5A623 ou similar)
- **Texto:** Branco sobre fundo escuro
- **Botões de ação:** Laranja (#F5A623)

### Tipografia
- Headers: Laranja/Amarelo
- Corpo de texto: Branco
- Campos de input: Fundo mais claro que o background principal

### Layout
- Design responsivo
- Cards/blocos para cada seção
- Botões grandes e fáceis de clicar (touch-friendly)
- Separação clara entre seções
- Bordas amarelas para delimitar áreas importantes

### Navegação
- Menu superior fixo
- Dropdown para Clientes e Relatórios
- Logout sempre visível
- Nome do usuário exibido ("Bem vindo")

---

## ✨ MELHORIAS A IMPLEMENTAR NO NOVO SISTEMA

### 1. **Funcionalidades Básicas (Manter)**
- ✅ Assinatura digital (técnico e cliente)
- ✅ Registro de peças/materiais
- ✅ Registro de mão de obra/deslocação
- ✅ Tipos de horário (sábado, domingo/feriado, diurno, noturno)
- ✅ Geração de PDF
- ✅ Envio por email

### 2. **Melhorias de UX**
- 🆕 Validações de campos em tempo real
- 🆕 Auto-save/rascunho automático
- 🆕 Preview do PDF antes de enviar
- 🆕 Histórico de versões do relatório
- 🆕 Notificações de status de envio
- 🆕 Upload de fotos do serviço
- 🆕 Geolocalização automática
- 🆕 Assinatura com timestamp verificável

### 3. **Funcionalidades Novas**
- 🆕 Dashboard com estatísticas
- 🆕 Busca e filtros avançados
- 🆕 Templates de relatório
- 🆕 Catálogo de peças com preços
- 🆕 Cálculo automático de custos
- 🆕 Modo offline (PWA)
- 🆕 Multi-idioma
- 🆕 Exportação em múltiplos formatos
- 🆕 Integração com calendário
- 🆕 Aprovação de relatórios por níveis

### 4. **Gestão de Clientes**
- 🆕 Histórico completo de serviços por cliente
- 🆕 Múltiplos contactos por cliente
- 🆕 Notas e observações
- 🆕 Status do cliente (ativo, inativo, VIP)
- 🆕 Agrupamento de clientes

### 5. **Relatórios e Analytics**
- 🆕 Relatórios de desempenho de técnicos
- 🆕 Relatórios financeiros
- 🆕 Análise de peças mais utilizadas
- 🆕 Tempo médio de serviço
- 🆕 Taxa de satisfação de clientes
- 🆕 Exportação de dados para Excel

---

## 📊 ENDPOINTS API NECESSÁRIOS

### Relatórios
- `POST /api/relatorios` - Criar relatório
- `GET /api/relatorios` - Listar relatórios
- `GET /api/relatorios/:id` - Obter relatório específico
- `PUT /api/relatorios/:id` - Atualizar relatório
- `DELETE /api/relatorios/:id` - Deletar relatório
- `POST /api/relatorios/:id/assinatura-tecnico` - Salvar assinatura técnico
- `POST /api/relatorios/:id/assinatura-cliente` - Salvar assinatura cliente
- `POST /api/relatorios/:id/gerar-pdf` - Gerar PDF
- `POST /api/relatorios/:id/enviar-email` - Enviar por email

### Peças/Materiais
- `POST /api/relatorios/:id/pecas` - Adicionar peça
- `PUT /api/relatorios/:id/pecas/:pecaId` - Atualizar peça
- `DELETE /api/relatorios/:id/pecas/:pecaId` - Remover peça

### Clientes
- `POST /api/clientes` - Criar cliente
- `GET /api/clientes` - Listar clientes
- `GET /api/clientes/:id` - Obter cliente
- `PUT /api/clientes/:id` - Atualizar cliente
- `DELETE /api/clientes/:id` - Deletar cliente
- `GET /api/clientes/:id/relatorios` - Histórico de relatórios do cliente

### Usuários/Técnicos
- `GET /api/users/me` - Dados do usuário logado
- `PUT /api/users/me` - Atualizar dados do usuário
- `POST /api/users/me/assinatura` - Salvar assinatura padrão

---

## 🔄 PRIORIDADES DE IMPLEMENTAÇÃO

### FASE 1 - MVP (Funcionalidades Essenciais)
1. Sistema de login e autenticação ✅ (já existe)
2. CRUD de clientes
3. Criar relatório básico
4. Adicionar peças/materiais
5. Registrar mão de obra
6. Captura de assinatura digital (técnico)
7. Captura de assinatura cliente
8. Geração de PDF básico
9. Envio por email

### FASE 2 - Melhorias
1. Dashboard com estatísticas
2. Filtros e busca
3. Upload de fotos
4. Templates de PDF personalizados
5. Histórico e audit log
6. Notificações

### FASE 3 - Avançado
1. Analytics completo
2. Modo offline
3. Multi-idioma
4. Integração com outros sistemas
5. API pública

---

## 📝 NOTAS TÉCNICAS

### Tecnologias Recomendadas

**Backend:**
- FastAPI (Python) ✅ (já em uso)
- MongoDB ✅ (já em uso)
- ReportLab ou WeasyPrint para geração de PDF
- SMTP para envio de emails ✅ (já configurado)
- Pillow para manipulação de imagens

**Frontend:**
- React ✅ (já em uso)
- Signature Pad ou React Signature Canvas para assinaturas
- React PDF ou PDF-lib para preview de PDF
- Axios para chamadas API ✅ (já em uso)

**Armazenamento:**
- AWS S3 ou similar para armazenar PDFs e imagens de assinaturas
- Ou diretório local com backup regular

---

## 🎯 CONCLUSÃO

O sistema antigo de relatórios HWI é uma aplicação funcional focada em:
- Gestão de assistências técnicas
- Captura de assinaturas digitais
- Registro de materiais e mão de obra
- Geração e envio de relatórios em PDF

O novo sistema deve **manter todas essas funcionalidades essenciais** e **adicionar melhorias significativas** em termos de:
- UX/UI mais moderna e intuitiva
- Funcionalidades de gestão e analytics
- Performance e confiabilidade
- Segurança e auditoria
- Escalabilidade

Esta análise serve como base para o desenvolvimento do novo sistema de relatórios integrado à plataforma de time tracking HWI.

---

**Documentado por:** AI Engineer - Emergent  
**Data:** 17/10/2025  
**Versão:** 1.0

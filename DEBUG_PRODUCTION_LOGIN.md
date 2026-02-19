# 🔍 Guia de Depuração - Problema de Login em Produção

## 📋 Resumo do Problema

Login funciona localmente mas falha em produção com erro "Credenciais inválidas".

## 🛠️ Alterações Implementadas

### 1. **Mensagens de Erro Detalhadas no Backend**

O endpoint `/api/auth/login` agora retorna mensagens de erro mais específicas:

- ❌ "Credenciais inválidas - utilizador não encontrado"
- ❌ "Credenciais inválidas - campo de senha não encontrado no utilizador"
- ❌ "Credenciais inválidas - senha incorreta"

**Como verificar:** Abrir DevTools do navegador → Aba Network → Tentar fazer login → Ver resposta do endpoint `/api/auth/login`

### 2. **Endpoint de Diagnóstico de Base de Dados**

Novo endpoint: `GET /api/debug/db-info`

Este endpoint retorna informações sobre:
- URL do MongoDB (sem senha)
- Nome da base de dados
- Número total de utilizadores
- Informações sobre utilizadores admin específicos (pedro.duarte, miguel.moreira, admin)
- Verificação de campos de senha

**Como usar:**
```bash
# Aceder diretamente no navegador
https://ot-manager-3.preview.emergentagent.com/api/debug/db-info

# Ou via curl
curl https://ot-manager-3.preview.emergentagent.com/api/debug/db-info
```

### 3. **Script para Resetar Senhas**

Criado `/app/backend/reset_password.py` para resetar senhas de utilizadores.

**Uso:**
```bash
cd /app/backend
python3 reset_password.py <username> <nova_senha>

# Exemplo:
python3 reset_password.py miguel HwiAdmin2025!
```

### 4. **Correção de Scripts de Verificação**

Corrigido `/app/backend/check_users.py` para usar `DB_NAME` do `.env` em vez de hardcoded "emergent".

## 🔍 Como Depurar o Problema em Produção

### Passo 1: Verificar Estado da Base de Dados

1. Abrir navegador e aceder:
   ```
   https://ot-manager-3.preview.emergentagent.com/api/debug/db-info
   ```

2. Verificar a resposta JSON:
   ```json
   {
     "mongo_url": "...",
     "database_name": "...",
     "user_count": X,
     "admin_users": [
       {
         "username": "pedro.duarte",
         "exists": true/false,
         "has_password_field": true/false,
         "password_field_name": "password" ou "hashed_password",
         "is_admin": true/false
       },
       ...
     ]
   }
   ```

3. **Verificar:**
   - ✅ `user_count` > 0 (existem utilizadores)
   - ✅ Utilizador desejado tem `exists: true`
   - ✅ Utilizador tem `has_password_field: true`
   - ✅ `password_field_name` é "hashed_password" ou "password"
   - ✅ `is_admin: true` para admin users

### Passo 2: Testar Login com Mensagens Detalhadas

1. Abrir DevTools do navegador (F12)
2. Ir para aba **Network**
3. Tentar fazer login na aplicação
4. Procurar request `POST /api/auth/login`
5. Ver a **Response** - agora terá mensagem específica:
   - "utilizador não encontrado" → User não existe na BD
   - "campo de senha não encontrado" → User existe mas sem campo password/hashed_password
   - "senha incorreta" → User existe, tem password, mas senha está errada

### Passo 3: Verificar Variáveis de Ambiente em Produção

O problema pode ser diferenças entre ambiente local e produção:

**Variáveis críticas:**
- `MONGO_URL` - URL da base de dados MongoDB
- `DB_NAME` - Nome da base de dados (default: "emergent" ou "test_database")
- `SECRET_KEY` - Chave para JWT (tem default)
- `CORS_ORIGINS` - Origens permitidas

**Como verificar em produção:**
- Verificar no Emergent dashboard se as variáveis de ambiente estão configuradas
- Confirmar que `MONGO_URL` aponta para a base de dados correta
- Confirmar que `DB_NAME` corresponde à base de dados onde os utilizadores existem

## 🐛 Possíveis Causas do Problema

### 1. **Base de Dados Diferente**
- **Sintoma:** `admin_users` todos com `exists: false` no `/api/debug/db-info`
- **Causa:** Produção pode estar usando base de dados diferente
- **Solução:** Verificar `DB_NAME` no ambiente de produção

### 2. **Campo de Senha com Nome Errado**
- **Sintoma:** User existe mas tem `has_password_field: false`
- **Causa:** User foi criado sem campo `password` ou `hashed_password`
- **Solução:** Recriar utilizador com campo correto

### 3. **Senha Incorreta**
- **Sintoma:** Erro "senha incorreta" no login
- **Causa:** Senha na base de dados é diferente do esperado
- **Solução:** Usar script `reset_password.py` para resetar

### 4. **Username Diferente**
- **Sintoma:** Erro "utilizador não encontrado"
- **Causa:** Username pode ser "miguel" em vez de "miguel.moreira"
- **Solução:** Verificar no `/api/debug/db-info` qual é o username exato

### 5. **Ambiente MongoDB Isolado**
- **Sintoma:** Tudo funciona local mas falha em produção
- **Causa:** Produção usa MongoDB diferente (managed database)
- **Solução:** Verificar se utilizadores foram criados na base de dados de produção

## 📝 Próximos Passos Recomendados

1. **Aceder `/api/debug/db-info` em produção** e copiar a resposta completa
2. **Testar login** e verificar mensagem de erro específica no Network tab
3. **Comparar** informações de produção vs local:
   - Quantos users existem?
   - Quais usernames existem?
   - Qual base de dados está sendo usada?
4. **Reportar** as informações encontradas para análise adicional

## 🔐 Credenciais de Teste (Ambiente Local)

No ambiente local, as credenciais foram resetadas para:

- **Username:** `miguel` (não "miguel.moreira")
- **Password:** `HwiAdmin2025!`
- **Admin:** Sim

- **Username:** `pedro` (não "pedro.duarte")
- **Password:** `HwiAdmin2025!`
- **Admin:** Sim

## 📞 Informações Adicionais

- Todos os logs de debug foram adicionados ao código
- Endpoint `/api/debug/db-info` pode ser usado indefinidamente
- Mensagens de erro agora são específicas e visíveis no navegador
- Scripts de gestão de utilizadores estão em `/app/backend/`

---

**Última atualização:** 2025-10-16
**Versão do documento:** 1.0

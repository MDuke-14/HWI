# 🚀 Instruções para Depuração do Login em Produção

## 📌 O Que Foi Feito

Implementei ferramentas de depuração para identificar o problema de login em produção sem precisar de acesso direto aos logs do servidor.

## 🛠️ Ferramentas Implementadas

### 1. **Endpoint de Diagnóstico** (MAIS IMPORTANTE)

**URL para testar em produção:**
```
https://worktrack-90.preview.emergentagent.com/api/debug/db-info
```

Este endpoint retorna informações detalhadas sobre:
- ✅ Quantos utilizadores existem na base de dados
- ✅ Quais utilizadores admin existem (pedro.duarte, miguel.moreira, admin, pedro, miguel)
- ✅ Se cada utilizador tem campo de senha configurado
- ✅ Qual nome do campo de senha (password ou hashed_password)
- ✅ ID de cada utilizador
- ✅ Status de admin de cada utilizador

**Exemplo de resposta esperada:**
```json
{
  "mongo_url": "...",
  "database_name": "test_database",
  "user_count": 4,
  "sample_user": {
    "username": "pedro",
    "email": "pedro.duarte@hwi.pt",
    "is_admin": true
  },
  "admin_users": [
    {
      "username": "pedro",
      "exists": true,
      "has_password_field": true,
      "password_field_name": "hashed_password",
      "is_admin": true,
      "user_id": "..."
    },
    {
      "username": "miguel",
      "exists": true,
      "has_password_field": true,
      "password_field_name": "hashed_password",
      "is_admin": true,
      "user_id": "..."
    }
  ]
}
```

### 2. **Mensagens de Erro Detalhadas no Login**

O endpoint de login agora retorna mensagens específicas que pode ver no navegador (F12 → Network):

- ❌ **"Credenciais inválidas - utilizador não encontrado"** 
  → O username não existe na base de dados

- ❌ **"Credenciais inválidas - campo de senha não encontrado no utilizador"**
  → O utilizador existe mas não tem senha configurada

- ❌ **"Credenciais inválidas - senha incorreta"**
  → O utilizador existe e tem senha, mas a senha digitada está errada

### 3. **Scripts de Gestão**

Criados 3 scripts úteis em `/app/backend/`:

- **`check_users.py`** - Lista utilizadores na base de dados
- **`reset_password.py`** - Reseta senha de um utilizador
- **`test_login.py`** - Testa login diretamente

## 🔍 COMO DEPURAR O PROBLEMA EM PRODUÇÃO

### Passo 1: Aceder ao Endpoint de Diagnóstico

Abrir no navegador:
```
https://worktrack-90.preview.emergentagent.com/api/debug/db-info
```

**O que verificar:**
1. ✅ `user_count` > 0 (existem utilizadores na BD)
2. ✅ Verificar lista `admin_users` para ver quais usernames existem
3. ✅ Verificar se utilizadores têm `exists: true`
4. ✅ Verificar se têm `has_password_field: true`
5. ✅ Anotar qual é o **username exato** (pode ser "miguel" em vez de "miguel.moreira")

### Passo 2: Testar Login com DevTools

1. Abrir a aplicação em produção: https://worktrack-90.preview.emergentagent.com
2. Abrir DevTools (F12)
3. Ir para aba **Network**
4. Tentar fazer login
5. Procurar o request **POST /api/auth/login**
6. Clicar no request e ver a aba **Response**
7. Ler a mensagem de erro específica

### Passo 3: Comparar com Local

**Local (funciona):**
- Database: `test_database`
- Users: `pedro`, `miguel`
- Passwords: `HwiAdmin2025!`

**Produção (verificar no /api/debug/db-info):**
- Database: `???` (verificar no endpoint)
- Users: `???` (verificar quais existem)
- Passwords: `???` (desconhecidas)

## 🎯 Cenários Prováveis e Soluções

### Cenário 1: Utilizadores Não Existem em Produção
**Sintoma:** `/api/debug/db-info` mostra `user_count: 0` ou todos `exists: false`

**Causa:** Base de dados de produção está vazia ou usando DB diferente

**Solução:** 
- Criar utilizadores na base de dados de produção
- Verificar variável de ambiente `DB_NAME` em produção

### Cenário 2: Username Diferente
**Sintoma:** Login diz "utilizador não encontrado"

**Causa:** Username pode ser "miguel" em vez de "miguel.moreira"

**Solução:**
- Ver no `/api/debug/db-info` qual é o username exato
- Tentar login com o username correto

### Cenário 3: Senha Incorreta
**Sintoma:** Login diz "senha incorreta"

**Causa:** Senha em produção é diferente da esperada

**Solução:**
- Resetar senha usando o script `reset_password.py`
- Ou pedir para criar novo utilizador com senha conhecida

### Cenário 4: Campo de Senha Não Existe
**Sintoma:** Login diz "campo de senha não encontrado"

**Causa:** Utilizador foi criado sem senha ou com campo errado

**Solução:**
- Recriar utilizador com senha
- Ou atualizar utilizador existente com campo `hashed_password`

## 📝 AÇÃO IMEDIATA REQUERIDA

**Por favor, faça o seguinte:**

1. **Acesse este URL e copie a resposta completa:**
   ```
   https://worktrack-90.preview.emergentagent.com/api/debug/db-info
   ```

2. **Tente fazer login em produção com DevTools aberto** e copie:
   - A mensagem de erro exata do endpoint `/api/auth/login`
   - O username que está tentando usar
   - Screenshot se possível

3. **Envie essas informações** para que possamos identificar exatamente qual é o problema

## 🔧 Testes Locais (Confirmado Funcionando)

✅ **Ambiente local está funcionando perfeitamente:**

```bash
# Username: miguel
# Password: HwiAdmin2025!
# Admin: Sim
# Database: test_database

curl -X POST "http://localhost:8001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"miguel","password":"HwiAdmin2025!"}'

# Resultado: ✅ Login com sucesso!
```

## 📚 Documentação Adicional

Ver arquivo `/app/DEBUG_PRODUCTION_LOGIN.md` para documentação completa e detalhada.

---

**Próximo Passo:** Por favor, acesse o endpoint `/api/debug/db-info` em produção e compartilhe a resposta.

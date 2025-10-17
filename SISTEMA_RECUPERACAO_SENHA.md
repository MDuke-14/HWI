# 🔐 Sistema de Recuperação de Senha Implementado

## ✅ O Que Foi Criado

Implementei um sistema completo e automático de recuperação de senha com os seguintes recursos:

### 1. **Backend - Endpoints Novos**

#### `/api/auth/forgot-password` (POST)
- Recebe email ou username do utilizador
- Gera senha temporária aleatória e segura (12 caracteres)
- Envia email automático com a senha temporária
- Marca utilizador com flag `must_change_password = true`

**Exemplo de uso:**
```bash
curl -X POST "https://timeflow-service.preview.emergentagent.com/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"miguel.moreira@hwi.pt"}'
```

Ou com username:
```bash
curl -X POST "https://timeflow-service.preview.emergentagent.com/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"miguel"}'
```

#### `/api/auth/change-password` (POST)
- Permite trocar senha (requer autenticação)
- Valida senha antiga
- Define nova senha
- Remove flag `must_change_password`

### 2. **Frontend - Novas Telas**

#### Tela de Login
- ✅ Botão "Esqueci a senha" adicionado
- ✅ Modal de recuperação de senha
- ✅ Aceita email ou username
- ✅ Feedback visual claro

#### Tela de Troca Obrigatória de Senha
- ✅ Aparece automaticamente quando `must_change_password = true`
- ✅ Bloqueia acesso ao sistema até trocar a senha
- ✅ Interface intuitiva com validações
- ✅ Dicas de senha segura

### 3. **Sistema de Email**

Email automático enviado contém:
- 📧 Senha temporária em destaque
- ⚠️ Avisos de segurança
- 📝 Instruções passo a passo
- 🎨 Design profissional HTML

**Exemplo de email enviado:**
```
Assunto: Recuperação de Senha - HWI Relógio de Ponto

Olá Miguel Moreira,

Recebemos uma solicitação de recuperação de senha para sua conta.

Sua senha temporária é:
┌──────────────┐
│ Xk7@mP9zL2n! │
└──────────────┘

⚠️ Atenção:
• Esta senha é temporária
• Você será obrigado a criar uma nova senha no próximo login
• Por segurança, não compartilhe esta senha com ninguém

Como fazer o login:
1. Acesse o sistema
2. Use seu nome de utilizador e a senha temporária acima
3. Você será direcionado para criar uma nova senha
4. Escolha uma senha forte e segura
```

---

## 🚀 Como Usar

### Para Recuperar Senha:

1. **Acesse a tela de login** em produção
2. **Clique em "Esqueci a senha"**
3. **Digite seu email ou username** (pode usar "miguel" ou "miguel.moreira@hwi.pt")
4. **Clique em "Enviar Email"**
5. **Verifique seu email** registado no sistema
6. **Copie a senha temporária** do email
7. **Faça login** com username e senha temporária
8. **Sistema forçará criar nova senha** automaticamente
9. **Defina nova senha segura**
10. **Pronto!** Pode usar o sistema normalmente

### Para Miguel Especificamente:

```bash
# Opção 1: Recuperar pelo email
1. Ir em "Esqueci a senha"
2. Digitar: miguel.moreira@hwi.pt
3. Clicar "Enviar Email"
4. Verificar email

# Opção 2: Recuperar pelo username
1. Ir em "Esqueci a senha"  
2. Digitar: miguel
3. Clicar "Enviar Email"
4. Verificar email
```

---

## 📋 Fluxo Completo

```
┌─────────────────────┐
│  Esqueci a Senha    │
│  (Tela de Login)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Insere Email ou    │
│  Username           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Sistema Gera       │
│  Senha Temporária   │
│  (Ex: Xk7@mP9zL2n!) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Email Enviado      │
│  Automaticamente    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Utilizador         │
│  Recebe Email       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Login com          │
│  Senha Temporária   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  TELA BLOQUEADA:    │
│  Troca Obrigatória  │
│  de Senha           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Define Nova Senha  │
│  Segura             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  ✅ Acesso Total    │
│  ao Sistema         │
└─────────────────────┘
```

---

## 🔒 Segurança

- ✅ Senhas temporárias geradas com `secrets` (criptograficamente seguras)
- ✅ 12 caracteres com letras, números e símbolos
- ✅ Hash bcrypt para armazenamento
- ✅ Flag `must_change_password` no banco de dados
- ✅ Validação de senha mínima (6 caracteres)
- ✅ Email obrigatório no cadastro
- ✅ Mensagem genérica se utilizador não existir (não revela informação)

---

## 🎯 Campos Adicionados ao Modelo User

```python
class User(BaseModel):
    id: str
    username: str
    email: EmailStr
    hashed_password: str
    full_name: Optional[str]
    phone: Optional[str]
    is_admin: bool
    must_change_password: bool = False  # 🆕 NOVO
    created_at: datetime
    password_reset_at: Optional[str]     # 🆕 NOVO (timestamp)
    password_changed_at: Optional[str]   # 🆕 NOVO (timestamp)
```

---

## 📧 Configuração de Email

O sistema usa as configurações SMTP já existentes no `.env`:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=geral@hwi.pt
SMTP_PASSWORD=*XLyr3qy
SMTP_FROM=geral@hwi.pt
```

**Email de envio:** geral@hwi.pt  
**Servidor:** Office 365

---

## 🧪 Testando Localmente

```bash
# 1. Solicitar recuperação de senha
curl -X POST "http://localhost:8001/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"miguel"}'

# Resposta:
# {
#   "message": "Email enviado com sucesso! Verifique sua caixa de entrada para a senha temporária."
# }

# 2. Verificar email em miguel.moreira@hwi.pt

# 3. Fazer login com senha temporária

# 4. Sistema forçará troca de senha
```

---

## 📝 Próximos Passos

1. **FAZER DEPLOY** do código para produção
2. **Testar** a recuperação de senha em produção
3. **Verificar** se o email chega corretamente
4. **Fazer login** com a senha temporária
5. **Trocar senha** e confirmar que funciona

---

## ⚡ SOLUÇÃO IMEDIATA para o Miguel

**Depois do deploy:**

1. Acesse: https://timeflow-service.preview.emergentagent.com
2. Clique em "Esqueci a senha"
3. Digite: `miguel`
4. Clique "Enviar Email"
5. Verifique o email: miguel.moreira@hwi.pt
6. Copie a senha temporária do email
7. Faça login com: username=`miguel`, password=`<senha do email>`
8. Defina nova senha quando solicitado
9. ✅ Pronto! Pode usar o sistema normalmente!

---

**Última atualização:** 2025-10-16  
**Versão:** 1.0  
**Status:** ✅ Implementado e pronto para deploy

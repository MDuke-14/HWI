# Variáveis de Ambiente Necessárias para Deployment

## CRÍTICO - Configure estas variáveis no painel do Emergent antes do deployment

### Frontend (.env)
```
REACT_APP_BACKEND_URL=https://seu-app.emergent.host
```

### Backend (.env)
```
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=hwi_timeclock_production

# Security
SECRET_KEY=gere-uma-chave-aleatoria-forte-aqui-min-32-caracteres

# Email Configuration
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=geral@hwi.pt
SMTP_PASSWORD="*XLyr3qy"
SMTP_FROM=geral@hwi.pt

# CORS (aceitar todas as origens ou especificar)
CORS_ORIGINS=*
```

## NOTAS IMPORTANTES:

1. **REACT_APP_BACKEND_URL:** 
   - Use o URL do seu app no Emergent (fornecido após deployment)
   - Formato: https://nome-do-app.emergent.host

2. **MONGO_URL:**
   - O Emergent fornece MongoDB gerenciado
   - Use o valor fornecido pelo painel

3. **DB_NAME:**
   - Use "hwi_timeclock_production" ou nome similar
   - NÃO use "test_database" em produção

4. **SECRET_KEY:**
   - Gere uma chave forte e aleatória
   - Mínimo 32 caracteres
   - Exemplo: openssl rand -hex 32

5. **SMTP_PASSWORD:**
   - Note as aspas devido ao caractere especial *

## Como Configurar no Emergent:

1. Acesse o painel de deployment
2. Vá em "Environment Variables" ou "Settings"
3. Adicione cada variável acima
4. Faça o deployment novamente

## Teste Local vs Produção:

**Local:** Usa arquivos .env (ignorados pelo git)
**Produção:** Usa variáveis configuradas no painel Emergent

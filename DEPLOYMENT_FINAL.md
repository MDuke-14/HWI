# GUIA DEFINITIVO PARA DEPLOYMENT EM PRODUÇÃO

## PROBLEMA: Site fica em branco em https://timesync-app-2.emergent.host/

### CAUSA:
Frontend não sabe onde está o backend porque falta variável de ambiente.

### SOLUÇÃO (Fazer no Painel Emergent):

1. **Vá em Settings → Environment Variables**

2. **ADICIONE esta variável:**
   - Nome: `REACT_APP_BACKEND_URL`
   - Valor: `https://timesync-app-2.emergent.host`

3. **Clique em Save**

4. **Faça novo Deploy**

5. **Aguarde 5-10 minutos**

6. **Teste:** https://timesync-app-2.emergent.host/

### VERIFICAÇÃO:
- Se abrir página de login = ✅ FUNCIONOU
- Se continuar branco = URL da variável está errada

### MONGODB:
NÃO configure MONGO_URL nem DB_NAME manualmente!
O Emergent fornece automaticamente.

Se você configurou, REMOVA essas variáveis.

### PWA:
Está PRONTO! Quando o site funcionar:
- No Chrome mobile: Menu → "Adicionar à tela inicial"
- Funcionará como app nativo

### CREDENCIAIS:
Primeira vez que funcionar, acesse:
https://timesync-app-2.emergent.host/api/setup/create-first-admin

Isso criará:
- Username: admin
- Password: admin123

### MIGRAR DADOS:
Após login, use botão "Importar Relatório" para importar seus 176 registros.

---

## RESUMO:
1. Configure `REACT_APP_BACKEND_URL=https://timesync-app-2.emergent.host`
2. Redeploy
3. Acesse `/api/setup/create-first-admin`
4. Login: admin/admin123
5. Importe dados

**SEM configurar a variável, o site SEMPRE ficará branco!**

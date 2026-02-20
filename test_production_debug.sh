#!/bin/bash
# Script to test production debug endpoint
# Usage: bash test_production_debug.sh

PROD_URL="https://work-tracking-mobile.preview.emergentagent.com"

echo "======================================"
echo "  TESTE DE DEBUG EM PRODUÇÃO"
echo "======================================"
echo ""
echo "URL: ${PROD_URL}/api/debug/db-info"
echo ""
echo "Obtendo informações da base de dados de produção..."
echo ""

# Make the request and format the JSON
response=$(curl -s "${PROD_URL}/api/debug/db-info")

# Check if we got a response
if [ -z "$response" ]; then
    echo "❌ ERRO: Não foi possível conectar ao servidor de produção"
    echo ""
    echo "Possíveis causas:"
    echo "  1. Servidor está offline"
    echo "  2. URL está incorreto"
    echo "  3. Firewall bloqueando a conexão"
    exit 1
fi

# Pretty print the JSON
echo "$response" | python3 -m json.tool

echo ""
echo "======================================"
echo "  ANÁLISE DA RESPOSTA"
echo "======================================"

# Extract key information using python
python3 << EOF
import json
import sys

try:
    data = json.loads('''$response''')
    
    print("\n📊 RESUMO:")
    print(f"  • Base de dados: {data.get('database_name', 'N/A')}")
    print(f"  • Total de utilizadores: {data.get('user_count', 0)}")
    print(f"  • Ambiente: {data.get('environment', 'N/A')}")
    
    print("\n👥 UTILIZADORES ADMIN:")
    admin_users = data.get('admin_users', [])
    
    existing_users = [u for u in admin_users if u.get('exists')]
    non_existing_users = [u for u in admin_users if not u.get('exists')]
    
    if existing_users:
        print("\n  ✅ Encontrados:")
        for user in existing_users:
            username = user.get('username')
            has_pwd = user.get('has_password_field', False)
            pwd_field = user.get('password_field_name', 'N/A')
            is_admin = user.get('is_admin', False)
            
            print(f"     • {username}")
            print(f"       - Senha configurada: {'✅ Sim' if has_pwd else '❌ Não'}")
            print(f"       - Campo de senha: {pwd_field}")
            print(f"       - É admin: {'✅ Sim' if is_admin else '❌ Não'}")
    
    if non_existing_users:
        print("\n  ❌ Não encontrados:")
        for user in non_existing_users:
            print(f"     • {user.get('username')}")
    
    print("\n" + "="*50)
    
    # Provide recommendations
    if not existing_users:
        print("\n⚠️  PROBLEMA: Nenhum utilizador admin encontrado!")
        print("\n📝 SOLUÇÕES:")
        print("  1. Criar utilizadores na base de dados de produção")
        print("  2. Verificar se DB_NAME está correto nas variáveis de ambiente")
        print("  3. Verificar se MONGO_URL aponta para a base de dados correta")
    else:
        print("\n✅ Utilizadores admin encontrados na base de dados!")
        print("\n📝 PRÓXIMO PASSO:")
        print("  1. Use um dos usernames encontrados acima para fazer login")
        print("  2. Se a senha não funcionar, use o script reset_password.py")
        
except Exception as e:
    print(f"\n❌ Erro ao processar resposta: {e}")
    sys.exit(1)
EOF

echo ""
echo "======================================"
echo ""
echo "Para resetar senha de um utilizador:"
echo "  cd /app/backend"
echo "  python3 reset_password.py <username> <nova_senha>"
echo ""
echo "Exemplo:"
echo "  python3 reset_password.py miguel NovaSenha123!"
echo ""

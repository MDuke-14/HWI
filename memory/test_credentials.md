# Test Credentials

## Admin "miguel" (utilizador real do user — Feb 2026)
- **Username**: `miguel`
- **Email**: `miguel.moreira@hwi.pt`
- **Password**: `Miguel123!`
- Full name: Miguel Moreira
- User ID: `92e60254-5bae-4fd7-ad44-7b2f5f4bcc60`
- is_admin: true · is_active: true · must_change_password: false

## Admin secundário (legacy, mantido)
- Username/Email: `teste@email.com`
- Password: `Admin123!`
- User ID: `c145d94b-bb5f-4fe1-b05d-6fa1034db968`
- is_admin: true · is_active: true

## Notas
- Login endpoint: `POST /api/auth/login`
- Field name é `username` — aceita username **OU** email no valor.
- Backend tenta primeiro `find_one({username})`, depois `find_one({email})`.
- Password armazenada em `hashed_password` (bcrypt).
- Em Feb 2026, removido utilizador duplicado com username `teste` (id `3907d254-...`) que causava conflito por partilhar o mesmo email com o admin ativo.

# Test Credentials

## Admin (full access)
- Username/Email: `teste@email.com`
- Password: `Admin123!`
- Role: `admin` · `is_admin: true` · `is_active: true`
- User ID: `c145d94b-bb5f-4fe1-b05d-6fa1034db968`

## Notas
- Login endpoint: `POST /api/auth/login`
- Field name is `username` (não `email`) — aceita email no valor.
- Backend tenta primeiro `find_one({username})`, depois `find_one({email})`.
- O utilizador duplicado com username `teste` (id `3907d254-...`) foi eliminado em Feb 2026 porque causava conflito no login (mesmo email, registo sem hashed_password).
- Password armazenada em `hashed_password` (bcrypt).

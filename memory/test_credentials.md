# Test Credentials

## Admin (full access)
- Username/Email: `teste@email.com`
- Password: `teste`
- ID: `c145d94b-bb5f-4fe1-b05d-6fa1034db968`
- Login endpoint expects: `{"username": "teste@email.com", "password": "teste"}`
- Returns: `access_token` (JWT, Bearer)

## Notes
- Auth endpoint: `POST /api/auth/login`
- Field name is `username` (not `email`) — uses email value

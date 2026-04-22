# Test Credentials

## Admin (Full access)
- Email / Username: `teste@email.com`
- Password: `teste`
- Login endpoint: `POST /api/auth/login` with body `{"username": "...", "password": "..."}` (NOT `email`)
- Returns: `access_token` (JWT), used as `Authorization: Bearer <token>`

## Notes
- `is_admin: true`
- Use for all admin flows (FS management, PC, Vacations, Error Log, Equipment, PDF generation).

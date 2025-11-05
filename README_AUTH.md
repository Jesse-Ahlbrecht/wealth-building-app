# Wealth Management App - Authentication System

This app now features a complete authentication system with email-based registration, login, and password reset.

## Features

✅ **Email-Based Authentication**
- Users register and log in with their email address
- Secure password hashing using bcrypt
- Session management with encrypted JWT tokens

✅ **User Registration**
- Email validation
- Password strength requirements (min 8 characters)
- Email verification support (optional)

✅ **Password Reset**
- Request password reset via email
- Secure token-based reset flow
- Tokens expire after 1 hour

✅ **Security Features**
- Passwords hashed with bcrypt (one-way encryption)
- JWT tokens encrypted with AES-256-GCM
- HMAC-signed API responses
- Rate limiting ready
- CSRF protection ready

## Quick Start

### 1. Database Setup

The database schema includes a `users` table with:
- Encrypted email storage
- Password hashes (bcrypt)
- Password reset tokens
- Email verification status

To update your database:

```bash
psql -d wealth_app -f backend/schema.sql
```

### 2. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

New dependencies added:
- `bcrypt` - Password hashing
- `email-validator` - Email validation
- `itsdangerous` - Token generation

### 3. Configure Email (Optional)

For password reset functionality, configure SMTP in `.env`:

```bash
# Gmail example (requires App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
APP_URL=http://localhost:3000
```

**Note:** Without email configuration, password reset requests will be logged to console but emails won't be sent.

### 4. Start the Application

```bash
# Terminal 1 - Backend
cd backend
python app.py

# Terminal 2 - Frontend
cd frontend
npm start
```

## Usage

### Login Page

Navigate to `http://localhost:3000` and you'll see the login page with:
- **Login** - Sign in with email and password
- **Register** - Create a new account
- **Forgot Password** - Reset your password via email

### Demo Account

For testing without creating an account:
- Email: `demo` (or `demo@example.com`)
- Password: `demo`

### Register New User

1. Click "Sign up" on the login page
2. Enter your full name, email, and password (min 8 characters)
3. Confirm your password
4. Click "Create Account"
5. (Optional) Check your email for verification link

### Password Reset

1. Click "Forgot password?" on the login page
2. Enter your registered email address
3. Click "Send Reset Link"
4. Check your email for the reset link
5. Click the link and enter your new password

## API Endpoints

### POST `/api/auth/register`
Register a new user

```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

### POST `/api/auth/login`
Login with email and password

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### POST `/api/auth/request-password-reset`
Request a password reset email

```json
{
  "email": "user@example.com"
}
```

### POST `/api/auth/reset-password`
Reset password with token

```json
{
  "token": "reset-token-from-email",
  "password": "newpassword123"
}
```

### POST `/api/auth/verify-email`
Verify email address with token

```json
{
  "token": "verification-token-from-email"
}
```

## Security Best Practices

### For Development
- Use strong random keys for encryption (generated automatically if not set)
- Keep `.env` file out of version control
- Use the provided `.env.example` as a template

### For Production
- ✅ Use environment variables for all secrets
- ✅ Enable HTTPS only
- ✅ Use a proper key management service (AWS KMS, Azure Key Vault, etc.)
- ✅ Set up proper CORS policies
- ✅ Enable rate limiting
- ✅ Use a production database (not the demo credentials)
- ✅ Configure email service (SendGrid, AWS SES, etc.)
- ✅ Set secure session cookie settings
- ✅ Enable CSRF protection
- ✅ Add 2FA (future enhancement)

## Troubleshooting

### "Email already registered"
The email is already in the system. Try logging in or use password reset.

### "Invalid email or password"
Check that:
- Email is correct
- Password is correct
- Account exists and is active

### "Password must be at least 8 characters"
Choose a stronger password with at least 8 characters.

### Email not sending
Check that:
- SMTP credentials are configured in `.env`
- SMTP_USER and SMTP_PASSWORD are set
- For Gmail, you're using an App Password (not your regular password)
- Firewall allows SMTP port 587

### Password reset link expired
Reset tokens expire after 1 hour. Request a new reset link.

## Database Schema

The `users` table stores:
- `id` - Primary key
- `tenant_id` - Multi-tenancy support
- `username` - Email address (unique)
- `encrypted_email` - AES-256 encrypted email
- `encrypted_name` - AES-256 encrypted full name
- `password_hash` - Bcrypt password hash
- `created_at` - Registration timestamp
- `last_login` - Last successful login
- `active` - Account status
- `reset_token` - Password reset token
- `reset_token_expires` - Token expiration
- `email_verified` - Email verification status
- `verification_token` - Email verification token

## Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] OAuth2 login (Google, GitHub, etc.)
- [ ] Account lockout after failed attempts
- [ ] Password complexity requirements
- [ ] Session management dashboard
- [ ] Login activity log
- [ ] Remember me functionality
- [ ] Account deletion/deactivation

## Support

For issues or questions, check:
1. Console logs (`/tmp/backend.log`, browser console)
2. Database connection
3. Environment variables configuration
4. This README

Enjoy secure wealth tracking! 🔐💰


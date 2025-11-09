# Wealth Management App - Local Development Setup

This guide will help you set up the Wealth Management App for local development with PostgreSQL, encryption, and secure API endpoints.

## 🚀 Quick Start

### Prerequisites
- macOS with Homebrew
- Python 3.9+
- Node.js 16+ (for React frontend)

### One-Command Setup
```bash
# Clone and setup everything
git clone <repository>
cd wealth_app

# Run the complete setup
./run_local.sh
```

This will:
- ✅ Install and start PostgreSQL
- ✅ Create the encrypted database
- ✅ Start the Flask backend on port 5001
- ✅ Start the React frontend on port 3000

## 📋 Manual Setup (Step by Step)

### 1. Install PostgreSQL
```bash
brew install postgresql@14
brew services start postgresql@14
createdb wealth_app
```

### 2. Setup Python Backend
```bash
cd backend
pip install -r requirements.txt
psql -d wealth_app -f schema.sql
python migrate_data.py  # Optional: load sample data
```

### 3. Setup React Frontend (Optional)
```bash
cd ../frontend
npm install
npm start
```

### 4. Start the Application
```bash
# From project root
./run_local.sh
```

## 🔐 Security Features

### Database Encryption
- **AES-256-GCM encryption** for sensitive data using PostgreSQL pgcrypto
- **Row-level encryption** for account numbers, transaction details, and user data
- **Tenant isolation** with encrypted data per user/organization

### API Security
- **HMAC-SHA256 payload signing** for all API responses
- **PASETO tokens** (authenticated encryption) for session management
- **Short-lived sessions** (15-minute expiration)
- **Zero implicit trust** - every boundary is secured

### File Security
- **Client-side encryption** before file upload
- **Double encryption**: client + server layers
- **Secure file storage** with encrypted metadata

## 🗄️ Database Schema

### Core Tables
- `tenants` - Multi-tenant architecture
- `users` - Encrypted user data
- `accounts` - Bank/investment accounts
- `transactions` - Encrypted financial transactions
- `categories` - Customizable expense/income categories
- `file_attachments` - Encrypted document storage

### Encryption Functions
- `encrypt_tenant_data(data, tenant_id)` - Encrypt data for a tenant
- `decrypt_tenant_data(encrypted_data, tenant_id)` - Decrypt tenant data

## 🛠️ Development Tools

### Database Management
```bash
# Connect to database
psql -d wealth_app

# View encrypted data (as superuser)
SELECT id, decrypt_tenant_data(encrypted_description, 1) as description
FROM transactions WHERE tenant_id = 1;
```

### API Testing
```bash
# Login
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "demo", "password": "demo"}'

# Get accounts (with auth token)
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/accounts
```

### SSL Certificate Generation
```bash
cd nginx
./generate_cert.sh
```

## 🌐 Production Deployment

For production deployment, see `wealth.plan.md` which outlines:
- Cloud VM with hardened Ubuntu
- nginx reverse proxy with TLS 1.3
- Cloud KMS integration
- Encrypted database backups

### Key Differences (Dev vs Prod)
| Feature | Development | Production |
|---------|-------------|------------|
| Database | Local PostgreSQL | Cloud PostgreSQL with pgcrypto |
| Encryption Keys | Local PBKDF2-derived | Cloud KMS (AWS/Azure/GCP) |
| SSL | Self-signed | Let's Encrypt / Cloud certs |
| Sessions | Short-lived tokens | Proper identity provider |
| File Storage | Local encrypted files | Cloud object storage |

## 🔧 Configuration

### Environment Variables
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wealth_app
DB_USER=postgres
DB_PASSWORD=

# Encryption (development only)
WEALTH_MASTER_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
WEALTH_HMAC_SECRET=ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100
WEALTH_TOKEN_KEY=112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00
```

### Nginx with SSL (Optional)
```bash
# Generate certificates
cd nginx && ./generate_cert.sh

# Install nginx
brew install nginx

# Start nginx with our config
sudo nginx -c /Users/jesseahlbrecht/python_projects/wealth_app/nginx/nginx.conf
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify session

### Data Endpoints
- `GET /api/accounts` - List user accounts
- `GET /api/transactions` - List transactions
- `GET /api/summary` - Monthly financial summary
- `POST /api/upload-statement` - Upload encrypted bank statements

### Management
- `GET /api/categories` - Expense/income categories
- `POST /api/categories` - Create custom categories
- `POST /api/update-category` - Override transaction categories

## 🐛 Troubleshooting

### PostgreSQL Issues
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql@14

# Recreate database
dropdb wealth_app
createdb wealth_app
psql -d wealth_app -f backend/schema.sql
```

### Python Issues
```bash
# Reinstall dependencies
cd backend
pip install -r requirements.txt --force-reinstall
```

### Permission Issues
```bash
# Fix database permissions
psql -d wealth_app -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;"
```

## 📚 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React SPA     │    │   Flask API      │    │   PostgreSQL     │
│                 │    │   (Encrypted)    │    │   (pgcrypto)     │
│ • Client-side   │◄──►│ • HMAC signing   │◄──►│ • AES-256-GCM    │
│   encryption    │    │ • PASETO tokens  │    │ • Row security   │
│ • Secure upload │    │ • Auth required  │    │ • Tenant isolation│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🤝 Contributing

1. Follow the security-first approach outlined in `wealth.plan.md`
2. All data handling must maintain encryption
3. API responses must be signed
4. Test encryption functionality thoroughly

## 📄 License

This project implements the security architecture described in `wealth.plan.md` for educational and development purposes.


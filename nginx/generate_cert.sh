#!/bin/bash

# Generate self-signed SSL certificate for local development

echo "🔐 Generating self-signed SSL certificate for local development..."

# Create certificates directory if it doesn't exist
mkdir -p /Users/jesseahlbrecht/python_projects/wealth_app/nginx

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 \
    -keyout /Users/jesseahlbrecht/python_projects/wealth_app/nginx/key.pem \
    -out /Users/jesseahlbrecht/python_projects/wealth_app/nginx/cert.pem \
    -days 365 \
    -nodes \
    -subj "/C=CH/ST=Basel/L=Basel/O=Wealth App/OU=Development/CN=localhost"

echo "✅ SSL certificate generated successfully!"
echo "📄 Certificate: nginx/cert.pem"
echo "🔑 Private key:  nginx/key.pem"
echo ""
echo "⚠️  This is a self-signed certificate for development only!"
echo "   Do not use in production."





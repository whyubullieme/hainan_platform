#!/bin/bash
# Generate a self-signed SSL certificate for development
# Run on the server: bash gen-cert.sh
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=101.33.116.223" \
  -addext "subjectAltName=IP:101.33.116.223"
echo "Generated cert.pem and key.pem"

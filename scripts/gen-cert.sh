#!/usr/bin/env bash
set -euo pipefail

# Gera certificado autoassinado com o IP local detectado.
# Uso: npm run cert

IP="$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '^127\.' | head -n1)"
if [ -z "${IP}" ]; then
  echo "Nao foi possivel detectar o IP local. Defina PALCO_CERT/PALCO_KEY manualmente."
  exit 1
fi

mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -subj "/CN=${IP}" \
  -addext "subjectAltName=IP:${IP},IP:127.0.0.1,DNS:localhost"

echo "Certificado gerado para ${IP}. Rode: npm start"

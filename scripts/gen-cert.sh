#!/usr/bin/env bash
# Gera um certificado autoassinado com o IP local do notebook.
# Sem HTTPS o Chrome do celular BLOQUEIA o microfone quando a pagina vem por IP.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs

IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}' || true)"
if [ -z "${IP}" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "${IP}" ]; then
  SAN="${SAN},IP:${IP}"
  echo "IP local detectado: ${IP}"
else
  echo "Aviso: nao consegui detectar o IP local. O certificado valera apenas para localhost."
fi

openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=palco-control" \
  -addext "subjectAltName=${SAN}" \
  -addext "basicConstraints=CA:FALSE" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

chmod 600 certs/key.pem
echo ""
echo "Certificado criado em certs/cert.pem e certs/key.pem"
echo "Agora rode:  npm start"
echo "No celular, ao abrir o link https://IP:8787, toque em 'Avancado' e 'Continuar mesmo assim'."
echo "Isso e necessario porque o certificado e assinado por voce, nao por uma autoridade publica."

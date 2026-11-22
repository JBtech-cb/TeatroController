# PALCO CONTROL

Central de sonorização teatral: celulares Android como microfones sem fio, mixer no notebook, músicas com crossfade, efeitos, cenas com deixas e botões de emergência.

O áudio dos celulares chega ao notebook **por WebRTC** (uma conexão independente por celular) e é mixado no notebook com **Web Audio API**. O servidor incluído só troca mensagens de sinalização e entrega os arquivos da interface — **nenhum áudio passa por ele**.

> Guia passo a passo para operação: [`docs/GUIA.md`](docs/GUIA.md)
> Relatório de testes e checklist manual: [`docs/TESTES.md`](docs/TESTES.md)

---

## 1. O que está realmente implementado

| Área | Implementação |
| --- | --- |
| Transmissão dos celulares | `getUserMedia` → `RTCPeerConnection` (1 conexão por celular) → `MediaStreamAudioSourceNode` no notebook |
| Sinalização | Servidor Node + WebSocket na mesma máquina, sala privada com PIN |
| Mixer | Canal por microfone: highpass, gate, compressor, limiter, ganho, fader, mute, solo, medidor RMS/pico, LED de clipping |
| Processamento no aparelho | `echoCancellation`, `noiseSuppression`, `autoGainControl` solicitados ao navegador; o aparelho informa o que aplicou de fato |
| Músicas | Importação local (IndexedDB), biblioteca, cenas, volume por faixa, pausa, seek ±10 s, progresso |
| Crossfade | Real, com curvas equal-power no `GainNode`; 0/1/2/3/5/10 s ou personalizado |
| Efeitos | Múltiplos simultâneos, sobre a música, com loop, volume, atalho e parada individual |
| Cenas | Cenas + deixas executadas manualmente pelo operador |
| Emergência | Silenciar microfones, parar músicas, parar efeitos, silenciar tudo, retomar |
| Persistência | Configurações e arquivos de áudio no IndexedDB; recuperação após atualizar a página |
| Reconexão | Celular reconecta sozinho (backoff) e renegocia (ICE restart); painel renegocia ao recarregar |
| Diagnóstico | Aba AJUSTES → EXECUTAR TESTES: estado do áudio, latência, sinal de cada mic, arquivos, armazenamento |

**Não implementado de propósito** (para não prometer o que não existe):
- gravação de áudio — o sistema não grava nada;
- cancelamento de microfonia acústica — nenhum software consegue; o sistema avisa e orienta o posicionamento;
- escolha de dispositivo de saída em navegadores que não suportam `setSinkId` (Firefox/Safari antigos) — nesse caso usa-se o seletor do sistema operacional;
- o modo hospedado na internet não é necessário para a peça; veja a seção 6.

---

## 2. Requisitos

- Node.js 18 ou superior (testado com Node 26).
- Chrome/Chromium atual no notebook e nos celulares Android.
- Notebook e celulares na mesma rede Wi-Fi.
- HTTPS para o microfone funcionar no celular (ver seção 4). `localhost` é a exceção.

## 3. Rodar

```bash
npm install
npm start
```

O terminal mostra a sala, o PIN e os endereços:

```
  Sala: PALCO     PIN: 4821
  Painel:  http://localhost:8787/
  Celular: http://localhost:8787/mic?room=PALCO&pin=4821
  Na rede local:
    wlan0: http://192.168.1.20:8787/
```

Abra `http://localhost:8787` no notebook, clique em **INICIAR ÁUDIO DA CENTRAL** e entre com o PIN.

Variáveis de ambiente:

| Variável | Para que serve |
| --- | --- |
| `PORT` | Porta (padrão 8787) |
| `PALCO_PIN` | PIN fixo (sem ela, um PIN aleatório é gerado a cada início) |
| `PALCO_ROOM` | Nome da sala (padrão `PALCO`) |
| `PALCO_STUN` | STUNs separados por vírgula |
| `PALCO_TURN_URL`, `PALCO_TURN_USER`, `PALCO_TURN_PASS` | TURN opcional |
| `PALCO_CERT`, `PALCO_KEY` | Caminho do certificado/chave |

## 4. HTTPS na rede local (obrigatório no celular)

O Chrome só libera microfone em páginas HTTPS ou em `localhost`. Um endereço `http://192.168.x.x` **bloqueia** o microfone.

```bash
npm run cert     # gera certs/cert.pem e certs/key.pem com o IP local
npm start        # agora sobe em HTTPS
```

No celular, ao abrir o link do QR Code, o Chrome mostra um aviso de certificado não confiável:

1. toque em **Avançado**;
2. toque em **Continuar para 192.168.x.x (não seguro)**;
3. toque em **Permitir** quando pedir o microfone.

Isso acontece porque o certificado é assinado por você, não por uma autoridade pública. Ele continua criptografando a conexão. Alternativa: instalar o `mkcert` e gerar um certificado confiável no seu notebook e no celular.

## 5. Arquitetura

```
 CELULAR (Chrome)                            NOTEBOOK (Chrome) — CENTRAL
┌───────────────────────┐                 ┌──────────────────────────────────────┐
│ getUserMedia (mic)    │   WebRTC áudio  │ MediaStream por celular               │
│ RTCPeerConnection ────┼────────────────▶│  → highpass → gate → compressor       │
│ SDP/ICE via WebSocket │                 │  → limiter → fader → medidor          │
└──────────┬────────────┘                 │  → barramento de microfones           │
           │                              │                                        │
           │  sinalização (JSON)          │ MÚSICAS → fade → volume → barramento  │
           ▼                              │ EFEITOS → volume → barramento         │
┌──────────────────────────────────────┐  │        ↓                               │
│ SERVIDOR LOCAL (Node, este projeto)  │  │  volume geral → limitador → SAÍDA      │
│ • serve a interface e o QR Code      │◀─┤  (caixa Bluetooth / cabo / padrão)     │
│ • sala + PIN, entradas/saídas        │  └──────────────────────────────────────┘
│ • repassa SDP/ICE (nunca o áudio)    │
└──────────────────────────────────────┘
```

- **Precisa de servidor:** apenas a sinalização (SDP/ICE) e o arquivo da página. É este projeto.
- **Não precisa de servidor:** o áudio (ponto a ponto), as músicas, os efeitos e as configurações (ficam no notebook, em IndexedDB).
- **Internet:** só é usada para STUN (descobrir o endereço público) e, se configurado, TURN. Em uma mesma rede Wi-Fi, os próprios endereços locais costumam bastar.

## 6. Modo hospedado na internet (opcional)

O servidor é Node + WebSocket, então precisa de uma hospedagem que mantenha processo e conexões abertas.

| Opção | Limites reais (verificados em nov/2026) | Serve para a peça? |
| --- | --- | --- |
| **Notebook na rede local** (recomendado) | nenhum limite de terceiros | **Sim** — é o modo indicado |
| Render Free | dorme após 15 min sem requisição HTTP **ou** mensagem WebSocket; volta em ~1 min; 750 h/mês; 0,1 CPU/512 MB; pode reiniciar a qualquer momento | Não para uso ao vivo |
| Cloudflare Workers + Durable Objects | 100 mil requisições/dia grátis; DO com WebSocket funciona, mas exige reescrever a sinalização para Worker (este servidor usa `http`/`ws`) | Possível, com adaptação |
| VPS próprio | custo mensal | Sim, se você já tiver |

Sobre STUN/TURN (só necessário no modo internet):

- STUN público: Google (`stun.l.google.com:19302`) — já configurado.
- **Metered Open Relay**: 20 GB/mês grátis, portas 80/443 (dados de nov/2026); a página de preços também cita um plano de 500 MB.
- **Cloudflare Realtime TURN**: 1 TB/mês grátis, depois US$ 0,05/GB.
- **Twilio Network Traversal**: STUN grátis, TURN US$ 0,40/GB (EUA/Europa), sem cota gratuita dedicada.
- **Xirsys**: 500 MB/mês.

Como configurar um TURN:

```bash
PALCO_TURN_URL="turn:SEU_HOST:3478,turns:SEU_HOST:443?transport=tcp" \
PALCO_TURN_USER="usuario" PALCO_TURN_PASS="senha" npm start
```

Atenção: o navegador recebe essas credenciais em `/config.json`. Use credenciais temporárias do provedor e nunca chaves privadas de outros serviços.

## 7. Segurança

- Sala única com PIN; sem PIN correto o WebSocket é fechado com código 4000 e nenhuma mensagem é aceita.
- Links de microfone carregam sala, PIN e um identificador do aparelho; o operador pode derrubar um celular (`disconnect-mic`).
- O PIN fica no `localStorage` do notebook para reconectar após recarregar. Não é autenticação forte: quem estiver na mesma rede e souber o PIN entra. Para a peça, mantenha a rede Wi-Fi só com os aparelhos do grupo.
- Nada é gravado. Nenhum áudio sai para a internet além da conexão direta com os celulares.

## 8. Estrutura

```
server.js               servidor HTTP + WebSocket (sinalização, PIN, sala)
public/index.html       painel do notebook
public/mic.html         MICROFONE PALCO (celular)
public/js/panel.js      lógica do painel
public/js/mic.js        captura e envio do microfone
public/js/audio-engine.js  grafo Web Audio (faders, gate, crossfade, medidores)
public/js/signaling.js  cliente WebSocket com reconexão
public/js/store.js      IndexedDB (arquivos + configurações)
public/vendor/qrcode.js biblioteca de QR Code (MIT, qrcode-generator)
scripts/gen-cert.sh     certificado autoassinado com o IP local
test/signaling.test.mjs testes do servidor de sinalização
docs/GUIA.md            manual do operador
docs/TESTES.md          evidências de teste e checklist
```

## 9. Testes automatizados

```bash
npm test
```

Sobe o servidor em uma porta de teste e verifica: PIN errado recusado, sala inválida recusada, painel + dois microfones simultâneos, repasse de SDP/ICE nos dois sentidos, aviso de entrada/saída e desconexão individual.

## 10. Limitações conhecidas

- Microfonia é acústica: mantenha a caixa **à frente** dos atores e longe dos celulares; use ganho moderado.
- Bluetooth acrescenta atraso (100–300 ms). Para voz, prefira cabo; para música, Bluetooth é aceitável.
- Cada celular é uma conexão WebRTC; o limite prático vem da rede e do notebook (4–6 celulares em Wi-Fi comum é confortável).
- O celular precisa ficar com a tela ligada e o navegador em primeiro plano. O sistema pede `Wake Lock` quando disponível.
- O áudio só começa depois de um clique em **INICIAR ÁUDIO DA CENTRAL** (exigência dos navegadores).

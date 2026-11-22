# RELATÓRIO DE TESTES — PALCO CONTROL

Data: 22/11/2026. Ambiente dos testes automatizados: Node.js 26, Chromium headless em nuvem, servidor local do projeto em HTTPS via proxy.

**Nada aqui foi inventado.** O que eu não consegui medir está marcado como “não verificado”, com o motivo.

---

## 1. Testes automatizados do servidor de sinalização

`npm test` — **6 de 6 passaram**

| Teste | Resultado |
| --- | --- |
| `/config.json` entrega sala e servidores ICE, sem o PIN | passou |
| `/mic` serve a página MICROFONE PALCO | passou |
| PIN errado é recusado (fecha com erro `pin`) | passou |
| Sala inexistente é recusada | passou |
| Painel + 2 microfones simultâneos: entradas, SDP/ICE nos dois sentidos, estado de transmissão | passou |
| Desconectar um celular não afeta o outro | passou |
| Operador derruba um microfone específico (`kicked`) | passou |

## 2. Testes de navegador (executados de verdade)

Método: painel real no Chromium + duas páginas `/mic` reais, cada uma enviando áudio por WebRTC. Como o navegador de teste não tem microfone físico, as páginas usaram a **fonte de teste** embutida (`&testsrc=osc`), que gera um tom real e o envia pelo mesmo caminho de um microfone (`MediaStream` → `RTCPeerConnection`). A página mostra um aviso laranja quando essa fonte está ativa.

| # | Teste | Evidência medida | Situação |
| --- | --- | --- | --- |
| 1 | Um celular como microfone | `RTCPeerConnection.connectionState = connected`, faixa de áudio `live`, pacotes RTP recebidos no painel | passou (transporte) |
| 2 | Dois celulares simultâneos | dois `RTCPeerConnection` independentes conectados, dois canais no mixer, `micIds()` com 2 entradas | passou |
| 3 | Três ou mais | não executado (limite de abas do navegador de teste) | **não verificado** |
| 4 | Volume independente | canal de teste: −12,3 dB médio; ganho −12 dB aplicado → −24,3 dB (exatamente 12 dB menor) | passou |
| 5 | Mute individual sem afetar os outros | canal silenciado foi a −100 dB enquanto o segundo permaneceu ativo | passou |
| 6 | Redução de ruído / eco | pedido enviado ao aparelho; retorno do aparelho exibido na tela. Com fonte de teste o aparelho informa “não aplicável” | **não verificado com microfone real** |
| 7 | Tocar música | música importada tocou; saída medida em −17 dB RMS | passou |
| 8 | Efeito sobre a música | efeito disparado com a música tocando: 1 efeito ativo, música continuou, saída em −12,5 dB | passou |
| 9 | Crossfade | duas instâncias simultâneas; nível da saída −21 → −17 → −14 → −13 → −12 dB (sem buraco/silêncio); ao final 1 instância | passou |
| 10 | Desconectar um celular | canal marcado OFFLINE; o outro manteve áudio; resumo “1 de 4 conectado” | passou |
| 11 | Reconectar | mesmo link reconectou: `connected = true`, áudio recebido, etiqueta LIVE | passou |
| 12 | Botões de emergência | SILENCIAR TUDO: saída muda, músicas paradas, efeitos parados, todos os mics mudos; RETOMAR: saída e mics liberados | passou |
| 13 | Reprodução na caixa de som | não há caixa física no ambiente de teste; a saída de áudio do navegador não é audível aqui | **não verificado** |
| 14 | 30 minutos contínuos | sessão de teste durou cerca de 25 minutos, sem travar nem cair | **parcial** — faça os 30 min no seu notebook |
| 15 | Recuperar após F5 | painel recarregado: reconectou sozinho (PIN salvo), restaurou 2 músicas, 1 efeito, 4 canais, e os dois celulares renegociaram (`hasAudio` nos dois) | passou |

### Limite importante do ambiente de teste

O navegador em nuvem recebeu os pacotes RTP dos celulares, mas informou `totalSamplesReceived = 0` e não decodificou áudio remoto (limitação de áudio do Chromium headless, sem placa de som). Por isso **não foi possível ouvir nem medir a voz vindo dos celulares**.

Para cobrir essa lacuna, o mesmo caminho de processamento do microfone foi testado com um `MediaStream` real gerado dentro do painel:

- sinal aberto: −12,3 dB médio / −9,4 dB pico;
- MUTE: −100 dB;
- ganho −12 dB: −24,3 dB (redução exata);
- gate em −20 dB: aberto com fala (−12,6 dB) e fechado ao parar o som (−100 dB).

Ou seja: **o mixer por microfone funciona**. O que falta confirmar nos seus aparelhos é a chegada da voz de verdade pela rede.

## 3. Checklist manual (faça no seu notebook e celulares)

Marque cada item. Leve 30 minutos e faça igual à peça.

- [ ] 1. Abrir a central, clicar em **INICIAR ÁUDIO DA CENTRAL** e entrar com o PIN.
- [ ] 2. Conectar 1 celular Android e ouvir a voz na caixa.
- [ ] 3. Conectar 2 celulares e falar nos dois ao mesmo tempo.
- [ ] 4. Conectar 3+ celulares e verificar estabilidade da rede.
- [ ] 5. Alterar o volume de um canal e confirmar que só ele muda.
- [ ] 6. Dar MUTE em um canal e confirmar que os outros continuam.
- [ ] 7. Testar Eco / Ruído / Ganho automático e ver o que o aparelho informa.
- [ ] 8. Tocar uma música.
- [ ] 9. Disparar um efeito com a música tocando.
- [ ] 10. Fazer crossfade de 2 s e de 10 s.
- [ ] 11. Afastar um celular até cair e confirmar que os outros continuam.
- [ ] 12. Reconectar o mesmo celular pelo mesmo link.
- [ ] 13. Testar os 5 botões de emergência e os atalhos `M , . X R N`.
- [ ] 14. Deixar tudo rodando 30 minutos com música e microfones.
- [ ] 15. Apertar F5 no painel e confirmar que tudo volta e os celulares reconectam.
- [ ] 16. Testar o modo local sem internet (roteador sem dados móveis).
- [ ] 17. Testar a caixa de som real (cabo e, se usar, Bluetooth).

## 4. Como repetir os testes automatizados

```bash
npm test                 # servidor de sinalização
npm run cert             # certificado para HTTPS local
npm start                # central em https://localhost:8787
```

Os arquivos usados no teste de áudio estão em `test/fixtures/` (tons gerados, não são músicas).

# PALCO CONTROL — GUIA DO OPERADOR

Escrito para quem vai operar o som da peça, sem precisar programar.

---

## 1. Antes de tudo: o que vai acontecer

- O **notebook** abre a central (painel).
- Cada **celular** abre um link (ou lê um QR Code) e vira um microfone.
- A voz chega ao notebook pela rede Wi-Fi e sai na **caixa de som** ligada ao notebook.
- As músicas e os efeitos são tocados pelo próprio notebook. Nada é enviado para a internet.

## 2. Onde fica o sistema

Duas formas:

**A) No seu notebook (recomendado para a peça)**
Você mesmo inicia o programa. Veja o item 10.

**B) Publicado na internet**
Não é necessário para a peça. Se quiser testar, o servidor precisa ficar em uma hospedagem que mantenha a conexão aberta; o README explica os limites de cada opção gratuita. A hospedagem gratuita do Render dorme após 15 minutos sem tráfego, então **não use para a apresentação**.

## 3. Como abrir a central no notebook

1. Abra o terminal na pasta do projeto.
2. Digite `npm start` e aperte Enter.
3. O terminal mostra algo assim:

```
  Sala: PALCO     PIN: 4821
  Painel:  http://localhost:8787/
```

4. Abra o **Google Chrome** e digite `http://localhost:8787`.
5. Clique no botão grande **INICIAR ÁUDIO DA CENTRAL**. Isso é obrigatório: o navegador só libera o som depois de um clique.
6. Digite o **PIN** que aparece no terminal e clique em **ENTRAR NA CENTRAL**.

Pronto. O topo da tela deve mostrar **servidor conectado** com uma bolinha verde.

## 4. Como conectar cada celular

1. No notebook, na aba **MIXER**, clique em **+ NOVO MICROFONE**.
2. Aparece um **QR Code** e um link.
3. No celular: abra a câmera, aponte para o QR Code e toque no aviso que aparece. (Ou copie o link e cole no Chrome do celular.)
4. O celular pergunta se pode usar o microfone: toque em **Permitir**.
5. Na primeira vez o Chrome avisa que o certificado não é confiável: toque em **Avançado** → **Continuar para 192.168.x.x (não seguro)**.
6. No painel, o canal aparece com a etiqueta **LIVE** e o medidor se mexe quando alguém fala.

Repita para cada celular. Não há limite fixo: o limite é a sua rede Wi-Fi e o notebook. Quatro a seis celulares funcionam bem em Wi-Fi comum.

**Se o celular não conectar:** confira se ele está na mesma rede Wi-Fi do notebook e se o endereço no celular começa com `https://`. `http://` com número de IP não libera microfone.

## 5. Como gerar QR Codes de novo

Clique em **+ NOVO MICROFONE** sempre que precisar de um novo canal/link. Cada canal tem seu próprio link permanente: se o celular cair, o mesmo link reconecta o mesmo canal (o QR Code antigo continua valendo).

## 6. Como importar músicas

1. Aba **MÚSICAS** → **+ IMPORTAR MÚSICAS**.
2. Escolha um ou vários arquivos (MP3, WAV, OGG, M4A, FLAC…).
3. O arquivo é copiado para o banco local do navegador (IndexedDB) e fica disponível mesmo depois de fechar e abrir.
4. Para tocar: botão **▶** na linha da música.
5. O volume de cada música está na própria linha; o volume geral fica no mixer (**SAÍDA GERAL**).

Se o formato não for suportado pelo Chrome, aparece um aviso dizendo qual arquivo falhou. Converta para MP3 ou WAV.

## 7. Como importar efeitos

1. Aba **EFEITOS** → **+ IMPORTAR EFEITOS**.
2. Cada efeito ganha um botão grande **DISPARAR**.
3. Teclas **1 a 9** disparam os nove primeiros efeitos.
4. Os efeitos tocam **por cima** da música, sem interromper.
5. Cada efeito tem volume próprio, opção **repetir** (loop) e botão **PARAR**.
6. Para excluir um efeito: clique com o **botão direito** no cartão e confirme.

## 8. Como configurar os volumes (o jeito simples)

1. Deixe todos os faders dos microfones em ~70%.
2. Fale ao celular a uma distância normal (20–30 cm) e observe o medidor:
   - mexendo até a metade = bom;
   - batendo no fim e acendendo **CLIP** = alto demais (reduza volume ou ganho);
   - quase parado = baixo demais (aumente o ganho, em **GANHO E PROCESSAMENTO**).
3. Ajuste **SAÍDA GERAL** para o volume da caixa.
4. Use **MUTE** em quem não está em cena.
5. **SOLO** deixa só aquele microfone audível (útil para teste rápido).
6. Se a voz sair "estourando", abaixe o ganho antes de abaixar o volume — o compressor e o limitador seguram picos, mas não consertam microfone colado na boca.

### Sobre eco, ruído e ganho automático
No canal, em **GANHO E PROCESSAMENTO**, existem três caixas: **Eco**, **Ruído** e **Ganho auto**.
Elas mandam um pedido ao celular. Nem todo aparelho aplica: o próprio celular informa o que fez, e o painel mostra isso na linha `eco: sim/não · ruído: sim/não`.
O cancelamento de eco do celular ajuda, mas **não elimina microfonia**.

### Gate, compressor e limiter
- **Gate**: fecha o microfone quando ninguém fala (corta chiado de fundo). Comece desligado; se precisar, ligue e ajuste o limiar para -50 dB.
- **Compressor**: equilibra quem fala alto e quem fala baixo. Já vem ligado em -18 dB.
- **Limiter**: impede picos e distorção. Já vem ligado.

## 9. Como usar o crossfade (troca suave)

1. Aba **MÚSICAS**, no topo, escolha a duração do **Crossfade**: 1, 2, 3, 5, 10 segundos ou personalizado.
2. Toque a primeira música (▶).
3. Com ela tocando, toque **▶** na segunda música.
4. A primeira vai baixando e a segunda vai subindo ao mesmo tempo. Ao final, só a segunda fica tocando.

Botões úteis:
- **FADE OUT** no painel “TOCANDO AGORA” encerra a música atual suavemente na duração escolhida.
- **PARAR** encerra rápido (0,2 s, sem estalo).
- A barra de progresso pode ser clicada para pular para um ponto.
- **« 10 s** e **10 s »** voltam e avançam 10 segundos.

## 10. Caixa de som no Garuda Linux

**Cabo (P2, USB ou HDMI):** conecte. O Garuda usa a saída nova automaticamente. Se não usar, abra o **pavucontrol** (Controle de volume) → aba **Saída** → escolha a caixa.

**Bluetooth:**

1. Ligue a caixa no modo pareamento.
2. No Garuda, abra **Configurações → Bluetooth**, ative, selecione a caixa e conecte.
3. Confirme no **pavucontrol** que a saída está na caixa.
4. Abra o Chrome e a central **depois** de conectar a caixa.
5. Na central, aba **AJUSTES → SAÍDA DE ÁUDIO**, escolha a caixa (o Chrome permite escolher a saída; se não listar, use o seletor do sistema).

Bluetooth tem atraso de 100–300 ms. Para voz ao vivo, prefira cabo. Para música, Bluetooth funciona bem.

## 11. Iniciar o modo local (sem internet)

1. Ligue o roteador Wi-Fi (pode ser um celular no modo roteador, sem dados móveis).
2. Conecte o notebook e todos os celulares nessa rede.
3. No notebook, rode `npm run cert` uma vez (gera o certificado com o IP local).
4. Rode `npm start`.
5. No notebook, abra `https://localhost:8787` (aceite o aviso de certificado uma vez).
6. Gere os QR Codes normalmente. Os links usarão o IP local, por exemplo `https://192.168.43.10:8787/mic?...`.

Não é preciso internet para: interface, sinalização, músicas, efeitos, mixer. A internet só é usada pelo STUN (para descobrir o endereço externo) que, na mesma rede, normalmente nem é necessário.

**Aviso honesto:** o modo sem internet foi projetado para funcionar assim (o sistema não carrega nada da internet), mas eu **não pude testá-lo com os seus aparelhos**. Faça o teste do item 13 antes da peça.

### Se o celular não abrir o endereço do notebook
- Verifique se o notebook e o celular estão na mesma rede (o celular não pode estar nos dados móveis).
- Veja o IP no terminal e no celular digite `https://IP:8787`.
- Confira o firewall do Garuda: libere a porta 8787 (`sudo ufw allow 8787/tcp` se usar ufw).
- Alguns roteadores isolam os clientes entre si (AP isolation). Desligue essa opção ou use outro roteador/celular como roteador.

## 12. Cenas e deixas

1. Aba **CENAS** → **+ NOVA CENA**. Dê o nome (ex.: “Cena 1 — Abertura”).
2. Escreva a descrição e as observações.
3. Em **NOVA DEIXA**, escreva o texto, escolha a ação (tocar música, fade out, disparar efeito, silenciar microfone…), escolha o alvo e clique em **+ ADICIONAR**.
4. Durante a peça, selecione a cena e clique em **EXECUTAR DEIXA** (ou tecle **N**).
5. Cada clique executa **uma** deixa e anda para a próxima. Nada roda sozinho.

## 13. Teste completo antes da apresentação (30 minutos)

Faça nesta ordem, com o tempo real de ensaio:

1. Abra a central e clique em **INICIAR ÁUDIO DA CENTRAL**.
2. Conecte **um** celular Android e ouvir a voz na caixa.
3. Conecte **dois** celulares e fale nos dois ao mesmo tempo.
4. Conecte **três ou mais** e verifique estabilidade da rede.
5. Altere o volume de um canal e confirme que só ele muda.
6. Dê **MUTE** em um canal e confirme que os outros continuam.
7. Teste Eco / Ruído / Ganho automático e veja o que o aparelho informa.
8. Toque uma música.
9. Dispare um efeito com a música tocando.
10. Faça crossfade de 2 s e de 10 s.
11. Afastar um celular até cair e confirmar que os outros continuam.
12. Reconectar o mesmo celular pelo mesmo link.
13. Testar os 5 botões de emergência e os atalhos `M , . X R N`.
14. Deixe tudo rodando 30 minutos com música e microfones.
15. Aperte F5 no painel e confirme que tudo volta e os celulares reconectam.

Anote o resultado de cada item. Se algo falhar, corrija **antes** da peça e repita o teste.

## 14. Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Celular diz “microfone bloqueado” | Página em `http://` com IP | Use `https://` (item 10) e aceite o certificado |
| Canal fica OFFLINE | Wi-Fi caiu, tela apagou, aba fechada | Mantenha a aba aberta e a tela ligada; o mesmo link reconecta |
| Voz sai atrasada | Bluetooth | Use cabo |
| Apita (microfonia) | Caixa perto/atrás do microfone | Afaste a caixa, aponte para o público, reduza volume e ganho |
| Voz “estourando” | Ganho alto | Abaixe **Ganho** e o volume do canal; veja o LED CLIP |
| Volume baixo mesmo no máximo | Microfone longe ou aparelho com AGC estranho | Aproxime, aumente o ganho, teste outro celular |
| Nada sai na caixa | Saída errada | Aba AJUSTES → SAÍDA DE ÁUDIO, ou o seletor do sistema |
| “Servidor não encontrado” | `npm start` não está rodando | Rode de novo no terminal e abra o endereço mostrado |
| PIN incorreto | PIN do terminal | Use o PIN exibido ao iniciar; ou defina `PALCO_PIN` |
| Música não importa | Formato não suportado | Converta para MP3/WAV/OGG |
| “Arquivo não encontrado neste notebook” | Áudio apagado do navegador | Importe o arquivo novamente |
| A página recarregou sozinha | Isso não acontece por conta do sistema | Verifique extensões do Chrome e atualizações automáticas |

## 15. Atalhos de teclado

Padrão (podem ser trocados em **AJUSTES → ATALHOS**):

| Tecla | Ação |
| --- | --- |
| `M` | Silenciar todos os microfones |
| `,` | Parar todas as músicas |
| `.` | Parar todos os efeitos |
| `X` | Silenciar tudo |
| `R` | Retomar operação |
| `N` | Executar a próxima deixa da cena ativa |
| `1`…`9` | Disparar os primeiros efeitos |

Os atalhos são ignorados enquanto você digita em um campo de texto.

## 16. Exportar e importar configurações

Em **AJUSTES → ARMAZENAMENTO**:

- **EXPORTAR CONFIGURAÇÕES** baixa um arquivo `.json` com nomes, volumes, cenas, atalhos e a lista de músicas/efeitos.
- **IMPORTAR CONFIGURAÇÕES** restaura esse arquivo.

Os **arquivos de áudio não vão no JSON** (ficariam enormes): eles ficam somente no navegador do notebook. Em outro notebook, importe o JSON e depois importe os áudios novamente.

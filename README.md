# Gotinhas 💧

Site (PWA) para acompanhar a água que você e sua namorada bebem. Tem login, dupla por código, registro de copos, edição dos registros, calendário dos dois, água subindo no fundo e gotinhas que reagem ao progresso.

Ele roda direto no GitHub Pages, sem build nenhum: é HTML, CSS e JavaScript puro.

## Testar agora (modo demo)

Enquanto `js/firebase-config.js` estiver com `null`, o site roda em **modo demo**:
- tudo fica salvo só no navegador;
- uma "Ela (demo)" entra na dupla sozinha depois de 3 segundos, já com histórico.

Para abrir no seu PC:

```bash
cd gotinhas
python -m http.server 8000
```

Depois abra `http://localhost:8000`. Abrir o `index.html` com dois cliques não funciona, porque os módulos JS precisam de um servidor.

## Colocar no ar (grátis, sem cartão)

### 1. Firebase (plano Spark)
1. Entre em <https://console.firebase.google.com> e clique em **Criar projeto** (ex.: `gotinhas`). O Google Analytics pode ficar desligado.
   - Não precisa cadastrar cartão. Sem cartão, nunca há cobrança: se um limite estourar, o serviço só para até o dia seguinte.
2. Vá em **Authentication → Começar → Método de login** e ative:
   - **Google**
   - **E-mail/senha**
3. Vá em **Firestore Database → Criar banco de dados**:
   - Escolha o **modo de produção** e a região `southamerica-east1` (São Paulo).
   - Abra a aba **Regras**, apague o que estiver lá, cole todo o conteúdo de `firestore.rules` e clique em **Publicar**.
4. Vá em **Configurações do projeto (engrenagem) → Seus apps → `</>` (Web)**:
   - Dê um nome e registre o app. Não precisa marcar o Firebase Hosting.
   - Copie o objeto `firebaseConfig` e cole em `js/firebase-config.js`, trocando o `null`.
   - A `apiKey` pode ficar pública. Quem protege os dados são as regras do Firestore.

### 2. GitHub Pages
1. Crie um repositório (ex.: `gotinhas`) e suba todos os arquivos desta pasta.
2. Vá em **Settings → Pages → Build and deployment**:
   - Em Source, escolha **Deploy from a branch**.
   - Selecione a branch `main` e a pasta `/ (root)`, depois clique em **Save**.
3. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/gotinhas/`.

### 3. Autorizar o domínio no Firebase
Vá em **Authentication → Configurações → Domínios autorizados → Adicionar domínio** e adicione `SEU-USUARIO.github.io`. Sem isso, o login dá erro de domínio não autorizado.

### 4. Usar
1. **Você** entra e toca em **Criar dupla**. Aparece um código de 6 letras, que você manda pra ela pelo botão **Enviar código**.
2. **Ela** abre o link no **Safari do iPhone**, toca em **Compartilhar → Adicionar à Tela de Início** e abre pelo ícone da gotinha.
3. Ela cria uma conta com **e-mail e senha** e entra com o código.
   - No app instalado no iPhone, o login com Google por janela pode falhar. O e-mail é o caminho garantido.

## Como os dados ficam

```
users/{uid}                    nome, cor, metaMl, copoMl, inicio, fim, duplaId
users/{uid}/dias/AAAA-MM-DD    metaMl, totalMl, registros: [{ id, h: "HH:MM", ml }]
duplas/{id}                    membros: [uid, uid], codigo
codigos/{CODIGO}               duplaId, dono
```

- Cada dia guarda a própria meta, como na sua extensão. Mudar a meta não altera dias passados.
- As regras garantem que:
  - cada um só escreve nos próprios dados;
  - só quem está na mesma dupla consegue ler os dados do outro;
  - uma dupla tem no máximo 2 pessoas.

## Publicar uma atualização

Depois de mudar qualquer arquivo, aumente a versão em `sw.js` (`gotinhas-v1` → `gotinhas-v2`). Assim o celular baixa a versão nova em vez de usar o cache.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | Página única do app |
| `css/style.css` | Visual pixel art |
| `js/app.js` | Telas, navegação e ações |
| `js/store.js` | Dados: Firebase ou modo demo |
| `js/gota.js` | Mascote em pixel art e regra de humor |
| `js/firebase-config.js` | Onde você cola a configuração do Firebase |
| `firestore.rules` | Regras de segurança, para colar no console |
| `sw.js`, `manifest.webmanifest`, `icons/` | Partes do PWA (instalar e abrir offline) |

## Humor da gotinha

| Humor | Quando |
|---|---|
| Radiante | Meta batida |
| No ritmo | Acompanhando o horário |
| Tristinha | Mais de 15% atrás do esperado pra hora (a janela início–fim define o esperado) |
| Com sede | Abaixo de 30% depois que 20% da janela já passou |

## Fase 2: notificações (lembretes + cutucada), grátis

As notificações saem de um **Cloudflare Worker** (plano grátis, sem cartão), que fica entre o site e o Firebase.
Código: `worker/worker.js`.

### A. No Firebase
1. **Chave do push**:
   - Vá em ⚙️ Configurações do projeto → **Cloud Messaging** → **Certificados push da Web** → **Gerar par de chaves**.
   - Copie a chave e cole em `vapidKey` no `js/firebase-config.js`.
2. **Conta de serviço** (é o que deixa o Worker mandar notificações):
   - Vá em ⚙️ Configurações do projeto → **Contas de serviço** → **Gerar nova chave privada**. Isso baixa um arquivo `.json`.
   - ⚠️ Esse arquivo é **secreto**. Não suba no GitHub e não mande em chat; ele vai só no Cloudflare (passo B.3).

### B. No Cloudflare
1. Crie uma conta grátis em <https://dash.cloudflare.com/sign-up>.
2. Crie o Worker:
   - Vá em **Workers e Pages** → **Criar** → **Worker**, dê o nome `gotinhas` e clique em **Implantar**.
   - Clique em **Editar código**, apague o exemplo, cole todo o `worker/worker.js` e clique em **Implantar**.
3. No Worker, vá em **Configurações → Variáveis e segredos** e adicione:

   | Nome | Tipo | Valor |
   |---|---|---|
   | `FIREBASE_SA` | **Secret** | o conteúdo inteiro do `.json` baixado em A.2 |
   | `API_KEY` | Texto | a `apiKey` do `firebase-config.js` |
   | `SITE_ORIGIN` | Texto | `https://brendowhat.github.io` |

4. Ainda em **Configurações**, vá em **Gatilhos** → **Adicionar** → **Cron**, escreva `0 * * * *` (de hora em hora) e salve.
5. Copie o endereço do Worker (ex.: `https://gotinhas.SEU-USUARIO.workers.dev`) e cole em `workerUrl` no `js/firebase-config.js`.

### C. Ativar nos aparelhos
- **iPhone:**
  - Abra o app **pelo ícone da tela inicial**, vá em **Config → Notificações → Ativar notificações** e toque em **Permitir**.
  - Pelo Safari normal não funciona.
- **PC:** use os lembretes da extensão (fase 3). Não ative as notificações do site no Chrome do PC, senão chegam dois lembretes.

### Como funciona
- **Lembretes:**
  - Chegam de hora em hora (ou a cada 2 ou 3 horas, conforme a Config), dentro do seu horário.
  - Param quando você bate a meta.
  - Se ela já tiver batido, a mensagem avisa 😉.
- **Cutucada (anti-spam):**
  - No máximo 1 a cada 30 min e 5 por dia.
  - Só dentro do horário dela, e nunca se ela já bateu a meta.
  - Ela pode desligar em Config.
  - Quem controla isso é o Worker, então apertar o botão várias vezes não adianta.
- **Custo zero:** sem cartão cadastrado, não existe cobrança. Se um limite estourar, o serviço só para até o dia seguinte.

## Fase 3: extensão do Chrome

A pasta `extensao/` é a extensão nova, conectada à mesma conta do site.

**Para importar o histórico da extensão antiga "Meta de Água"**, substitua os arquivos **na mesma pasta** da antiga:
1. Copie tudo de `extensao/` pra dentro da pasta onde está a extensão antiga, sobrescrevendo os arquivos.
2. Abra `chrome://extensions` e clique em **↻ Recarregar** na extensão.

Assim o Chrome mantém os dados antigos e a extensão nova consegue importá-los. Se for uma instalação nova, use **Carregar sem compactação** e escolha a pasta `extensao/`.

**Pra conectar:**
1. Abra o popup e clique em **Conectar com minha conta**.
2. O site abre e mostra "Extensão conectada". Essa conexão usa o Worker da fase 2.
3. No primeiro acesso, os dias da extensão antiga sobem pro Firebase. Só sobem os dias que ainda não existem lá; nada é sobrescrito.

**O que a extensão tem:**
- Popup com o copo enchendo e os botões +copo, +500 e +outro.
- O progresso da sua dupla e os últimos 7 dias com ♥.
- O ícone mostra a % e fica verde quando você bate a meta.
- Lembretes no PC: seguem o seu horário e intervalo da Config e podem ser desligados no popup.

## Fase 4: conquistas e resumo

Já está no site, na aba **Conquistas**: 8 conquistas com barra de progresso, mais o **Resumo dos últimos 7 dias**. O campeão da semana é quem cumpriu a maior % da própria meta.

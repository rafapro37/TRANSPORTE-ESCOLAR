# ELEFANTE ROSA – Sistema de Gestão de Transporte Escolar

Aplicação web para administrar as três instalações (Carro 01, 02 e 03), escolas, responsáveis, alunos, veículos, passageiros, mensalidades, relatórios, usuários e backups.

## Requisitos

- Node.js 20 ou superior (recomendado: Node.js 22 LTS)
- npm
- Um diretório persistente e gravável pelo processo da aplicação para os dados

## Instalação local

```bash
npm install
cp .env.example .env.local
```

Gere uma chave secreta forte para assinar as sessões e configure-a em `.env.local`:

```bash
openssl rand -hex 32
```

Cole o resultado como valor de `AUTH_SESSION_SECRET`. Não compartilhe nem comite essa chave. O servidor de produção se recusa a iniciar operações autenticadas sem ela; ela precisa permanecer igual entre reinícios e em todas as instâncias do aplicativo.

Exemplo de `.env.local`:

```dotenv
AUTH_SESSION_SECRET="cole-aqui-o-resultado-de-openssl-rand-hex-32"
ELEFANTE_DATA_DIR="./server-data/installations"
```

`ELEFANTE_DATA_DIR` é opcional. Se não for definido, os dados são gravados em `server-data/installations` dentro do projeto. Cada instalação tem seu próprio banco JSON, arquivos privados e backups. Faça backups regulares e use armazenamento persistente: o disco local efêmero de plataformas serverless não é adequado para guardar esses dados.

Inicie em desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000), selecione o carro e cadastre o primeiro administrador. O primeiro cadastro em cada carro cria o administrador daquela instalação.

## Validar o sistema

```bash
npm test       # testes unitários e de armazenamento
npm run lint   # análise estática
npx tsc --noEmit
npm run build  # compilação de produção
```

Para executar a versão compilada:

```bash
npm run start
```

Por padrão, o servidor escuta na porta 3000; a variável `PORT` pode alterá-la. Configure `AUTH_SESSION_SECRET` e `ELEFANTE_DATA_DIR` também no ambiente do processo de produção.

## Segurança e operação

- Cada instalação é isolada; os dados não são compartilhados entre os três carros.
- A sessão usa cookie HttpOnly e assinatura HMAC. Preserve a mesma `AUTH_SESSION_SECRET` para não invalidar sessões existentes.
- Os dados operacionais e anexos ficam no servidor; proteja e faça backup do diretório de dados.
- A configuração de backup automático é acionada durante requisições autenticadas ao painel. Para retenção durável, mantenha o diretório de dados em volume persistente.
- O aplicativo não depende de chave Gemini para as funções de gestão atuais.

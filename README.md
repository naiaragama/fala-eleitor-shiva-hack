# Fala Eleitor - MVP

Aplicação para acompanhamento de deputados federais do RJ via WhatsApp, usando APIs governamentais, PostgreSQL e Tess AI.

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  WhatsApp   │────▶│  Webhook     │────▶│   Tess AI       │
│  (usuário)  │◀────│  Express.js  │◀────│   (Pareto)      │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    │  (Replit/    │
                    │   Neon)      │
                    └──────▲───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌───▼────┐
        │ API      │ │ Portal   │ │ TSE    │
        │ Câmara   │ │ Transp.  │ │ Dados  │
        └──────────┘ └──────────┘ └────────┘
```

## Candidatos do MVP

| Nome | ID | Partido | Status |
|------|-----|---------|--------|
| Talíria Petrone | 204464 | PSOL | Em exercício |
| Daniela do Waguinho | 204459 | UNIÃO | Em exercício |
| Glauber Braga | 152605 | PSOL | Cassado (dez/2024) |
| Doutor Luizinho | 204450 | PP | Em exercício |

## APIs Governamentais

| API | URL | Auth | Dados |
|-----|-----|------|-------|
| Câmara dos Deputados | `dadosabertos.camara.leg.br/api/v2` | Nenhuma | Perfil, despesas, proposições, presença, comissões |
| Portal da Transparência | `api.portaldatransparencia.gov.br` | API Key | Remuneração, viagens |
| TSE Dados Abertos | `dadosabertos.tse.jus.br` | Nenhuma | Patrimônio, filiações, resultados eleitorais |

## Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Criar banco e tabelas
createdb fiscaliza_rj
npm run db:migrate

# 4. Popular deputados do MVP
npm run db:seed

# 5. Sincronizar dados das APIs
npm run sync

# 6. Iniciar servidor
npm run dev
```

## Deploy no Replit

1. Importe o repositório no Replit
2. O Replit provisiona PostgreSQL automaticamente (DATABASE_URL)
3. Configure os Secrets: `TESS_API_KEY`, `TESS_AGENT_ID`, `WA_*`
4. O `.replit` já está configurado para rodar

## Modelagem do Banco

Tabelas principais com índices otimizados:
- `deputados` - perfil base (índice trigram para busca por nome)
- `despesas` - cota parlamentar (índice composto deputado+ano+mês)
- `proposicoes` - projetos de lei (índice trigram na ementa)
- `eventos` - presença em sessões
- `frentes` / `deputado_frentes` - frentes parlamentares (N:N)
- `orgaos_participacao` - comissões
- `remuneracao` - salário e auxílios
- `filiacoes` - histórico partidário
- `patrimonio` - bens declarados
- `conversas` - histórico do chat WhatsApp
- `mv_resumo_deputados` - materialized view para queries rápidas

## Endpoints

```
GET  /api/deputados                    # Lista candidatos
GET  /api/deputados/:id/completo       # Todos os dados agregados
GET  /api/deputados/:id/perfil         # Perfil
GET  /api/deputados/:id/despesas       # Cota parlamentar
GET  /api/deputados/:id/proposicoes    # Projetos de lei
GET  /api/deputados/:id/eventos        # Presença
GET  /api/deputados/:id/frentes        # Frentes parlamentares
GET  /api/deputados/:id/orgaos         # Comissões
POST /api/webhook/whatsapp             # Webhook WhatsApp (Meta)
POST /api/webhook/evolution            # Webhook Evolution API
POST /api/webhook/chat-test            # Teste sem WhatsApp
GET  /api/health                       # Status
```

## Tess AI

O agente usa a API compatível com OpenAI da Tess AI (`api.tess.im`).
Ele recebe a pergunta do usuário, busca contexto no banco PostgreSQL,
e gera uma resposta enriquecida com dados reais.

## WhatsApp

Suporta dois modos:
- **Meta Business API** - produção (requer conta business verificada)
- **Evolution API** - desenvolvimento (open source, self-hosted)

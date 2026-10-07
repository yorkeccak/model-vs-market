# Model vs Market

Three AI decision models read today's news and price live Polymarket and Kalshi questions, then we show where they disagree with real money.

![Model vs Market](docs/screenshot.png)

## How it works

- For each question, [Valyu](https://valyu.ai) search pulls recent news articles. The models never see the market odds.
- Three decision models (OpenAI Decisions, TypeSafe Jev, Cloudflare Clef) each turn that evidence into a probability.
- The board compares every model with the market price and replays how each probability moved, article by article.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in the keys below
pnpm dev
```

| Variable | Where to get it |
| --- | --- |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| `VALYU_API_KEY` | [platform.valyu.ai](https://platform.valyu.ai) |
| `AI_GATEWAY_API_KEY` | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard, API token with Workers AI access |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard |

## Built with

Next.js 16, Valyu, OpenAI Decisions API, TypeSafe Jev via Vercel AI Gateway, Cloudflare Clef on Workers AI, and the Polymarket and Kalshi public APIs.

Not financial advice.

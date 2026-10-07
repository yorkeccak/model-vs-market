# Model vs Market

**Live: [model-vs-market.vercel.app](https://model-vs-market.vercel.app)**

The best way to test AI decision models: make them predict the future.

Three decision models (OpenAI Decisions, TypeSafe Jev, Cloudflare Clef) read recent news, never the odds, and put a probability on any question. The site compares them with live Polymarket and Kalshi prices and replays how each model changed its mind, article by article.

![Model vs Market: three AI decision models priced against live prediction markets](docs/screenshot.png)

## Run it

```bash
pnpm install
cp .env.example .env.local   # add your keys
pnpm dev
```

| Key                                             | Used for               | Get one                                                                                                     |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                | OpenAI Decisions API   | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)                                        |
| `VALYU_API_KEY`                                 | News search            | [platform.valyu.ai](https://platform.valyu.ai)                                                              |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Clef on Workers AI     | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) (Workers AI token) |
| `TYPESAFE_API_KEY` **or** `AI_GATEWAY_API_KEY`  | Jev (either one works) | [typesafe.ai](https://typesafe.ai) or [Vercel AI Gateway](https://vercel.com/ai-gateway)                    |

Jev uses TypeSafe's API directly when `TYPESAFE_API_KEY` is set, otherwise it goes through Vercel AI Gateway.

## Powered by Valyu

All evidence comes from [Valyu](https://valyu.ai), the search and research API for knowledge work. It excels at deep research across financial services, forecasting and the sciences, combining the live web with proprietary sources like SEC filings, financial data, academic papers and clinical trials.

## How it works

1. **Markets.** The board pulls the most-traded open questions from Polymarket. Search covers Polymarket and Kalshi, or you can ask your own question.
2. **Evidence.** [Valyu](https://valyu.ai) search finds the last 60 days of news. Anything quoting odds or betting markets is removed first, because these models copy the market price if they can see it.
3. **Decisions.** Each model returns P(YES), then is asked again with articles 1..k for every k. That replay shows which article moved which model.

## Deploy

Import the repo into [Vercel](https://vercel.com/new) and add the keys above, plus `CRON_SECRET` (any long random string).

- The board refreshes every 15 minutes via Vercel Cron (`vercel.json`) and is shared by every visitor through the Vercel Runtime Cache.
- Answers are cached for 30 minutes, and new questions are rate limited per IP. `MAX_DAILY_ANALYSES` caps fresh analyses per day (default 10,000).

## Stack

Next.js 16, React 19, Tailwind CSS 4, AI SDK 7 and the public Polymarket and Kalshi APIs.

Not financial advice. [MIT licensed](LICENSE).

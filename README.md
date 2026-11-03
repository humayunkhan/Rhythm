<div align="center">

# 〰 Rhythm

### The AI-assisted perfume studio

**Compose a fragrance that has never existed.** Tell Rhythm the notes you love and how you want to feel. It remixes time-tested accords into new formulas, then shows you how each one will open, unfold and fade on skin.

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-API-e36002?logo=hono&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20D1-f38020?logo=cloudflare&logoColor=white)

[Features](#features) · [Screenshots](#a-tour-of-the-studio) · [How it works](#how-the-engine-works) · [Tech stack](#tech-stack) · [Getting started](#getting-started)

<br>

<img src="docs/screenshots/home.png" alt="Rhythm home page: Compose a fragrance that has never existed" width="100%">

</div>

---

## What is Rhythm?

Accords are the building blocks of every fragrance. Rhythm is a web app that learns how notes and accords combine, then guides you from a feeling to a finished, balanced formula. You stay in charge: you choose the notes, set the character, react to what it dreams up and fine-tune every dose.

Inspired by the idea behind [Deep Dream Generator](https://deepdreamgenerator.com), Rhythm treats perfume creation as a conversation between a person's taste and a generative engine.

## Features

| | |
| --- | --- |
| 🎡 **Fragrance wheel** | Pick two or more notes you already love from an interactive wheel of 12 olfactive families and 110 notes. |
| ✨ **Dream generations** | Rhythm composes four candidate perfumes at a time. Steer them (fresher, warmer, softer…), like or reject them, and each new generation reshapes itself around your taste. |
| ⏱ **Formula Studio** | The heart of Rhythm. Watch your perfume evolve hour by hour on skin, with a live timeline, harmony and structure scores and a note pyramid. |
| 🌬 **Sillage and projection** | Original visualisations show how far the scent trail reaches and how it projects at conversation distance, at any moment of the day. |
| ⚖️ **Score coach and balancer** | One-tap suggestions swap, add or re-dose notes, with indicative IFRA limits enforced on everything. |
| 🧑‍🔬 **AI perfumer** | Ask an LLM perfumer to critique your formula and propose exact dose changes. Nothing changes until you apply them. |
| 🧪 **Lab bench** | Notes are grouped into the accords they form, weighed from your own stock dilutions, with a printable lab sheet for any batch size. |
| 🍾 **Identity and packaging** | AI-assisted names, stories, bottle shapes, colours, caps and boxes, rendered live as you design. |
| 📚 **Notes and accords catalogue** | Every note has performance metrics, use levels, pairings and the accords and well-known perfumes it appears in. |
| 🔐 **Accounts and admin** | Sign in with Google, Apple or email. An admin portal manages users, formulas and catalogue imports. |
| 🔑 **Bring your own AI** | Users can plug in their own Claude key or any OpenAI-compatible server, encrypted at rest. |
| 🌗 **Light and dark themes** | Designed for both, with a device-matching default. Installable and cached for fast repeat visits. |

## A tour of the studio

### 1. Choose the notes you love

Spin the fragrance wheel or search the catalogue. Hover any note for its profile, performance and best partners.

<img src="docs/screenshots/wizard-wheel.png" alt="The fragrance wheel with Bergamot and Rose chosen" width="100%">

### 2. Guide the dream

Rhythm builds four compositions around your brief. Every steer pushes the next generation further in that direction.

<img src="docs/screenshots/dream.png" alt="Dream generation with steering controls and four candidate perfumes" width="100%">

### 3. Perfect it in the Formula Studio

See the day on skin before you mix a drop. Each band is a note, sized by how strongly you smell it from the first spray to the last trace.

<img src="docs/screenshots/studio-timeline.png" alt="Formula Studio timeline showing how each note fades over 24 hours" width="100%">

<table>
<tr>
<td width="50%"><img src="docs/screenshots/studio-performance.png" alt="Sillage and projection visualisations"><p align="center"><sub><b>Sillage and projection</b> at the selected hour</sub></p></td>
<td width="50%"><img src="docs/screenshots/studio-ai.png" alt="AI perfumer and score coach"><p align="center"><sub><b>AI perfumer and score coach</b> with one-tap fixes</sub></p></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/studio-bench.png" alt="Lab bench grouping notes into accords"><p align="center"><sub><b>Lab bench</b>: doses grouped by accord, weighed from your dilutions</sub></p></td>
<td width="50%"><img src="docs/screenshots/studio-dark.png" alt="Formula Studio in dark theme"><p align="center"><sub><b>Dark theme</b></sub></p></td>
</tr>
</table>

### 4. Give it an identity

Pick a concept, then fine-tune the name, bottle, colours, packaging and concentration.

<img src="docs/screenshots/identity.png" alt="Identity designer with bottle, box and three concepts" width="100%">

### 5. Explore the catalogue

<table>
<tr>
<td width="50%"><img src="docs/screenshots/note-detail.png" alt="Rose note detail page"><p align="center"><sub><b>Note detail</b>: performance, use levels and pairings</sub></p></td>
<td width="50%"><img src="docs/screenshots/accords.png" alt="Accords catalogue"><p align="center"><sub><b>Accords catalogue</b> with generated artwork</sub></p></td>
</tr>
</table>

## How the engine works

```mermaid
flowchart LR
    A[Your notes, mood<br>and brief] --> B[Note embeddings<br>learned from accords<br>and perfume pyramids]
    B --> C[Dream generator<br>4 candidates per round]
    C -- like, reject, steer --> C
    C --> D[Balancer<br>dose ranges + IFRA caps]
    D --> E[Simulator<br>evaporation, sillage,<br>projection over 24 h]
    E --> F[Formula Studio]
    G[LLM perfumer<br>optional] -.-> F
```

- **Training.** `npm run train` builds a note co-occurrence matrix over the corpus, applies PPMI and factorises it into 24-dimension note embeddings in `shared/generated/model.json`.
- **Generation.** Runs entirely in the browser. Notes are chosen by learned affinity, mood, brief and the user's taste profile.
- **Balancing.** The balancer enforces typical dose ranges and indicative IFRA limits on every formula, including those proposed by the LLM.
- **Simulation.** Each note's volatility, strength and dose drive the timeline, sillage, projection and "which notes remain" views.
- **LLM layer.** A self-hosted OpenAI-compatible model (or Claude) powers the AI perfumer and brand concepts. Replies are schema-validated, and the built-in engine answers if the model is unavailable.
- **Artwork.** Note, accord and bottle art is generated procedurally in the browser, not by an image model.

The corpus in `shared/data/` is original and hand-authored. Nothing was scraped, and no proprietary formulas are included.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8, TypeScript |
| API | [Hono](https://hono.dev) on Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite), with migrations in `migrations/` |
| AI | Self-hosted OpenAI-compatible LLM or Claude, with an in-browser generative engine |
| Auth | Email and password, Google and Apple sign-in |
| Validation | Zod |
| Testing | Vitest |
| Caching | Immutable hashed assets, a service worker and edge-cached public API responses |

Every library is free and open source. The LLM layer is optional.

## Project structure

```
├── src/                  React app
│   ├── pages/            Home, Create wizard, Catalogue, Account, Dilutions, Admin, Terms
│   └── components/       Studio, Wheel, Dream, Bench, Identity, Bottle, visualisations
├── server/               Hono API: auth, AI, user AI keys, admin
├── shared/
│   ├── engine/           Generation, balancing, simulation, branding, dilution
│   ├── data/             Notes, accords and perfume pyramids
│   └── generated/        Trained note embeddings
├── functions/            Cloudflare Pages Functions entry
├── migrations/           D1 schema
├── scripts/train.ts      Model training
└── tests/                Engine and API tests
```

## Getting started

Requires **Node 24**.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run pages:dev
```

Open <http://localhost:8788>. The command builds the app, applies database migrations locally and serves the app and API together.

```bash
npm test
```

Every secret is optional: features without their keys are hidden or fall back to the built-in engine. See **[docs/SETUP.md](docs/SETUP.md)** for configuring sign-in providers, the AI layer, the admin account and deploying to Cloudflare Pages.

## Disclaimer

Formulas created on Rhythm, and everything created with them, are fully owned by Rhythm and its owners. No one may claim trademarks, copyrights or other rights in them. See the in-app **Terms and disclaimer**.

Performance figures are modelled estimates, and IFRA figures are indicative only. Always verify against the current [IFRA Standards](https://ifrafragrance.org/) and your supplier's certificates before making or selling a fragrance.

<div align="center">
<br>
<sub>Made with care for perfumers, dreamers and the curious.</sub>
</div>

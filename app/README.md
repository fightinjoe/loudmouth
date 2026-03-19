# Loudmouth

A mobile-first flashcard app for Chinese and Japanese vocabulary.

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:5173`. The app uses hash-based routing:

| Route | Screen |
|---|---|
| `#home` | Home (deck list) |
| `#import` | Import cards from JSON |
| `#review?deckId=<id>` | Tap-to-flip review |
| `#browse?deckId=<id>` | Scrollable card list |

## Build

```bash
npm run build
```

Output goes to `dist/`. Includes a service worker for offline use.

## Preview production build

```bash
npm run preview
```

## Testing on iOS Safari

To test PWA installability ("Add to Home Screen"):

1. `npm run build`
2. Serve `dist/` over HTTPS (e.g. via ngrok or a deployment)
3. Open in iOS Safari → Share → Add to Home Screen

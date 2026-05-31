# Veraya — Mobile App

React Native app built with Expo SDK 52 + Expo Router, connecting to the Next.js backend.

## Setup

```bash
cd mobile
npm install
```

Create `.env.local` from `.env.example` and set your backend URL:
```
EXPO_PUBLIC_API_URL=http://YOUR_MACHINE_IP:3000
```

**Find your IP:** `ipconfig getifaddr en0` (macOS) — use the LAN IP, not localhost, so physical devices can connect.

## Running

```bash
npm start          # Expo Go (scan QR with your phone)
npm run ios        # iOS Simulator
npm run android    # Android Emulator
```

## Production Build (EAS)

```bash
npm install -g eas-cli
eas login
eas build --platform all   # Builds for App Store + Play Store
```

## Features

| Screen | What it does |
|--------|-------------|
| **Home** | Dashboard — sales, open orders, low stock |
| **POS** | Floor plan, new orders, barcode scan to add items, close checks |
| **Kitchen** | Live KDS — mark items sent/done, bump orders |
| **Inventory** | Stock levels, scan barcode to check quantity instantly |
| **Invoices** | Receive purchase orders, scan each item, generate PDF invoice |

## Auth
The mobile app calls `POST /api/mobile/auth` on the Next.js server, which returns a NextAuth-compatible JWT. This token is stored in `expo-secure-store` and sent as a cookie with every API request — so all existing API routes work without modification.

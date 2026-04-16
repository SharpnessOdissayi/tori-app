# @workspace/mobile-owner-app

Native iOS + Android shell for the business-owner dashboard.

- iOS bundle ID: `net.kavati.owner`
- Android package: `net.kavati.owner`
- Loads: `https://www.kavati.net/dashboard` at runtime
- Offline fallback: `www/index.html`

## Quick start

```bash
pnpm install
pnpm cap:add:ios       # first time only
pnpm cap:add:android   # first time only
pnpm cap:sync
```

## Daily

```bash
pnpm android:build   # opens Android Studio
pnpm ios:build       # opens Xcode (Mac only)
```

## Full publishing guide

See [MOBILE_APP_GUIDE.md](./MOBILE_APP_GUIDE.md) for end-to-end App Store
+ Play Store instructions.

## Directory layout after `cap:add`

```
artifacts/mobile-owner-app/
├── capacitor.config.ts      ← app config (edit here)
├── www/                      ← offline fallback (don't touch)
├── ios/                      ← created by cap add ios
└── android/                  ← created by cap add android
```

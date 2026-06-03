# Shipping Veraya to TestFlight

This is the path to installing/updating the app **without a cable to your Mac**.
Everything is scaffolded — the only blocker is the **Apple Developer Program**
membership ($99/yr). Once enrolled, this is ~30 min of mostly-automated steps.

## One-time setup (after enrolling)

1. **Enroll** in the Apple Developer Program: https://developer.apple.com/programs/enroll/
   (Use the same Apple ID as `tylshe@gmail.com`, or update `eas.json` → `submit.production.ios.appleId`.)

2. **Find your Apple Team ID**: https://developer.apple.com/account → Membership details →
   "Team ID" (10 chars). Put it in `eas.json` → `submit.production.ios.appleTeamId`.

3. **Create the app record** in App Store Connect: https://appstoreconnect.apple.com →
   Apps → "+" → New App.
   - Platform: iOS
   - Name: Veraya
   - Bundle ID: `com.restaurantops.tylshe` (already this app's id)
   - SKU: anything unique, e.g. `veraya-001`
   After creating, open the app → App Information → copy the **Apple ID** number
   (that's the `ascAppId`). Put it in `eas.json` → `submit.production.ios.ascAppId`.

## Each release (repeatable)

From `mobile/`:

```bash
# 1. Build a signed store binary in the cloud (EAS handles certs/provisioning).
CI=1 npx eas-cli@latest build --platform ios --profile production

# 2. Upload it to TestFlight.
CI=1 npx eas-cli@latest submit --platform ios --profile production --latest
```

EAS will prompt to log into your Apple account once and create the
distribution certificate + App Store provisioning profile automatically.

After the upload, the build appears in App Store Connect → TestFlight in a few
minutes (after Apple's processing). Add yourself/staff as testers and install
via the **TestFlight app** on each device.

## How OTA fits with TestFlight

- TestFlight builds run on the **`production`** EAS Update channel (set in
  `eas.json`), separate from the cabled dev build's **`preview`** channel.
- After a TestFlight build is installed, JS-only changes still ship instantly:
  ```bash
  CI=1 npx eas-cli@latest update --branch production --platform ios -m "msg"
  ```
- A new **native** build (added native module, permission, SDK bump) requires a
  fresh `eas build` + `submit` and a version bump — same as the cabled flow.

## Notes

- `runtimeVersion` policy is `appVersion`, so each app version (currently
  `1.0.1`) is its own OTA runtime. Keep the production build's version in sync
  with the updates you publish to the `production` branch.
- `autoIncrement: true` bumps the iOS build number automatically each `eas build`.

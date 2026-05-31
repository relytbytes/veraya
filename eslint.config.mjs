import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These two react-hooks v6 rules flag idiomatic patterns this app relies on
    // heavily — fetch-on-mount effects and form-reset-on-open dialogs — none of
    // which are bugs. Kept as warnings (still visible) rather than errors so they
    // don't block CI. TODO: revisit with a dedicated effect-refactor pass.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The mobile app is a separate Expo/React Native project with its own
    // toolchain and conventions (e.g. require() in metro/tailwind config).
    // Linting it with the Next.js web config produces false positives.
    "mobile/**",
    // Generated Prisma client — never hand-edited, don't lint.
    "app/generated/**",
  ]),
]);

export default eslintConfig;

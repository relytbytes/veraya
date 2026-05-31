const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = getDefaultConfig(__dirname);

// Proxy /api/* requests to the Next.js server (port 3000).
// This lets the Expo ngrok tunnel handle both the JS bundle AND API calls —
// no second tunnel required for remote testing.
config.server = {
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/auth/")) {
        return createProxyMiddleware({
          target: "http://localhost:3000",
          changeOrigin: true,
        })(req, res, next);
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });

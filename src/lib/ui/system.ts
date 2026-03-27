import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  globalCss: {
    "html, body": {
      minHeight: "100%",
      margin: 0,
      color: "whiteAlpha.900",
      background:
        "radial-gradient(circle at top left, rgba(161,33,65,0.24), transparent 28%), linear-gradient(180deg, #130d11 0%, #09070a 52%, #050507 100%)",
      fontFeatureSettings: '"ss01" 1',
    },
    body: {
      fontFamily: "body",
    },
    "::selection": {
      background: "#a12141",
      color: "#fff7fa",
    },
  },
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: "#fff1f6" },
          100: { value: "#ffd7e3" },
          200: { value: "#ffadc4" },
          300: { value: "#ff82a4" },
          400: { value: "#f35984" },
          500: { value: "#d63a63" },
          600: { value: "#a12141" },
          700: { value: "#7f1932" },
          800: { value: "#5b1023" },
          900: { value: "#3a0815" },
        },
        canvas: {
          950: { value: "#070709" },
          900: { value: "#111116" },
          850: { value: "#17171d" },
          800: { value: "#1d1d26" },
          700: { value: "#2a2a36" },
        },
      },
      fonts: {
        heading: { value: "var(--font-space-grotesk)" },
        body: { value: "var(--font-manrope)" },
      },
      radii: {
        sm: { value: "0.375rem" },
        md: { value: "0.5rem" },
        lg: { value: "0.625rem" },
        xl: { value: "0.875rem" },
        "2xl": { value: "1.125rem" },
      },
      shadows: {
        panel: { value: "0 22px 60px rgba(0, 0, 0, 0.38)" },
      },
    },
    semanticTokens: {
      colors: {
        panel: { value: "#121219" },
        muted: { value: "#8f90a0" },
        border: { value: "rgba(255,255,255,0.08)" },
        accent: { value: "#a12141" },
        accentMuted: { value: "rgba(161,33,65,0.18)" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

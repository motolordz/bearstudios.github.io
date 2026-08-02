import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#122B33",
        teal: { DEFAULT: "#0E7B71", dark: "#0A5F58", light: "#E4F3F1" },
        gum: "#C6532B",
        paper: "#FAF8F4",
        ledger: "#E8E3D9",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(18,43,51,0.06), 0 8px 24px rgba(18,43,51,0.07)",
      },
    },
  },
  plugins: [],
};
export default config;

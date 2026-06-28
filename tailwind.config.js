/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./templates/**/*.html"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", surface: "var(--surface)", "surface-2": "var(--surface-2)",
        border: "var(--border)", text: "var(--text)", muted: "var(--text-muted)",
        glacier: "var(--glacier)", "alp-1": "var(--alpenglow-1)",
        "alp-2": "var(--alpenglow-2)", "alp-3": "var(--alpenglow-3)"
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"]
      },
      maxWidth: { content: "72rem" }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface0: "#1a1612",
        surface1: "#100d0a",
        surface2: "#241f19",
        surface3: "#2e2820",
        border: "rgba(245,158,11,0.08)",
        borderStrong: "rgba(245,158,11,0.16)",
        primary: "#f0ebe3",
        secondary: "#c4b8a8",
        muted: "#8a7e6e",
        faint: "#5a5044",
        accent: "#f59e0b",
        accentHover: "#fbbf24",
        accentLight: "rgba(245,158,11,0.08)",
        success: "#34d399",
        warning: "#f59e0b",
        danger: "#f87171",
        info: "#38bdf8",
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','"Segoe UI"','Roboto','sans-serif'],
        mono: ['"SF Mono"','"Cascadia Code"','Consolas','monospace'],
      },
      borderRadius: { sm: "6px", DEFAULT: "12px", lg: "16px" },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.3)",
        DEFAULT: "0 2px 8px rgba(0,0,0,0.3)",
        md: "0 4px 12px rgba(0,0,0,0.35)",
        focus: "0 0 0 2px #100d0a, 0 0 0 4px #f59e0b",
      },
    },
  },
  plugins: [],
};
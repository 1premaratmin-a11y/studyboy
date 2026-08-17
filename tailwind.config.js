/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface0: "#16130e",
        surface1: "#0d0b08",
        surface2: "#1e1a13",
        surface3: "#2a241b",
        border: "rgba(245,158,11,0.10)",
        borderStrong: "rgba(245,158,11,0.20)",
        primary: "#f5f0e8",
        secondary: "#b8aea0",
        muted: "#8a8074",
        faint: "#5c5448",
        accent: "#f59e0b",
        accentHover: "#fbbf24",
        accentLight: "rgba(245,158,11,0.10)",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#06b6d4",
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','"Segoe UI"','Roboto','"Helvetica Neue"','sans-serif'],
        mono: ['"SF Mono"','"Cascadia Code"','Consolas','monospace'],
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", lg: "10px" },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.4)",
        DEFAULT: "0 2px 6px rgba(0,0,0,0.35)",
        md: "0 4px 12px rgba(0,0,0,0.4)",
        lg: "0 8px 24px rgba(0,0,0,0.5)",
        focus: "0 0 0 2px #0d0b08, 0 0 0 4px #f59e0b",
      },
    },
  },
  plugins: [],
};
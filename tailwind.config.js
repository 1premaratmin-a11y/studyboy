/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark surface ramp — same class names, dark values
        surface0: "#131318",   // cards / panels (was #ffffff)
        surface1: "#0a0a0f",   // app background (was #f8f9fa)
        surface2: "#1a1a22",   // sidebar / secondary bg (was #f1f3f5)
        surface3: "#22222e",   // hover / disabled bg (was #e9ecef)
        border: "rgba(255,255,255,0.08)",
        borderStrong: "rgba(255,255,255,0.14)",
        // Text — inverted for dark
        primary: "#e4e4e7",    // was #212529
        secondary: "#a1a1aa",  // was #495057
        muted: "#71717a",      // was #868e96
        faint: "#52525b",      // was #adb5bd
        // Accent — indigo
        accent: "#6366f1",
        accentHover: "#818cf8",
        accentLight: "rgba(99,102,241,0.12)",
        // Semantic — brightened for dark bg
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#06b6d4",
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"SF Mono"', '"Cascadia Code"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        lg: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.3)",
        DEFAULT: "0 2px 8px rgba(0,0,0,0.3)",
        md: "0 4px 16px rgba(0,0,0,0.35)",
        lg: "0 8px 32px rgba(0,0,0,0.4)",
        focus: "0 0 0 2px #0a0a0f, 0 0 0 4px #6366f1",
      },
    },
  },
  plugins: [],
};
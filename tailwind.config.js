/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral surface ramp
        surface0: "#ffffff",
        surface1: "#f8f9fa",
        surface2: "#f1f3f5",
        surface3: "#e9ecef",
        border: "#dee2e6",
        borderStrong: "#ced4da",
        // Text
        primary: "#212529",
        secondary: "#495057",
        muted: "#868e96",
        faint: "#adb5bd",
        // Accent
        accent: "#3b82f6",
        accentHover: "#2563eb",
        accentLight: "#eff6ff",
        // Semantic
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
        sm: "6px",
        DEFAULT: "8px",
        lg: "12px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.05)",
        DEFAULT: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.05)",
        lg: "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05)",
        focus: "0 0 0 2px #fff, 0 0 0 4px #3b82f6",
      },
    },
  },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#111418",
        gold: "#c4a035",
        paper: "#f3f0e8",
        night: "#0f1216",
      },
      fontFamily: {
        sans: ["DM Sans", "Segoe UI", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

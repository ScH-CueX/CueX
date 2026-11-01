/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  },
  theme: {
    extend: {
      colors: {
        ground: {
          DEFAULT: "var(--ground, #ecede8)",
          2: "var(--ground-2, #e2e4de)",
          3: "var(--ground-3, #d6d9d2)",
        },
        surface: "var(--surface, #f6f6f2)",
        ink: {
          DEFAULT: "var(--ink, #141716)",
          2: "var(--ink-2, #4a504d)",
          3: "var(--ink-3, #585e5b)",
          hover: "var(--ink-hover, #2a2f2d)",
        },
        line: {
          DEFAULT: "var(--line, #c9ccc5)",
          strong: "var(--line-strong, #a9ada6)",
        },
        plaster: "var(--plaster, #d9d6ce)",
        held: {
          DEFAULT: "var(--held, #d2461e)",
          ink: "var(--held-ink, #a8340f)",
          tint: "var(--held-tint, #f3ddd3)",
        },
        resolved: {
          DEFAULT: "var(--resolved, #28604f)",
          tint: "var(--resolved-tint, #d9e6e0)",
        },
      },
      fontFamily: {
        doctor: ["Noto Serif SC", "Songti SC", "STSong", "serif"],
        ui: ["Noto Serif SC", "Songti SC", "STSong", "serif"],
        sans: ["Noto Serif SC", "Songti SC", "STSong", "serif"],
        mono: ["Noto Serif SC", "Songti SC", "STSong", "serif"],
      },
      borderRadius: {
        DEFAULT: "2px",
        none: "0",
        sm: "2px",
        md: "2px",
        lg: "2px",
      },
      lineHeight: {
        tight: "1.12",
        ui: "1.5",
        read: "1.7",
      },
      transitionTimingFunction: {
        "out-custom": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-custom": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      transitionDuration: {
        press: "140ms",
        ui: "220ms",
        state: "480ms",
        withdraw: "640ms",
      },
    },
  },
  plugins: [],
};

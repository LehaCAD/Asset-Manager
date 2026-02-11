import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: ["aspect-vertical"],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f0f1f3',
          hover: '#e9ecef',
          border: '#e2e4e9',
        },
        accent: {
          DEFAULT: '#6c5ce7',
          hover: '#5a4bd1',
          subtle: 'rgba(108, 92, 231, 0.08)',
        },
        txt: {
          primary: '#1a1a2e',
          secondary: '#555770',
          muted: '#8e90a6',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
};
export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2F63F2',
          hover: '#2555E6',
          light: '#EEF4FF'
        },
        secondary: {
          DEFAULT: '#6B7280',
          light: '#F8FAFC'
        },
        slate: {
          50: '#F8FAFC',
          100: '#E5E7EB', // Unify borders
          200: '#E5E7EB', // Unify borders
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280', // Secondary Text
          600: '#4B5563',
          700: '#374151',
          800: '#111827', // Primary Text
          900: '#111827', // Primary Text
        },
        enterprise: {
          bg: '#F8FAFC',
          sidebar: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E5E7EB',
          textPrimary: '#111827',
          textSecondary: '#6B7280',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444'
        }
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'enterprise': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card-soft': '0 10px 25px -5px rgba(0, 0, 0, 0.02), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
        'dropdown': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
      }
    },
  },
  plugins: [],
}

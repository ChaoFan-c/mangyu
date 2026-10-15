import type { Config } from 'tailwindcss';

/**
 * 忙鱼设计令牌。
 * - brand：品牌黄，只用于品牌标识与关键交互，不满屏铺色。
 * - ink / gray：文字与中性面，承担绝大多数信息层级。
 * - warn / green / red：状态语义色，始终与文字标签一起出现，不单独用颜色表意。
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#FFFBEB',
          100: '#FFF5CC',
          200: '#FFEC9E',
          300: '#FFE76B',
          400: '#FFE34D',
          500: '#FFC928',
          600: '#EFB100',
          700: '#9A6B00',
          800: '#6B4A00',
          900: '#3F2C00',
        },
        warn: {
          50: '#FFF4F0',
          100: '#FFE4DA',
          200: '#FFC9B4',
          300: '#FFA98D',
          400: '#FF8B66',
          500: '#FF7043',
          600: '#E85A2E',
          700: '#B4451C',
          800: '#8A3512',
          900: '#5C240D',
        },
        ink: {
          300: '#BDC1C6',
          400: '#9AA0A6',
          500: '#6B7280',
          600: '#4B5058',
          700: '#3C4043',
          800: '#2A2C2F',
          900: '#202124',
        },
        canvas: '#F6F7F9',
        gray: {
          50: '#F6F7F9',
          100: '#F1F3F5',
          200: '#E5E7EB',
          300: '#D8DBDF',
          400: '#9AA0A6',
          500: '#6B7280',
          600: '#4B5058',
          700: '#3C4043',
          800: '#2A2C2F',
          900: '#202124',
        },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16, 24, 40, 0.05)',
        DEFAULT: '0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.06)',
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        md: '0 2px 4px rgba(16, 24, 40, 0.05), 0 4px 12px rgba(16, 24, 40, 0.06)',
        lg: '0 4px 8px rgba(16, 24, 40, 0.06), 0 12px 32px rgba(16, 24, 40, 0.10)',
        xl: '0 12px 48px rgba(16, 24, 40, 0.16)',
        pop: '0 8px 20px rgba(16, 24, 40, 0.10), 0 20px 48px rgba(16, 24, 40, 0.12)',
        inner: 'inset 0 1px 0 rgba(16, 24, 40, 0.04)',
      },
      fontSize: {
        '2xs': ['11px', '16px'],
      },
      spacing: {
        18: '4.5rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.22s cubic-bezier(0.22, 0.61, 0.36, 1)',
        'fade-in': 'fade-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;

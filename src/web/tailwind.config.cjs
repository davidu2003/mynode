const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 将代码中大量使用的 'slate' 映射为更中性、更深沉的 'zinc' 色系
        // Zinc 比 Slate 少了蓝色调，更接近纯黑灰
        slate: {
          ...colors.zinc,
          // 覆盖深色背景色，使其更黑
          900: '#18181b', // 默认 zinc-900
          950: '#09090b', // 默认 zinc-950, 接近纯黑
          // 如果想要极致黑，可以解开下面这行的注释
          // 950: '#050505', 
        },
      }
    },
  },
  plugins: [],
}
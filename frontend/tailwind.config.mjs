/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './public/index.html',
        './src/**/*.{js,ts}',
    ],
    darkMode: ['selector', '[data-theme="dark"]'],
    theme: {
        extend: {},
    },
    plugins: [],
}

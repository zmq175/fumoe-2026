import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.wrangler'] },
  { extends: [js.configs.recommended, ...tseslint.configs.recommended], files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.worker } }, plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, ...reactRefresh.configs.vite.rules, '@typescript-eslint/no-explicit-any': 'off' } }
)

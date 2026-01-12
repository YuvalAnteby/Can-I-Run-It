// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default tseslint.config(
    {
        ignores: ['eslint.config.mjs', 'dist'],
    },
    eslint.configs.recommended,
    // 1. Use 'strict' instead of 'recommended' if you want high code quality
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
            // 2. NestJS uses ES Module syntax (import/export), so 'module' is usually preferred here
            sourceType: 'module',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
    },
    {
        rules: {
            // --- Improved Type Safety ---
            // Don't disable 'any'. Explicitly silence it with @ts-expect-error if you really need it.
            '@typescript-eslint/no-explicit-any': 'error',

            // Floating promises in backend code cause unhandled rejections/crashes. Make this an error.
            '@typescript-eslint/no-floating-promises': 'error',

            // Prevents passing 'any' into functions that expect specific types.
            '@typescript-eslint/no-unsafe-argument': 'error',

            // --- Clean Code & Organization ---
            // Auto-sort imports.
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',

            // Allow unused variables if they start with an underscore (e.g., _req)
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],

            // Force explicit return types on boundaries (Controllers/Services).
            // This makes APIs clearer and catches errors where you return the wrong object shape.
            '@typescript-eslint/explicit-module-boundary-types': 'warn',

            // --- Prettier Integration ---
            'prettier/prettier': ['error', { endOfLine: 'auto' }],
        },
    },
);

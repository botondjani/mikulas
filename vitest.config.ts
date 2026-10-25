import { defineConfig } from 'vitest/config';

// a CI gépe lassabb: a szimulációs tesztek bőven kapjanak időt
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 } });

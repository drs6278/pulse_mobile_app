const expoPreset = require('jest-expo/jest-preset');
const [transformer, options] = expoPreset.transform['\\.[jt]sx?$'];
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)'],
  moduleNameMapper: { '^@/assets/(.*)$': '<rootDir>/assets/$1', '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '\\.[jt]sx?$': [transformer, { ...options, plugins: [...(options.plugins ?? []), 'dynamic-import-node'] }] },
  testTimeout: 20000,
};

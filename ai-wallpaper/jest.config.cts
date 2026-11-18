const { readFileSync } = require('node:fs');

const swcJestConfig = JSON.parse(
  readFileSync(__dirname + '/.spec.swcrc', 'utf-8')
);
swcJestConfig.swcrc = false;
swcJestConfig.module = { type: 'commonjs' };

module.exports = {
  displayName: 'ai-wallpaper',
  preset: '../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  transformIgnorePatterns: [],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};

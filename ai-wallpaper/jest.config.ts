import { readFileSync } from 'fs';

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
	readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
	displayName: 'ai-wallpaper',
	preset: '../jest.preset.js',
	testEnvironment: 'node',
	transform: {
		'^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
	},
	transformIgnorePatterns: [],
	moduleFileExtensions: ['ts', 'js', 'html'],
	coverageDirectory: 'test-output/jest/coverage',
};

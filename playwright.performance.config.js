import base from './playwright.config.js';
export default {
    ...base, testDir: './benchmarks', timeout: 240000, retries: 0,
    reporter: [['list']], projects: [{ name: 'chromium-profile', use: base.projects[0].use }]
};

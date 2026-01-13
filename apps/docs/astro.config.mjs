// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Oken',
			description: 'AI agent deployment platform. One CLI command, get a URL.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/neult/oken' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quickstart' },
					],
				},
				{
					label: 'CLI Reference',
					items: [
						{ label: 'Overview', slug: 'cli/overview' },
						{ label: 'oken login', slug: 'cli/login' },
						{ label: 'oken init', slug: 'cli/init' },
						{ label: 'oken deploy', slug: 'cli/deploy' },
						{ label: 'oken list', slug: 'cli/list' },
						{ label: 'oken status', slug: 'cli/status' },
						{ label: 'oken invoke', slug: 'cli/invoke' },
						{ label: 'oken logs', slug: 'cli/logs' },
						{ label: 'oken stop', slug: 'cli/stop' },
						{ label: 'oken delete', slug: 'cli/delete' },
						{ label: 'oken secrets', slug: 'cli/secrets' },
					],
				},
				{
					label: 'Configuration',
					items: [
						{ label: 'oken.toml', slug: 'configuration/oken-toml' },
					],
				},
			],
		}),
	],
});

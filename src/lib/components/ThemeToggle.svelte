<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getTheme, setTheme, initTheme, type Theme } from '$lib/theme';

	let currentTheme = $state<Theme>('light');

	onMount(() => {
		initTheme();
		currentTheme = getTheme();

		// Listen for storage changes (when theme is changed in another tab/window)
		if (browser) {
			const handleStorageChange = (e: StorageEvent) => {
				if (e.key === 'theme' && e.newValue) {
					const newTheme = e.newValue as Theme;
					currentTheme = newTheme;
					// Apply the theme if it changed in another tab
					const root = document.documentElement;
					if (newTheme === 'dark') {
						root.classList.add('dark');
					} else {
						root.classList.remove('dark');
					}
				}
			};

			window.addEventListener('storage', handleStorageChange);
			return () => window.removeEventListener('storage', handleStorageChange);
		}
	});

	function toggleTheme() {
		const newTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
		setTheme(newTheme);
		currentTheme = newTheme;
	}
</script>

<button
	onclick={toggleTheme}
	class="border-border bg-background text-foreground hover:bg-secondary inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border transition-colors"
	aria-label={currentTheme === 'dark' ? 'Schakel naar licht modus' : 'Schakel naar donkere modus'}
	title={currentTheme === 'dark' ? 'Schakel naar licht modus' : 'Schakel naar donkere modus'}
>
	{#if currentTheme === 'dark'}
		<!-- Sun icon for light mode -->
		<svg
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
			/>
		</svg>
	{:else}
		<!-- Moon icon for dark mode -->
		<svg
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>


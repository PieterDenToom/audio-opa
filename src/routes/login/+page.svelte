<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData } from './$types';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { initTheme } from '$lib/theme';

	let { form }: { form: ActionData } = $props();
	let password = $state('');
	let error = $derived(form?.error || '');

	onMount(() => {
		initTheme();
	});
</script>

<div class="bg-background flex min-h-screen items-center justify-center p-4 md:p-8">
	<div class="border-border bg-card relative w-full max-w-md rounded-xl border p-8 shadow-md">
		<div class="absolute top-4 right-4">
			<ThemeToggle />
		</div>
		<h1 class="text-card-foreground mb-6 text-center text-2xl font-semibold">Wachtwoord vereist</h1>
		<form method="POST" class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<label for="password" class="text-card-foreground text-sm font-medium">Wachtwoord</label>
				<input
					type="password"
					id="password"
					name="password"
					bind:value={password}
					required
					autofocus
					class="border-border bg-background text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 shadow-sm transition-colors focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none"
				/>
			</div>
			{#if error}
				<div class="bg-red-50 border-red-200 text-red-900 rounded-lg border px-3 py-2 text-sm">
					{error}
				</div>
			{/if}
			<button
				type="submit"
				class="bg-primary text-primary-foreground hover:bg-primary/90 w-full cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
			>
				Inloggen
			</button>
		</form>
	</div>
</div>


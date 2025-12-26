<script lang="ts">
	import { onMount } from 'svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	interface AudioItem {
		bestandsnaam: string;
		titel: string;
		samenvatting: string;
		tags: string[];
	}

	let audioItems = $state<AudioItem[]>([]);
	let audioDurations = $state<Map<string, number>>(new Map());
	let expandedSummaries = $state<Set<string>>(new Set());
	let currentAudio = $state<HTMLAudioElement | null>(null);
	let currentItem = $state<AudioItem | null>(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let isLoading = $state(false);
	let transcriptItem = $state<AudioItem | null>(null);
	let transcriptText = $state<string>('');
	let isLoadingTranscript = $state(false);
	let searchQuery = $state('');
	let searchResults = $state<Array<{ item: AudioItem; timestamp: number; text: string }>>([]);
	let isLoadingSearch = $state(false);

	onMount(async () => {
		try {
			const response = await fetch('/audio/data.json');
			audioItems = await response.json();
			// Load durations for all audio files
			loadDurations();
		} catch (error) {
			console.error('Failed to load audio data:', error);
		}
	});

	function loadDurations() {
		audioItems.forEach((item) => {
			const audio = new Audio(`/audio/${item.bestandsnaam}`);
			audio.addEventListener('loadedmetadata', () => {
				const newMap = new Map(audioDurations);
				newMap.set(item.bestandsnaam, audio.duration);
				audioDurations = newMap; // Trigger reactivity
			});
			audio.addEventListener('error', () => {
				console.error('Failed to load duration for:', item.bestandsnaam);
			});
		});
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function parseVttTimestamp(timestamp: string): number {
		// Format: HH:MM:SS.mmm or MM:SS.mmm
		const parts = timestamp.trim().split(':');
		let totalSeconds = 0;
		if (parts.length === 3) {
			// HH:MM:SS.mmm
			totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
		} else if (parts.length === 2) {
			// MM:SS.mmm
			totalSeconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
		}
		return totalSeconds;
	}

	function parseSrtTimestamp(timestamp: string): number {
		// Format: HH:MM:SS,mmm
		const parts = timestamp.trim().split(':');
		if (parts.length === 3) {
			const secParts = parts[2].split(',');
			return (
				parseInt(parts[0]) * 3600 +
				parseInt(parts[1]) * 60 +
				parseFloat(secParts[0] + '.' + secParts[1])
			);
		}
		return 0;
	}

	function parseVtt(content: string): Array<{ start: number; text: string }> {
		const entries: Array<{ start: number; text: string }> = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.includes('-->')) {
				const parts = line.split('-->');
				if (parts.length === 2) {
					const startTime = parseVttTimestamp(parts[0].trim());
					const textLines: string[] = [];

					// Collect text until next timestamp or blank line
					for (let j = i + 1; j < lines.length; j++) {
						const nextLine = lines[j].trim();
						if (nextLine === '' || nextLine.includes('-->')) break;
						if (nextLine && nextLine !== 'WEBVTT') {
							textLines.push(nextLine);
						}
					}

					if (textLines.length > 0) {
						entries.push({ start: startTime, text: textLines.join(' ') });
					}
				}
			}
		}

		return entries;
	}

	function parseSrt(content: string): Array<{ start: number; text: string }> {
		const entries: Array<{ start: number; text: string }> = [];
		const blocks = content.split(/\n\s*\n/);

		for (const block of blocks) {
			const lines = block.trim().split('\n');
			if (lines.length >= 3) {
				// Skip the number line, parse timestamp line
				const timestampLine = lines[1].trim();
				if (timestampLine.includes('-->')) {
					const parts = timestampLine.split('-->');
					if (parts.length === 2) {
						const startTime = parseSrtTimestamp(parts[0].trim());
						const text = lines.slice(2).join(' ').trim();
						if (text) {
							entries.push({ start: startTime, text });
						}
					}
				}
			}
		}

		return entries;
	}

	async function searchSubtitles(query: string) {
		if (!query.trim()) {
			searchResults = [];
			return;
		}

		isLoadingSearch = true;
		const results: Array<{ item: AudioItem; timestamp: number; text: string }> = [];
		const lowerQuery = query.toLowerCase();

		for (const item of audioItems) {
			try {
				// Try .vtt first, then .srt
				let vttFileName = item.bestandsnaam.replace(/\.webm$/i, '.vtt');
				let response = await fetch(`/audio/${vttFileName}`);
				let entries: Array<{ start: number; text: string }> = [];

				if (response.ok) {
					const content = await response.text();
					entries = parseVtt(content);
				} else {
					// Try .srt
					const srtFileName = item.bestandsnaam.replace(/\.webm$/i, '.srt');
					response = await fetch(`/audio/${srtFileName}`);
					if (response.ok) {
						const content = await response.text();
						entries = parseSrt(content);
					}
				}

				// Search in entries
				for (const entry of entries) {
					if (entry.text.toLowerCase().includes(lowerQuery)) {
						results.push({
							item,
							timestamp: entry.start,
							text: entry.text
						});
					}
				}
			} catch (error) {
				// Silently continue if file doesn't exist
			}
		}

		searchResults = results;
		isLoadingSearch = false;
	}

	function jumpToTimestamp(item: AudioItem, timestamp: number) {
		// If different item, load it first using togglePlay which handles stopping current audio
		if (currentItem?.bestandsnaam !== item.bestandsnaam) {
			togglePlay(item);

			// Wait for the audio to load, then seek
			const seekWhenReady = () => {
				if (currentAudio && currentItem?.bestandsnaam === item.bestandsnaam) {
					if (currentAudio.readyState >= 2) {
						// Can seek
						currentAudio.currentTime = timestamp;
						currentTime = timestamp;
						if (!isPlaying) {
							currentAudio.play();
							isPlaying = true;
						}
					} else {
						// Wait a bit more
						setTimeout(seekWhenReady, 100);
					}
				}
			};

			// Try immediately, then with a small delay
			setTimeout(seekWhenReady, 50);
		} else {
			// Same item, just seek to timestamp
			if (currentAudio) {
				currentAudio.currentTime = timestamp;
				currentTime = timestamp;
				if (!isPlaying) {
					currentAudio.play();
					isPlaying = true;
				}
			}
		}
	}

	function toggleSummary(item: AudioItem) {
		const newSet = new Set(expandedSummaries);
		if (newSet.has(item.bestandsnaam)) {
			newSet.delete(item.bestandsnaam);
		} else {
			newSet.add(item.bestandsnaam);
		}
		expandedSummaries = newSet;
	}

	async function loadTranscript(item: AudioItem) {
		transcriptItem = item;
		isLoadingTranscript = true;
		try {
			// Get the base filename (without .webm extension) and add .txt
			const txtFileName = item.bestandsnaam.replace(/\.webm$/i, '.txt');
			const response = await fetch(`/audio/${txtFileName}`);
			if (response.ok) {
				transcriptText = await response.text();
			} else {
				transcriptText = 'Transcriptie niet beschikbaar.';
			}
		} catch (error) {
			console.error('Failed to load transcript:', error);
			transcriptText = 'Kon transcriptie niet laden.';
		} finally {
			isLoadingTranscript = false;
		}
	}

	function closeTranscript() {
		transcriptItem = null;
		transcriptText = '';
	}

	function togglePlay(item: AudioItem) {
		if (currentItem?.bestandsnaam === item.bestandsnaam && currentAudio) {
			if (isPlaying) {
				currentAudio.pause();
				isPlaying = false;
			} else {
				currentAudio.play();
				isPlaying = true;
			}
		} else {
			// Load new audio - stop any currently playing audio first
			if (currentAudio) {
				currentAudio.pause();
				currentAudio.src = ''; // Clear src to stop loading
			}

			isLoading = true;
			currentItem = item;
			currentAudio = new Audio(`/audio/${item.bestandsnaam}`);
			currentAudio.volume = volume;

			currentAudio.addEventListener('loadedmetadata', () => {
				duration = currentAudio?.duration || 0;
				isLoading = false;
			});

			currentAudio.addEventListener('timeupdate', () => {
				if (currentAudio) {
					currentTime = currentAudio.currentTime;
				}
			});

			currentAudio.addEventListener('ended', () => {
				isPlaying = false;
				currentTime = 0;
			});

			currentAudio.addEventListener('error', () => {
				isLoading = false;
				console.error('Failed to load audio:', item.bestandsnaam);
			});

			currentAudio.play();
			isPlaying = true;
		}
	}

	function seek(event: MouseEvent) {
		if (!currentAudio) return;
		const target = event.currentTarget as HTMLDivElement;
		const rect = target.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percent = x / rect.width;
		const newTime = percent * duration;
		currentAudio.currentTime = newTime;
		currentTime = newTime;
	}

	$effect(() => {
		if (currentAudio) {
			currentAudio.volume = volume;
		}
	});
</script>

<div class="bg-background min-h-screen p-4 md:p-8">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 flex items-start justify-between">
			<div>
				<h1 class="text-foreground text-4xl font-bold tracking-tight">Audio Archief</h1>
				<p class="text-muted-foreground mt-2">Blader en luister naar audio opnames</p>
			</div>
			<ThemeToggle />
		</div>

		<!-- Search Bar -->
		<div class="mb-6">
			<div class="relative">
				<svg
					class="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<input
					type="text"
					bind:value={searchQuery}
					oninput={(e) => searchSubtitles(e.currentTarget.value)}
					placeholder="Zoek in transcripties..."
					class="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-primary w-full rounded-lg border py-2.5 pr-4 pl-10 shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
				/>
				{#if searchQuery}
					<button
						onclick={() => {
							searchQuery = '';
							searchResults = [];
						}}
						class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
					>
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				{/if}
			</div>

			{#if isLoadingSearch}
				<div class="text-muted-foreground mt-3 text-sm">Zoeken...</div>
			{:else if searchResults.length > 0}
				<div class="border-border bg-card mt-4 rounded-lg border p-4 shadow-sm">
					<div class="text-card-foreground mb-3 text-sm font-medium">
						{searchResults.length}
						{searchResults.length === 1 ? 'resultaat' : 'resultaten'} gevonden
					</div>
					<div class="space-y-2">
						{#each searchResults as result}
							<button
								onclick={() => jumpToTimestamp(result.item, result.timestamp)}
								class="border-border bg-background hover:bg-secondary w-full cursor-pointer rounded-md border p-3 text-left transition-colors"
							>
								<div class="mb-1 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<svg
											class="text-primary h-4 w-4 shrink-0"
											fill="currentColor"
											viewBox="0 0 24 24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M8 5v14l11-7z" />
										</svg>
										<span class="text-card-foreground text-sm font-semibold"
											>{result.item.titel}</span
										>
									</div>
									<span class="text-muted-foreground text-xs">{formatTime(result.timestamp)}</span>
								</div>
								<p class="text-muted-foreground text-sm">{result.text}</p>
							</button>
						{/each}
					</div>
				</div>
			{:else if searchQuery.trim()}
				<div class="text-muted-foreground mt-3 text-sm">Geen resultaten gevonden</div>
			{/if}
		</div>

		{#if currentAudio && currentItem}
			<!-- Current Player Card -->
			<div class="border-border bg-card mb-8 rounded-xl border p-6 shadow-md">
				<div class="mb-4">
					<h2 class="text-card-foreground text-xl font-semibold">{currentItem.titel}</h2>
					<p class="text-muted-foreground mt-1 text-sm">{currentItem.samenvatting}</p>
				</div>

				<div class="flex items-center gap-4">
					<button
						onclick={() => currentItem && togglePlay(currentItem)}
						disabled={isLoading}
						class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50"
					>
						{#if isLoading}
							<svg
								class="h-5 w-5 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						{:else if isPlaying}
							<svg
								class="h-5 w-5"
								fill="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
							</svg>
						{:else}
							<svg
								class="ml-0.5 h-5 w-5"
								fill="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M8 5v14l11-7z" />
							</svg>
						{/if}
					</button>

					<div class="flex flex-1 flex-col justify-center gap-1.5">
						<div
							class="bg-secondary relative h-2 cursor-pointer rounded-full"
							onclick={seek}
							role="progressbar"
							tabindex="0"
						>
							<div
								class="bg-primary h-full rounded-full transition-all"
								style={`width: ${duration ? (currentTime / duration) * 100 : 0}%`}
							></div>
						</div>
						<div class="text-muted-foreground flex items-center justify-between text-xs">
							<span>{formatTime(currentTime)}</span>
							<span>{formatTime(duration)}</span>
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<svg
							class="text-muted-foreground h-4 w-4"
							viewBox="0 -960 960 960"
							xmlns="http://www.w3.org/2000/svg"
							fill="currentColor"
						>
							<path
								d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320ZM400-606l-86 86H200v80h114l86 86v-252ZM300-480Z"
							/>
						</svg>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							bind:value={volume}
							class="bg-secondary accent-primary h-1 w-20 cursor-pointer appearance-none rounded-lg"
						/>
					</div>
				</div>
			</div>
		{/if}

		<!-- Audio Items Grid -->
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each audioItems as item}
				<div
					onclick={() => togglePlay(item)}
					class="group border-border bg-card relative cursor-pointer overflow-hidden rounded-xl border p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg {currentItem?.bestandsnaam ===
					item.bestandsnaam
						? 'ring-primary shadow-md ring-2'
						: ''}"
				>
					<div class="mb-5 flex items-start justify-between">
						<button
							onclick={(e) => {
								e.stopPropagation();
								togglePlay(item);
							}}
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-110 hover:shadow-lg"
						>
							{#if currentItem?.bestandsnaam === item.bestandsnaam && isPlaying}
								<svg
									class="h-5 w-5"
									fill="currentColor"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
								</svg>
							{:else}
								<svg
									class="ml-0.5 h-5 w-5"
									fill="currentColor"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M8 5v14l11-7z" />
								</svg>
							{/if}
						</button>
					</div>

					<h3 class="text-card-foreground mb-3 text-xl font-bold tracking-tight">{item.titel}</h3>
					<div class="mb-4">
						<p
							class="text-muted-foreground text-sm leading-relaxed {expandedSummaries.has(
								item.bestandsnaam
							)
								? ''
								: 'line-clamp-3'}"
						>
							{item.samenvatting}
						</p>
						{#if item.samenvatting.length > 150}
							<button
								onclick={(e) => {
									e.stopPropagation();
									toggleSummary(item);
								}}
								class="text-primary hover:text-primary/80 mt-2 cursor-pointer text-xs font-medium transition-colors hover:underline"
							>
								{expandedSummaries.has(item.bestandsnaam) ? 'Minder tonen' : 'Meer tonen'}
							</button>
						{/if}
					</div>

					{#if audioDurations.has(item.bestandsnaam)}
						<div
							class="border-border bg-background mb-5 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 shadow-sm"
						>
							<svg
								class="text-muted-foreground h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span class="text-foreground text-sm font-semibold"
								>{formatTime(audioDurations.get(item.bestandsnaam) || 0)}</span
							>
						</div>
					{/if}

					<div class="flex flex-wrap gap-2.5">
						{#each item.tags as tag}
							<span
								class="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-3 py-1 text-xs font-medium shadow-sm"
							>
								{tag}
							</span>
						{/each}
					</div>

					<button
						onclick={(e) => {
							e.stopPropagation();
							loadTranscript(item);
						}}
						class="border-border bg-background text-foreground hover:bg-secondary mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
					>
						<svg
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
							/>
						</svg>
						Lees Verhaal
					</button>
				</div>
			{/each}
		</div>
	</div>

	<!-- Transcript Modal -->
	{#if transcriptItem}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			onclick={closeTranscript}
			role="dialog"
			aria-modal="true"
			aria-labelledby="transcript-title"
		>
			<div
				class="border-border bg-card relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-lg"
				onclick={(e) => e.stopPropagation()}
			>
				<div class="border-border flex shrink-0 items-center justify-between border-b p-6">
					<h2 id="transcript-title" class="text-card-foreground text-xl font-semibold">
						{transcriptItem.titel}
					</h2>
					<button
						onclick={closeTranscript}
						class="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors"
					>
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto p-6">
					{#if isLoadingTranscript}
						<div class="flex items-center justify-center py-12">
							<svg
								class="text-muted-foreground h-8 w-8 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						</div>
					{:else}
						<div class="prose prose-sm text-card-foreground max-w-none">
							<p class="leading-relaxed whitespace-pre-wrap">{transcriptText}</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Range input styling */
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
		border: none;
	}
</style>

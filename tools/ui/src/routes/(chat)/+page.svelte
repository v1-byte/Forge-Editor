<svelte:head>
	<title>Forge Editor</title>
	<meta
		name="description"
		content="Forge Editor — antarmuka editor GGUF dan AI workbench."
	/>
</svelte:head>

<main class="forge-editor-shell">
	<iframe
		title="Forge Editor"
		src="forge-editor.html"
		allow="clipboard-read; clipboard-write"
		referrerpolicy="strict-origin-when-cross-origin"
	></iframe>
</main>

<style>
	.forge-editor-shell {
		position: fixed;
		inset: 0;
		z-index: 2147483000;
		width: 100vw;
		height: 100dvh;
		margin: 0;
		padding: 0;
		background: #111111;
	}

	.forge-editor-shell iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: #111111;
	}
</style>

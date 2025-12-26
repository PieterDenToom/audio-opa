import { readdir, stat, rename, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const AUDIO_DIR = join(process.cwd(), 'static', 'audio');
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

async function findWebmFiles(dir) {
	const files = [];
	try {
		const entries = await readdir(dir);

		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const fileStat = await stat(fullPath);

			if (fileStat.isFile() && extname(entry).toLowerCase() === '.webm') {
				files.push(fullPath);
			}
		}
	} catch (error) {
		console.error(`Error reading directory ${dir}:`, error.message);
	}

	return files;
}

async function getFileSize(filePath) {
	const stats = await stat(filePath);
	return stats.size;
}

async function compressWebm(inputFile, targetSizeBytes) {
	const fileName = basename(inputFile);
	const tempFile = inputFile.replace(/\.webm$/i, '.webm.tmp');

	let bestBitrate = null;
	let bestSize = Infinity;

	console.log(`  Compressing ${fileName}...`);

	// Try bitrates from highest to lowest quality
	// Start with 64kbps (same as conversion script) and go down if needed
	const bitratesToTry = [64, 56, 48, 40, 32, 24];

	for (const bitrate of bitratesToTry) {
		try {
			// ffmpeg command to re-encode with specified bitrate
			// -f webm explicitly specifies the output format
			const command = `ffmpeg -i "${inputFile}" -c:a libopus -b:a ${bitrate}k -vbr on -compression_level 10 -f webm -vn -y "${tempFile}"`;

			await execAsync(command);

			const compressedSize = await getFileSize(tempFile);
			const compressedSizeMB = (compressedSize / (1024 * 1024)).toFixed(2);

			console.log(`    Tried ${bitrate}kbps: ${compressedSizeMB} MB`);

			if (compressedSize <= targetSizeBytes) {
				// Success! This bitrate works
				bestBitrate = bitrate;
				bestSize = compressedSize;
				break; // Found a working bitrate, use it
			} else {
				// File is still too large, try lower bitrate
				// Clean up temp file before trying next bitrate
				try {
					await unlink(tempFile);
				} catch (e) {
					// Ignore cleanup errors
				}
			}
		} catch (error) {
			console.error(`    Error at ${bitrate}kbps:`, error.message);
			// Clean up temp file
			try {
				await unlink(tempFile);
			} catch (e) {
				// Ignore cleanup errors
			}
			// Continue to next bitrate
		}
	}

	if (bestBitrate === null) {
		console.error(`  ✗ Could not compress ${fileName} below ${MAX_SIZE_MB} MB with any bitrate`);
		return false;
	}

	// If we found a working bitrate, the temp file should still exist with the compressed version
	try {
		// Verify the file exists and is the right size
		const finalSize = await getFileSize(tempFile);
		if (finalSize > targetSizeBytes) {
			console.error(
				`  ✗ Compressed file is still too large: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`
			);
			await unlink(tempFile);
			return false;
		}

		// Replace original with compressed version
		await rename(tempFile, inputFile);
		const finalSizeMB = (finalSize / (1024 * 1024)).toFixed(2);
		console.log(`  ✓ Compressed ${fileName} to ${finalSizeMB} MB (using ${bestBitrate}kbps)`);
		return true;
	} catch (error) {
		console.error(`  ✗ Failed to replace original file:`, error.message);
		// Clean up temp file
		try {
			await unlink(tempFile);
		} catch (e) {
			// Ignore cleanup errors
		}
		return false;
	}
}

async function main() {
	console.log(`Checking for .webm files larger than ${MAX_SIZE_MB} MB in static/audio...\n`);

	const webmFiles = await findWebmFiles(AUDIO_DIR);

	if (webmFiles.length === 0) {
		console.log('No .webm files found.');
		return;
	}

	console.log(`Found ${webmFiles.length} .webm file(s)\n`);

	// Check file sizes and collect files that need compression
	const filesToCompress = [];

	for (const file of webmFiles) {
		const size = await getFileSize(file);
		const sizeMB = (size / (1024 * 1024)).toFixed(2);
		const fileName = basename(file);

		if (size > MAX_SIZE_BYTES) {
			console.log(`⚠ ${fileName}: ${sizeMB} MB (needs compression)`);
			filesToCompress.push(file);
		} else {
			console.log(`✓ ${fileName}: ${sizeMB} MB (OK)`);
		}
	}

	if (filesToCompress.length === 0) {
		console.log('\nAll files are already under the size limit!');
		return;
	}

	console.log(`\n${filesToCompress.length} file(s) need compression\n`);

	let successCount = 0;
	let failCount = 0;

	for (const file of filesToCompress) {
		const success = await compressWebm(file, MAX_SIZE_BYTES);
		if (success) {
			successCount++;
		} else {
			failCount++;
		}
	}

	console.log(`\n--- Compression complete ---`);
	console.log(`Successfully compressed: ${successCount}`);
	console.log(`Failed: ${failCount}`);
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});

import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const AUDIO_DIR = join(process.cwd(), 'static', 'audio');

async function findWmaFiles(dir) {
	const files = [];
	try {
		const entries = await readdir(dir);
		
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const fileStat = await stat(fullPath);
			
			if (fileStat.isFile() && extname(entry).toLowerCase() === '.wma') {
				files.push(fullPath);
			}
		}
	} catch (error) {
		console.error(`Error reading directory ${dir}:`, error.message);
	}
	
	return files;
}

async function convertToWebm(wmaFile) {
	const webmFile = wmaFile.replace(/\.wma$/i, '.webm');
	const fileName = basename(wmaFile);
	
	console.log(`Converting ${fileName}...`);
	
	try {
		// ffmpeg command to convert WMA to WebM
		// Using libopus codec with lower bitrate (64k) to keep file size below 25MB
		// -b:a 64k sets average bitrate, -vbr on enables variable bitrate for better quality at lower sizes
		const command = `ffmpeg -i "${wmaFile}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -vn "${webmFile}"`;
		
		await execAsync(command);
		
		// Check file size
		const stats = await stat(webmFile);
		const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
		
		if (stats.size > 25 * 1024 * 1024) {
			console.log(`⚠ ${fileName} converted but is ${fileSizeMB} MB (above 25 MB target)`);
		} else {
			console.log(`✓ Successfully converted ${fileName} (${fileSizeMB} MB)`);
		}
		return true;
	} catch (error) {
		console.error(`✗ Failed to convert ${fileName}:`, error.message);
		return false;
	}
}

async function main() {
	console.log('Looking for .WMA files in static/audio...\n');
	
	const wmaFiles = await findWmaFiles(AUDIO_DIR);
	
	if (wmaFiles.length === 0) {
		console.log('No .WMA files found.');
		return;
	}
	
	console.log(`Found ${wmaFiles.length} .WMA file(s)\n`);
	
	let successCount = 0;
	let failCount = 0;
	
	for (const wmaFile of wmaFiles) {
		const success = await convertToWebm(wmaFile);
		if (success) {
			successCount++;
		} else {
			failCount++;
		}
	}
	
	console.log(`\n--- Conversion complete ---`);
	console.log(`Successfully converted: ${successCount}`);
	console.log(`Failed: ${failCount}`);
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});


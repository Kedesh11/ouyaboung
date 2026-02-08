// Script to optimize PWA icons using sharp
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '../public/icons');
const sizes = [192, 512];

async function optimizeIcons() {
  console.log('🎨 Optimizing PWA icons...\n');

  for (const size of sizes) {
    const iconPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    
    if (!fs.existsSync(iconPath)) {
      console.log(`⚠️  Icon not found: ${iconPath}`);
      continue;
    }

    const stats = fs.statSync(iconPath);
    const before = stats.size;

    // Optimize PNG
    await sharp(iconPath)
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(iconPath + '.tmp');

    // Replace original
    fs.renameSync(iconPath + '.tmp', iconPath);

    const afterStats = fs.statSync(iconPath);
    const after = afterStats.size;
    const reduction = ((before - after) / before * 100).toFixed(1);

    console.log(`✅ icon-${size}x${size}.png: ${(before/1024).toFixed(1)}KB → ${(after/1024).toFixed(1)}KB (-${reduction}%)`);

    // Also create WebP version
    await sharp(iconPath)
      .webp({ quality: 85 })
      .toFile(path.join(iconsDir, `icon-${size}x${size}.webp`));

    console.log(`   └─ Created WebP version`);
  }

  // Optimize maskable icon512
  const maskablePath = path.join(iconsDir, 'icon-maskable-512x512.png');
  if (fs.existsSync(maskablePath)) {
    const stats = fs.statSync(maskablePath);
    const before = stats.size;

    await sharp(maskablePath)
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(maskablePath + '.tmp');

    fs.renameSync(maskablePath + '.tmp', maskablePath);

    const afterStats = fs.statSync(maskablePath);
    const after = afterStats.size;
    const reduction = ((before - after) / before * 100).toFixed(1);

    console.log(`✅ icon-maskable-512x512.png: ${(before/1024).toFixed(1)}KB → ${(after/1024).toFixed(1)}KB (-${reduction}%)`);
  }

  // Optimize apple-touch-icon
  const applePath = path.join(__dirname, '../public/apple-touch-icon.png');
  if (fs.existsSync(applePath)) {
    const stats = fs.statSync(applePath);
    const before = stats.size;

    await sharp(applePath)
      .resize(180, 180) // Apple recommended size
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(applePath + '.tmp');

    fs.renameSync(applePath + '.tmp', applePath);

    const afterStats = fs.statSync(applePath);
    const after = afterStats.size;
    const reduction = ((before - after) / before * 100).toFixed(1);

    console.log(`✅ apple-touch-icon.png: ${(before/1024).toFixed(1)}KB → ${(after/1024).toFixed(1)}KB (-${reduction}%)`);
  }

  console.log('\n✨ Icon optimization complete!\n');
}

optimizeIcons().catch(console.error);

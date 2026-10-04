const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const sizes = {
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192
};

async function generateIcons() {
  const logoPath = path.join(__dirname, 'public', 'logo.jpg');
  const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

  try {
    const image = await Jimp.read(logoPath);

    for (const [dpi, size] of Object.entries(sizes)) {
      const folderPath = path.join(resDir, `mipmap-${dpi}`);
      if (!fs.existsSync(folderPath)) continue;

      const resized = image.clone().resize({ w: size, h: size });
      
      const file1 = path.join(folderPath, 'ic_launcher.png');
      const file2 = path.join(folderPath, 'ic_launcher_round.png');
      const file3 = path.join(folderPath, 'ic_launcher_foreground.png');
      
      await resized.write(file1);
      await resized.write(file2);
      await resized.write(file3);
      
      console.log(`Generated icons for ${dpi}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

generateIcons();

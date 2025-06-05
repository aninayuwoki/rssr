// compress-existing-images.js
const { ImageCompressor } = require('../imageCompressor');
const fs = require('fs').promises;
const path = require('path');

async function compressExistingImages() {
    console.log('🚀 Iniciando compresión de imágenes existentes...\n');
    
    const compressor = new ImageCompressor('./public/uploads');
    
    // Configurar ajustes de compresión (puedes personalizar estos valores)
    compressor.setCompressionSettings({
        jpeg: { quality: 85, progressive: true },
        png: { compressionLevel: 8, progressive: true },
        webp: { quality: 85, effort: 6 }
    });
    
    // Configurar dimensiones máximas (opcional)
    compressor.setMaxDimensions(1920, 1080);
    
    try {
        // Crear directorio para thumbnails si no existe
        const thumbnailDir = './public/uploads/thumbs';
        try {
            await fs.access(thumbnailDir);
        } catch {
            await fs.mkdir(thumbnailDir, { recursive: true });
            console.log('📁 Directorio de thumbnails creado');
        }
        
        // Realizar compresión
        const results = await compressor.compressAllImages();
        
        console.log('\n🎉 ¡Proceso completado exitosamente!');
        console.log(`✅ ${results.filter(r => r.success).length} imágenes comprimidas`);
        console.log(`❌ ${results.filter(r => !r.success).length} errores`);
        
        // Mostrar errores si los hay
        const errors = results.filter(r => !r.success);
        if (errors.length > 0) {
            console.log('\n❌ Errores encontrados:');
            errors.forEach(error => {
                console.log(`  - ${error.file}: ${error.error}`);
            });
        }
        
    } catch (error) {
        console.error('💥 Error fatal:', error.message);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    compressExistingImages();
}

module.exports = compressExistingImages;
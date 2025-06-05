const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class ImageCompressor {
    constructor(uploadDir = './public/uploads') {
        this.uploadDir = uploadDir;
        this.compressionSettings = {
            jpeg: { quality: 85, progressive: true },
            png: { compressionLevel: 8, progressive: true },
            webp: { quality: 85, effort: 6 }
        };
        this.maxWidth = 1920;
        this.maxHeight = 1080;
        this.thumbnailSize = 400;
    }

    // Comprimir imagen individual
    async compressImage(inputPath, outputPath = null, options = {}) {
        try {
            const outputFilePath = outputPath || inputPath;
            const fileExtension = path.extname(inputPath).toLowerCase();
            
            let sharpInstance = sharp(inputPath);
            
            // Obtener metadata de la imagen
            const metadata = await sharpInstance.metadata();
            console.log(`Procesando: ${path.basename(inputPath)} - ${metadata.width}x${metadata.height} - ${metadata.format}`);
            
            // Redimensionar si es necesario
            if (metadata.width > this.maxWidth || metadata.height > this.maxHeight) {
                sharpInstance = sharpInstance.resize(this.maxWidth, this.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }
            
            // Aplicar compresión según el formato
            switch (fileExtension) {
                case '.jpg':
                case '.jpeg':
                    await sharpInstance
                        .jpeg(this.compressionSettings.jpeg)
                        .toFile(outputFilePath + '.temp');
                    break;
                case '.png':
                    await sharpInstance
                        .png(this.compressionSettings.png)
                        .toFile(outputFilePath + '.temp');
                    break;
                case '.webp':
                    await sharpInstance
                        .webp(this.compressionSettings.webp)
                        .toFile(outputFilePath + '.temp');
                    break;
                default:
                    // Convertir otros formatos a JPEG
                    await sharpInstance
                        .jpeg(this.compressionSettings.jpeg)
                        .toFile(outputFilePath + '.temp');
            }
            
            // Reemplazar archivo original
            await fs.rename(outputFilePath + '.temp', outputFilePath);
            
            // Calcular reducción de tamaño
            const originalStats = await fs.stat(inputPath);
            const compressedStats = await fs.stat(outputFilePath);
            const reduction = ((originalStats.size - compressedStats.size) / originalStats.size * 100).toFixed(2);
            
            console.log(`✅ Comprimido: ${path.basename(inputPath)} - Reducción: ${reduction}%`);
            
            return {
                success: true,
                originalSize: originalStats.size,
                compressedSize: compressedStats.size,
                reduction: reduction
            };
            
        } catch (error) {
            console.error(`❌ Error comprimiendo ${inputPath}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Crear thumbnail
    async createThumbnail(inputPath, thumbnailPath = null) {
        try {
            const outputPath = thumbnailPath || inputPath.replace(/(\.[^.]+)$/, '_thumb$1');
            
            await sharp(inputPath)
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 80 })
                .toFile(outputPath);
            
            console.log(`🖼️  Thumbnail creado: ${path.basename(outputPath)}`);
            return outputPath;
            
        } catch (error) {
            console.error(`❌ Error creando thumbnail:`, error.message);
            return null;
        }
    }

    // Comprimir todas las imágenes existentes
    async compressAllImages() {
        try {
            const files = await fs.readdir(this.uploadDir);
            const imageFiles = files.filter(file => 
                /\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(file)
            );
            
            console.log(`📁 Encontradas ${imageFiles.length} imágenes para procesar`);
            
            const results = [];
            let totalOriginalSize = 0;
            let totalCompressedSize = 0;
            
            for (const file of imageFiles) {
                const filePath = path.join(this.uploadDir, file);
                const result = await this.compressImage(filePath);
                
                if (result.success) {
                    totalOriginalSize += result.originalSize;
                    totalCompressedSize += result.compressedSize;
                    
                    // Crear thumbnail si no existe
                    const thumbnailPath = path.join(this.uploadDir, 'thumbs', file);
                    await this.ensureDirectoryExists(path.dirname(thumbnailPath));
                    await this.createThumbnail(filePath, thumbnailPath);
                }
                
                results.push({ file, ...result });
            }
            
            const totalReduction = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(2);
            
            console.log(`\n📊 RESUMEN:`);
            console.log(`Tamaño original total: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`Tamaño comprimido total: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`Reducción total: ${totalReduction}%`);
            console.log(`Espacio ahorrado: ${((totalOriginalSize - totalCompressedSize) / 1024 / 1024).toFixed(2)} MB`);
            
            return results;
            
        } catch (error) {
            console.error('❌ Error procesando imágenes:', error.message);
            return [];
        }
    }

    // Middleware para comprimir imágenes al subirlas
    getCompressionMiddleware() {
        return async (req, res, next) => {
            if (req.files && req.files.length > 0) {
                console.log('🔄 Comprimiendo imágenes subidas...');
                
                for (const file of req.files) {
                    const result = await this.compressImage(file.path);
                    
                    if (result.success) {
                        // Crear thumbnail automáticamente
                        const thumbnailDir = path.join(this.uploadDir, 'thumbs');
                        await this.ensureDirectoryExists(thumbnailDir);
                        const thumbnailPath = path.join(thumbnailDir, file.filename);
                        await this.createThumbnail(file.path, thumbnailPath);
                        
                        // Agregar info de thumbnail al objeto file
                        file.thumbnail = `thumbs/${file.filename}`;
                        file.compressed = true;
                        file.compressionInfo = result;
                    }
                }
            }
            next();
        };
    }

    // Asegurar que el directorio existe
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    // Configurar ajustes de compresión
    setCompressionSettings(settings) {
        this.compressionSettings = { ...this.compressionSettings, ...settings };
    }

    // Configurar dimensiones máximas
    setMaxDimensions(width, height) {
        this.maxWidth = width;
        this.maxHeight = height;
    }
}

// Función para integrar con tu servidor existente
function setupImageCompression(app, uploadDir = './public/uploads') {
    const compressor = new ImageCompressor(uploadDir);
    
    // Endpoint para comprimir todas las imágenes existentes
    app.post('/api/compress-all-images', async (req, res) => {
        try {
            const results = await compressor.compressAllImages();
            res.json({ 
                success: true, 
                message: 'Compresión completada',
                results 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });
    
    // Endpoint para comprimir imagen específica
    app.post('/api/compress-image/:filename', async (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(uploadDir, filename);
            
            const result = await compressor.compressImage(filePath);
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: 'Imagen comprimida exitosamente',
                    result 
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    error: result.error 
                });
            }
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });
    
    return compressor;
}

module.exports = { ImageCompressor, setupImageCompression };

// Ejemplo de uso directo
if (require.main === module) {
    const compressor = new ImageCompressor('./public/uploads');
    
    // Comprimir todas las imágenes existentes
    compressor.compressAllImages().then(() => {
        console.log('✅ Proceso de compresión completado');
    });
}
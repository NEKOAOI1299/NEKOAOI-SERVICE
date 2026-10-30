const mongoose = require('mongoose');

const animeSchema = new mongoose.Schema({
    // Datos Básicos e Identificación
    titulo: { type: String, required: true },
    titulosAlternativos: {
        ingles: { type: String, default: '' },
        romaji: { type: String, default: '' },
        japones: { type: String, default: '' },
        espanol: { type: String, default: '' }
    },
    
    // Formato y Clasificación
    tipo: { type: String, default: 'Serie' }, // TV, Película, OVA, ONA, Especial
    generos: [String],
    
    // Fechas y Temporadas
    fechaSalida: { type: String },
    temporadaEstreno: { type: String }, // Ej. Primavera 2024
    estado: { type: String, default: 'En emisión' }, // En emisión, Finalizado, Próximamente
    
    // Estadísticas y Emisión
    episodiosTotales: { type: Number, default: 0 },
    temporadasTotales: { type: Number, default: 1 },
    puntuacion: { type: Number, default: 8.5 },
    
    // Argumento
    sinopsis: { type: String },
    
    // Datos Avanzados y de Producción
    estudioAnimacion: { type: String },
    creadorOriginal: { type: String },
    formatoOrigen: { type: String }, // Manga, Light Novel, Videojuego, Original
    
    // Banda Sonora (Openings y Endings)
    openings: [String],
    endings: [String],
    
    // Extras para la Comunidad
    rellenoGuia: { type: String }, // Porcentaje o detalle de capítulos canon/relleno
    imagenPortada: { type: String },
    
    // Registro
    creadoEn: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Anime', animeSchema);
const mongoose = require('mongoose');
require('dotenv').config();
const Anime = require('./models/anime');

async function limpiarBaseDeDatos() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Conectado a MongoDB...");
        
        const resultado = await Anime.deleteMany({});
        console.log(`🗑️ ¡Se eliminaron ${resultado.deletedCount} animes con éxito! Base de datos en ceros.`);
        
        await mongoose.disconnect();
    } catch (error) {
        console.error("❌ Error al limpiar:", error);
    }
}

limpiarBaseDeDatos();
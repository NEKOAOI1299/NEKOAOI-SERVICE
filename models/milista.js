const mongoose = require('mongoose');

const userAnimeSchema = new mongoose.Schema({
    usuario: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    anime: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Anime', 
        required: true 
    },
    estadoLista: { 
        type: String, 
        enum: ['planeo_ver', 'sigo_viendo', 'ya_vi'], 
        required: true 
    },
    creadoEn: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserAnime', userAnimeSchema);
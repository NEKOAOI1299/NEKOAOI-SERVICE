const mongoose = require('mongoose');

const foroPostSchema = new mongoose.Schema({
    user: { type: String, required: true },
    avatar: { type: String, default: '' },
    rank: { type: String, default: 'Novato del Anime' },
    category: { type: String, default: 'general' },
    content: { type: String, default: '' },
    media: { type: String, default: '' },
    reactions: {
        love: { type: Number, default: 0 },
        god: { type: Number, default: 0 },
        cry: { type: Number, default: 0 },
        filler: { type: Number, default: 0 }
    },
    comments: [{
        user: String,
        text: String,
        time: String
    }],
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ForoPost', foroPostSchema);
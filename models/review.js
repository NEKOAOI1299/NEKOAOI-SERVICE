const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    animeId: { type: String, required: true },
    user: { type: String, required: true },
    text: { type: String, required: true },
    hasSpoiler: { type: Boolean, default: false },
    likes: { type: [String], default: [] },
    replies: [{
        user: String,
        text: String,
        time: { type: String, default: 'Hace un momento' }
    }],
    timestamp: { type: Number, default: Date.now },
    timeAgo: { type: String, default: 'Hace un momento' }
});

// --- AÑADE ESTO PARA MAPEAR EL _ID A ID EN LAS RESEÑAS ---
reviewSchema.virtual('id').get(function() {
    return this._id.toHexString();
});

reviewSchema.set('toJSON', {
    virtuals: true
});

module.exports = mongoose.model('Review', reviewSchema);
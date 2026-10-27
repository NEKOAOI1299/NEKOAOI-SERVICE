const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true // Contraseña ya cifrada con bcrypt
    },
    // --- CAMPO NUEVO PARA GUARDAR LA FOTO DE PERFIL EN LA NUBE ---
    avatar: {
        type: String,
        default: ''
    },
    // Lista personal de animes de cada usuario
    myList: [{
        animeTitle: { type: String, required: true },
        image: { type: String },
        status: { type: String, default: 'Por ver' },
        addedAt: { type: Date, default: Date.now }
    }],
    level: {
        type: Number,
        default: 1
    },
    xp: {
        type: Number,
        default: 0
    },
    role: {
        type: String,
        default: 'user', // Puede ser 'user' o 'admin'
        enum: ['user', 'admin']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
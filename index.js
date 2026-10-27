const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');

// --- MÓDULOS DE SEGURIDAD ---
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

require('dotenv').config();
const Anime = require('./models/anime');
const User = require('./models/user');
const UserAnime = require('./models/milista');

const app = express();
app.use(session({
    secret: 'secreto_super_seguro_anibase',
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Servir archivos estáticos
app.use(express.static(__dirname));

// --- BLINDAJE DE SEGURIDAD ---
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

// Limitador general
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' }
});
app.use(generalLimiter);

// Limitador estricto para Login/Registro
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Demasiados intentos de acceso. Por favor espera.' }
});

// Conectar a MongoDB Atlas
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("¡Conexión exitosa a la base de datos de MongoDB Atlas! 🚀");
    app.listen(PORT, () => {
      console.log(`🔒 Servidor seguro corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error al conectar a la base de datos:", err);
  });

// RUTA PRINCIPAL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// RUTA DE REGISTRO
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'El nombre de usuario o correo ya están registrados.' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            avatar: ''
        });

        await newUser.save();

        return res.status(201).json({
            message: '¡Usuario registrado de forma segura en la base de datos!',
            user: { _id: newUser._id, username: newUser.username, email: newUser.email, avatar: '' }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error en el servidor al registrar el usuario.', detalle: error.message });
    }
});

// API DE ANIMES
app.post('/api/animes', async (req, res) => {
    try {
        const nuevoAnime = new Anime(req.body);
        const animeGuardado = await nuevoAnime.save();
        res.status(201).json({ 
            mensaje: '¡Anime guardado con éxito en la nube! 🌟', 
            anime: animeGuardado 
        });
    } catch (error) {
        res.status(400).json({ error: 'Error al guardar el anime', detalle: error.message });
    }
});

app.get('/api/animes', async (req, res) => {
    try {
        const listaAnimes = await Anime.find();
        res.status(200).json(listaAnimes);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los animes', detalle: error.message });
    }
});

app.post('/api/mi-lista', async (req, res) => {
    try {
        const { usuarioId, animeId, estadoLista } = req.body;

        if (!usuarioId || !animeId) {
            return res.status(400).json({ error: 'Faltan datos obligatorios (usuarioId o animeId).' });
        }

        let queryUsuario = usuarioId;
        if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
            const userFound = await User.findOne({ $or: [{ email: usuarioId }, { username: usuarioId }] });
            if (userFound) {
                queryUsuario = userFound._id;
            } else {
                return res.status(404).json({ error: 'Usuario no encontrado en la base de datos.' });
            }
        }

        let registro = await UserAnime.findOne({ usuario: queryUsuario, anime: animeId });

        if (registro) {
            registro.estadoLista = estadoLista;
            await registro.save();
        } else {
            registro = new UserAnime({ usuario: queryUsuario, anime: animeId, estadoLista: estadoLista || 'planeo_ver' });
            await registro.save();
        }
        res.status(200).json({ mensaje: '¡Lista actualizada con éxito!', registro });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la lista personal', detalle: error.message });
    }
});

app.get('/api/mi-lista/:usuarioId', async (req, res) => {
    try {
        let { usuarioId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
            const userFound = await User.findOne({ $or: [{ email: usuarioId }, { username: usuarioId }] });
            if (userFound) {
                usuarioId = userFound._id;
            } else {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
        }

        const listaUsuario = await UserAnime.find({ usuario: usuarioId }).populate('anime');
        res.status(200).json(listaUsuario);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista personal', detalle: error.message });
    }
});

// --- RUTA DE LOGIN ---
app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Por favor ingresa tu correo y contraseña.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }

        return res.status(200).json({
            message: `¡Bienvenido de nuevo, ${user.username}! 🌟`,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || '',
                level: user.level || 1,
                xp: user.xp || 0,
                myList: user.myList || []
            }
        });

    } catch (error) {
        return res.status(500).json({ error: 'Error en el servidor al iniciar sesión.', detalle: error.message });
    }
});

// --- RUTA PARA GUARDAR/ACTUALIZAR EL AVATAR EN MONGODB ---
app.post('/api/user/avatar', async (req, res) => {
    try {
        const { userId, avatar } = req.body;

        if (!userId || !avatar) {
            return res.status(400).json({ error: 'Faltan datos (userId o avatar).' });
        }

        let user = null;

        if (mongoose.Types.ObjectId.isValid(userId)) {
            user = await User.findById(userId);
        }

        if (!user) {
            user = await User.findOne({ $or: [{ email: userId }, { username: userId }] });
        }

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado en la base de datos.' });
        }

        user.avatar = avatar;
        await user.save();

        res.status(200).json({
            message: '¡Foto de perfil actualizada en la nube con éxito!',
            avatar: user.avatar
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el avatar', detalle: error.message });
    }
});

// --- PASSPORT GOOGLE ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.get('/auth/google', (req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicCallback = `${protocol}://${host}/auth/google/callback`;

    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        callbackURL: dynamicCallback 
    })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicCallback = `${protocol}://${host}/auth/google/callback`;

    passport.authenticate('google', { 
        failureRedirect: '/',
        callbackURL: dynamicCallback,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.log("Error en autenticación de Google:", err);
            return res.redirect('/');
        }
        
        try {
            const googleUser = req.user._json || req.user;
            const email = googleUser.email || (googleUser.emails && googleUser.emails[0] ? googleUser.emails[0].value : 'google@user.com');
            const username = googleUser.name || googleUser.displayName || 'Usuario Google';
            const avatar = googleUser.picture || (googleUser.photos && googleUser.photos[0] ? googleUser.photos[0].value : '');

            let dbUser = await User.findOne({ email });
            if (!dbUser) {
                dbUser = new User({
                    username,
                    email,
                    password: await bcrypt.hash(Math.random().toString(36), 10),
                    avatar
                });
                await dbUser.save();
            }

            const userData = {
                _id: dbUser._id,
                username: dbUser.username,
                email: dbUser.email,
                avatar: dbUser.avatar
            };

            res.send(`
                <script>
                    localStorage.setItem('anibase_user', '${JSON.stringify(userData)}');
                    window.location.href = '/';
                </script>
            `);
        } catch (e) {
            console.error("Error procesando usuario de Google:", e);
            res.redirect('/');
        }
    });
});

module.exports = app;
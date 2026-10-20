const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// --- MÓDULOS DE SEGURIDAD NUEVOS ---
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

require('dotenv').config();
const Anime = require('./models/anime');
const User = require('./models/user');
const UserAnime = require('./models/milista'); // Importamos el modelo de la lista personal

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

app.use(express.json());
app.use(cors());

// --- BLINDAJE DE SEGURIDAD ---
app.use(helmet()); // Protege los encabezados HTTP del servidor

// Limitador general contra ataques de fuerza bruta / bots
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Máximo 100 peticiones por IP
    message: { error: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' }
});
app.use(generalLimiter);

// Limitador estricto exclusivo para rutas de Autenticación (Login/Registro)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10, // Máximo 10 intentos por hora
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

// --- RUTA DE REGISTRO SEGURO CONECTADA A MONGODB ---
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
        }

        // Verificar si el usuario o el correo ya están registrados en la base de datos
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'El nombre de usuario o correo ya están registrados.' });
        }

        // Hashear la contraseña con bcrypt de forma segura antes de guardarla
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Crear el nuevo usuario usando el modelo y la contraseña cifrada
        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        return res.status(201).json({
            message: '¡Usuario registrado de forma segura en la base de datos!',
            user: { _id: newUser._id, username: newUser.username, email: newUser.email }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error en el servidor al registrar el usuario.', detalle: error.message });
    }
});

// Ruta de prueba inicial
app.get('/', (req, res) => {
  res.send('El servidor de AniBase está activo, funcionando y blindado.');
});

// ==========================================
// RUTAS DE LA API DE ANIBASE
// ==========================================

// 1. Ruta para CREAR/GUARDAR un nuevo anime
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

// 2. Ruta para OBTENER la lista de animes
app.get('/api/animes', async (req, res) => {
    try {
        const listaAnimes = await Anime.find();
        res.status(200).json(listaAnimes);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los animes', detalle: error.message });
    }
});

// 3. Ruta para AGREGAR o ACTUALIZAR un anime en la lista personal del usuario
app.post('/api/mi-lista', async (req, res) => {
    try {
        const { usuarioId, animeId, estadoLista } = req.body;

        if (!usuarioId || !animeId) {
            return res.status(400).json({ error: 'Faltan datos obligatorios (usuarioId o animeId).' });
        }

        // Determinar si usuarioId es un ObjectId válido o un email/username de respaldo
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

// 4. Ruta para OBTENER la lista de un usuario específico
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

// --- RUTA DE LOGIN SEGURO ---
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

        // Devolvemos explícitamente el _id para que el frontend lo reconozca al guardar listas
        return res.status(200).json({
            message: `¡Bienvenido de nuevo, ${user.username}! 🌟`,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                level: user.level || 1,
                xp: user.xp || 0,
                myList: user.myList || []
            }
        });

    } catch (error) {
        return res.status(500).json({ error: 'Error en el servidor al iniciar sesión.', detalle: error.message });
    }
});

// --- CONFIGURACIÓN DE PASSPORT GOOGLE ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5000/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// --- RUTAS DE AUTENTICACIÓN CON GOOGLE ---
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
       res.redirect('/'); 
    }
);
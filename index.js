const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const ForoPost = require('./models/foroPost');

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

// API DE ANIMES (CREAR)
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

// API DE ANIMES (OBTENER CON PAGINACIÓN Y FILTROS)
app.get('/api/animes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const { titulo, genero, estado, tipo, temporada, anio, ordenar } = req.query;
        let filtro = {};

        if (titulo) {
            filtro.$or = [
                { titulo: { $regex: titulo, $options: 'i' } },
                { 'titulosAlternativos.ingles': { $regex: titulo, $options: 'i' } },
                { 'titulosAlternativos.romaji': { $regex: titulo, $options: 'i' } }
            ];
        }

        if (tipo && tipo !== '' && tipo !== 'Todos') {
            filtro.tipo = tipo;
        }

        if (estado && estado !== '' && estado !== 'Todos') {
            filtro.estado = estado;
        }

        if (genero && genero !== '' && genero !== 'Todos') {
            filtro.generos = { $regex: new RegExp('^' + genero + '$', 'i') };
        }

        if (temporada && temporada !== '') {
            filtro.temporada = { $regex: temporada, $options: 'i' };
        }

        if (anio && anio !== '' && anio !== 'Todos') {
            filtro.anio = Number(anio);
        }

let orden = { puntuacion: -1 }; // Por defecto más popular
        if (ordenar === 'popular_asc' || ordenar === 'menos populares') {
            orden = { puntuacion: 1 };
        } else if (ordenar === 'popular_desc' || ordenar === 'más populares') {
            orden = { puntuacion: -1 };
        } else if (ordenar === 'recent' || ordenar === 'recién agregados') {
            orden = { creadoEn: -1, _id: -1 };
        } else if (ordenar === 'az' || ordenar === 'alfabético (a-z)') {
            orden = { titulo: 1 };
        }        const totalAnimes = await Anime.countDocuments(filtro);

        const animes = await Anime.find(filtro)
            .sort(orden)
            .skip(skip)
            .limit(limit)
            .lean();

        res.status(200).json({
            animes,
            currentPage: page,
            totalPages: Math.ceil(totalAnimes / limit) || 1,
            totalAnimes
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los animes', detalle: error.message });
    }
});

// RUTA PARA ELIMINAR UN ANIME POR SU ID
app.delete('/api/animes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const animeEliminado = await Anime.findByIdAndDelete(id);
        
        if (!animeEliminado) {
            return res.status(404).json({ error: 'Anime no encontrado en la base de datos.' });
        }

        res.status(200).json({ mensaje: '¡Anime eliminado con éxito de la base de datos!' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el anime', detalle: error.message });
    }
});

app.post('/api/mi-lista', async (req, res) => {
    try {
        const { usuarioId, animeId, estadoLista } = req.body;

        if (estadoLista === 'eliminar') {
            await UserAnime.deleteMany({ usuario: usuarioId, anime: animeId });
            return res.status(200).json({ message: 'Anime eliminado de la lista exitosamente' });
        }

        const actualizado = await UserAnime.findOneAndUpdate(
            { usuario: usuarioId, anime: animeId },
            { estadoLista: estadoLista },
            { upsert: true, new: true }
        );

        res.status(200).json({ message: 'Lista actualizada', data: actualizado });
    } catch (error) {
        console.error("Error en /api/mi-lista:", error);
        res.status(500).json({ error: 'Error interno en el servidor' });
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
        const listaValida = listaUsuario.filter(item => item.anime !== null);
        res.status(200).json(listaValida);
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

// OBTENER POSTS DEL FORO
app.get('/api/foro', async (req, res) => {
    try {
        const posts = await ForoPost.find().sort({ timestamp: -1 });
        res.status(200).json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los posts del foro', detalle: error.message });
    }
});

// CREAR POST EN EL FORO
app.post('/api/foro', async (req, res) => {
    try {
        const nuevoPost = new ForoPost(req.body);
        const guardado = await nuevoPost.save();
        res.status(201).json(guardado);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el post', detalle: error.message });
    }
});

// ACTUALIZAR REACCIONES DE UN POST
app.post('/api/foro/:id/react', async (req, res) => {
    try {
        const { reaction } = req.body;
        const post = await ForoPost.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post no encontrado' });

        if (post.reactions[reaction] !== undefined) {
            post.reactions[reaction] += 1;
            await post.save();
        }
        res.status(200).json(post);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar reacción', detalle: error.message });
    }
});

// ELIMINAR POST DEL FORO
app.delete('/api/foro/:id', async (req, res) => {
    try {
        await ForoPost.findByIdAndDelete(req.params.id);
        res.status(200).json({ mensaje: 'Post eliminado con éxito' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el post', detalle: error.message });
    }
});

app.post('/api/foro/:id/comment', async (req, res) => {
    try {
        const { user, text } = req.body;
        const post = await ForoPost.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });

        post.comments.push({
            user: user || 'Anónimo',
            text,
            time: 'Hace un momento'
        });

        await post.save();
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: 'Error al guardar el comentario' });
    }
});

const Review = require('./models/review');

app.get('/api/animes/:animeId/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ animeId: req.params.animeId }).sort({ timestamp: -1 });
        res.status(200).json(reviews);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener reseñas' });
    }
});

app.post('/api/animes/:animeId/reviews', async (req, res) => {
    try {
        const nuevaReseña = new Review({
            animeId: req.params.animeId,
            ...req.body
        });
        const guardada = await nuevaReseña.save();
        res.status(201).json(guardada);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar la reseña' });
    }
});

app.post('/api/reviews/:reviewId/like', async (req, res) => {
    try {
        const { username } = req.body;
        const review = await Review.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ error: 'Reseña no encontrada' });

        const index = review.likes.indexOf(username);
        if (index > -1) {
            review.likes.splice(index, 1);
        } else {
            review.likes.push(username);
        }
        await review.save();
        res.status(200).json(review);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar like' });
    }
});

app.post('/api/reviews/:reviewId/reply', async (req, res) => {
    try {
        const { user, text } = req.body;
        const review = await Review.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ error: 'Reseña no encontrada' });

        review.replies.push({ user, text, time: 'Hace un momento' });
        await review.save();
        res.status(200).json(review);
    } catch (error) {
        res.status(500).json({ error: 'Error al responder reseña' });
    }
});

app.delete('/api/reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
        if (mongoose.Types.ObjectId.isValid(reviewId)) {
            await Review.findByIdAndDelete(reviewId);
            return res.status(200).json({ mensaje: 'Reseña eliminada de MongoDB' });
        }
        return res.status(200).json({ mensaje: 'Reseña local eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar reseña', detalle: error.message });
    }
});

async function sincronizarAnimesConAniList() {
    console.log('🤖 [BOT] Sincronización limpia y estructurada iniciada...');
    
    const query = `
    query {
      Page(perPage: 50) {
        media(type: ANIME, sort: [POPULARITY_DESC]) {
          id
          title {
            romaji
            english
            native
          }
          status
          seasonYear
          episodes
          averageScore
          isAdult
          coverImage {
            large
          }
          description
          genres
          format
          studios(isMain: true) {
            nodes {
              name
            }
          }
          startDate {
            year
            month
            day
          }
        }
      }
    }`;

    try {
        const response = await axios.post('https://graphql.anilist.co', { query });
        const animesApi = response.data.data.Page.media;

        for (let item of animesApi) {
            // DETECCIÓN Y FILTRO HENTAI / ADULTO
            const esHentai = item.isAdult || (item.genres && item.genres.some(g => g.toLowerCase().includes('hentai')));
            
            let generosFinales = item.genres || [];
            if (esHentai && !generosFinales.includes('Hentai')) {
                generosFinales.push('Hentai'); // Aseguramos que la etiqueta Hentai quede registrada si decides filtrarla
            }

            // MAPEO EXACTO DE LOS FORMATOS (Las 10 etiquetas)
            let formatoMapeado = 'Serie'; // Por defecto
            switch (item.format) {
                case 'TV': formatoMapeado = 'Serie TV'; break;
                case 'TV_SHORT': formatoMapeado = 'Corto TV'; break;
                case 'MOVIE': formatoMapeado = 'Película'; break;
                case 'OVA': formatoMapeado = 'OVA'; break;
                case 'ONA': formatoMapeado = 'ONA'; break;
                case 'SPECIAL': formatoMapeado = 'Especial'; break;
                case 'MUSIC': formatoMapeado = 'Música'; break;
                case 'MANGA': formatoMapeado = 'Manga'; break;
                case 'NOVEL': formatoMapeado = 'Novela Ligera'; break;
                case 'ONE_SHOT': formatoMapeado = 'One-Shot'; break;
                default: formatoMapeado = 'Serie TV';
            }

            let estadoMapeado = 'En emisión';
            if (item.status === 'NOT_YET_RELEASED') estadoMapeado = 'Próximamente';
            if (item.status === 'FINISHED') estadoMapeado = 'Finalizado';

            const tituloAnime = item.title.romaji || item.title.english || 'Sin título';
            const estudioNombre = item.studios && item.studios.nodes[0] ? item.studios.nodes[0].name : 'Desconocido';
            const puntuacionReal = item.averageScore ? (item.averageScore / 10).toFixed(1) : 0.0;

            let fechaEstrenoStr = '';
            if (item.startDate && item.startDate.year) {
                fechaEstrenoStr = `${item.startDate.year}-${String(item.startDate.month || 1).padStart(2, '0')}-${String(item.startDate.day || 1).padStart(2, '0')}`;
            }

            await Anime.findOneAndUpdate(
                { titulo: tituloAnime },
                {
                    titulo: tituloAnime,
                    titulosAlternativos: {
                        ingles: item.title.english || '',
                        romaji: item.title.romaji || '',
                        japones: item.title.native || ''
                    },
                    sinopsis: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Sin descripción',
                    imagenUrl: item.coverImage ? item.coverImage.large : '',
                    estado: estadoMapeado,
                    tipo: formatoMapeado, // AQUÍ SE GUARDA EL FORMATO REAL (OVA, ONA, Película, etc.)
                    puntuacion: puntuacionReal,
                    episodios: item.episodios || item.episodes || 0,
                    generos: generosFinales,
                    anio: item.seasonYear || new Date().getFullYear(),
                    estudio: estudioNombre,
                    fechaEstreno: fechaEstrenoStr,
                    esAdulto: esHentai
                },
                { upsert: true, new: true }
            );
        }

        console.log('🤖 [BOT] Sincronización masiva finalizada con éxito y formatos organizados.');
    } catch (error) {
        console.error('❌ Error en la sincronización del bot:', error.message);
    }
}

module.exports = app;
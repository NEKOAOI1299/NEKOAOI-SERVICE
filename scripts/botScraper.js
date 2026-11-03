const mongoose = require('mongoose');
const https = require('https');
require('dotenv').config();

const Anime = require('../models/anime');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Función alternativa utilizando una API pública libre de bloqueos anti-bot
async function traducirTexto(texto) {
    if (!texto) return 'Sin descripción disponible.';
    try {
        const urlObj = new URL(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto.substring(0, 450))}&langpair=en|es`);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };

        const data = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => resolve(body));
            });
            req.on('error', (err) => reject(err));
            req.end();
        });
        
        const parsed = JSON.parse(data);
        if (parsed && parsed.responseData && parsed.responseData.translatedText) {
            return parsed.responseData.translatedText;
        }
        return texto;
    } catch (e) {
        console.error("⚠️ Error en la traducción:", e.message);
        return texto;
    }
}

async function importAnime(animeName) {
    if (!animeName) {
        console.error('❌ Por favor proporciona el nombre de un anime.');
        process.exit(1);
    }

    try {
        console.log(`🔌 Conectando a MongoDB...`);
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Conexión establecida con la base de datos.`);

        console.log(`🔍 Buscando "${animeName}" en AniList API...`);

        const query = `
        query ($search: String) {
          Media (search: $search, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              extraLarge
              large
              medium
            }
            format
            status
            genres
            episodes
            averageScore
            seasonYear
            season
            startDate {
              year
            }
          }
        }`;

        const postData = JSON.stringify({
            query: query,
            variables: { search: animeName }
        });

        const options = {
            hostname: 'graphql.anilist.co',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };

        const data = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => reject(err));
            req.write(postData);
            req.end();
        });

        const animeData = data?.data?.Media;

        if (!animeData) {
            console.log(`⚠️ No se encontró ningún anime con el nombre: "${animeName}"`);
            await mongoose.disconnect();
            return;
        }

        console.log(`🌐 Traduciendo sinopsis al español...`);
        const sinopsisIngles = animeData.description ? animeData.description.replace(/<[^>]*>?/gm, '') : 'Sin descripción disponible.';
        const sinopsisEspanol = await traducirTexto(sinopsisIngles);

        const urlImagen = animeData.coverImage?.extraLarge || animeData.coverImage?.large || animeData.coverImage?.medium || '';

        // Traducir la estación del inglés de AniList al español
        const estaciones = {
            'WINTER': 'Invierno',
            'SPRING': 'Primavera',
            'SUMMER': 'Verano',
            'FALL': 'Otoño'
        };
        const temporadaEspanol = estaciones[animeData.season] || 'Otoño';
        const anioReal = animeData.startDate?.year || animeData.seasonYear || 2024;


        // Mapeo adaptado exactamente al esquema models/anime.js
       const animePayload = {
            titulo: animeData.title.romaji || animeData.title.english,
            titulosAlternativos: {
                ingles: animeData.title.english || '',
                romaji: animeData.title.romaji || '',
                japones: animeData.title.native || '',
                espanol: animeData.title.english || ''
            },
            tipo: animeData.format === 'MOVIE' ? 'Película' : 'Serie',
            anio: Number(anioReal),
            temporada: temporadaEspanol,
            generos: animeData.genres || [],
            estado: animeData.status === 'RELEASING' ? 'En emisión' : 'Finalizado',
            episodiosTotales: animeData.episodes || 0,
            puntuacion: animeData.averageScore ? (animeData.averageScore / 10) : 8.5,
            sinopsis: sinopsisEspanol,
            imagenPortada: urlImagen,
            imagenUrl: urlImagen
        };
   
        // 1. Borramos cualquier registro previo con el mismo título para evitar duplicados
        await Anime.deleteOne({ titulo: animePayload.titulo });

        // 2. Guardamos el nuevo documento con los campos de año y temporada incluidos
        const nuevoAnime = new Anime(animePayload);
        const animeGuardado = await nuevoAnime.save();

        console.log(`\n🎉 ¡Anime procesado y sincronizado con éxito!`);
        console.log(`📌 Título: ${animeGuardado.titulo}`);
        console.log(`📅 Año: ${animeGuardado.anio} | 🍂 Temporada: ${animeGuardado.temporada}`);
        console.log(`🖼️ Imagen: ${animeGuardado.imagenPortada}`);
        console.log(`📝 Sinopsis (Español): ${animeGuardado.sinopsis.substring(0, 100)}...\n`);

    } catch (error) {
        console.error('❌ Error durante la importación:', error);
    } finally {
        await mongoose.disconnect();
        console.log(`🔌 Conexión con MongoDB cerrada.`);
    }
}

const args = process.argv.slice(2);
const searchName = args.join(' ');

importAnime(searchName);
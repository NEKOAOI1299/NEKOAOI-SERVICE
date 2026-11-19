const mongoose = require('mongoose');
const https = require('https');
require('dotenv').config();

const Anime = require('../models/anime');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

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

        // CONSULTA GRAPHQL OPTIMIZADA (Punto 5: Incluye tags y endDate)
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
            tags {
              name
              rank
            }
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                    english
                  }
                  coverImage {
                    large
                  }
                  format
                }
              }
            }
            episodes
            averageScore
            seasonYear
            season
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            studios(isMain: true) {
              nodes {
                name
              }
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

        // --- PUNTO 3: SINOPSIS EN INGLÉS LIMPIA DE HTML ---
        const sinopsisIngles = animeData.description ? animeData.description.replace(/<[^>]*>?/gm, '') : 'No synopsis available.';

        // --- PUNTO 4: GÉNEROS ORIGINALES EN INGLÉS ---
        const generosOriginales = animeData.genres || [];

        // --- PUNTO 5: EXTRACCIÓN DE TAGS (ORDENADOS POR RANK) ---
        const tagsExtraidos = animeData.tags ? animeData.tags.sort((a, b) => b.rank - a.rank).map(t => t.name) : [];

        const urlImagen = animeData.coverImage?.extraLarge || animeData.coverImage?.large || animeData.coverImage?.medium || '';

        // --- PUNTO 6: MAPEO EXACTO DE FORMATO (Adiós al error de que todo era Serie) ---
        let formatoMapeado = 'Serie';
        switch (animeData.format) {
            case 'TV': formatoMapeado = 'Serie'; break;
            case 'MOVIE': formatoMapeado = 'Película'; break;
            case 'OVA': formatoMapeado = 'OVA'; break;
            case 'ONA': formatoMapeado = 'ONA'; break;
            case 'SPECIAL': formatoMapeado = 'Especial'; break;
            case 'MUSIC': formatoMapeado = 'Música'; break;
            default: formatoMapeado = animeData.format || 'Serie';
        }

        const estudioPrincipal = animeData.studios?.nodes?.[0]?.name || 'Unknown';

        // --- PUNTO 2: PERIODO DE EMISIÓN Y FECHAS REALES ---
        const formatAniDate = (d) => {
            if (!d || !d.year) return '';
            return `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}`;
        };

        const fechaInicioStr = formatAniDate(animeData.startDate);
        let fechaFinStr = '';

        if (animeData.status === 'FINISHED') {
            fechaFinStr = formatAniDate(animeData.endDate) || (animeData.startDate?.year ? String(animeData.startDate.year) : 'Finished');
        } else if (animeData.status === 'NOT_YET_RELEASED') {
            fechaFinStr = 'Upcoming';
        } else {
            fechaFinStr = 'Releasing';
        }

        let periodoEmision = fechaInicioStr ? `${fechaInicioStr} → ${fechaFinStr}` : 'N/A';
        if (formatoMapeado === 'Película' && animeData.startDate?.year) {
            periodoEmision = `${animeData.startDate.year}`; // Las películas muestran únicamente su año
        }

        // --- PUNTO 1: CALIFICACIÓN REAL DE ANILIST (Adiós al 8.5 fijo) ---
        const puntuacionReal = animeData.averageScore ? (animeData.averageScore / 10).toFixed(1) : 0.0;

        const estaciones = {
            'WINTER': 'Invierno',
            'SPRING': 'Primavera',
            'SUMMER': 'Verano',
            'FALL': 'Otoño'
        };
        const temporadaEspanol = estaciones[animeData.season] || 'Invierno';
        const anioReal = animeData.startDate?.year || animeData.seasonYear || new Date().getFullYear();

        // Mapeo de relaciones de la franquicia
        const relacionesMapeadas = animeData.relations?.edges ? animeData.relations.edges.map(edge => ({
            titulo: edge.node.title.romaji || edge.node.title.english,
            tipoRelacion: edge.relationType,
            imagenUrl: edge.node.coverImage?.large || '',
            idAnilist: edge.node.id
        })) : [];

        const animePayload = {
            titulo: animeData.title.romaji || animeData.title.english,
            titulosAlternativos: {
                ingles: animeData.title.english || '',
                romaji: animeData.title.romaji || '',
                japones: animeData.title.native || '',
                espanol: ''
            },
            tipo: formatoMapeado,
            anio: Number(anioReal),
            temporada: temporadaEspanol,
            generos: generosOriginales, // <--- En inglés, listo para traducir después
            tags: tagsExtraidos,         // <--- Tags extraídos correctamente de AniList
            relaciones: relacionesMapeadas,
            estado: animeData.status === 'FINISHED' ? 'Finalizado' : (animeData.status === 'NOT_YET_RELEASED' ? 'Próximamente' : 'En emisión'),
            episodiosTotales: animeData.episodes || 0,
            puntuacion: puntuacionReal,  // <--- Puntuación real de la API
            sinopsis: sinopsisIngles,    // <--- Sinopsis en inglés limpia
            imagenPortada: urlImagen,
            imagenUrl: urlImagen,
            episodios: animeData.episodes || null,
            estudio: estudioPrincipal,
            estudioAnimacion: estudioPrincipal,
            fechaEstreno: periodoEmision,   // <--- Periodo de emisión exacto[cite: 8]
            fechaFinalizacion: fechaFinStr
        };   

        // Guardar o actualizar en MongoDB usando el título o ID único
        await Anime.deleteOne({ titulo: animePayload.titulo });
        const nuevoAnime = new Anime(animePayload);
        await nuevoAnime.save();

        console.log(`\n🎉 ¡Anime importado con éxito en crudo!`);
        console.log(`📌 Título: ${animePayload.titulo}`);
        console.log(`⭐ Puntuación: ${animePayload.puntuacion}`);
        console.log(`🎬 Formato: ${animePayload.tipo}`);
        console.log(`📅 Periodo: ${animePayload.fechaEstreno}`);
        console.log(`🏷️ Tags encontrados: ${animePayload.tags.length}\n`);

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
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const Anime = require('./models/anime'); 
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Diccionario de traducción de géneros
const traduccionGeneros = {
    "Action": "Acción", "Adventure": "Aventura", "Animation": "Animación",
    "Comedy": "Comedia", "Drama": "Drama", "Ecchi": "Ecchi",
    "Fantasy": "Fantasía", "Horror": "Terror", "Mahou Shoujo": "Mahou Shoujo",
    "Mecha": "Mecha", "Music": "Música", "Mystery": "Misterio",
    "Psychological": "Psicológico", "Romance": "Romance", "Sci-Fi": "Ciencia Ficción",
    "Slice of Life": "Recuentos de la vida", "Sports": "Deportes",
    "Supernatural": "Sobrenatural", "Thriller": "Suspenso", "Hentai": "Hentai"
};

// Traductor optimizado
async function traducirTexto(texto) {
    if (!texto) return 'Sin descripción';
    const textoLimpio = texto.replace(/<[^>]*>?/gm, '');
    try {
        const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textoLimpio.substring(0, 450))}&langpair=en|es`, { timeout: 3000 });
        if (res.data?.responseData?.translatedText) {
            return res.data.responseData.translatedText;
        }
    } catch (e) {}
    return textoLimpio;
}

async function procesarLote(animesLote) {
    await Promise.all(animesLote.map(async (animeDoc) => {
        let exito = false;
        let intentos = 0;

        while (!exito && intentos < 2) {
            try {
                const queryString = `
                    query ($search: String) {
                      Media (search: $search, type: ANIME) {
                        format
                        status
                        season
                        seasonYear
                        averageScore
                        episodes
                        description
                        genres
                        isAdult
                        startDate { year month day }
                        endDate { year month day }
                        relations {
                          edges {
                            relationType
                            node {
                              id
                              title { romaji english }
                              type
                              coverImage { large }
                            }
                          }
                        }
                      }
                    }
                `;

                const response = await axios({
                    url: 'https://graphql.anilist.co',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: { query: queryString, variables: { search: animeDoc.titulo } },
                    timeout: 6000
                });

                const media = response.data?.data?.Media;

                if (media) {
                    const sinopsisEspanol = await traducirTexto(media.description);
                    const generosTraducidos = media.genres ? media.genres.map(g => traduccionGeneros[g] || g) : [];

                    // Mapeo exhaustivo de TODOS los formatos posibles de AniList
                    let formatoMapeado = 'Serie';
                    if (media.format === 'MOVIE') formatoMapeado = 'Película';
                    else if (media.format === 'ONA') formatoMapeado = 'ONA';
                    else if (media.format === 'OVA') formatoMapeado = 'OVA';
                    else if (media.format === 'SPECIAL') formatoMapeado = 'Especial';
                    else if (media.format === 'TV_SHORT') formatoMapeado = 'Cortometraje';
                    else if (media.format === 'MUSIC') formatoMapeado = 'Música';
                    
                    // Detección automática si es Hentai por formato o etiqueta de adulto
                    if (media.isAdult || (media.genres && media.genres.includes('Hentai'))) {
                        formatoMapeado = 'Hentai';
                        if (!generosTraducidos.includes('Hentai')) generosTraducidos.push('Hentai');
                    }

                    let estadoMapeado = 'Finalizado';
                    if (media.status === 'RELEASING') estadoMapeado = 'En emisión';
                    if (media.status === 'NOT_YET_RELEASED') estadoMapeado = 'Próximamente';

                    let temporadaMapeada = 'Desconocida';
                    if (media.season && media.seasonYear) {
                        const estaciones = { 'WINTER': 'Invierno', 'SPRING': 'Primavera', 'SUMMER': 'Verano', 'FALL': 'Otoño' };
                        temporadaMapeada = `${estaciones[media.season] || media.season} ${media.seasonYear}`;
                    } else if (media.seasonYear) {
                        temporadaMapeada = `${media.seasonYear}`;
                    }

                    let inicioStr = '????-??-??';
                    if (media.startDate?.year) {
                        inicioStr = `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, '0')}-${String(media.startDate.day || 1).padStart(2, '0')}`;
                    }
                    
                    let finStr = 'Presente';
                    if (media.status === 'FINISHED' && media.endDate?.year) {
                        finStr = `${media.endDate.year}-${String(media.endDate.month || 1).padStart(2, '0')}-${String(media.endDate.day || 1).padStart(2, '0')}`;
                    } else if (media.status === 'RELEASING') {
                        finStr = 'En emisión';
                    }
                    const periodoEmisionReal = `${inicioStr} $\rightarrow$ ${finStr}`;

                    let calificacionReal = media.averageScore ? (media.averageScore / 10).toFixed(1) : '8.5';

                    let relacionesMapeadas = [];
                    if (media.relations?.edges) {
                        relacionesMapeadas = media.relations.edges.map(edge => ({
                            idAnilist: edge.node.id,
                            titulo: edge.node.title.romaji || edge.node.title.english || 'Sin título',
                            tipoRelacion: edge.relationType,
                            imagenUrl: edge.node.coverImage?.large || ''
                        }));
                    }

                    animeDoc.sinopsis = sinopsisEspanol;
                    animeDoc.generos = generosTraducidos;
                    animeDoc.tipo = formatoMapeado;
                    animeDoc.estado = estadoMapeado;
                    animeDoc.temporada = temporadaMapeada;
                    animeDoc.fechaEstreno = periodoEmisionReal;
                    animeDoc.puntuacion = Number(calificacionReal);
                    animeDoc.relaciones = relacionesMapeadas;
                    animeDoc.episodios = media.episodes || animeDoc.episodios;

                    await animeDoc.save();
                    console.log(`✨ [${formatoMapeado}] Actualizado: ${animeDoc.titulo}`);
                }
                exito = true;
            } catch (err) {
                intentos++;
                if (intentos < 2) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
    }));
}

async function repararAnimesFlash() {
    try {
        console.log('🔌 Conectando a MongoDB para modo ULTRA-RÁPIDO y formatos totales...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado exitosamente.');

        const animes = await Anime.find({});
        console.log(`📦 Total de animes a procesar: ${animes.length}`);

        const tamanoLote = 15;
        for (let i = 0; i < animes.length; i += tamanoLote) {
            const lote = animes.slice(i, i + tamanoLote);
            console.log(`\n🚀 Procesando bloque ${Math.floor(i/tamanoLote) + 1} de ${Math.ceil(animes.length/tamanoLote)}...`);
            
            await procesarLote(lote);
            
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        console.log('\n🎉 ¡REPARACIÓN TOTAL Y FLASH FINALIZADA!');
        mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

repararAnimesFlash();
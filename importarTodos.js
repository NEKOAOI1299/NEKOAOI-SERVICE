const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const Anime = require('./models/anime'); 

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function importarPorAnios() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado exitosamente a MongoDB.');

        let totalGlobalGuardados = 0;
        const anioActual = new Date().getFullYear();

        // Mapeo oficial de estaciones a español
        const estaciones = {
            'WINTER': 'Invierno',
            'SPRING': 'Primavera',
            'SUMMER': 'Verano',
            'FALL': 'Otoño'
        };

        // Recorremos desde el año 1980 hasta el año actual
        for (let anio = 1980; anio <= anioActual; anio++) {
            let paginaActual = 1;
            let hayMasPaginas = true;
            let aniosGuardadosLocales = 0;

            console.log(`\n📅 Procesando animes del año ${anio}...`);

            const queryString = `
                query ($page: Int, $perPage: Int, $seasonYear: Int) {
                  Page(page: $page, perPage: $perPage) {
                    pageInfo {
                      hasNextPage
                    }
                    media(type: ANIME, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
                      id
                      title {
                        romaji
                        english
                        native
                      }
                      status
                      seasonYear
                      season
                      episodes
                      averageScore
                      isAdult
                      coverImage {
                        large
                      }
                      description
                      genres
                      tags {
                        name
                        rank
                      }
                      format
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
                      endDate {
                        year
                        month
                        day
                      }
                    }
                  }
                }
            `;

            while (hayMasPaginas) {
                try {
                    const response = await axios({
                        url: 'https://graphql.anilist.co',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        data: {
                            query: queryString,
                            variables: {
                                page: paginaActual,
                                perPage: 50,
                                seasonYear: anio
                            }
                        }
                    });

                    const pageData = response.data.data.Page;
                    const animesApi = pageData.media;

                    if (!animesApi || animesApi.length === 0) break;

                    for (let item of animesApi) {
                        // FILTRO: Si es contenido adulto / Hentai, lo ignoramos
                        const esHentai = item.isAdult || (item.genres && item.genres.some(g => g.toLowerCase().includes('hentai')));
                        if (esHentai) {
                            continue;
                        }

                        let formatoMapeado = item.format || 'Serie';
                        switch (item.format) {
                            case 'TV': formatoMapeado = 'Serie'; break;
                            case 'MOVIE': formatoMapeado = 'Película'; break;
                            case 'OVA': formatoMapeado = 'OVA'; break;
                            case 'ONA': formatoMapeado = 'ONA'; break;
                            case 'SPECIAL': formatoMapeado = 'Especial'; break;
                            case 'MUSIC': formatoMapeado = 'Música'; break;
                            default: formatoMapeado = item.format || 'Serie';
                        }

                        let estadoMapeado = 'En emisión';
                        if (item.status === 'NOT_YET_RELEASED') estadoMapeado = 'Próximamente';
                        if (item.status === 'FINISHED') estadoMapeado = 'Finalizado';

                        const tituloAnime = item.title.romaji || item.title.english || 'Sin título';
                        const estudioNombre = item.studios && item.studios.nodes[0] ? item.studios.nodes[0].name : 'Desconocido';

                        // PUNTUACIÓN REAL
                        const puntuacionReal = item.averageScore ? (item.averageScore / 10).toFixed(1) : 0.0;

                        // CORRECCIÓN DE FECHAS Y PERIODO DE EMISIÓN (Sin duplicados)
                        const formatAniDate = (d) => {
                            if (!d || !d.year) return '';
                            return `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}`;
                        };

                        const fechaInicioStr = formatAniDate(item.startDate);
                        let fechaFinStr = '';

                        if (item.status === 'FINISHED') {
                            fechaFinStr = formatAniDate(item.endDate) || (item.startDate?.year ? String(item.startDate.year) : 'Finalizado');
                        } else if (item.status === 'NOT_YET_RELEASED') {
                            fechaFinStr = 'Próximamente';
                        } else {
                            fechaFinStr = 'En emisión';
                        }

                        let periodoEmision = fechaInicioStr ? `${fechaInicioStr} → ${fechaFinStr}` : 'N/A';
                        if (formatoMapeado === 'Película' && item.startDate?.year) {
                            periodoEmision = `${item.startDate.year}`; // Las películas muestran únicamente su año
                        } else if (fechaInicioStr === fechaFinStr || !fechaFinStr || fechaFinStr === 'Finalizado') {
                            periodoEmision = fechaInicioStr || `${anio}`;
                        }

                        // TEMPORADA EN ESPAÑOL (Invierno, Primavera, Verano, Otoño)
                        const temporadaEspanol = estaciones[item.season] || 'Invierno';

                        // TAGS EXTRAÍDOS DE ANILIST
                        const tagsExtraidos = item.tags ? item.tags.sort((a, b) => b.rank - a.rank).map(t => t.name) : [];

                        // RELACIONES DE LA FRANQUICIA (Precuelas, Secuelas, etc.)
                        const relacionesMapeadas = item.relations?.edges ? item.relations.edges.map(edge => ({
                            titulo: edge.node.title.romaji || edge.node.title.english,
                            tipoRelacion: edge.relationType,
                            imagenUrl: edge.node.coverImage?.large || '',
                            idAnilist: edge.node.id
                        })) : [];

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
                                tipo: formatoMapeado,
                                puntuacion: puntuacionReal,
                                episodios: item.episodes || 0,
                                generos: item.genres || [],
                                tags: tagsExtraidos,
                                relaciones: relacionesMapeadas, // <--- Aquí se guardan las relaciones de la franquicia
                                anio: item.seasonYear || anio,
                                temporada: temporadaEspanol,     // <--- Aquí se guarda la estación corregida
                                estudio: estudioNombre,
                                fechaEstreno: periodoEmision,    // <--- Periodo limpio sin repetir
                                fechaFinalizacion: fechaFinStr,
                                esAdulto: false
                            },
                            { upsert: true, new: true }
                        );
                        aniosGuardadosLocales++;
                        totalGlobalGuardados++;
                    }

                    hayMasPaginas = pageData.pageInfo.hasNextPage;
                    paginaActual++;

                    await new Promise(resolve => setTimeout(resolve, 800));

                } catch (error) {
                    console.error(`⚠️ Error en año ${anio} (página ${paginaActual}):`, error.response?.data || error.message);
                    console.log('Reintentando en 5 segundos...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            console.log(`✅ Año ${anio} completado. Animes de este año: ${aniosGuardadosLocales} | Total acumulado: ${totalGlobalGuardados}`);
        }

        console.log(`\n🎉 ¡PROCESO HISTÓRICO COMPLETADO! Se procesaron un total de ${totalGlobalGuardados} animes limpios.`);
        mongoose.connection.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Error general de conexión:', err);
    }
}

importarPorAnios();
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
                      media(type: ANIME, seasonYear: $seasonYear) {
                      id
                      title {
                        romaji
                        english
                        native
                      }
                      status
                      seasonYear
                      episodes
                      coverImage {
                        large
                      }
                      description
                      genres
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
                        let estadoMapeado = 'En emisión';
                        if (item.status === 'NOT_YET_RELEASED') estadoMapeado = 'Próximamente';
                        if (item.status === 'FINISHED') estadoMapeado = 'Finalizado';

                        const tituloAnime = item.title.romaji || item.title.english || 'Sin título';
                        const estudioNombre = item.studios && item.studios.nodes[0] ? item.studios.nodes[0].name : '';

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
                                episodios: item.episodes || 0,
                                generos: item.genres || [],
                                anio: item.seasonYear || anio,
                                estudio: estudioNombre,
                                fechaEstreno: fechaEstrenoStr
                            },
                            { upsert: true, new: true }
                        );
                        aniosGuardadosLocales++;
                        totalGlobalGuardados++;
                    }

                    hayMasPaginas = pageData.pageInfo.hasNextPage;
                    paginaActual++;

                    // Pausa ligera entre páginas para cuidar la API
                    await new Promise(resolve => setTimeout(resolve, 800));

                } catch (error) {
                    console.error(`⚠️ Error en año ${anio} (página ${paginaActual}):`, error.response?.data || error.message);
                    console.log('Reintentando en 5 segundos...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            console.log(`✅ Año ${anio} completado. Animes de este año: ${aniosGuardadosLocales} | Total acumulado: ${totalGlobalGuardados}`);
        }

        console.log(`\n🎉 ¡PROCESO HISTÓRICO COMPLETADO! Se procesaron un total de ${totalGlobalGuardados} animes de 1980 a ${anioActual}.`);
        mongoose.connection.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Error general de conexión:', err);
    }
}

importarPorAnios();
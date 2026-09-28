// Plugin local de Netlify: guarda la base de datos del scraper en la caché de
// builds para que cada actualización solo pida lo nuevo (≈30 peticiones por jornada).
const DB_FILES = ['data/d3basket.db']

module.exports = {
  async onPreBuild({ utils }) {
    const restored = await utils.cache.restore(DB_FILES)
    console.log(restored ? 'Base de datos restaurada desde la caché' : 'Sin caché previa: sincronización completa')
  },
  async onPostBuild({ utils }) {
    await utils.cache.save(DB_FILES)
    console.log('Base de datos guardada en la caché de builds')
  }
}

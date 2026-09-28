import type { Config } from '@netlify/functions'

/**
 * Actualización diaria de los datos: lanza un nuevo build (que ejecuta el
 * scraper). Requiere la variable de entorno BUILD_HOOK_URL con la URL de un
 * Build hook del proyecto (Project configuration → Build & deploy → Build hooks).
 */
export default async () => {
  const hook = Netlify.env.get('BUILD_HOOK_URL')
  if (!hook) {
    console.log('BUILD_HOOK_URL no está configurada: no se lanza la actualización')
    return
  }
  const res = await fetch(hook, { method: 'POST' })
  console.log(`Build hook → HTTP ${res.status}`)
}

// Todos los días a las 06:00 UTC (08:00 en España en verano).
export const config: Config = {
  schedule: '0 6 * * *'
}

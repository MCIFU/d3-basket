import type { Config } from '@netlify/functions'

/**
 * Actualización de los datos (viernes, sábado y domingo a las 08:00 en España): lanza un nuevo build (que ejecuta el
 * scraper). Requiere la variable de entorno BUILD_HOOK_URL con la URL de un
 * Build hook del proyecto (Project configuration → Build & deploy → Build hooks).
 */
export default async () => {
  // El cron va en UTC: se lanza a las 06:00 y 07:00 UTC y solo sigue la que
  // cae a las 08:00 en Madrid (06:00 en horario de verano, 07:00 en invierno).
  const hora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
  if (hora !== '08') return
  const hook = Netlify.env.get('BUILD_HOOK_URL')
  if (!hook) {
    console.log('BUILD_HOOK_URL no está configurada: no se lanza la actualización')
    return
  }
  const res = await fetch(hook, { method: 'POST' })
  console.log(`Build hook → HTTP ${res.status}`)
}

// Viernes, sábado y domingo a las 06:00 y 07:00 UTC (una de las dos son las 08:00 en España).
export const config: Config = {
  schedule: '0 6,7 * * 5,6,0'
}

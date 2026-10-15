/**
 * Orquestador del scraper de la FEB (Primera FEB, Segunda FEB...):
 * calendario → plantillas y datos de club → fichas y trayectorias → boxscores.
 * Incremental como el de la ACB: los boxscores guardados y las fichas recientes se saltan.
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import type { HttpClient } from '../core/http'
import type { NCalendar, NTeam } from '../types'
import type { AcbSyncOptions, SyncSummary } from '../acb/sync'
import { febStage, parseFebBoxscore, parseFebCalendar, parseFebGroups, parseFebPlayer, parseFebResults, parseFebTeam } from './parsers'
import { FEB_COMPETITIONS, febUrls, type FebCompetition } from './urls'

/** Temporada en curso: desde agosto se considera la nueva. */
export const currentSeasonStart = (d = new Date()) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1)

export class FebScraper {
  private readonly w: Writer

  constructor(
    private readonly db: DB,
    private readonly http: HttpClient
  ) {
    this.w = new Writer(db)
  }

  async sync(competition: FebCompetition, opts: AcbSyncOptions & { season?: number } = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const { g, name } = FEB_COMPETITIONS[competition]
    const startYear = opts.season ?? currentSeasonStart()
    // La Copa España se juega desde 2024-25: antes no existía.
    if (competition === 'COPA_ESPANA' && startYear < 2024) throw new Error('La Copa España empezó en la temporada 2024-25')
    // Los campeonatos de formación se juegan en primavera: la FEB devuelve la edición anterior si se
    // pide una que aún no existe.
    if (/^CES?A?_/.test(competition) && startYear >= currentSeasonStart()) throw new Error(`${name} ${startYear}: aún no se ha disputado`)
    const label = `${name} ${startYear}-${String(startYear + 1).slice(-2)}`
    const runId = this.w.startRun('feb', `${competition}:${startYear}`)
    const summary: SyncSummary = {
      edition: label,
      competitionSeasonId: 0,
      teams: 0,
      games: 0,
      rosters: 0,
      players: 0,
      playerBios: 0,
      boxscores: 0,
      careerSeasons: 0,
      history: false,
      requests: 0,
      errors: []
    }
    try {
      log(`▶ ${label}: calendario`)
      opts.onProgress?.({ stage: 'calendar', done: 0, total: 1 })
      const cup = competition === 'COPA_ESPANA'
      // Campeonatos de formación: menores de edad, sin foto.
      const minors = /^CES?A?_/.test(competition)
      const noPhoto = <T extends { photoUrl?: string; photoNobgUrl?: string }>(p: T): T => (minors ? { ...p, photoUrl: undefined, photoNobgUrl: undefined } : p)
      // Copa: la FEB usa el mismo id de equipo que en la liga. El club es el mismo, pero el equipo de
      // copa lleva su propia ref para no pisar el enlace del equipo de liga. Sin plantillas ni fichas
      // (los jugadores son los de la liga) ni enlace de clubes (ya son los de la liga).
      const own = (t: NTeam): NTeam => (cup ? { ...t, ref: { ...t.ref, id: `${t.ref.id}-copa` } } : t)
      if (cup) opts = { ...opts, rosters: false, players: false }
      const cal = await this.calendar(g, competition, startYear, label)
      cal.teams = cal.teams.map(own)
      cal.games = cal.games.map((x) => ({ ...x, homeTeam: own(x.homeTeam), awayTeam: own(x.awayTeam) }))
      cal.edition.isCurrent = startYear === currentSeasonStart()
      const csId = this.w.transaction(() => {
        const csId = this.w.upsertEdition(cal.edition)
        const ids = new Map(cal.teams.map((t) => [t.ref.id, this.w.upsertTeam(csId, t, { updateClubName: true })]))
        for (const game of cal.games) this.w.upsertGame(csId, game, ids.get(game.homeTeam.ref.id)!, ids.get(game.awayTeam.ref.id)!)
        this.w.refreshRoundDates(csId)
        return csId
      })
      summary.competitionSeasonId = csId
      summary.teams = cal.teams.length
      summary.games = cal.games.length
      log(`  ${cal.teams.length} equipos, ${cal.games.length} partidos (${cal.games.filter((x) => x.status === 'finished').length} jugados)`)

      const knockout = await this.knockoutGames(g, startYear)
      if (knockout.length) {
        this.w.transaction(() => {
          for (const game of knockout) {
            const home = this.w.upsertTeam(csId, own(game.homeTeam))
            const away = this.w.upsertTeam(csId, own(game.awayTeam))
            this.w.upsertGame(csId, game, home, away)
          }
          this.w.refreshRoundDates(csId)
        })
        summary.games += knockout.length
        log(`  ${knockout.length} partidos de eliminatorias (playoffs, permanencia)`)
      }

      if (opts.rosters !== false) {
        log('▶ Plantillas y datos de club')
        for (const [i, team] of cal.teams.entries()) {
          opts.onProgress?.({ stage: 'rosters', done: i, total: cal.teams.length, message: team.name })
          const url = febUrls.team(team.ref.id)
          try {
            const roster = parseFebTeam((await this.http.get(url)).body, team.ref.id)
            this.w.transaction(() => {
              const teamId = this.w.upsertTeam(csId, team)
              const seen: number[] = []
              for (const e of roster.players) {
                const playerId = this.w.upsertPlayer(noPhoto(e.player))
                this.w.upsertRosterEntry(teamId, playerId, e)
                seen.push(playerId)
              }
              this.w.deactivateMissing(teamId, seen)
              this.w.updateClubInfo(roster.club)
              this.w.setStaff(teamId, roster.staff.map((c) => ({ coachId: this.w.upsertCoach(c), role: c.role })))
            })
            summary.rosters++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      const linked = cup ? 0 : linkFebClubs(this.db, csId)
      if (linked) log(`  ${linked} clubes enlazados con sus otras temporadas`)

      if (opts.players !== false) {
        const maxAge = opts.playerMaxAgeDays ?? 30
        const pending = this.db
          .prepare(
            `SELECT DISTINCT p.id, px.external_id AS person, tx.external_id AS team
             FROM players p
             JOIN roster_entries r ON r.player_id = p.id AND r.is_active = 1
             JOIN teams t ON t.id = r.team_id AND t.competition_season_id = ?
             JOIN external_ids px ON px.entity_type = 'player' AND px.entity_id = p.id AND px.source = 'feb'
             JOIN external_ids tx ON tx.entity_type = 'team' AND tx.entity_id = t.id AND tx.source = 'feb'
             WHERE NOT EXISTS (SELECT 1 FROM player_stints s WHERE s.player_id = p.id AND s.source = 'feb')
                OR p.bio_synced_at IS NULL OR p.bio_synced_at < datetime('now', ?)
             ORDER BY p.bio_synced_at IS NOT NULL, p.bio_synced_at`
          )
          .all(csId, `-${maxAge} days`)
          .slice(0, opts.maxPlayerBios ?? Infinity) as { id: number; person: string; team: string }[]
        log(`▶ Fichas y trayectorias (${pending.length} pendientes)`)
        for (const [i, p] of pending.entries()) {
          opts.onProgress?.({ stage: 'players', done: i, total: pending.length })
          const url = febUrls.player(p.team, p.person)
          try {
            const { player, stints } = parseFebPlayer((await this.http.get(url)).body, p.person)
            const id = this.w.upsertPlayer(noPhoto(player), { bio: true })
            this.w.savePlayerStints(id, 'feb', stints)
            summary.playerBios++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      if (opts.boxscores !== false) {
        const pending = this.db
          .prepare(
            `SELECT x.external_id AS feb_id, rd.phase, rd.number, rd.name
             FROM games g
             JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'feb'
             LEFT JOIN rounds rd ON rd.id = g.round_id
             WHERE g.competition_season_id = ? ${opts.force ? '' : 'AND g.boxscore_synced_at IS NULL'}
               -- También los partidos pasados sin resultado: a veces el calendario de la FEB no lo
               -- publica pero la ficha del partido sí.
               AND (g.status = 'finished' OR g.scheduled_at < datetime('now', '-1 day'))
             ORDER BY g.scheduled_at`
          )
          .all(csId) as { feb_id: string; phase: string | null; number: number | null; name: string | null }[]
        const todo = pending.slice(0, opts.maxBoxscores ?? pending.length)
        log(`▶ Boxscores (${todo.length} pendientes)`)
        for (const [i, g2] of todo.entries()) {
          opts.onProgress?.({ stage: 'boxscores', done: i, total: todo.length })
          const url = febUrls.game(g2.feb_id)
          try {
            const box = parseFebBoxscore((await this.http.get(url)).body, g2.feb_id)
            if (minors) for (const t of box.teams) for (const per of t.periods) per.players = per.players.map((l) => ({ ...l, player: noPhoto(l.player) }))
            if (cup) {
              box.homeTeam = own(box.homeTeam)
              box.awayTeam = own(box.awayTeam)
              for (const t of box.teams) t.team = own(t.team)
            }
            const round = g2.phase != null ? { phase: g2.phase, number: g2.number!, name: g2.name ?? undefined } : undefined
            this.w.saveBoxscore(csId, box, { round })
            summary.boxscores++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      summary.players = (
        this.db
          .prepare(
            `SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?`
          )
          .get(csId) as { n: number }
      ).n
      this.w.touchEdition(csId)
      summary.requests = this.http.requests
      this.w.finishRun(runId, {
        csId,
        status: summary.errors.length ? 'partial' : 'ok',
        requests: summary.requests,
        summary: { ...summary, errors: undefined },
        errors: summary.errors
      })
      opts.onProgress?.({ stage: 'done', done: 1, total: 1 })
      return summary
    } catch (err) {
      summary.requests = this.http.requests
      this.w.finishRun(runId, {
        csId: summary.competitionSeasonId || undefined,
        status: 'error',
        requests: summary.requests,
        summary: { ...summary, errors: undefined },
        errors: [...summary.errors, { error: err instanceof Error ? err.message : String(err) }]
      })
      throw err
    }
  }

  /**
   * Calendario completo. Si la liga se divide en grupos (Segunda FEB: A y B), la web
   * muestra uno por defecto y el resto se pide por postback; se unen todos y cada
   * equipo queda marcado con su grupo. Las fases finales (temporadas cerradas de la
   * Tercera FEB) se guardan como fase aparte, sin grupo.
   */
  private async calendar(g: number, competition: FebCompetition, startYear: number, label: string): Promise<NCalendar> {
    const first = await this.http.get(febUrls.calendar(g, startYear))
    const info = parseFebGroups(first.body)
    if (info.groups.length <= 1) return parseFebCalendar(first.body, competition, startYear, label)
    const grouped = info.groups.filter((x) => x.regular).length > 1
    const parts: NCalendar[] = []
    for (const group of info.groups) {
      const html = group.value === info.selected ? first.body : (await this.http.post(first.finalUrl, info.postback(group.value))).body
      parts.push(
        group.regular
          ? parseFebCalendar(html, competition, startYear, label, grouped ? group.name : undefined)
          : parseFebCalendar(html, competition, startYear, label, undefined, { id: 'final', name: 'Fase final' })
      )
    }
    return { ...parts[0], teams: parts.flatMap((c) => c.teams), games: parts.flatMap((c) => c.games) }
  }


  /**
   * Eliminatorias (playoffs, final por el título, permanencia): solo salen en la página de
   * resultados, una jornada cada vez. Se pide cada fase que no sea de liga regular y, dentro,
   * cada jornada (cada partido de la serie). Las fases finales que ya trae el calendario
   * (Tercera FEB) se leen de allí.
   */
  private async knockoutGames(g: number, startYear: number): Promise<NCalendar['games']> {
    const first = await this.http.get(febUrls.results(g, startYear))
    const info = parseFebGroups(first.body)
    const inCalendar = new Set(parseFebGroups((await this.http.get(febUrls.calendar(g, startYear))).body).groups.map((x) => x.value))
    const games: NCalendar['games'] = []
    for (const group of info.groups.filter((x) => !x.regular && !inCalendar.has(x.value))) {
      const stage = febStage(group.label)
      const phase = { id: 'playoff', ...stage }
      const form = info.postback(group.value)
      const page = group.value === info.selected ? first.body : (await this.http.post(first.finalUrl, form)).body
      const parsed = parseFebResults(page, phase)
      games.push(...parsed.games)
      // Cada jornada se pide con el estado (viewstate) de la página de su fase.
      const phaseForm = parseFebGroups(page).postback(group.value)
      for (const j of parsed.jornadas.filter((x) => !x.selected)) {
        const html = (await this.http.post(first.finalUrl, { ...phaseForm, __EVENTTARGET: parsed.jornadaField, [parsed.jornadaField]: j.value })).body
        games.push(...parseFebResults(html, phase).games)
      }
    }
    return games
  }
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Palabras que identifican a un club (sin genéricas como "club" o "baloncesto"). */
const GENERIC = new Set(['club', 'baloncesto', 'basket', 'basquet', 'basketball', 'fundacion', 'deportivo', 'deportiva', 'escola', 'escuela', 'asociacion', 'grupo', 'sociedad', 'union', 'ciudad'])
const tokens = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w)))

/**
 * La FEB da a cada equipo un id nuevo cada temporada, así que cada edición crea clubes nuevos.
 * Se une cada club que solo existe en esta edición con el mismo club de otras temporadas (FEB o
 * ACB, para ascensos y descensos): mismo pabellón y alguna palabra significativa del nombre en
 * común, o el mismo nombre. Los filiales (el club ya juega otra liga esa temporada) no se unen.
 * Si hay dos candidatos igual de buenos no se une ninguno.
 */
export function linkFebClubs(db: DB, csId: number): number {
  const w = new Writer(db)
  const fresh = db
    .prepare(
      `SELECT c.id, c.arena, t.name FROM teams t JOIN clubs c ON c.id = t.club_id
       WHERE t.competition_season_id = ? AND NOT EXISTS (SELECT 1 FROM teams o WHERE o.club_id = c.id AND o.competition_season_id <> ?)`
    )
    .all(csId, csId) as { id: number; arena: string | null; name: string }[]
  if (!fresh.length) return 0
  const candidates = db
    .prepare(
      `SELECT c.id, c.arena, group_concat(t.name, '|') AS names FROM clubs c
       JOIN teams t ON t.club_id = c.id
       -- Sin equipo esa misma temporada en ninguna liga: si lo tiene, este es su filial (Baskonia en Tercera FEB).
       WHERE NOT EXISTS (
         SELECT 1 FROM teams o JOIN competition_seasons ocs ON ocs.id = o.competition_season_id
         WHERE o.club_id = c.id AND ocs.season_id = (SELECT season_id FROM competition_seasons WHERE id = ?))
       GROUP BY c.id`
    )
    .all(csId) as { id: number; arena: string | null; names: string }[]
  let linked = 0
  w.transaction(() => {
    for (const club of fresh) {
      const words = tokens(club.name)
      let best: { id: number; score: number } | undefined
      let tie = false
      for (const c of candidates) {
        const names = c.names.split('|')
        const shared = Math.max(...names.map((n) => [...tokens(n)].filter((w) => words.has(w)).length))
        const sameName = names.some((n) => norm(n) === norm(club.name))
        const sameArena = !!club.arena && !!c.arena && norm(club.arena) === norm(c.arena)
        if (!(sameName || (sameArena && shared >= 1))) continue
        const score = (sameName ? 10 : 0) + shared + (sameArena ? 1 : 0)
        if (!best || score > best.score) {
          best = { id: c.id, score }
          tie = false
        } else if (score === best.score) tie = true
      }
      if (best && !tie) {
        w.mergeClub(club.id, best.id)
        candidates.splice(candidates.findIndex((c) => c.id === best!.id), 1)
        linked++
      }
    }
  })
  return linked
}

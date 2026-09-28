import { describe, expect, it } from 'vitest'
import { RscDocument, extractFlightPayload, findAllInDoc, parseFlightRows, textContent } from '../src/scraper/core/rsc'

const push = (s: string) => `<script>self.__next_f.push([1,${JSON.stringify(s)}])</script>`

describe('RSC flight parser', () => {
  it('concatena fragmentos y separa filas', () => {
    const html = push('0:{"a":1}\n') + push('1:["$","div",null,{"children":"hola"}]\n')
    const rows = parseFlightRows(extractFlightPayload(html))
    expect(rows.get('0')).toEqual({ a: 1 })
    expect(rows.size).toBe(2)
  })

  it('respeta filas de texto con longitud en bytes UTF-8', () => {
    const text = 'Mahón – ñ'
    const len = Buffer.byteLength(text, 'utf8').toString(16)
    const rows = parseFlightRows(`a:T${len},${text}b:{"ok":true}\n`)
    expect(rows.get('a')).toBe(text)
    expect(rows.get('b')).toEqual({ ok: true })
  })

  it('resuelve referencias entre filas, rutas y valores especiales', () => {
    const doc = new RscDocument(
      parseFlightRows(
        [
          '1:{"teams":[{"id":1,"name":"A"},{"id":2,"name":"B"}]}',
          '2:{"home":"$1:teams:1","missing":"$undefined","price":"$$5","when":"$D2026-09-28"}'
        ].join('\n')
      )
    )
    expect(doc.row('2')).toEqual({ home: { id: 2, name: 'B' }, missing: undefined, price: '$5', when: '2026-09-28' })
  })

  it('resuelve auto-referencias (patrón del calendario de acb.com)', () => {
    const doc = new RscDocument(
      parseFlightRows(
        '2d:["$","$L3",null,{"data":{"teams":[{"id":7}],"rounds":[{"matches":[{"homeTeam":"$2d:props:data:teams:0"}]}]}}]'
      )
    )
    const [round] = findAllInDoc<{ matches: { homeTeam: { id: number } }[] }>(doc, (o) => Array.isArray(o.matches))
    expect(round.matches[0].homeTeam).toEqual({ id: 7 })
  })

  it('extrae texto de árboles de elementos', () => {
    const doc = new RscDocument(parseFlightRows('0:["$","td",null,{"children":[1,["$","span",null,{"children":"LR"}]]}]'))
    expect(textContent(doc.row('0'))).toBe('1LR')
  })
})

import { useEffect, useMemo, useState } from "react";
import { countryName } from "../components/Header";
import {
  Avatar,
  Crest,
  Foot,
  Loading,
  Score,
  Sec,
  src,
  Court,
  Flag,
} from "../components/ui";
import { cssVars, valColor } from "../lib/color";
import {
  compOf,
  loadClub,
  loadDays,
  loadPlayer,
  LOG0,
  S,
  useLoad,
  type Comp,
  type Days,
  type Meta,
} from "../lib/data";
import {
  dateLong,
  dateShort,
  dateYear,
  dayKey,
  dayLabel,
  time,
  val,
} from "../lib/fmt";
import { href } from "../lib/router";
import { useFavs, type Fav } from "../lib/favs";
import { EspLast } from "../components/EspLast";

const BRAND = { dk: "#0a2a5c", lt: "#2f7be0" };

export default function Home({ meta }: { meta: Meta }) {
  const days = useLoad(loadDays, []);
  if (days === undefined) return <Loading />;
  if (!days || days instanceof Error)
    return <div className="loading">Sin datos de partidos</div>;
  return <HomePage meta={meta} days={days} />;
}

function HomePage({ meta, days }: { meta: Meta; days: Days }) {
  const today = dayKey(new Date().toISOString());
  const byDay = useMemo(() => {
    const m = new Map<string, Days["games"]>();
    for (const g of days.games) {
      const k = dayKey(g.d);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return m;
  }, [days]);
  // Siete días alrededor de hoy; por defecto hoy, o el día con partidos más cercano.
  const keys = useMemo(() => {
    const out: string[] = [];
    const [y, m, d] = today.split("-").map(Number);
    for (let i = -3; i <= 3; i++)
      out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
    return out;
  }, [today]);
  const initial = byDay.has(today)
    ? today
    : ([...keys]
        .sort(
          (a, b) =>
            Math.abs(Date.parse(a) - Date.parse(today)) -
            Math.abs(Date.parse(b) - Date.parse(today)),
        )
        .find((k) => byDay.has(k)) ?? today);
  const [day, setDay] = useState(initial);
  useEffect(() => setDay(initial), [initial]);
  const [open, setOpen] = useState<string[]>([]);
  const favs = useFavs();
  const list = byDay.get(day) ?? [];
  const order = meta.comps.map((c) => c.code);
  const groups = [...new Set(list.map((g) => g.code))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  // Partido destacado: el de la competición de más nivel del día (EuroLeague y ACB primero).
  const rank = (c: string) =>
    c === "EUROLEAGUE" ? 0 : c === "ACB" ? 1 : 2 + order.indexOf(c);
  const feat = [...list].sort(
    (a, b) => rank(a.code) - rank(b.code) || (a.d < b.d ? 1 : -1),
  )[0];
  const main = meta.comps.filter((c) => c.tier != null);
  const tm = (id: number) => days.teams[id];
  return (
    <div style={cssVars(BRAND)}>
      <section className="hero short">
        <Court />
        <div className="ghost">Hoy</div>
        <div className="wrap">
          <span className="kicker" style={{ paddingLeft: 14 }}>
            {dateLong(new Date().toISOString())}
          </span>
          <h1>
            <small>Baloncesto</small>Hoy
          </h1>
          {feat && <Featured g={feat} days={days} meta={meta} />}
          <div className="days">
            {keys.map((k) => {
              const l = dayLabel(k, today);
              const n = byDay.get(k)?.length ?? 0;
              return (
                <button
                  key={k}
                  className={`${k === day ? "on" : ""} ${n ? "" : "none"}`}
                  onClick={() => setDay(k)}
                >
                  {l.top}
                  <small>
                    {l.sub} · {n}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <main className="wrap page">
        <div
          className="grid g-21"
          style={{ marginTop: -50, position: "relative", zIndex: 2 }}
        >
          <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
            {favs.length > 0 && (
              <section className="card">
                <Sec aside="guardados en este navegador">Siguiendo</Sec>
                <div className="favs">
                  {favs.map((f) => (
                    <FavRow
                      key={f.kind + f.ref}
                      f={f}
                      days={days}
                      meta={meta}
                    />
                  ))}
                </div>
              </section>
            )}
            <section className="card">
              <Sec
                aside={`${list.length} ${list.length === 1 ? "partido" : "partidos"}`}
              >
                Partidos
              </Sec>
              {!list.length && (
                <div className="empty">No hay partidos este día</div>
              )}
              {groups.map((code) => {
                const c = compOf(meta, code);
                const gs = list.filter((g) => g.code === code);
                const rounds = [
                  ...new Set(gs.map((g) => g.rn).filter(Boolean)),
                ];
                return (
                  <div className="comp-block" key={code}>
                    <a className="comp-head" href={href.comp(code)}>
                      {c?.logo && <img src={src(c.logo)} alt="" />}
                      <b>{c?.name ?? code}</b>
                      <span>{rounds.join(" · ")}</span>
                    </a>
                    <div className="games">
                      {(open.includes(code) ? gs : gs.slice(0, 6)).map((g) => {
                        const h = tm(g.h);
                        const a = tm(g.a);
                        return (
                          <Score
                            key={g.id}
                            id={g.id}
                            d={g.d}
                            st={g.st}
                            h={g.h}
                            a={g.a}
                            hs={g.hs}
                            as={g.as}
                            hn={h?.s ?? h?.n ?? "?"}
                            an={a?.s ?? a?.n ?? "?"}
                            hl={h?.l ?? null}
                            al={a?.l ?? null}
                            hc1={h?.c1}
                            ac1={a?.c1}
                            noDate
                          />
                        );
                      })}
                    </div>
                    {gs.length > 6 && !open.includes(code) && (
                      <div style={{ textAlign: "center", marginTop: 12 }}>
                        <button
                          className="chip"
                          onClick={() => setOpen([...open, code])}
                        >
                          Ver los {gs.length} partidos
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
            <section className="card">
              <Sec more={{ to: "#/ligas", label: "Todas" }}>Competiciones</Sec>
              {(
                [
                  ["España", (c: Comp) => c.country === "ES"],
                  ["Europa", (c: Comp) => c.country === "EU"],
                  [
                    "Ligas nacionales",
                    (c: Comp) => c.country !== "ES" && c.country !== "EU",
                  ],
                ] as const
              ).map(([label, f]) => (
                <div key={label} className="comp-block">
                  <div className="comp-head">
                    <b style={{ fontSize: 16, color: "var(--tx3)" }}>{label}</b>
                  </div>
                  <div className="comps">
                    {main.filter(f).map((c) => (
                      <a
                        key={c.code}
                        className="cc"
                        href={href.comp(c.code)}
                        style={{
                          ["--lc" as string]: c.color ?? "var(--accent)",
                        }}
                      >
                        {c.logo ? (
                          <img src={src(c.logo)} alt="" />
                        ) : (
                          <Crest name={c.name} c1={c.color} size={44} />
                        )}
                        <div>
                          <b>{c.name}</b>
                          <span>
                            {c.country === "ES" || c.country === "EU" ? (
                              c.division
                            ) : (
                              <>
                                <Flag nat={countryName(c.country)} />{" "}
                                {countryName(c.country)} ·{" "}
                                {c.tier === 1 ? "1.ª" : "2.ª"} división
                              </>
                            )}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
          <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
            {(days.esp?.length ?? 0) > 0 && (
              <section className="card">
                <Sec
                  aside="NBA, NCAA y Europa · últimos días"
                  more={{ to: "#/espanoles", label: "Todos" }}
                >
                  Españoles fuera
                </Sec>
                <EspLast days={days} meta={meta} limit={6} />
              </section>
            )}
            <section className="card">
              <Sec aside="últimos 8 días · por valoración">
                Mejores actuaciones
              </Sec>
              <div className="best" style={{ gridTemplateColumns: "1fr" }}>
                {days.best.slice(0, 8).map((b) => {
                  const pl = days.pl[b.p];
                  const t = tm(b.t);
                  const o = tm(b.opp);
                  return (
                    <a className="bp" key={b.p + b.g} href={href.player(b.p)}>
                      <Avatar url={pl?.[1]} name={pl?.[0] ?? "?"} size={64} />
                      <div style={{ minWidth: 0 }}>
                        <div className="nm">{pl?.[0]}</div>
                        <div className="sub">
                          <Crest
                            url={t?.l}
                            name={t?.n ?? ""}
                            c1={t?.c1}
                            size={16}
                          />
                          {t?.s ?? t?.n} · vs {o?.s ?? o?.n} · {dateShort(b.d)}
                        </div>
                        <div className="line">
                          <b>{b.pts}</b> pts · <b>{b.reb}</b> reb ·{" "}
                          <b>{b.ast}</b> ast
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          background: valColor(b.val),
                          fontSize: 18,
                          height: 34,
                          minWidth: 44,
                        }}
                      >
                        {b.val}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>
      <Foot updated={meta.updated} />
    </div>
  );
}

function Featured({
  g,
  days,
  meta,
}: {
  g: Days["games"][number];
  days: Days;
  meta: Meta;
}) {
  const h = days.teams[g.h];
  const a = days.teams[g.a];
  const c = compOf(meta, g.code);
  const fin = g.st === "f" && g.hs != null && g.as != null;
  return (
    <a
      className="feat"
      href={href.game(g.id)}
      aria-label={`Partido destacado: ${h?.n} contra ${a?.n}`}
    >
      <div className="feat-k">
        {c?.logo && <img src={src(c.logo)} alt="" />}
        <span>{c?.name}</span>
        <i>{g.rn}</i>
      </div>
      <div className="feat-m">
        <div className="feat-t">
          <Crest url={h?.l} name={h?.n ?? ""} c1={h?.c1} size={72} />
          <b>{h?.s ?? h?.n}</b>
        </div>
        <div className="feat-s">
          {fin ? (
            <>
              <span className={g.hs! > g.as! ? "" : "dim"}>{g.hs}</span>
              <em>–</em>
              <span className={g.as! > g.hs! ? "" : "dim"}>{g.as}</span>
            </>
          ) : (
            <span className="tm">{time(g.d) || "vs"}</span>
          )}
          <small>{fin ? "Final" : g.st === "p" ? "Aplazado" : "Hoy"}</small>
        </div>
        <div className="feat-t">
          <Crest url={a?.l} name={a?.n ?? ""} c1={a?.c1} size={72} />
          <b>{a?.s ?? a?.n}</b>
        </div>
      </div>
    </a>
  );
}

/** Favorito con su último partido (jugador) o su último resultado y el próximo partido (club). */
function FavRow({ f, days, meta }: { f: Fav; days: Days; meta: Meta }) {
  const rec = useLoad<unknown>(
    () => (f.kind === "p" ? loadPlayer(f.ref) : loadClub(f.ref)),
    [f.kind, f.ref],
  );
  const head = (
    <a
      className="fv-h"
      href={f.kind === "p" ? href.player(f.ref) : href.club(f.ref)}
    >
      {f.kind === "p" ? (
        <Avatar url={f.img} name={f.name} size={40} />
      ) : (
        <Crest url={f.img} name={f.name} size={40} />
      )}
      <span>
        <b>{f.name}</b>
        <small>{f.kind === "p" ? "Jugador" : "Club"}</small>
      </span>
    </a>
  );
  let body: React.ReactNode = <span className="muted fv-x">…</span>;
  if (rec && !(rec instanceof Error) && f.kind === "p") {
    const p = rec as import("../lib/data").PlayerRec;
    const last = [...p.log].sort((a, b) =>
      (b[2] ?? "").localeCompare(a[2] ?? ""),
    )[0];
    if (last) {
      const line = last.slice(LOG0) as (number | null)[];
      const opp = p.tm[last[4]];
      const won = last[6] > last[7];
      body = (
        <a className="fv-x" href={href.game(last[0])}>
          <span className="muted">
            {Date.now() - Date.parse(last[2] ?? "") > 120 * 86400_000
              ? dateYear(last[2])
              : dateShort(last[2])}{" "}
            · {last[5] ? "vs" : "en"} {opp?.a ?? opp?.s ?? opp?.n} ·{" "}
            <i className={won ? "win" : "loss"}>{won ? "V" : "D"}</i> {last[6]}-
            {last[7]}
          </span>
          <span>
            <b>{line[S.pts] ?? 0}</b> pts · <b>{line[S.reb] ?? 0}</b> reb ·{" "}
            <b>{line[S.ast] ?? 0}</b> ast · val <b>{val(line)}</b>
          </span>
        </a>
      );
    } else
      body = <span className="muted fv-x">Sin partidos con estadística</span>;
  }
  if (rec && !(rec instanceof Error) && f.kind === "c") {
    const c = rec as import("../lib/data").ClubRec;
    const ids = new Set(c.teams.map((t) => t.t));
    const mine = days.games.filter((g) => ids.has(g.h) || ids.has(g.a));
    const prev = mine.filter((g) => g.st === "f" && g.hs != null).at(-1);
    const next = mine.find(
      (g) => g.st === "s" && Date.parse(g.d) > Date.now() - 3 * 3600_000,
    );
    const line = (g: Days["games"][number], fin: boolean) => {
      const home = ids.has(g.h);
      const o = days.teams[home ? g.a : g.h];
      const won = home === (g.hs ?? 0) > (g.as ?? 0);
      const cp = compOf(meta, g.code);
      return (
        <a href={href.game(g.id)} className="fv-g">
          <small>{fin ? "Último" : "Próximo"}</small>
          <span>
            {home ? "vs" : "en"} {o?.s ?? o?.n}{" "}
            <em className="muted">· {cp?.short ?? cp?.name ?? g.code}</em>
          </span>
          {fin ? (
            <b>
              <i className={won ? "win" : "loss"}>{won ? "V" : "D"}</i>{" "}
              {home ? g.hs : g.as}-{home ? g.as : g.hs}
            </b>
          ) : (
            <b className="muted">
              {dayKey(g.d) === dayKey(new Date().toISOString())
                ? "Hoy"
                : dateShort(g.d)}{" "}
              {time(g.d)}
            </b>
          )}
        </a>
      );
    };
    body =
      prev || next ? (
        <div className="fv-x">
          {prev && line(prev, true)}
          {next && line(next, false)}
        </div>
      ) : (
        <span className="muted fv-x">Sin partidos estos días</span>
      );
  }
  return (
    <div className="fv">
      {head}
      {body}
    </div>
  );
}

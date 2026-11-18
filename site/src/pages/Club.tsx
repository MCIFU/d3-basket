import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Avatar,
  Crest,
  Foot,
  Loading,
  NotFound,
  Score,
  Sec,
  SortTable,
  Strip,
  Tabs,
  src,
  type Col,
  Court,
  FavButton,
  Flag,
  ShareButton,
} from "../components/ui";
import { cssVars, palette } from "../lib/color";
import {
  S,
  compOf,
  loadClub,
  loadEd,
  useLoad,
  type ClubRec,
  type EdFile,
  type Meta,
  type RosterRow,
  type Title,
} from "../lib/data";
import { age, height, n1, per, POS, seasonLabel, ts } from "../lib/fmt";
import { href, useQuery } from "../lib/router";
import { players, teams as teamAggs, type PAgg } from "../lib/stats";
import { Medals, Trophy } from "../components/Medals";

const ROLE: Record<string, string> = {
  head_coach: "Primer entrenador",
  assistant_coach: "Entrenador ayudante",
  coach: "Entrenador",
  delegate: "Delegado",
  physio: "Fisioterapeuta",
  doctor: "Médico",
};
/** Singular de cada tipo de título (para «1 Liga» frente a «3 Ligas»). */
const TONE: Record<string, string> = {
  liga: "Liga",
  copa: "Copa",
  supercopa: "Supercopa",
  lba: "Scudetto",
  lnb_elite: "Liga francesa",
  gbl: "Liga griega",
  bsl: "Liga turca",
};
const TNAME: Record<string, string> = {
  liga: "Ligas",
  copa: "Copas",
  supercopa: "Supercopas",
  euroleague: "EuroLeague",
  eurocup: "EuroCup",
  bcl: "Champions",
  nba: "NBA",
  lba: "Scudetti",
  bbl: "BBL",
  lnb_elite: "Ligas francesas",
  gbl: "Ligas griegas",
  bsl: "Ligas turcas",
};
const SECONDARY = [
  "EUROLEAGUE",
  "EUROCUP",
  "BCL",
  "COPA_ESPANA",
  "COPA_REY",
  "SUPERCOPA",
];

export default function Club({
  meta,
  refId,
  year,
}: {
  meta: Meta;
  refId: string;
  year?: number;
}) {
  const c = useLoad(() => loadClub(refId), [refId]);
  if (c === undefined) return <Loading />;
  if (!c || c instanceof Error) return <NotFound what="Club" />;
  return (
    <ClubLoader meta={meta} c={c} year={year} key={c.ref + (year ?? "")} />
  );
}

function ClubLoader({
  meta,
  c,
  year,
}: {
  meta: Meta;
  c: ClubRec;
  year?: number;
}) {
  const y = year ?? c.teams[0]?.y;
  const sameYear = c.teams.filter((t) => t.y === y);
  // Equipo principal del año: la liga nacional antes que Europa o la Copa.
  const main = [...sameYear].sort(
    (a, b) =>
      Number(SECONDARY.includes(a.code)) - Number(SECONDARY.includes(b.code)),
  )[0];
  const ed = useLoad(
    () => (main ? loadEd(main.ed) : Promise.resolve(undefined)),
    [main?.ed],
  );
  useEffect(() => {
    document.title = `${c.name} · d3 basket`;
  }, [c.name]);
  if (main && ed === undefined) return <Loading />;
  return (
    <ClubPage
      meta={meta}
      c={c}
      y={y}
      main={main}
      other={sameYear.filter((t) => t !== main)}
      ed={ed && !(ed instanceof Error) ? ed : undefined}
    />
  );
}

/** Palmarés del club en el formato de la vitrina de trofeos. */
const clubTitles = (c: ClubRec): Title[] =>
  c.honours.map((h) => ({
    k: h[0],
    y: h[1],
    label: h[2],
    won: h[3],
    club: c.ref,
    name: c.name,
    logo: c.logo,
    vs: h[4],
    res: h[5],
  }));

function ClubPage({
  meta,
  c,
  y,
  main,
  other,
  ed,
}: {
  meta: Meta;
  c: ClubRec;
  y?: number;
  main?: ClubRec["teams"][number];
  other: ClubRec["teams"];
  ed?: EdFile;
}) {
  const [tab, setTab] = useQuery("v", "plantilla");
  const comp = main ? compOf(meta, main.code) : undefined;
  const pal = palette(c.c1, c.c2, comp?.color ?? undefined);
  const agg = useMemo(
    () => (ed && main ? teamAggs(ed).get(main.t) : undefined),
    [ed, main],
  );
  const stand = ed && main ? ed.stand.find((s) => s.t === main.t) : undefined;
  const groupSize =
    ed && stand ? ed.stand.filter((s) => s.g === stand.g).length : 0;
  const years = [...new Set(c.teams.map((t) => t.y))];
  const name = c.name;
  return (
    <div style={cssVars(pal)}>
      <section className="hero">
        <Court />
        <div className="ghost">{(c.short ?? c.name).split(" ")[0]}</div>
        <div className="wrap hc">
          <Crest
            url={c.logo ?? main?.logo}
            name={name}
            c1={c.c1}
            size={168}
            className="bigcrest"
          />
          <div>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {comp && y && (
                <a className="kicker" href={href.comp(comp.code, y)}>
                  {comp.logo && (
                    <img className="lg" src={src(comp.logo)} alt="" />
                  )}
                  {comp.name}
                </a>
              )}
              {years.length > 0 && (
                <select
                  className="select"
                  value={y}
                  onChange={(e) =>
                    (location.hash = href
                      .club(c.ref, Number(e.target.value))
                      .slice(1))
                  }
                  aria-label="Temporada"
                >
                  {years.map((yy) => (
                    <option key={yy} value={yy}>
                      {seasonLabel(yy)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <h1
              className={
                name.length > 22 ? "sm" : name.length > 14 ? "mid" : ""
              }
            >
              {main?.name ?? name}
            </h1>
            <dl className="meta">
              {c.city && (
                <div>
                  <dt>Ciudad</dt>
                  <dd>{c.city}</dd>
                </div>
              )}
              {c.founded && (
                <div>
                  <dt>Fundación</dt>
                  <dd>{c.founded}</dd>
                </div>
              )}
              {c.arena && (
                <div>
                  <dt>Pabellón</dt>
                  <dd>{c.arena}</dd>
                </div>
              )}
              {c.arenaCap && (
                <div>
                  <dt>Aforo</dt>
                  <dd>{c.arenaCap.toLocaleString("es-ES")}</dd>
                </div>
              )}
            </dl>
            {c.honours.some((h) => h[3]) && (
              <a className="msum" href={`${href.club(c.ref, y)}?v=club`}>
                <span className="it">
                  <Trophy size={20} />
                  <b>{c.honours.filter((h) => h[3]).length}</b> títulos
                </span>
                <span className="it">
                  {[...new Set(c.honours.filter((h) => h[3]).map((h) => h[0]))]
                    .slice(0, 4)
                    .map((k) => {
                      const n = c.honours.filter(
                        (h) => h[3] && h[0] === k,
                      ).length;
                      return `${n} ${n === 1 ? (TONE[k] ?? TNAME[k] ?? k) : (TNAME[k] ?? k)}`;
                    })
                    .join(" · ")}
                </span>
              </a>
            )}
            <div className="hero-actions">
              <FavButton
                fav={{
                  kind: "c",
                  ref: c.ref,
                  name: c.name,
                  img: c.logo ?? main?.logo ?? null,
                }}
              />
              <ShareButton />
              {c.ics && <CalButtons refId={c.ref} />}
            </div>
          </div>
        </div>
      </section>
      <main className="wrap page">
        {agg && agg.gp ? (
          <Strip
            items={[
              ...(stand
                ? [
                    {
                      k: stand.g ? `Puesto grupo ${stand.g}` : "Puesto",
                      v: `${stand.pos}.º`,
                      bar: groupSize
                        ? (100 * (groupSize - stand.pos + 1)) / groupSize
                        : undefined,
                      rank: `de ${groupSize} equipos`,
                    },
                  ]
                : []),
              {
                k: "Balance",
                v: `${agg.w}-${agg.l}`,
                bar: (100 * agg.w) / agg.gp,
              },
              {
                k: "Puntos a favor",
                v: n1(agg.pf / agg.gp),
                rank: "por partido",
              },
              {
                k: "Puntos en contra",
                v: n1(agg.pa / agg.gp),
                rank: "por partido",
              },
            ]}
            note={
              <>
                <b
                  style={{
                    color: agg.pf >= agg.pa ? "var(--win)" : "var(--loss)",
                  }}
                >
                  {agg.pf - agg.pa > 0 ? "+" : ""}
                  {n1((agg.pf - agg.pa) / agg.gp)}
                </b>
                <span>
                  diferencia por partido · en casa {agg.hw}-{agg.hl}, fuera{" "}
                  {agg.aw}-{agg.al}
                </span>
              </>
            }
          />
        ) : (
          <Strip
            items={[]}
            note={
              <span>
                {main
                  ? `Temporada ${seasonLabel(main.y)} sin partidos jugados`
                  : "Sin temporadas en la base de datos"}
              </span>
            }
          />
        )}
        <Tabs
          value={tab as "plantilla"}
          set={setTab}
          items={[
            ["plantilla", "Plantilla"],
            ["partidos", "Partidos"],
            ["estadisticas", "Estadísticas"],
            ...(c.rivals?.length
              ? [["rivales", "Rivales"] as [string, string]]
              : []),
            ["club", "Club"],
          ]}
        />
        {tab === "plantilla" && main && <Roster c={c} t={main.t} ed={ed} />}
        {tab === "plantilla" && y != null && c.moves?.[y] && (
          <Moves c={c} y={y} />
        )}
        {tab === "partidos" && main && ed && (
          <Games ed={ed} t={main.t} other={other} meta={meta} />
        )}
        {tab === "estadisticas" && main && ed && (
          <TeamStats ed={ed} t={main.t} />
        )}
        {tab === "rivales" && <Rivals c={c} />}
        {tab === "club" && <Info c={c} meta={meta} />}
      </main>
      <Foot updated={ed?.last ?? meta.updated} />
    </div>
  );
}

interface CardData {
  ref: string;
  num: string | null;
  name: string;
  photo: string | null;
  cut: string | null;
  posc: string | null;
  nat: string | null;
  birth: string | null;
  h: number | null;
  a?: PAgg;
  active: number;
}

function Card({ x }: { x: CardData }) {
  const [bad, setBad] = useState(false);
  const img = !bad ? (x.cut ?? x.photo) : null;
  const parts = x.name.split(" ");
  return (
    <a className="pc" href={href.player(x.ref)}>
      <div className="ph">
        {img ? (
          <img
            className={x.cut ? "cut" : ""}
            src={src(img)}
            alt=""
            loading="lazy"
            onError={() => setBad(true)}
          />
        ) : (
          <span className="ini">
            {parts
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </span>
        )}
        {x.num && <span className="n">{x.num}</span>}
      </div>
      <div className="in">
        <div className="nm">
          <small>{parts.slice(0, -1).join(" ")}</small>
          {parts.at(-1)}
        </div>
        <div className="sub">
          <span>
            {[
              x.posc ? POS[x.posc] : null,
              age(x.birth) ? `${age(x.birth)} años` : null,
              height(x.h),
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            <Flag nat={x.nat} />
          </span>
        </div>
        {x.a && x.a.gp > 0 && (
          <div className="sub" style={{ marginTop: 6 }}>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).pts)}</b> pts
            </span>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).reb)}</b> reb
            </span>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).val)}</b> val
            </span>
          </div>
        )}
      </div>
    </a>
  );
}

function Roster({ c, t, ed }: { c: ClubRec; t: number; ed?: EdFile }) {
  const rows = c.rosters[t] ?? [];
  const stats = useMemo(
    () => new Map((ed ? players(ed, t) : []).map((a) => [a.p, a])),
    [ed, t],
  );
  // Jugadores con partidos pero sin ficha de plantilla (fuentes sin plantilla oficial).
  const extra = [...stats.values()].filter(
    (a) => !rows.some((r) => r[0] === a.p),
  );
  const cards: CardData[] = [
    ...rows.map((r: RosterRow) => ({
      ref: r[0],
      num: r[1],
      name: r[5],
      photo: r[6],
      cut: r[7],
      posc: r[2] ?? r[8],
      nat: r[9],
      birth: r[10],
      h: r[11],
      a: stats.get(r[0]),
      active: r[3],
    })),
    ...extra.map((a) => {
      const pl = ed!.pl[a.p];
      return {
        ref: a.p,
        num: null,
        name: pl?.[0] ?? "?",
        photo: pl?.[1] ?? null,
        cut: pl?.[2] ?? null,
        posc: pl?.[3] ?? null,
        nat: pl?.[4] ?? null,
        birth: pl?.[5] ?? null,
        h: pl?.[6] ?? null,
        a,
        active: 1,
      };
    }),
  ];
  const active = cards.filter((x) => x.active);
  const gone = cards.filter((x) => !x.active);
  const staff = c.staff[t] ?? [];
  return (
    <>
      <section className="card" style={{ marginTop: 22 }}>
        <Sec aside={`${active.length} jugadores`}>Plantilla</Sec>
        {active.length ? (
          <div className="roster">
            {active.map((x) => (
              <Card key={x.ref} x={x} />
            ))}
          </div>
        ) : (
          <div className="empty">Sin plantilla en la base de datos</div>
        )}
      </section>
      {(staff.length > 0 || gone.length > 0) && (
        <div className="grid g-2">
          {staff.length > 0 && (
            <section className="card">
              <Sec>Cuerpo técnico</Sec>
              {staff.map(([n, role, ph]) => (
                <div
                  key={n + role}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <Avatar url={ph} name={n} size={40} />
                  <div>
                    <b>{n}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {ROLE[role] ?? role}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
          {gone.length > 0 && (
            <section className="card">
              <Sec aside="pasaron por el equipo esta temporada">Bajas</Sec>
              {gone.map((x) => (
                <a
                  key={x.ref}
                  href={href.player(x.ref)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <Avatar url={x.photo} name={x.name} size={36} />
                  <b>{x.name}</b>
                  <span
                    className="muted"
                    style={{ marginLeft: "auto", fontSize: 12.5 }}
                  >
                    {x.a?.gp ? `${x.a.gp} partidos` : ""}
                  </span>
                </a>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Games({
  ed,
  t,
  other,
  meta,
}: {
  ed: EdFile;
  t: number;
  other: ClubRec["teams"];
  meta: Meta;
}) {
  const tm = new Map(ed.teams.map((x) => [x.id, x]));
  const list = ed.games.filter((g) => g.h === t || g.a === t);
  const fin = list.filter((g) => g.st === "f");
  const next = list.filter((g) => g.st !== "f");
  const render = (gs: typeof list) => (
    <div className="games">
      {gs.map((x) => {
        const h = tm.get(x.h);
        const a = tm.get(x.a);
        return (
          <Score
            key={x.id}
            id={x.id}
            d={x.d}
            st={x.st}
            h={x.h}
            a={x.a}
            hs={x.hs}
            as={x.as}
            hn={h?.short ?? h?.name ?? "?"}
            an={a?.short ?? a?.name ?? "?"}
            hl={h?.logo ?? null}
            al={a?.logo ?? null}
            hc1={h?.c1}
            ac1={a?.c1}
            extra={x.rn ?? (x.r ? `Jornada ${x.r}` : undefined)}
          />
        );
      })}
    </div>
  );
  return (
    <>
      {next.length > 0 && (
        <section className="card" style={{ marginTop: 22 }}>
          <Sec aside={`${next.length} por jugar`}>Próximos partidos</Sec>
          {render(next.slice(0, 6))}
        </section>
      )}
      <section className="card" style={{ marginTop: next.length ? 20 : 22 }}>
        <Sec aside={`${fin.length} jugados`}>Resultados</Sec>
        {fin.length ? (
          render([...fin].reverse())
        ) : (
          <div className="empty">Aún no ha jugado</div>
        )}
      </section>
      {other.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec>Otras competiciones esta temporada</Sec>
          <div className="comps">
            {other.map((o) => {
              const cp = compOf(meta, o.code);
              return (
                <a
                  key={o.t}
                  className="cc"
                  href={href.comp(o.code, o.y)}
                  style={{ ["--lc" as string]: cp?.color ?? "var(--accent)" }}
                >
                  {cp?.logo ? (
                    <img src={src(cp.logo)} alt="" />
                  ) : (
                    <Crest name={o.code} size={44} />
                  )}
                  <div>
                    <b>{cp?.name ?? o.code}</b>
                    <span>{o.name}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function TeamStats({ ed, t }: { ed: EdFile; t: number }) {
  const rows = useMemo(() => players(ed, t), [ed, t]);
  const pl = (r: PAgg) => ed.pl[r.p];
  const f = (k: keyof ReturnType<typeof per>) => (r: PAgg) => per(r.s, r.gp)[k];
  const cols: Col<PAgg>[] = [
    {
      k: "name",
      label: "Jugador",
      l: true,
      asc: true,
      get: (r) => pl(r)?.[0] ?? "",
      fmt: (r) => (
        <span className="who">
          <Avatar url={pl(r)?.[1]} name={pl(r)?.[0] ?? "?"} size={32} />
          {pl(r)?.[0]}
        </span>
      ),
    },
    { k: "gp", label: "PJ", get: (r) => r.gp },
    { k: "gs", label: "Tit", hideM: true, get: (r) => r.gs },
    { k: "min", label: "Min", get: f("min"), fmt: (r) => n1(f("min")(r)) },
    {
      k: "pts",
      label: "Pts",
      b: true,
      get: f("pts"),
      fmt: (r) => n1(f("pts")(r)),
    },
    { k: "reb", label: "Reb", get: f("reb"), fmt: (r) => n1(f("reb")(r)) },
    { k: "ast", label: "Ast", get: f("ast"), fmt: (r) => n1(f("ast")(r)) },
    {
      k: "stl",
      label: "Rob",
      hideM: true,
      get: f("stl"),
      fmt: (r) => n1(f("stl")(r)),
    },
    {
      k: "t3",
      label: "T3",
      hideM: true,
      get: (r) => r.s[S.f3m],
      fmt: (r) => `${r.s[S.f3m]}/${r.s[S.f3a]}`,
    },
    {
      k: "ts",
      label: "TS %",
      hideM: true,
      get: (r) => ts(r.s),
      fmt: (r) => n1((ts(r.s) ?? 0) * 100),
    },
    {
      k: "val",
      label: "Val",
      b: true,
      get: f("val"),
      fmt: (r) => n1(f("val")(r)),
    },
  ];
  if (!rows.length)
    return (
      <div className="card empty" style={{ marginTop: 22 }}>
        Sin estadísticas esta temporada
      </div>
    );
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside="medias por partido">Estadísticas</Sec>
      <SortTable
        rows={rows}
        cols={cols}
        initial="val"
        onRow={(r) => href.player(r.p)}
      />
    </section>
  );
}

function Info({ c, meta }: { c: ClubRec; meta: Meta }) {
  const rows: [string, ReactNode][] = [
    ["Nombre", c.name],
    ["Ciudad", c.city],
    ["Fundación", c.founded],
    ["Pabellón", c.arena],
    ["Aforo", c.arenaCap?.toLocaleString("es-ES")],
    ["Presidente", c.president],
    [
      "Web",
      c.web ? (
        <a
          href={c.web}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--c-dk)" }}
        >
          {c.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
        </a>
      ) : null,
    ],
  ].filter(([, v]) => v != null && v !== "") as [string, ReactNode][];
  const seasons = [...c.teams].sort((a, b) => b.y - a.y);
  return (
    <>
      <div className="grid g-2">
        <section className="card info">
          <Sec>Datos del club</Sec>
          <dl>
            {rows.map(([k, v]) => (
              <span key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </span>
            ))}
          </dl>
          {c.parent && (
            <p className="muted" style={{ marginTop: 14 }}>
              Equipo vinculado a{" "}
              <a
                href={href.club(c.parent[0])}
                style={{ color: "var(--c-dk)", fontWeight: 600 }}
              >
                {c.parent[1]}
              </a>
            </p>
          )}
          {c.filiales.length > 0 && (
            <>
              <h3
                style={{
                  font: "700 15px var(--cond)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--tx2)",
                  margin: "20px 0 8px",
                }}
              >
                Cantera y filiales
              </h3>
              {c.filiales.map(([r, n, l, comps]) => (
                <a
                  key={r}
                  href={href.club(r)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 0",
                  }}
                >
                  <Crest url={l} name={n} size={24} />
                  <span>
                    {n}
                    {comps && (
                      <small className="muted" style={{ display: "block", fontSize: 12 }}>
                        {comps}
                      </small>
                    )}
                  </span>
                </a>
              ))}
            </>
          )}
        </section>
        {c.history && (
          <section className="card">
            <Sec>Historia</Sec>
            <div className="prose">
              {c.history
                .split(/\n+/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </section>
        )}
      </div>
      <Medals titles={clubTitles(c)} medals={[]} club />
      <section className="card" style={{ marginTop: 20 }}>
        <Sec
          aside={`${new Set(seasons.map((x) => x.y)).size} temporadas en la base de datos`}
        >
          Temporadas
        </Sec>
        <div className="tw">
          <table className="t">
            <tbody>
              {[...new Set(seasons.map((x) => x.y))].map((yy) => {
                const ts = seasons.filter((x) => x.y === yy);
                return (
                  <tr
                    key={yy}
                    className="link"
                    tabIndex={0}
                    onClick={() =>
                      (location.hash = href.club(c.ref, yy).slice(1))
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (location.hash = href.club(c.ref, yy).slice(1))
                    }
                  >
                    <td className="l">{seasonLabel(yy)}</td>
                    <td className="l b">
                      <span className="who">
                        <Crest
                          url={ts[0].logo ?? c.logo}
                          name={ts[0].name}
                          c1={c.c1}
                          size={22}
                        />
                        {ts[0].name}
                      </span>
                    </td>
                    <td className="l">
                      <span
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {ts.map((x) => (
                          <span key={x.t} className="lgp">
                            {compOf(meta, x.code)?.name ?? x.code}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** Altas y bajas respecto a la temporada anterior, con el club de procedencia o de destino. */
function Moves({ c, y }: { c: ClubRec; y: number }) {
  const m = c.moves![y];
  const row = ([p, cl]: [string, string | null], dir: "in" | "out") => {
    const pl = c.mpl?.[p];
    const other = cl ? c.mclubs?.[cl] : undefined;
    return (
      <div className="mv" key={p}>
        <a href={href.player(p)} className="mv-p">
          <Avatar url={pl?.[1]} name={pl?.[0] ?? "?"} size={36} />
          <b>{pl?.[0] ?? "?"}</b>
        </a>
        {other ? (
          <a className="mv-c" href={href.club(cl!)}>
            <span className="muted">{dir === "in" ? "de" : "a"}</span>
            <Crest url={other[1]} name={other[0]} size={20} />
            {other[0]}
          </a>
        ) : (
          <span className="mv-c muted">
            {dir === "in" ? "debut o sin datos" : "sin equipo en la base"}
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="grid g-2">
      <section className="card">
        <Sec aside={`${m.in.length} respecto a ${seasonLabel(y - 1)}`}>
          Altas
        </Sec>
        {m.in.length ? (
          m.in.map((x) => row(x, "in"))
        ) : (
          <div className="empty">Sin altas</div>
        )}
      </section>
      <section className="card">
        <Sec aside={`${m.out.length} jugadores`}>Bajas del curso anterior</Sec>
        {m.out.length ? (
          m.out.map((x) => row(x, "out"))
        ) : (
          <div className="empty">Sin bajas</div>
        )}
      </section>
    </div>
  );
}

/** Rivales más habituales del club, con el balance; cada uno abre el cara a cara. */
function Rivals({ c }: { c: ClubRec }) {
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside="en todas las competiciones cargadas">Rivales</Sec>
      <div className="rivals">
        {c.rivals!.map(([o, name, logo, w, l]) => (
          <a key={o} className="rv" href={href.h2h(c.ref, o)}>
            <Crest url={logo} name={name} size={32} />
            <span>
              <b>{name}</b>
              <small>{w + l} partidos</small>
            </span>
            <em
              style={{
                color: w > l ? "var(--win)" : w < l ? "var(--loss)" : undefined,
              }}
            >
              {w}-{l}
            </em>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Calendario del club: suscripción (el móvil lo actualiza solo) o descarga del .ics. */
function CalButtons({ refId }: { refId: string }) {
  const path = `d/ics/${encodeURIComponent(refId)}.ics`;
  const url = new URL(path, location.href.split("#")[0]);
  const webcal = url.href.replace(/^https?:/, "webcal:");
  const icon = (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
    </svg>
  );
  return (
    <>
      <a
        className="fav"
        href={webcal}
        title="Añade los partidos del club al calendario del móvil; se actualiza solo"
      >
        {icon}
        Suscribirse al calendario
      </a>
      <a
        className="fav"
        href={url.href}
        download={`${refId}.ics`}
        title="Descargar el calendario (.ics)"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
        </svg>
        .ics
      </a>
    </>
  );
}

import { useEffect } from 'react'
import { Layout } from './Layout'
import { useRoute } from './router'
import { ClubPage, ClubsPage } from './pages/Clubs'
import { DataPage } from './pages/Data'
import { GamePage } from './pages/Game'
import { HomePage } from './pages/Home'
import { LeaguePage, LeaguesPage } from './pages/Leagues'
import { PlayerPage, PlayersPage } from './pages/Players'
import { ReportEditor, ScoutingPage } from './pages/Scouting'
import { Empty } from './components'

export function App() {
  const route = useRoute()
  useEffect(() => {
    document.title = 'D3 Basket'
  }, [route])

  let page
  switch (route.page) {
    case 'home':
      page = <HomePage />
      break
    case 'leagues':
      page = <LeaguesPage />
      break
    case 'league':
      page = <LeaguePage code={route.code} tab={route.tab} year={route.year} />
      break
    case 'clubs':
      page = <ClubsPage />
      break
    case 'club':
      page = <ClubPage refId={route.ref} tab={route.tab} year={route.year} />
      break
    case 'players':
      page = <PlayersPage />
      break
    case 'player':
      page = <PlayerPage refId={route.ref} tab={route.tab} />
      break
    case 'game':
      page = <GamePage refId={route.ref} />
      break
    case 'scouting':
      page = <ScoutingPage />
      break
    case 'report':
      page = <ReportEditor key={`${route.playerRef}-${route.reportId}`} playerRef={route.playerRef} reportId={route.reportId} />
      break
    case 'data':
      page = <DataPage />
      break
    default:
      page = <Empty>Página no encontrada.</Empty>
  }
  return <Layout route={route}>{page}</Layout>
}

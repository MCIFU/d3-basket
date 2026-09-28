import type { D3Api } from '../shared/api'

declare global {
  interface Window {
    d3: D3Api
  }
}

export {}

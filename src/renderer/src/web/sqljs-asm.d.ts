// Compilación de sql.js en JavaScript puro (sin WebAssembly), usada en la versión para Claude.
declare module 'sql.js/dist/sql-asm-memory-growth.js' {
  import type { SqlJsStatic } from 'sql.js'
  const initSqlJs: () => Promise<SqlJsStatic>
  export default initSqlJs
}

import path from 'node:path'

function intFrom(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  port: intFrom(process.env.PORT, 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  staticDir: path.resolve(process.env.STATIC_DIR ?? 'web/dist'),
}

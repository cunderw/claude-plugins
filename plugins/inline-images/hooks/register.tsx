import type { Register } from 'claude-code'

type Engine = Parameters<Parameters<Parameters<Register>[0]>[2]>[0]

// Draws PNGs that Claude reads or sends under their tool row as a real picture
// (kitty graphics). The picture is a downscaled copy sent as bytes, so it never
// depends on the terminal reading this machine's files. Behind a multiplexer such
// as herdr, Claude Code needs CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1 to draw it.

const MAX_ROWS = 40
const MAX_COLUMNS = 100
const MAX_PICTURES = 6
// Long edge of the copy sent to the terminal, in pixels.
const MAX_PIXELS = 1400

type Size = { width: number; height: number }
type Picture = { path: string; size: Size; columns: number; rows: number; png: string }
type Call = { tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function decodeBase64(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let length = 0
  let bits = 0
  let value = 0
  for (let i = 0; i < text.length; i++) {
    const index = ALPHABET.indexOf(text.charAt(i))
    if (index < 0) break
    value = ((value << 6) | index) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[length++] = (value >> bits) & 0xff
    }
  }
  return out.subarray(0, length)
}

// Width and height from a PNG's IHDR chunk (bytes 16 to 23).
function pngSize(base64: string): Size | null {
  const head = decodeBase64(base64.slice(0, 44))
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  if (!isPng || head.length < 24) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function pngPaths(tool: string, input: unknown): string[] {
  const value = (input ?? {}) as Record<string, unknown>
  const candidates =
    tool === 'Read' ? [value.file_path]
    : tool === 'SendUserFile' && Array.isArray(value.files) ? value.files
    : []
  return candidates.filter(
    (p): p is string => typeof p === 'string' && p.startsWith('/') && p.toLowerCase().endsWith('.png'),
  )
}

// A terminal cell is about twice as tall as it is wide.
function cellBox(size: Size, viewportColumns: number): { columns: number; rows: number } {
  const maxColumns = Math.max(10, Math.min(MAX_COLUMNS, viewportColumns - 6))
  let rows = MAX_ROWS
  let columns = Math.round((rows * 2 * size.width) / size.height)
  if (columns > maxColumns) {
    columns = maxColumns
    rows = Math.round((columns * size.height) / (size.width * 2))
  }
  return { columns: Math.max(1, Math.min(512, columns)), rows: Math.max(1, Math.min(256, rows)) }
}

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return h
}

// Keyed by path, modification time and box, so a rewritten file or a new width is drawn again.
const cache = new Map<string, Picture | null>()

async function picture($: Engine, path: string, viewportColumns: number): Promise<Picture | null> {
  const stat = await $.fs.stat(path)
  const head = await $.fs.read(path, { as: 'bytes' })
  const size = pngSize(head.base64)
  if (!size) return null
  const box = cellBox(size, viewportColumns)
  const key = `${path}@${Math.round(stat.mtimeMs)}@${box.columns}x${box.rows}`
  if (cache.has(key)) return cache.get(key) ?? null

  const scratch = `/private/tmp/inline-images-${Math.abs(hash(key))}.png`
  const { exitCode } = await $.process.run([
    '/usr/bin/sips', '-s', 'format', 'png', '-Z', String(MAX_PIXELS), path, '--out', scratch,
  ])
  let result: Picture | null = null
  if (exitCode === 0) {
    const { base64 } = await $.fs.read(scratch, { as: 'bytes' })
    if (base64.length <= (2 * 1024 * 1024 * 4) / 3) {
      result = { path, size, columns: box.columns, rows: box.rows, png: base64 }
    }
  }
  await $.process.run(['/bin/rm', '-f', scratch])
  cache.set(key, result)
  return result
}

async function picturesFor($: Engine, calls: readonly Call[], viewportColumns: number): Promise<Picture[]> {
  const pictures: Picture[] = []
  for (const call of calls) {
    if (call.isRunning || call.isErrored || call.isInterrupted) continue
    for (const path of pngPaths(call.tool, call.input)) {
      if (pictures.length >= MAX_PICTURES) return pictures
      try {
        const one = await picture($, path, viewportColumns)
        if (one) pictures.push(one)
      } catch {
        // Unreadable, gone, or sips failed: draw the row alone.
      }
    }
  }
  return pictures
}

function draw(ui: any, row: unknown, pictures: Picture[]) {
  const { Box, Image, Text } = ui
  return (
    <Box flexDirection="column">
      {row}
      {pictures.map((one, index) => {
        const name = one.path.split('/').pop() ?? one.path
        return (
          <Box key={`${one.path}-${index}`} flexDirection="column" paddingLeft={2}>
            <Image
              source={{ png: one.png }}
              columns={one.columns}
              rows={one.rows}
              alt={`${name} (${one.size.width}x${one.size.height})`}
            />
            <Text dimColor>{name} · {one.size.width}x{one.size.height}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export const register: Register = on => {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const pictures = await picturesFor($, [e.props], e.viewport?.columns ?? 100)
    return pictures.length === 0 ? row : draw($.ui.resolve(e), row, pictures)
  })

  // Reads are folded into one "Read N files" line, which raises no ToolUse.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal' || e.props.isExpanded) return row
    const pictures = await picturesFor($, e.props.calls, e.viewport?.columns ?? 100)
    return pictures.length === 0 ? row : draw($.ui.resolve(e), row, pictures)
  })
}

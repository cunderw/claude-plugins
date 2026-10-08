import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Questions } from '../types'

const pending = atom({ plugin: 'open-questions', key: 'pending' } as const, [] as Questions)

const MAX_SHOWN = 4

// The lines of an answer that ask something: outside code fences and quotes,
// ending in a question mark once list marks and emphasis are stripped.
export function questionsIn(answer: string): Questions {
  const found: Questions = []
  let isFenced = false

  for (const raw of answer.split('\n')) {
    const line = raw.trim()

    if (line.startsWith('```') || line.startsWith('~~~')) {
      isFenced = !isFenced
      continue
    }

    if (isFenced || line.startsWith('>')) {
      continue
    }

    const text = line
      .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/[*_`]+/g, '')
      .trim()

    if (text.length > 1 && text.endsWith('?')) {
      found.push(text)
    }
  }

  return found.slice(-MAX_SHOWN)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ends here too; only the main loop asks the person.
    if (e.agentId === undefined && e.reason === 'answer') {
      const asked = questionsIn(e.answer)

      // A turn that asks nothing leaves an earlier question pinned.
      if (asked.length > 0) {
        await update($, pending, () => asked)
      }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'

    if (isPerson) {
      await update($, pending, () => [])
    }

    return next(e)
    // A failed clear must not cost the person their prompt.
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const asked = await read($, pending)

    if (e.props.hasSurvey || asked.length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const room = Math.max(20, e.props.bodyColumns - 4)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color="yellow">
            {asked.length === 1 ? 'Open question' : `${asked.length} open questions`}{' '}
          </Text>
          <Button key="dismiss" label="Dismiss" onPress={() => update($, pending, () => [])} />
        </Box>
        {asked.map((question, index) => {
          const line = asked.length === 1 ? question : `${index + 1}. ${question}`

          return (
            <Text key={`q${index}`}>
              {line.length > room ? `${line.slice(0, room - 1)}…` : line}
            </Text>
          )
        })}
        {below}
      </Box>
    )
  })
}

import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

const SITE = {
  plugin: 'open-questions',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 8,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 7 },
    view: {},
  },
} as const
const BAND = { ...SITE, surface: 'terminal' } as const

const TURN = { durationMs: 10, isAborted: false, reason: 'answer' } as const
const ASK = 'gate.py: the lock now times out after 60 s.\n\nDo you want 30 s instead?'

// The world beneath the mod: the engine draws its own band and stores nothing.
function world(on: On) {
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: 'engine' })
  })
}

async function shows($: Parameters<TestBody>[0], text: RegExp) {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()

  return found !== undefined
}

test('a question the main loop asks is pinned', async ($, on) => {
  world(on)
  expect(await shows($, /Open question/)).toBe(false)

  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...SITE, surface })
    expect(await ui.find({ type: 'Text', text: /Do you want 30 s instead\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
    await ui.unmount()
  }
})

test('other turns and other senders leave it pinned', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })

  await $.turn.complete({ ...TURN, turnId: 's1', agentId: 'a1', answer: 'Should I rebase?' })
  await $.turn.complete({ ...TURN, turnId: 't2', answer: 'The reviewer finished. No findings.' })
  await $.prompt.submit({ text: 'gate passed', wait: false, origin: { kind: 'task-notification' } })
  await $.prompt.submit({ text: 'done', wait: false, origin: { kind: 'peer' } })

  expect(await shows($, /Do you want 30 s instead\?/)).toBe(true)
  expect(await shows($, /Should I rebase/)).toBe(false)
})

test('the reply clears it, and so does Dismiss', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })
  await $.prompt.submit({ text: '30', wait: false, origin: { kind: 'composer' } })

  expect(await shows($, /Open question/)).toBe(false)

  await $.turn.complete({ ...TURN, turnId: 't2', answer: ASK })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ type: 'Text', text: /Open question/ })).toBeUndefined()
  await ui.unmount()
})

test('a follow-up asked by the turn the reply was typed over is pinned', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })
  await $.prompt.submit({ text: '30', wait: false, turnId: 't2', origin: { kind: 'composer' } })
  await $.turn.complete({ ...TURN, turnId: 't2', answer: 'Set to 30 s.\nApply it to the pool lock too?' })

  expect(await shows($, /Apply it to the pool lock too\?/)).toBe(true)
  expect(await shows($, /Do you want 30 s/)).toBe(false)
})

test('code and quotes are not questions; several are numbered', async ($, on) => {
  world(on)
  const answer = '> why?\n```\nif (a) ? b : c ?\n```\n- **Ship it today?**\n2. Keep the old flag?'
  await $.turn.complete({ ...TURN, turnId: 't1', answer })

  expect(await shows($, /2 open questions/)).toBe(true)
  expect(await shows($, /1\. Ship it today\?/)).toBe(true)
  expect(await shows($, /why/)).toBe(false)
})

test('a reply over the bridge clears it', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })
  await $.prompt.submit({ text: '30', wait: false, origin: { kind: 'bridge' } })

  expect(await shows($, /Open question/)).toBe(false)
})

test('a survey takes the band', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: ASK })

  const ui = await $.ui.mount({ ...BAND, props: { ...SITE.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /Open question/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()
})

test('a long question is cut to the band', async ($, on) => {
  world(on)
  await $.turn.complete({ ...TURN, turnId: 't1', answer: 'Do you want the lock timeout at 30 s instead?' })

  const ui = await $.ui.mount({ ...BAND, props: { ...SITE.props, bodyColumns: 30 } })
  expect(await ui.find({ type: 'Text', text: /^Do you want the lock time…$/ })).toBeDefined()
  await ui.unmount()
})

test('only the last four of many are shown', async ($, on) => {
  world(on)
  const answer = ['One?', 'Two?', 'Three?', 'Four?', 'Five?', 'Six?'].join('\n')
  await $.turn.complete({ ...TURN, turnId: 't1', answer })

  expect(await shows($, /4 open questions/)).toBe(true)
  expect(await shows($, /1\. Three\?/)).toBe(true)
  expect(await shows($, /4\. Six\?/)).toBe(true)
  expect(await shows($, /Two\?/)).toBe(false)
})

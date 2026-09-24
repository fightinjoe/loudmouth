import { test, expect } from '@playwright/test'

// Stored content must stay literal through import, reload, editing, export and review.
test('hostile historical source stays inert through the real card lifecycle', async ({ page }) => {
  const payload = '<img src="/security-probe" onerror="window.__injectionExecuted=true">'
  const probeRequests = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/security-probe') probeRequests.push(request.url())
  })
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  const {deckId,entryKey,chunkId,phraseId} = await page.evaluate(async payload => {
    const {db,ui} = window.__loudmouth
    const phrase = {type:'phrase',lang:'ja',text:`猫${payload}`,translation:payload,reading:[['猫','ねこ'],[payload,null]],notes:payload}
    const deck = await db.commitPhrasebook({name:payload,lang:'ja',selectedIndexes:[0],groups:[{
      id:crypto.randomUUID(),title:payload,phrases:[{id:crypto.randomUUID(),card:phrase,speaker:'you'}],vocab:[],
    }]})
    const [entry] = await db.getCards(deck.id)
    const source = {snapshot:{lang:'ja',text:phrase.text,translation:payload,reading:phrase.reading},ref:{cardId:entry.cardId,occurrenceId:entry.occurrence.id},span:{start:0,end:1}}
    await db.importCards([
      {card:{type:'word',lang:'ja',text:'猫',translation:payload,reading:[['猫','ねこ']],partOfSpeech:'noun',senseKey:'domestic-cat'},sources:[source]},
      {card:{type:'chunk',lang:'ja',text:'猫',translation:payload,reading:[['猫','ねこ']],role:payload,explanation:payload,source}},
    ],deck.id)
    const entries = await db.getCards(deck.id)
    ui.transition('content/select-deck',{id:deck.id})
    ui.transition('shell/close')
    return {deckId:deck.id,entryKey:entry.key,phraseId:entry.cardId,chunkId:entries.find(entry=>entry.card.type==='chunk').cardId}
  },payload)

  const row = page.locator(`[data-entry-key="${entryKey}"].card-row`)
  await expect(row.locator('.card-term-english')).toHaveText(payload)
  await expect(row.locator('.card-term-target rt')).toHaveText('ねこ')
  await expect(row.locator('.card-term-target')).toContainText(payload)
  await expect(page.locator('img[src="/security-probe"], [onerror], [onmouseover]')).toHaveCount(0)
  await row.locator('.card-star').click()
  await expect.poll(()=>page.evaluate(async deckId=>{
    const entries = await window.__loudmouth.db.getReviewCards(deckId)
    return entries.map(entry=>entry.cardId)
  },deckId)).toEqual([phraseId])

  await page.reload()
  await expect(page.locator('.card-term-english').first()).toHaveText(payload)
  await page.evaluate(async deckId=>{
    const {db,ui}=window.__loudmouth
    ui.transition('action/open',{kind:'review',payload:{deck:await db.db.decks.get(deckId),cards:await db.getReviewCards(deckId)}})
  },deckId)
  await expect(page.locator('.review-panel-inner')).toContainText(payload)
  await page.locator('[data-action="review/toggle-reveal"]').click()
  await expect(page.locator('.review-panel-inner rt')).toHaveText('ねこ')
  await page.evaluate(()=>window.__loudmouth.ui.transition('action/close'))

  // Source remains historical after its parent is removed; editor and export cannot turn it into HTML.
  await page.evaluate(async ({deckId,phraseId,chunkId})=>{
    const {db,ui}=window.__loudmouth
    await db.deleteCard(phraseId)
    await db.toggleCardStar(deckId,{cardId:chunkId})
    const entry=(await db.getCards(deckId)).find(entry=>entry.cardId===chunkId)
    ui.transition('action/open',{kind:'card-edit',payload:{entry}})
  },{deckId,phraseId,chunkId})
  await expect(page.locator('#edit-text')).not.toBeEditable()
  await expect(page.locator('#edit-role')).toHaveValue(payload)
  await expect(page.locator('#edit-explanation')).toHaveValue(payload)
  await page.locator('#btn-view-json').click()
  const batch=JSON.parse(await page.locator('.json-pane-textarea').inputValue())
  expect(batch.schemaVersion).toBe(2)
  expect(batch.cards[0].card.source.snapshot.text).toBe(`猫${payload}`)
  expect(batch.cards[0].card.role).toBe(payload)
  await page.evaluate(()=>window.__loudmouth.ui.transition('action/close'))
  await page.evaluate(async deckId=>{
    const {db,ui}=window.__loudmouth
    ui.transition('action/open',{kind:'review',payload:{deck:await db.db.decks.get(deckId),cards:await db.getReviewCards(deckId)}})
  },deckId)
  await expect(page.locator('.review-panel-inner mark')).toHaveText('____')
  await expect(page.locator('.review-panel-inner')).toContainText(payload)
  await page.locator('[data-action="review/toggle-reveal"]').click()
  await expect(page.locator('.review-panel-inner mark')).toContainText('猫')
  await expect(page.locator('.review-panel-inner')).toContainText(payload)
  await expect(page.locator('img[src="/security-probe"], [onerror], [onmouseover]')).toHaveCount(0)
  expect(await page.evaluate(()=>window.__injectionExecuted===true)).toBe(false)
  expect(probeRequests).toEqual([])
})

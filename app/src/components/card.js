export function renderCard(card, mode, readingDisplay = 'reading') {
  return `
    <div
      class="card"
      data-card-id="${card.id}"
      data-card-mode="${mode}"
    >
      ${ renderCardContent(card, readingDisplay) }

      <div class="answer">
        <div class="skeleton"></div>
        <div class="translation">${ card.translation }</div>
        <div class="notes">${ card.notes }</div>
      </div>
    </div>
  `;
}

export function renderCardRow(card, readingDisplay = 'reading') {
  return `
    <div
      class="card-row flex-row gap-auto"
      data-card-id="${card.id}"
    >
      ${ renderCardContent(card, readingDisplay) }

      <button
        class="card-row-play"
        data-card-id="${card.id}"
        aria-label="Play"
      >
        ▶
      </button>
    </div>
  `;
}

function renderCardContent(card, readingDisplay = 'reading') {
  const reading = card[readingDisplay] || ''
  return `
    <div class="card-content flex-col gap-sm">
      <div class="card-primary text-h2">
        <span class="card-text">${card.text}</span>
        <span class="card-translation">${card.translation}</span>
      </div>
      <div class="card-secondary text-body2 text-caption">
        <span class="card-reading">${reading}</span>
        <span class="card-translation">${card.translation}</span>
      </div>
    </div>
  `;
}
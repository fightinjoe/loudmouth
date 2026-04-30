/**
 * wireNavPaneGesture — swipe-right-to-open / swipe-left-to-close for the nav pane.
 *
 * @param {HTMLElement} contentPaneEl  The content pane element that slides right to reveal the nav pane.
 * @param {Function}    onOpen     Called when the nav pane opens.
 * @param {Function}    onClose    Called when the nav pane closes.
 * @param {number}      navPaneWidth  Width of the nav pane in px (default 280).
 * @param {number}      openThreshold  Swipe distance needed to commit open/close (default 100).
 * @returns {{ open: Function, close: Function, setSuppressed: Function }}
 */
export function wireNavPaneGesture(contentPaneEl, onOpen, onClose, navPaneWidth = 280, openThreshold = 100) {
  const navMainEl = contentPaneEl
  let startX = null
  let startY = null
  let axis = null
  let isOpen = false
  let _isSuppressed = null

  function setOpen(open, animate = true) {
    isOpen = open
    if (!animate) navMainEl.dataset.dragging = ''
    if (open) {
      navMainEl.classList.add('nav-main--open')
      onOpen()
    } else {
      navMainEl.classList.remove('nav-main--open')
      onClose()
    }
    if (!animate) {
      requestAnimationFrame(() => delete navMainEl.dataset.dragging)
    }
  }

  navMainEl.addEventListener('touchstart', e => {
    if (e.target.closest('.pane-screen')) return
    // When open, allow tracking on the scrim (for swipe-left to close).
    // When closed, ignore scrim touches (it's invisible).
    if (!isOpen && e.target.closest('.nav-main-scrim')) return
    if (_isSuppressed && _isSuppressed()) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    axis = null
  }, { passive: true })

  navMainEl.addEventListener('touchmove', e => {
    if (startX === null) return
    const dx = e.touches[0].clientX - startX
    const dy = e.touches[0].clientY - startY

    if (!axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (axis !== 'h') return
    if (!isOpen && dx < 0) return
    if (isOpen && dx > 0) return

    const base = isOpen ? navPaneWidth : 0
    const clamped = Math.max(0, Math.min(navPaneWidth, base + dx))
    navMainEl.dataset.dragging = ''
    navMainEl.style.transform = `translateX(${clamped}px)`
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = clamped / navPaneWidth
  }, { passive: false })

  navMainEl.addEventListener('touchend', e => {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    delete navMainEl.dataset.dragging
    navMainEl.style.transform = ''
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = ''
    startX = null

    if (axis !== 'h') return
    if (!isOpen && dx >= openThreshold) setOpen(true)
    else if (isOpen && dx <= -openThreshold) setOpen(false)
    axis = null
  }, { passive: true })

  navMainEl.addEventListener('touchcancel', () => {
    if (startX === null) return
    delete navMainEl.dataset.dragging
    navMainEl.style.transform = ''
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = ''
    startX = null
    axis = null
  }, { passive: true })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    setSuppressed: (fn) => { _isSuppressed = fn },
  }
}

/**
 * wireRevealGesture — swipe-left on a list item to reveal action buttons behind it.
 *
 * The gesture tracks real-time finger position and applies transform directly.
 * On release, commits (reveals) or snaps back based on threshold.
 *
 * @param {HTMLElement} listEl          The scrollable list container.
 * @param {string}      wrapperSelector CSS class selector for each swipeable row wrapper,
 *                                      e.g. '.card-row-wrapper'. MUST be a single class
 *                                      with a leading dot — the function derives the
 *                                      committed state class by appending '--swiped'.
 * @param {string}      rowSelector     CSS selector for the inner row element that slides.
 * @param {number}      revealWidth     How far (px) the row slides to reveal buttons (default 160).
 * @param {number}      commitThreshold Swipe distance needed to commit reveal (default 80).
 * @returns {{ reset: Function, isAnyOpen: Function }}
 */
export function wireRevealGesture(listEl, wrapperSelector, rowSelector, revealWidth = 160, commitThreshold = 80) {
  let startX = 0
  let startY = 0
  let target = null   // wrapper element
  let axis = null
  let activeSwiped = null

  listEl.addEventListener('touchstart', e => {
    const wrapper = e.target.closest(wrapperSelector)
    if (!wrapper) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    target = wrapper
    axis = null
    wrapper.querySelector(rowSelector).dataset.dragging = ''
  }, { passive: true })

  listEl.addEventListener('touchmove', e => {
    if (!target) return
    const dx = e.touches[0].clientX - startX
    const dy = e.touches[0].clientY - startY

    if (!axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (axis !== 'h') return
    e.preventDefault()

    const isSwiped = target.classList.contains(`${wrapperSelector.slice(1)}--swiped`)
    const base = isSwiped ? -revealWidth : 0
    const clamped = Math.max(-revealWidth, Math.min(0, base + dx))
    target.querySelector(rowSelector).style.transform = `translateX(${clamped}px)`
  }, { passive: false })

  listEl.addEventListener('touchend', e => {
    if (!target) return
    const row = target.querySelector(rowSelector)
    delete row.dataset.dragging

    if (axis === 'h') {
      const dx = e.changedTouches[0].clientX - startX
      const swipedClass = `${wrapperSelector.slice(1)}--swiped`
      const isSwiped = target.classList.contains(swipedClass)
      const net = (isSwiped ? -revealWidth : 0) + dx

      if (net < -commitThreshold) {
        if (activeSwiped && activeSwiped !== target) {
          activeSwiped.classList.remove(swipedClass)
          activeSwiped.querySelector(rowSelector).style.transform = ''
        }
        target.classList.add(swipedClass)
        activeSwiped = target
      } else {
        target.classList.remove(swipedClass)
        if (activeSwiped === target) activeSwiped = null
      }
      row.style.transform = ''
    }

    target = null
    axis = null
  })

  listEl.addEventListener('touchcancel', () => {
    if (!target) return
    const row = target.querySelector(rowSelector)
    delete row.dataset.dragging
    row.style.transform = ''
    target = null
    axis = null
  })

  return {
    reset() {
      if (activeSwiped) {
        const swipedClass = `${wrapperSelector.slice(1)}--swiped`
        activeSwiped.classList.remove(swipedClass)
        activeSwiped.querySelector(rowSelector).style.transform = ''
        activeSwiped = null
      }
    },
    isAnyOpen() {
      return activeSwiped !== null
    },
  }
}

/**
 * wireSheetDismissGesture — swipe-down on a bottom sheet panel to dismiss it.
 *
 * Tracks the finger in real-time, translating the panel downward. Commits
 * (calls onDismiss) if displacement exceeds the threshold, otherwise snaps back.
 *
 * @param {HTMLElement} panelEl        The bottom sheet element.
 * @param {Function}    onDismiss      Called when the swipe-down threshold is met.
 * @param {number}      threshold      Downward drag distance needed to commit (default 80).
 */
export function wireSheetDismissGesture(panelEl, onDismiss, threshold = 80) {
  let startX = null
  let startY = null
  let axis = null

  panelEl.addEventListener('touchstart', e => {
    // Only initiate from the handle or header area to avoid conflicting with
    // scrollable content inside the sheet.
    const handle = e.target.closest('.sheet-handle, .pane-header')
    if (!handle) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    axis = null
    panelEl.dataset.dragging = ''
  }, { passive: true })

  panelEl.addEventListener('touchmove', e => {
    if (startY === null) return
    const dy = e.touches[0].clientY - startY
    const dx = e.touches[0].clientX - startX

    if (!axis) {
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return
      axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    }
    if (axis !== 'v') return

    const clamped = Math.max(0, dy)
    panelEl.style.transform = `translateY(${clamped}px)`
  }, { passive: true })

  panelEl.addEventListener('touchend', e => {
    if (startY === null) return
    const dy = e.changedTouches[0].clientY - startY
    delete panelEl.dataset.dragging
    startX = null
    startY = null

    if (axis === 'v' && dy >= threshold) {
      panelEl.style.transform = ''
      onDismiss()
    } else {
      panelEl.style.transform = ''
    }
    axis = null
  }, { passive: true })

  panelEl.addEventListener('touchcancel', () => {
    if (startY === null) return
    delete panelEl.dataset.dragging
    panelEl.style.transform = ''
    startX = null
    startY = null
    axis = null
  }, { passive: true })
}

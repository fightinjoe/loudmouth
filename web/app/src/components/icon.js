export function icon( iconName ) {
  return `
    <svg aria-hidden="true" focusable="false" viewBox="0 0 44 44">
      <use href="icons/${iconName}.svg"></use>
    </svg>
  `
}
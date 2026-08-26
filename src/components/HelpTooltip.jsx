// Iconita "?" cu explicatie - tooltip NATIV al browserului (atributul
// "title"), nu unul custom cu hover/focus in CSS: apare/dispare mereu
// corect, garantat, fara riscul sa ramana "agatat" deschis dupa un click
// sau tap.
export default function HelpTooltip({ text }) {
  return (
    <span className="help-tooltip-icon" title={text} tabIndex={0}>
      ?
    </span>
  )
}

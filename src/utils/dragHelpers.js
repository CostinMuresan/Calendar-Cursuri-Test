// Dupa un drag cu Pointer Events (mousedown pe un maner, miscare, mouseup
// pe alt element), browserul genereaza in continuare un eveniment "click"
// pe elementul aflat sub cursor in acel moment - de exemplu o zi din
// calendar sau o bara de curs. Fara suprimare, acel click "fantoma"
// declansa actiuni nedorite (ex: deschiderea "Adauga curs" sau editarea
// unui curs peste care s-a dat drumul la mouse).
//
// Apelata din onPointerUp, DOAR daca s-a miscat efectiv mouse-ul (nu la un
// simplu click pe maner, fara tragere) - interceptam urmatorul click, in
// faza de capturare (inainte sa ajunga la orice element din pagina), si il
// anulam complet, o singura data.
export function suppressNextGhostClick() {
  window.addEventListener(
    'click',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
    },
    { capture: true, once: true }
  )
}

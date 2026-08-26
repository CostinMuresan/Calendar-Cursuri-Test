import { useEffect, useState } from 'react'

// Masoara inaltimea reala a barei de meniu (.navbar) - variaza pe mobil,
// cand meniul se rupe pe mai multe randuri. Recalculat la redimensionarea
// ferestrei/rotirea telefonului. Bara e acum "sticky" (mereu vizibila, sus),
// deci orice element care trebuie sa stea chiar sub ea (sau centrat pe ea)
// foloseste acest hook, ca sa nu se suprapuna niciodata cu ea.
export default function useNavbarOffset() {
  const [height, setHeight] = useState(60)

  useEffect(() => {
    function update() {
      const nav = document.querySelector('.navbar')
      setHeight(nav ? nav.getBoundingClientRect().height : 60)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // centrul vertical real al barei (indiferent daca are 1 rand sau se rupe
  // pe mai multe) - folosit ca sa centram elemente PE bara, niciodata sub ea
  return { height, center: height / 2 }
}

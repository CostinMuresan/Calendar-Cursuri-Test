import { useEffect, useRef, useState } from 'react'
import { parse, isValid, format } from 'date-fns'

// Camp de data cu afisare fixa in format romanesc zz/ll/aaaa, indiferent de
// limba/regiunea setata in browser-ul utilizatorului. Valoarea transmisa prin
// props/onChange ramane in format ISO (yyyy-MM-dd), pentru compatibilitate cu
// baza de date si cu restul aplicatiei.
//
// Butonul cu iconita de calendar deschide selectorul vizual nativ al
// browser-ului prin showPicker() - un buton normal, usor de apasat, nu o
// zona mica suprapusa (asta cauza dificultatea de a-l "nimeri" anterior).
export default function DateInputRO({ value, onChange, required, disabled }) {
  const [text, setText] = useState('')
  const nativeRef = useRef(null)

  useEffect(() => {
    if (value) {
      const parsedFromIso = parse(value, 'yyyy-MM-dd', new Date())
      if (isValid(parsedFromIso)) {
        setText(format(parsedFromIso, 'dd/MM/yyyy'))
        return
      }
    }
    setText('')
  }, [value])

  function handleChange(e) {
    const digitsOnly = e.target.value.replace(/[^\d]/g, '').slice(0, 8)

    let formatted = digitsOnly
    if (digitsOnly.length > 4) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4)}`
    } else if (digitsOnly.length > 2) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`
    }
    setText(formatted)

    if (digitsOnly.length === 8) {
      const parsed = parse(formatted, 'dd/MM/yyyy', new Date())
      if (isValid(parsed)) {
        onChange(format(parsed, 'yyyy-MM-dd'))
      }
    } else if (digitsOnly.length === 0) {
      onChange('')
    }
  }

  function handlePickerChange(e) {
    const iso = e.target.value // input nativ type=date da direct format yyyy-MM-dd
    if (!iso) return
    onChange(iso)
  }

  function openPicker() {
    if (disabled) return
    const el = nativeRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch (err) {
        // browser a refuzat showPicker (rar) - fallback mai jos
      }
    }
    el.focus()
    el.click()
  }

  return (
    <div className="date-input-ro-wrapper">
      <input
        type="text"
        inputMode="numeric"
        placeholder="zz/ll/aaaa"
        value={text}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        maxLength={10}
      />
      <button
        type="button"
        className="date-input-ro-icon-btn"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Deschide calendar"
        title="Deschide calendar"
      >
        📅
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="date-input-ro-native"
        value={value || ''}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

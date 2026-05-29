import { useState } from 'react'

export default function Notepad() {
  const [text, setText] = useState('')

  return (
    <textarea
      className="notepad"
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder="Start typing..."
      spellCheck="false"
      autoFocus
    />
  )
}

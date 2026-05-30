import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { WebrtcProvider } from 'y-webrtc'

const ROOM_NAME = 'screwing-around-notepad'
const WEBSOCKET_ENDPOINT = 'wss://demos.yjs.dev'
const SIGNALING_SERVERS = ['wss://signaling.yjs.dev']

export default function Notepad() {
  const [text, setText] = useState('')
  const [peerCount, setPeerCount] = useState(0)
  const [status, setStatus] = useState('connecting')
  const ytextRef = useRef(null)

  useEffect(() => {
    const doc = new Y.Doc()
    const wsProvider = new WebsocketProvider(WEBSOCKET_ENDPOINT, ROOM_NAME, doc)
    const rtcProvider = new WebrtcProvider(ROOM_NAME, doc, {
      signaling: SIGNALING_SERVERS,
      password: null,
    })

    const ytext = doc.getText('shared-notepad')
    ytextRef.current = ytext

    const updateText = () => {
      setText(ytext.toString())
    }

    const updatePeers = () => {
      const states = wsProvider.awareness.getStates()
      const peers = Math.max(0, states.size - 1)
      setPeerCount(peers)
    }

    const updateStatus = ({ status }) => {
      setStatus(status)
    }

    wsProvider.on('status', updateStatus)
    rtcProvider.on('status', updateStatus)
    ytext.observe(updateText)
    wsProvider.awareness.on('change', updatePeers)
    rtcProvider.awareness.on('change', updatePeers)

    updateText()
    updatePeers()

    return () => {
      ytext.unobserve(updateText)
      wsProvider.awareness.off('change', updatePeers)
      rtcProvider.awareness.off('change', updatePeers)
      wsProvider.off('status', updateStatus)
      rtcProvider.off('status', updateStatus)
      rtcProvider.destroy()
      wsProvider.destroy()
      doc.destroy()
    }
  }, [])

  function handleChange(event) {
    const ytext = ytextRef.current
    if (!ytext) return

    const nextValue = event.target.value
    const currentValue = ytext.toString()
    if (nextValue === currentValue) return

    let start = 0
    let endCurrent = currentValue.length
    let endNext = nextValue.length

    while (
      start < endCurrent &&
      start < endNext &&
      currentValue[start] === nextValue[start]
    ) {
      start += 1
    }

    while (
      endCurrent > start &&
      endNext > start &&
      currentValue[endCurrent - 1] === nextValue[endNext - 1]
    ) {
      endCurrent -= 1
      endNext -= 1
    }

    ytext.delete(start, endCurrent - start)
    if (endNext > start) {
      ytext.insert(start, nextValue.slice(start, endNext))
    }
    setText(nextValue)
  }

  return (
    <div className="notepad-wrapper">
      <div className="notepad-header">
        Shared editor — {peerCount} peer{peerCount === 1 ? '' : 's'} connected • {status}
      </div>
      <textarea
        className="notepad"
        value={text}
        onChange={handleChange}
        placeholder="Type here and everyone in the room edits live..."
        spellCheck="false"
        autoFocus
      />
    </div>
  )
}

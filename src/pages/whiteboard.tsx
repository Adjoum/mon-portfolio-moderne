// src/pages/whiteboard.tsx
import { useEffect } from 'react'
import WhiteboardEmbed from '../components/WhiteboardEmbed'

export default function WhiteboardPage() {
  useEffect(() => {
    document.title = 'InkSpace — Tableau Blanc | Adjoumani'
    return () => { document.title = 'Adjoumani' } // restaure au départ
  }, [])

  return (
    <main className="whiteboard-page fixed inset-0 pt-20 bg-dark">
      <WhiteboardEmbed />
    </main>
  )
}
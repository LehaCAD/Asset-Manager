'use client'

import { useState } from 'react'

interface ReviewerNameInputProps {
  onSave: (name: string, sessionId: string) => void
}

export function ReviewerNameInput({ onSave }: ReviewerNameInputProps) {
  const [name, setName] = useState('')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const sessionId = crypto.randomUUID()
    localStorage.setItem('reviewer_name', trimmed)
    localStorage.setItem('reviewer_session_id', sessionId)
    onSave(trimmed, sessionId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg border border-border">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Как вас зовут?</span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Имя"
        maxLength={50}
        autoFocus
        className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        onClick={handleSubmit}
        disabled={!name.trim()}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        OK
      </button>
    </div>
  )
}

export default ReviewerNameInput

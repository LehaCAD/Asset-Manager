'use client'

import { useAuthStore } from '@/lib/store/auth'
import { redirect } from 'next/navigation'
import { AdminFeedbackInbox } from '@/components/feedback/AdminFeedbackInbox'

export default function AdminFeedbackPage() {
  const user = useAuthStore((s) => s.user)
  if (!user?.is_staff) redirect('/projects')
  return <AdminFeedbackInbox />
}

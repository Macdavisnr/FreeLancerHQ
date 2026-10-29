import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import PhoneField from '@/components/PhoneField'
import TextField from '@/components/TextField'
import { useAuth } from '@/hooks/useAuth'
import { guessCountry, joinPhone, splitPhone } from '@/lib/countries'
import { btnPrimary } from '@/lib/ui'
import { changePassword, updateProfile } from '@/services/profileService'
import { formatMonthYear } from '@/utils/format'

const textareaClass = 'mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-600'

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: user?.name ?? '',
    title: user?.title ?? '',
    email: user?.email ?? '',
    bio: user?.bio ?? '',
  })
  const [phone, setPhone] = useState(() => splitPhone(user?.phone ?? '', guessCountry()))
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [passwords, setPasswords] = useState({ current: '', next: '' })
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  if (!user) return null

  const setField = (field: keyof typeof form) => (e: { target: { value: string } }) => {
    setProfileMsg(null)
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleProfile(e: FormEvent) {
    e.preventDefault()
    setProfileMsg(null)
    setSavingProfile(true)
    try {
      updateUser(await updateProfile({ ...form, phone: joinPhone(phone.country, phone.national) }))
      setProfileMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save profile.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    setSavingPassword(true)
    try {
      await changePassword(passwords.current, passwords.next)
      setPasswords({ current: '', next: '' })
      setPasswordMsg({ ok: true, text: 'Password updated.' })
    } catch (err) {
      setPasswordMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not update password.' })
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const message = (m: { ok: boolean; text: string } | null) =>
    m && <p className={`mb-4 text-sm ${m.ok ? 'font-semibold text-emerald-700' : 'text-red-600'}`}>{m.text}</p>

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your personal account details."
        action={<button onClick={handleLogout} className={btnPrimary}>Log out</button>}
      />

      <div className="max-w-4xl space-y-4">
        <section className="flex items-center gap-5 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-sun text-3xl font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xl font-bold">{user.name}</p>
            {user.title && <p className="text-muted">{user.title}</p>}
            <p className="text-sm text-muted">Member since {formatMonthYear(user.createdAt)}</p>
          </div>
        </section>

        <form onSubmit={handleProfile} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-bold">Personal information</h2>
          <p className="mb-4 text-muted">Your name and how clients can reach you.</p>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <TextField label="Full name" value={form.name} onChange={setField('name')} required />
            <TextField label="Professional title" value={form.title} onChange={setField('title')} />
            <TextField label="Email" type="email" value={form.email} onChange={setField('email')} required />
          </div>
          <div className="sm:w-2/3">
            <PhoneField
              label="Phone"
              country={phone.country}
              national={phone.national}
              onChange={(country, national) => {
                setProfileMsg(null)
                setPhone({ country, national })
              }}
            />
          </div>
          <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold">Short bio</label>
          <textarea id="bio" rows={3} value={form.bio} onChange={setField('bio')} className={textareaClass} />
          {message(profileMsg)}
          <button type="submit" disabled={savingProfile} className={btnPrimary}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <form onSubmit={handlePassword} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-bold">Password</h2>
          <p className="mb-4 text-muted">Use at least 8 characters.</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <TextField
              label="Current password" type="password" autoComplete="current-password"
              value={passwords.current} onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} required
            />
            <TextField
              label="New password" type="password" autoComplete="new-password" minLength={8}
              value={passwords.next} onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} required
            />
          </div>
          {message(passwordMsg)}
          <button type="submit" disabled={savingPassword} className={btnPrimary}>
            {savingPassword ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </>
  )
}

import nodemailer from 'nodemailer'

/*
 * Delivery of one-time codes.
 *
 *  - Email: sent through any SMTP service when SMTP_HOST is set (Resend, Brevo, Gmail app
 *    password, Mailtrap...). See .env.example.
 *  - Phone (SMS): sent through Twilio, which reaches 180+ countries, when TWILIO_ACCOUNT_SID,
 *    TWILIO_AUTH_TOKEN and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM are set.
 *
 * With nothing configured, in development the code is printed in the API terminal instead
 * (and returned to the app so you can test). In production we refuse to "send" a code
 * that nobody can receive.
 */

export type Delivery = 'email' | 'sms' | 'console'

const isProduction = process.env.NODE_ENV === 'production'

const smtpConfigured = Boolean(process.env.SMTP_HOST)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null

const twilioConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM),
)

/** Send one SMS using Twilio's REST API (plain HTTPS, no SDK needed). */
async function sendTwilioSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const base = process.env.TWILIO_API_BASE ?? 'https://api.twilio.com'
  const form = new URLSearchParams({ To: to, Body: body })
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
  } else {
    form.set('From', process.env.TWILIO_FROM!)
  }
  const response = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  if (!response.ok) {
    throw new Error(`Twilio responded ${response.status}: ${await response.text()}`)
  }
}

/** What the code is for: changes the wording of the message, nothing else. */
export type OtpPurpose = 'signup' | 'reset'

const OTP_COPY: Record<OtpPurpose, { subject: string; heading: string; intro: string; ignore: string }> = {
  signup: {
    subject: 'is your FreelanceHQ verification code',
    heading: 'Verify your email',
    intro: 'Use this code to finish creating your FreelanceHQ account:',
    ignore: 'If you did not try to create an account, you can ignore this email.',
  },
  reset: {
    subject: 'is your FreelanceHQ password reset code',
    heading: 'Reset your password',
    intro: 'Use this code to choose a new password for your FreelanceHQ account:',
    ignore: 'If you did not ask to reset your password, you can ignore this email. Your password has not changed.',
  },
}

export async function sendOtp(
  channel: 'email' | 'phone',
  destination: string,
  code: string,
  purpose: OtpPurpose = 'signup',
): Promise<Delivery> {
  const copy = OTP_COPY[purpose]
  if (channel === 'email' && transporter) {
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? 'FreelanceHQ <no-reply@freelancehq.local>',
      to: destination,
      subject: `${code} ${copy.subject}`,
      text: `${copy.intro} ${code}\n\nIt expires in 10 minutes. ${copy.ignore}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
        <h2 style="margin:0 0 8px">${copy.heading}</h2>
        <p>${copy.intro}</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0">${code}</p>
        <p style="color:#6b6b8a">It expires in 10 minutes. ${copy.ignore}</p>
      </div>`,
    })
    return 'email'
  }

  if (channel === 'phone' && twilioConfigured) {
    await sendTwilioSms(destination, `${code} ${copy.subject}. It expires in 10 minutes.`)
    return 'sms'
  }

  if (isProduction) {
    throw new Error(`No ${channel === 'email' ? 'email (SMTP)' : 'SMS'} provider is configured.`)
  }
  console.log(`\n[DEV OTP] ${purpose} ${channel} → ${destination}: ${code}\n`)
  return 'console'
}

/** Only in development with no provider configured: the app can show the code to help testing. */
export const canExposeDevCode = (delivery: Delivery) => delivery === 'console' && !isProduction

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
  /** Where the recipient's "Reply" goes, e.g. the freelancer rather than our no-reply address. */
  replyTo?: string
}

/**
 * Send any email (invoices, notifications). Same rules as codes: real SMTP when configured,
 * printed in the API terminal in development, and an error in production with no provider.
 */
export async function sendEmail(message: EmailMessage): Promise<Delivery> {
  if (transporter) {
    await transporter.sendMail({ from: process.env.MAIL_FROM ?? 'FreelanceHQ <no-reply@freelancehq.local>', ...message })
    return 'email'
  }
  if (isProduction) throw new Error('No email (SMTP) provider is configured.')
  console.log(`\n[DEV EMAIL] to ${message.to}${message.replyTo ? ` (reply-to ${message.replyTo})` : ''}\nSubject: ${message.subject}\n\n${message.text}\n`)
  return 'console'
}

/** Anything a user typed must be escaped before it goes into an HTML email. */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

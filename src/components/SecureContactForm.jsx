import { useEffect, useRef, useState } from 'react'

const PUBLIC_KEY_URL = '/keys/info-sabot-media.asc'
const EXPECTED_FINGERPRINT = '3166FF411CC871E72D15344CAC268457855E57BA'
const DISPLAY_FINGERPRINT = '3166 FF41 1CC8 71E7 2D15 344C AC26 8457 855E 57BA'

function buildPlaintext({ name, replyEmail, subject, message }) {
  return [
    'SabotPress secure contact form',
    `Created: ${new Date().toISOString()}`,
    `Name: ${name.trim() || 'Not provided'}`,
    `Reply email: ${replyEmail.trim() || 'Not provided'}`,
    `Subject: ${subject.trim() || 'Not provided'}`,
    '',
    'Message:',
    message.trim(),
  ].join('\n')
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard access was denied.')
}

export function SecureContactForm() {
  const [publicKey, setPublicKey] = useState(null)
  const [keyState, setKeyState] = useState('loading')
  const [status, setStatus] = useState('')
  const [encryptedMessage, setEncryptedMessage] = useState('')
  const encryptedOutputRef = useRef(null)
  const openpgpRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadPublicKey() {
      try {
        const openpgp = await import('openpgp')
        const response = await fetch(PUBLIC_KEY_URL, { cache: 'force-cache' })
        if (!response.ok) throw new Error('The public key could not be loaded.')
        const armoredKey = await response.text()
        const key = await openpgp.readKey({ armoredKey })
        const fingerprint = key.getFingerprint().toUpperCase()
        const identityMatches = key.getUserIDs().some((identity) => identity.includes(''))

        if (fingerprint !== EXPECTED_FINGERPRINT || !identityMatches) {
          throw new Error('The public key did not match the pinned SabotPress identity.')
        }

        if (!cancelled) {
          openpgpRef.current = openpgp
          setPublicKey(key)
          setKeyState('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setKeyState('error')
          setStatus(error instanceof Error ? error.message : 'The public key could not be verified.')
        }
      }
    }

    loadPublicKey()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!publicKey || !openpgpRef.current || keyState !== 'ready') return

    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') || ''),
      replyEmail: String(form.get('replyEmail') || ''),
      subject: String(form.get('subject') || ''),
      message: String(form.get('message') || ''),
    }

    if (!payload.message.trim()) {
      setStatus('Write a message before encrypting it.')
      return
    }

    setKeyState('encrypting')
    setStatus('Encrypting locally in your browser…')
    setEncryptedMessage('')

    try {
      const armoredMessage = await openpgpRef.current.encrypt({
        message: await openpgpRef.current.createMessage({ text: buildPlaintext(payload) }),
        encryptionKeys: publicKey,
        format: 'armored',
      })

      setEncryptedMessage(armoredMessage)

      let copied = false
      try {
        await copyText(armoredMessage)
        copied = true
      } catch {
        copied = false
      }

      const mailto = new URL('mailto:')
      mailto.searchParams.set('subject', 'Encrypted website message')
      mailto.searchParams.set('body', armoredMessage)
      window.location.href = mailto.toString()

      setStatus(copied
        ? 'Encrypted message copied. Your email app should open with it; paste if the message body is blank.'
        : 'Encrypted. Your email app should open with the message. A copy is also available below.')
    } catch {
      setStatus('Encryption failed. Nothing was sent. Try again or use the public key from the Security page.')
    } finally {
      setKeyState('ready')
    }
  }

  async function handleCopy() {
    if (!encryptedMessage) return
    try {
      await copyText(encryptedMessage)
      setStatus('Encrypted message copied to your clipboard.')
    } catch {
      setStatus('Copying was blocked. Select and copy the encrypted message below.')
      encryptedOutputRef.current?.focus()
      encryptedOutputRef.current?.select()
    }
  }

  return (
    <section className="secure-contact" aria-labelledby="secure-contact-title">
      <div className="secure-contact__heading">
        <div>
          <p className="secure-contact__eyebrow">optional encrypted contact</p>
          <h2 id="secure-contact-title">Send an encrypted message</h2>
        </div>
        <span className={`secure-contact__key-state secure-contact__key-state--${keyState}`}>
          {keyState === 'ready' ? 'Key verified' : keyState === 'error' ? 'Key unavailable' : keyState === 'encrypting' ? 'Encrypting' : 'Checking key'}
        </span>
      </div>

      <p className="secure-contact__intro">
        This form encrypts your message in this browser for <strong></strong>, then opens your email app. Nothing is uploaded to SabotPress by the form itself.
      </p>

      <form className="secure-contact__form" onSubmit={handleSubmit}>
        <div className="secure-contact__field-grid">
          <label>
            Name <span>optional</span>
            <input name="name" type="text" autoComplete="name" maxLength="120" />
          </label>
          <label>
            Reply email <span>optional</span>
            <input name="replyEmail" type="email" autoComplete="email" maxLength="254" />
          </label>
        </div>
        <label>
          Subject <span>encrypted inside the message</span>
          <input name="subject" type="text" maxLength="200" />
        </label>
        <label>
          Message
          <textarea name="message" rows="8" maxLength="12000" required />
        </label>

        <div className="secure-contact__actions">
          <button className="button button--primary" type="submit" disabled={keyState !== 'ready'}>
            Encrypt and open email
          </button>
          <a className="button button--ghost" href={PUBLIC_KEY_URL} download>
            Download public key
          </a>
        </div>
      </form>

      <p className="secure-contact__fingerprint">
        Pinned fingerprint: <code>{DISPLAY_FINGERPRINT}</code>
      </p>

      {status ? <p className="secure-contact__status" role="status" aria-live="polite">{status}</p> : null}

      {encryptedMessage ? (
        <details className="secure-contact__output">
          <summary>Show encrypted message</summary>
          <textarea ref={encryptedOutputRef} value={encryptedMessage} readOnly aria-label="Encrypted OpenPGP message" />
          <button className="button button--ghost" type="button" onClick={handleCopy}>Copy encrypted message</button>
        </details>
      ) : null}
    </section>
  )
}

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Milk } from 'lucide-react'

export default function Login() {
  const { login, signUp } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [signupSuccessInfo, setSignupSuccessInfo] = useState(null)

  const validate = () => {
    const e = {}
    if (!email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email address'
    if (!password) e.password = 'Password is required'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
        setSignupSuccessInfo({ email })
        toast.success('Account created! Verification needed.')
      } else {
        await login(email, password)
        toast.success('Welcome back!')
      }
    } catch (err) {
      toast.error(err.message || 'Action failed. Check details.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0A5240 0%, #0F6E56 50%, #1a9e7a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: '600px', height: '600px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)'
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', left: '-8%',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)'
        }} />
      </div>

      <div style={{
        background: 'white', borderRadius: '20px',
        padding: '2.5rem 2rem', width: '100%', maxWidth: '420px',
        boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '18px',
            background: 'linear-gradient(135deg, #0F6E56, #1a9e7a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', boxShadow: '0 8px 24px rgba(15,110,86,0.3)'
          }}>
            <span style={{ fontSize: '2rem' }}>🥛</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1A2332', marginBottom: '0.35rem' }}>
            Milk Manager
          </h1>
          <p style={{ color: '#6B7A90', fontSize: '0.875rem' }}>
            Dairy Management System
          </p>
        </div>

        {signupSuccessInfo ? (
          <div style={{ textAlign: 'left' }}>
            <div style={{
              background: '#ECFDF5', border: '1px solid #A7F3D0',
              borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem'
            }}>
              <h3 style={{ color: '#065F46', fontWeight: 700, margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
                🎉 Account Created!
              </h3>
              <p style={{ color: '#047857', fontSize: '0.825rem', margin: 0, lineHeight: 1.4 }}>
                Check your inbox to confirm your email, or bypass verification instantly by running this SQL query in your **Supabase SQL Editor**:
              </p>
            </div>
            
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <pre style={{
                background: '#F3F4F6', color: '#1F2937', padding: '1rem 0.75rem',
                borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto',
                border: '1px solid #E5E7EB', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
              }}>
                {`UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${signupSuccessInfo.email}';`}
              </pre>
            </div>

            <button
              onClick={() => {
                setSignupSuccessInfo(null)
                setIsSignUp(false)
                setPassword('')
              }}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className={`input${errors.email ? ' error' : ''}`}
                placeholder="admin@dairy.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrors(ev => ({...ev, email: ''})) }}
                autoComplete="email"
              />
              {errors.email && <span className="form-error">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`input${errors.password ? ' error' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(ev => ({...ev, password: ''})) }}
                  autoComplete="current-password"
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none',
                    border: 'none', cursor: 'pointer', color: '#6B7A90'
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="form-error">{errors.password}</span>}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  {isSignUp ? 'Creating account…' : 'Signing in…'}
                </span>
              ) : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(s => !s)
                  setErrors({})
                }}
                style={{
                  background: 'none', border: 'none', color: '#0F6E56',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem', color: '#9CA3AF' }}>
          Milk Manager v1.0 · Secure dairy operations
        </p>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PlayerAuthData {
  userId: string
  playerId: string
  playerName: string
  isDevMode: boolean
}

interface CoachAuthData {
  userId: string
  coachId: string
  coachName: string
  coachType: 'college' | 'juco' | 'high_school' | 'showcase'
  isDevMode: boolean
}

interface AuthHookResult<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Hook for player authentication
 * Returns player data if user is authenticated as a player
 */
export function usePlayerAuth(): AuthHookResult<PlayerAuthData> {
  const [data, setData] = useState<PlayerAuthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPlayerAuth() {
      try {
        const supabase = createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        // Get user record to check role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userData?.role !== 'player') {
          setError('Not authenticated as player')
          setLoading(false)
          return
        }

        // Get player profile
        const { data: player, error: playerError } = await supabase
          .from('baseball_players')
          .select('id, first_name, last_name')
          .eq('user_id', user.id)
          .single()

        if (playerError || !player) {
          // Fallback: use user data if player profile doesn't exist
          setData({
            userId: user.id,
            playerId: user.id,
            playerName: user.email?.split('@')[0] || 'Player',
            isDevMode: false,
          })
        } else {
          setData({
            userId: user.id,
            playerId: player.id,
            playerName: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player',
            isDevMode: false,
          })
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadPlayerAuth()
  }, [])

  return { data, loading, error }
}

/**
 * Hook for coach authentication
 * Returns coach data if user is authenticated as a coach
 */
export function useCoachAuth(): AuthHookResult<CoachAuthData> {
  const [data, setData] = useState<CoachAuthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCoachAuth() {
      try {
        const supabase = createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        // Get user record to check role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userData?.role !== 'coach') {
          setError('Not authenticated as coach')
          setLoading(false)
          return
        }

        // Get coach profile
        const { data: coach, error: coachError } = await supabase
          .from('baseball_coaches')
          .select('id, full_name, coach_type')
          .eq('user_id', user.id)
          .single()

        if (coachError || !coach) {
          // Fallback: use user data if coach profile doesn't exist
          setData({
            userId: user.id,
            coachId: user.id,
            coachName: user.email?.split('@')[0] || 'Coach',
            coachType: 'college',
            isDevMode: false,
          })
        } else {
          setData({
            userId: user.id,
            coachId: coach.id,
            coachName: coach.full_name || 'Coach',
            coachType: (coach.coach_type as CoachAuthData['coachType']) || 'college',
            isDevMode: false,
          })
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadCoachAuth()
  }, [])

  return { data, loading, error }
}

/**
 * Hook for general authentication (any role)
 */
export function useAuth() {
  const [user, setUser] = useState<{
    userId: string
    role: string | null
    coachType?: string | null
    isDevMode: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAuth() {
      try {
        const supabase = createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        // Get user record
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .single()

        // Get coach type if coach
        let coachType: string | null = null
        if (userData?.role === 'coach') {
          const { data: coach } = await supabase
            .from('baseball_coaches')
            .select('coach_type')
            .eq('user_id', authUser.id)
            .single()
          coachType = coach?.coach_type || null
        }

        setUser({
          userId: authUser.id,
          role: userData?.role || null,
          coachType,
          isDevMode: false,
        })
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadAuth()
  }, [])

  return { user, loading, error }
}

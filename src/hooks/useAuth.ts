'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDevModeConfig, getDevModeUserData } from '@/lib/dev-mode'
import { getSessionData } from '@/lib/auth/session'

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
        // Check dev mode first
        const devConfig = getDevModeConfig()
        if (devConfig.enabled && devConfig.role === 'player') {
          const devData = getDevModeUserData('player') as PlayerAuthData
          setData(devData)
          setLoading(false)
          return
        }

        // Get real session data
        const sessionData = await getSessionData()

        if (!sessionData.user || sessionData.role !== 'player') {
          setError('Not authenticated as player')
          setLoading(false)
          return
        }

        // TODO: Enable when player columns are added to database
        // const supabase = createClient()
        // const { data: player, error: playerError } = await supabase
        //   .from('players')
        //   .select('id, first_name, last_name')
        //   .eq('user_id', sessionData.user.id)
        //   .single()
        // if (playerError || !player) {
        //   setError('Player profile not found')
        //   setLoading(false)
        //   return
        // }

        // Temporary: use default values
        setData({
          userId: sessionData.user.id,
          playerId: sessionData.user.id, // temporary
          playerName: sessionData.user.email?.split('@')[0] || 'Player',
          isDevMode: false,
        })
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
        // Check dev mode first
        const devConfig = getDevModeConfig()
        if (
          devConfig.enabled &&
          devConfig.role &&
          devConfig.role !== 'player'
        ) {
          const devData = getDevModeUserData(devConfig.role) as CoachAuthData
          setData(devData)
          setLoading(false)
          return
        }

        // Get real session data
        const sessionData = await getSessionData()

        if (!sessionData.user || sessionData.role !== 'coach') {
          setError('Not authenticated as coach')
          setLoading(false)
          return
        }

        // TODO: Enable when coach columns are added to database
        // const supabase = createClient()
        // const { data: coach, error: coachError } = await supabase
        //   .from('coaches')
        //   .select('id, full_name, coach_type')
        //   .eq('user_id', sessionData.user.id)
        //   .single()
        // if (coachError || !coach) {
        //   setError('Coach profile not found')
        //   setLoading(false)
        //   return
        // }

        // Temporary: use default values
        setData({
          userId: sessionData.user.id,
          coachId: sessionData.user.id, // temporary
          coachName: sessionData.user.email?.split('@')[0] || 'Coach',
          coachType: sessionData.coachType || 'college',
          isDevMode: false,
        })
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
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAuth() {
      try {
        // Check dev mode
        const devConfig = getDevModeConfig()
        if (devConfig.enabled && devConfig.role) {
          const devData = getDevModeUserData(devConfig.role)
          setUser(devData)
          setLoading(false)
          return
        }

        // Get real session
        const sessionData = await getSessionData()
        if (!sessionData.user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        setUser({
          userId: sessionData.user.id,
          role: sessionData.role,
          coachType: sessionData.coachType,
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

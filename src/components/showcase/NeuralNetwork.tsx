'use client'

import { useRef, useEffect, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

export function NeuralNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number | null>(null)
  const isAnimatingRef = useRef(false)
  const isVisibleRef = useRef(true)
  const dprRef = useRef(1)

  const initParticles = useCallback((width: number, height: number) => {
    const count = Math.min(80, Math.floor(width / 18))
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.8,
      alpha: Math.random() * 0.4 + 0.15
    }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      dprRef.current = dpr
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initParticles(window.innerWidth, window.innerHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove)

    const animate = () => {
      if (!isAnimatingRef.current) return
      const width = canvas.width / dprRef.current
      const height = canvas.height / dprRef.current
      ctx.clearRect(0, 0, width, height)
      const particles = particlesRef.current

      particles.forEach((p, i) => {
        // Mouse repulsion
        const dx = mouseRef.current.x - p.x
        const dy = mouseRef.current.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          const force = (120 - dist) / 120 * 0.015
          p.vx -= dx * force * 0.01
          p.vy -= dy * force * 0.01
        }

        // Apply velocity with dampening
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.995
        p.vy *= 0.995

        // Wrap edges
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        // Draw particle with glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
        gradient.addColorStop(0, `rgba(16, 185, 129, ${p.alpha})`)
        gradient.addColorStop(0.5, `rgba(16, 185, 129, ${p.alpha * 0.3})`)
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Draw connections
        particles.slice(i + 1).forEach((p2) => {
          const cdx = p.x - p2.x
          const cdy = p.y - p2.y
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy)
          if (cdist < 100) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            const opacity = (1 - cdist / 100) * 0.12
            ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    const startAnimation = () => {
      if (isAnimatingRef.current) return
      isAnimatingRef.current = true
      animationRef.current = requestAnimationFrame(animate)
    }

    const stopAnimation = () => {
      isAnimatingRef.current = false
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }

    const updateAnimationState = () => {
      if (reducedMotionQuery.matches || document.hidden || !isVisibleRef.current) {
        stopAnimation()
        return
      }
      startAnimation()
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      isVisibleRef.current = entry.isIntersecting
      updateAnimationState()
    }, { threshold: 0.1 })
    observer.observe(canvas)

    const handleVisibilityChange = () => updateAnimationState()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotionQuery.addEventListener?.('change', updateAnimationState)

    updateAnimationState()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotionQuery.removeEventListener?.('change', updateAnimationState)
      stopAnimation()
    }
  }, [initParticles])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.6, mixBlendMode: 'screen' }}
    />
  )
}

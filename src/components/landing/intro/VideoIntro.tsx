'use client'

import { useEffect, useRef, useState } from 'react'

interface VideoIntroProps {
  children: React.ReactNode
  videoSrc?: string
}

export function VideoIntro({
  children,
  videoSrc = '/videos/intro.mp4',
}: VideoIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [shouldPlay, setShouldPlay] = useState(false)

  const handleCanPlay = () => {
    if (!shouldPlay) return
    videoRef.current?.play().catch(() => {})
  }

  const handleEnded = () => {
    const video = videoRef.current
    if (!video) return
    video.pause()
  }

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = reduceMotion ? 0 : 2000
    const timer = window.setTimeout(() => {
      setIsRevealing(true)
      setShouldPlay(true)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!shouldPlay) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    video.play().catch(() => {})
  }, [shouldPlay])

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute transition-opacity duration-700 ease-out"
        style={{
          opacity: isRevealing ? 1 : 0,
          // Scale up and shift right+up to crop out bottom-right Veo watermark
          top: '-5%',
          left: '0',
          width: '110%',
          height: '115%',
          objectFit: 'cover',
          objectPosition: '60% 40%',
        }}
        muted
        playsInline
        preload="auto"
        onCanPlay={handleCanPlay}
        onLoadedData={handleCanPlay}
        onEnded={handleEnded}
      >
        <source src={videoSrc} type="video/mp4" />
      </video>

      <div
        className="absolute inset-0 bg-black transition-opacity duration-700 ease-out"
        style={{ opacity: isRevealing ? 0 : 1 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/50" />

      <div
        className="relative z-10 transition-[opacity,filter,transform] duration-700 ease-out"
        style={{
          opacity: isRevealing ? 1 : 0,
          filter: isRevealing ? 'brightness(1)' : 'brightness(0.35)',
          transform: isRevealing ? 'translateY(0px)' : 'translateY(8px)',
          pointerEvents: isRevealing ? 'auto' : 'none',
          transitionDelay: isRevealing ? '200ms' : '0ms',
        }}
      >
        {children}
      </div>
    </div>
  )
}

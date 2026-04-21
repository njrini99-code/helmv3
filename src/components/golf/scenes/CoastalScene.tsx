/**
 * Desktop-only painterly coastal scene. Paired with mobile `<CourseScene />`
 * via a `useMediaQuery` switch on the login/welcome pages.
 *
 * All animations are tagged `data-scene-animated` so the global reduced-motion
 * rule in `globals.css` disables them. Keyframes shared with CourseScene live
 * there too.
 *
 * Performance notes (applied from the review):
 *   - no `mix-blend-mode` on the grain (forces software composite on Safari)
 *   - grain is static (not animated) — opacity 0.05 is imperceptible at 1Hz
 *   - `numOctaves=1`, `baseFrequency=1.2` halves the feTurbulence cost
 *   - animated transforms carry `willChange` hints for layer promotion
 */

export interface CoastalSceneProps {
  /** Optional className on the root decorative wrapper. */
  className?: string;
  /** Unique suffix for SVG ids — avoids collision when multiple scenes render. */
  idSuffix?: string;
}

export function CoastalScene({ className, idSuffix = 'coastal' }: CoastalSceneProps) {
  const skyId = `${idSuffix}-sky`;
  const hazeId = `${idSuffix}-haze`;
  const oceanId = `${idSuffix}-ocean`;
  const cliffId = `${idSuffix}-cliff`;
  const fairwayId = `${idSuffix}-fairway`;
  const mowDarkId = `${idSuffix}-mow-dark`;
  const roughId = `${idSuffix}-rough`;
  const greenBodyId = `${idSuffix}-green-body`;
  const fairwayClipId = `${idSuffix}-fairway-clip`;
  const grainId = `${idSuffix}-grain`;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFDF4" />
            <stop offset="40%" stopColor="#FFE7BE" />
            <stop offset="72%" stopColor="#F6BE84" />
            <stop offset="100%" stopColor="#E08D4E" />
          </linearGradient>
          <linearGradient id={hazeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,232,196,0)" />
            <stop offset="50%" stopColor="rgba(255,232,196,0.75)" />
            <stop offset="100%" stopColor="rgba(255,232,196,0)" />
          </linearGradient>
          <linearGradient id={oceanId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6E9EA8" />
            <stop offset="35%" stopColor="#3A6F83" />
            <stop offset="75%" stopColor="#234F6A" />
            <stop offset="100%" stopColor="#153B55" />
          </linearGradient>
          <linearGradient id={cliffId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EAD1A4" />
            <stop offset="55%" stopColor="#C4A372" />
            <stop offset="100%" stopColor="#8F7346" />
          </linearGradient>
          <linearGradient id={fairwayId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B6C17A" />
            <stop offset="100%" stopColor="#849560" />
          </linearGradient>
          <linearGradient id={mowDarkId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#97A665" />
            <stop offset="100%" stopColor="#77884B" />
          </linearGradient>
          <linearGradient id={roughId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#758548" />
            <stop offset="100%" stopColor="#566636" />
          </linearGradient>
          <radialGradient id={greenBodyId} cx="0.45" cy="0.4" r="0.6">
            <stop offset="0%" stopColor="#7FA455" />
            <stop offset="70%" stopColor="#4E6C30" />
            <stop offset="100%" stopColor="#3A5320" />
          </radialGradient>
          <clipPath id={fairwayClipId}>
            <path d="M -50 900 L -50 880 C 80 860, 220 850, 360 842 C 500 834, 640 826, 780 820 C 920 814, 1060 810, 1200 808 C 1300 806, 1400 808, 1500 812 C 1580 814, 1660 816, 1660 816 L 1660 900 Z" />
          </clipPath>
        </defs>

        {/* Sky */}
        <rect width="1600" height="900" fill={`url(#${skyId})`} />

        {/* Atmospheric depth — four receding headland layers */}
        <g opacity=".32">
          <path d="M -50 436 C 110 424, 240 434, 380 426 C 500 420, 620 432, 740 428 L 740 494 L -50 494 Z" fill="#B7CDD0" />
          <path d="M 880 432 C 1020 424, 1180 436, 1320 428 C 1440 422, 1560 432, 1660 428 L 1660 494 L 880 494 Z" fill="#B0C7CA" />
        </g>
        <g opacity=".55">
          <path d="M -50 462 C 140 452, 300 468, 460 460 C 600 454, 720 466, 820 462 L 820 498 L -50 498 Z" fill="#8AA9AE" />
          <path d="M 820 464 C 960 456, 1120 470, 1280 462 C 1420 456, 1560 470, 1660 464 L 1660 498 L 820 498 Z" fill="#7D9DA3" />
        </g>
        <rect x="-50" y="466" width="1710" height="56" fill={`url(#${hazeId})`} />
        <g opacity=".82">
          <path d="M -50 492 C 80 482, 200 498, 340 492 C 460 488, 560 500, 680 496 L 680 518 L -50 518 Z" fill="#5E848C" />
          <path d="M 900 494 C 1030 486, 1180 502, 1320 496 C 1440 492, 1560 504, 1660 498 L 1660 518 L 900 518 Z" fill="#5A808A" />
        </g>
        <g>
          <path d="M -50 504 C 100 498, 240 514, 380 508 C 500 504, 600 516, 720 512 L 720 524 L -50 524 Z" fill="#3D626D" opacity=".92" />
          <path d="M 940 506 C 1080 498, 1220 516, 1380 510 C 1500 506, 1600 516, 1660 512 L 1660 524 L 940 524 Z" fill="#3D626D" opacity=".9" />
        </g>

        {/* Deep ocean */}
        <rect x="-50" y="518" width="1710" height="200" fill={`url(#${oceanId})`} />

        {/* Wave crests (animated) */}
        <g
          data-scene-animated
          opacity=".55"
          style={{ animation: 'helmSceneWaveShift 9s ease-in-out infinite', willChange: 'transform' }}
        >
          <path d="M 40 560 Q 200 554, 360 562 Q 520 570, 680 562 Q 840 554, 1000 562 Q 1160 570, 1320 562 Q 1480 554, 1640 562" stroke="#DFEFF1" strokeWidth="1.4" fill="none" />
          <path d="M 10 610 Q 170 602, 330 612 Q 490 620, 650 610 Q 810 602, 970 612 Q 1130 622, 1290 612 Q 1450 602, 1610 614" stroke="#D0E3E5" strokeWidth="1.2" fill="none" opacity=".7" />
          <path d="M 60 660 Q 220 654, 380 662 Q 540 668, 700 660 Q 860 652, 1020 662 Q 1180 670, 1340 662 Q 1500 654, 1660 662" stroke="#B9D3D7" strokeWidth="1" fill="none" opacity=".5" />
        </g>
        <path d="M 100 596 Q 260 590, 420 596 Q 580 602, 740 596" stroke="#184055" strokeWidth="1.3" fill="none" opacity=".5" />
        <path d="M 920 640 Q 1080 632, 1240 642 Q 1400 648, 1560 640" stroke="#184055" strokeWidth="1.1" fill="none" opacity=".45" />
        <path d="M 60 690 Q 260 684, 460 692 Q 660 698, 860 690 Q 1060 684, 1260 694 Q 1460 700, 1640 694" stroke="#133549" strokeWidth="1" fill="none" opacity=".4" />

        {/* Surf / foam at ocean–cliff interface */}
        <path d="M -40 708 C 120 700, 280 714, 440 706 C 600 700, 760 716, 920 706 C 1080 698, 1240 714, 1400 706 C 1520 702, 1600 710, 1660 706 L 1660 728 L -40 728 Z" fill="#F8ECD0" opacity=".9" />
        <path d="M 0 720 Q 200 716, 400 722 Q 600 728, 800 720 Q 1000 712, 1200 722 Q 1400 730, 1600 720" stroke="#D8C6A0" strokeWidth="1" fill="none" opacity=".55" />

        {/* Sandy cliff wall */}
        <path
          d="M -50 706 C 80 700, 220 716, 360 710 C 500 704, 620 720, 760 714 C 900 708, 1040 722, 1180 716 C 1320 710, 1460 724, 1660 718 L 1660 790 C 1540 788, 1420 796, 1280 790 C 1140 784, 1000 796, 860 790 C 720 784, 580 796, 440 790 C 300 784, 160 796, -50 790 Z"
          fill={`url(#${cliffId})`}
        />
        <path d="M 20 742 Q 220 734, 420 744 Q 620 752, 820 744 Q 1020 736, 1220 746 Q 1420 754, 1640 746" stroke="#9F8151" strokeWidth="1.2" fill="none" opacity=".55" />
        <path d="M 60 768 Q 260 760, 460 770 Q 660 776, 860 768 Q 1060 762, 1260 770 Q 1460 776, 1640 770" stroke="#8A6F45" strokeWidth="1" fill="none" opacity=".45" />
        <path d="M -50 710 C 80 704, 220 720, 360 714 C 500 708, 620 724, 760 718 C 900 712, 1040 726, 1180 720 C 1320 714, 1460 728, 1660 722" stroke="#F4E1BC" strokeWidth="1.8" fill="none" opacity=".65" />

        {/* Rough base */}
        <path d="M -50 784 C 160 770, 360 790, 540 780 C 680 772, 800 792, 940 786 C 1060 780, 1180 796, 1320 790 C 1440 784, 1560 796, 1660 792 L 1660 900 L -50 900 Z" fill={`url(#${roughId})`} />

        {/* Fairway body */}
        <path
          d="M -50 900 L -50 880 C 80 860, 220 850, 360 842 C 500 834, 640 826, 780 820 C 920 814, 1060 810, 1200 808 C 1300 806, 1400 808, 1500 812 C 1580 814, 1660 816, 1660 816 L 1660 900 Z"
          fill={`url(#${fairwayId})`}
        />

        {/* Mow stripes — clipped to fairway */}
        <g clipPath={`url(#${fairwayClipId})`}>
          <path d="M -60 816 C 200 808, 600 802, 1000 804 C 1300 806, 1560 810, 1660 812 L 1660 832 C 1400 828, 1000 824, 600 826 C 300 828, 0 832, -60 836 Z" fill={`url(#${mowDarkId})`} opacity=".55" />
          <path d="M -60 848 C 200 842, 600 840, 1000 842 C 1300 844, 1560 846, 1660 848 L 1660 866 C 1400 864, 1000 862, 600 864 C 300 866, 0 868, -60 872 Z" fill={`url(#${mowDarkId})`} opacity=".45" />
          <path d="M -60 880 C 200 876, 600 876, 1000 878 C 1300 880, 1560 882, 1660 884 L 1660 900 L -60 900 Z" fill={`url(#${mowDarkId})`} opacity=".3" />
          <path d="M -60 826 Q 200 822, 600 820 Q 1000 820, 1660 824" stroke="#7E8C58" strokeWidth=".6" fill="none" opacity=".45" />
          <path d="M -60 858 Q 200 854, 600 854 Q 1000 856, 1660 860" stroke="#7E8C58" strokeWidth=".6" fill="none" opacity=".4" />
          <path d="M -60 886 Q 200 884, 600 884 Q 1000 886, 1660 890" stroke="#7E8C58" strokeWidth=".6" fill="none" opacity=".35" />
        </g>

        {/* Fairway edge highlight + transition */}
        <path d="M -50 880 C 80 860, 220 850, 360 842 C 500 834, 640 826, 780 820 C 920 814, 1060 810, 1200 808 C 1300 806, 1400 808, 1500 812 C 1580 814, 1660 816, 1660 816" stroke="#E2E9B0" strokeWidth="1.4" fill="none" opacity=".6" />
        <path d="M -50 880 C 80 860, 220 850, 360 842 C 500 834, 640 826, 780 820 C 920 814, 1060 810, 1200 808 C 1300 806, 1400 808, 1500 812 C 1580 814, 1660 816, 1660 816" stroke="#5E6F3A" strokeWidth=".6" fill="none" opacity=".5" strokeDasharray="2 3" />

        {/* Fringe tufts */}
        <g opacity=".6" fill="#5F6E3A">
          <path d="M 110 870 l -1 -5 l 2 0 z" />
          <path d="M 260 856 l -1 -6 l 2 0 z" />
          <path d="M 420 844 l -1 -5 l 2 0 z" />
          <path d="M 560 834 l -1 -6 l 2 0 z" />
          <path d="M 700 826 l -1 -5 l 2 0 z" />
          <path d="M 860 818 l -1 -5 l 2 0 z" />
          <path d="M 1020 814 l -1 -5 l 2 0 z" />
          <path d="M 1440 818 l -1 -5 l 2 0 z" />
          <path d="M 1560 820 l -1 -5 l 2 0 z" />
        </g>

        {/* Foreground sand shadow — left */}
        <g transform="translate(220,862)" opacity=".88">
          <path d="M -90 14 C -108 10, -120 22, -114 34 C -104 46, -70 52, -30 48 C 12 44, 54 46, 78 38 C 96 32, 100 20, 80 14 C 48 6, 12 8, -30 12 C -60 16, -80 14, -90 14 Z" fill="#EFDAB0" />
          <path d="M -100 26 C -60 38, -6 42, 50 38 C 80 36, 92 28, 86 22" stroke="#D0B486" strokeWidth="1" fill="none" opacity=".6" />
          <circle cx="-40" cy="28" r="1" fill="#FFFAE8" opacity=".7" />
          <circle cx="36" cy="32" r=".9" fill="#FFFAE8" opacity=".6" />
        </g>

        {/* Hero putting green */}
        <g transform="translate(1290,830)">
          <ellipse cx="6" cy="14" rx="164" ry="18" fill="#2E3F1A" opacity=".22" />
          <ellipse cx="0" cy="0" rx="148" ry="32" fill="#556935" />
          <ellipse cx="0" cy="-1" rx="134" ry="27" fill="#8FA656" />
          <ellipse cx="0" cy="-1" rx="134" ry="27" fill="none" stroke="#6E843E" strokeWidth=".7" opacity=".45" />
          <ellipse cx="0" cy="-3" rx="120" ry="22" fill={`url(#${greenBodyId})`} />
          <g opacity=".35">
            <path d="M -106 -10 Q 0 -18, 106 -8" stroke="#7FA455" strokeWidth="3" fill="none" />
            <path d="M -110 0 Q 0 -8, 110 2" stroke="#7FA455" strokeWidth="3" fill="none" />
            <path d="M -106 10 Q 0 2, 106 12" stroke="#7FA455" strokeWidth="3" fill="none" />
          </g>
          <ellipse cx="-26" cy="-8" rx="48" ry="5" fill="#B3CA7E" opacity=".4" />
          <ellipse cx="36" cy="6" rx="36" ry="4" fill="#38502A" opacity=".35" />
          <path d="M -72 -4 Q 0 2, 72 -2" stroke="#4F6B2A" strokeWidth=".6" fill="none" opacity=".4" />
          <ellipse cx="28" cy="-4" rx="6.5" ry="2.4" fill="#1A1612" />
          <ellipse cx="28" cy="-4.4" rx="5" ry="1.6" fill="#000" />
          <path d="M 22 -5.4 Q 28 -6.4, 34 -5.4" stroke="#C3D390" strokeWidth=".9" fill="none" opacity=".55" />

          {/* Pin + flag */}
          <g transform="translate(28,-4)">
            <ellipse cx="2" cy="1" rx="3" ry="1.2" fill="#2A3A18" opacity=".5" />
            <line x1="0" y1="0" x2="0" y2="-108" stroke="#2d2a25" strokeWidth="3.2" strokeLinecap="round" />
            <g
              data-scene-animated
              style={{
                transformBox: 'fill-box',
                transformOrigin: '0% 50%',
                animation: 'helmSceneFlagFlutter 2.4s ease-in-out infinite',
                willChange: 'transform',
              }}
            >
              <path d="M 0 -108 C 12 -111, 24 -104, 38 -108 L 38 -84 C 24 -81, 12 -88, 0 -84 Z" fill="#B83A29" stroke="#7A2418" strokeWidth=".8" strokeOpacity=".55" />
              <path d="M 2 -104 C 12 -107, 22 -100, 32 -104" stroke="#E96A55" strokeWidth=".8" fill="none" opacity=".6" />
            </g>
            <circle cx="0" cy="0" r="2.8" fill="#1C1917" />
            <circle cx="-0.7" cy="-0.6" r="1" fill="#3A3A3A" opacity=".7" />
          </g>

          {/* Greenside bunker */}
          <g transform="translate(-98,22)">
            <ellipse cx="-4" cy="18" rx="60" ry="6" fill="#8A6F45" opacity=".3" />
            <path d="M -48 2 C -68 -4, -80 8, -72 20 C -60 32, -30 34, 0 30 C 32 26, 52 16, 36 4 C 10 -6, -26 -4, -48 2 Z" fill="#F2E0BC" />
            <path d="M -56 16 C -26 26, 14 28, 40 16" stroke="#D6BB90" strokeWidth="1" fill="none" opacity=".7" />
            <path d="M -44 24 C -14 30, 16 30, 34 22" stroke="#D6BB90" strokeWidth=".7" fill="none" opacity=".5" />
            <ellipse cx="-8" cy="10" rx="20" ry="3" fill="#FFF6E0" opacity=".4" />
            <circle cx="-18" cy="18" r=".9" fill="#FFFAE8" opacity=".8" />
            <circle cx="10" cy="22" r=".8" fill="#FFFAE8" opacity=".7" />
            <circle cx="-32" cy="14" r=".8" fill="#FFFAE8" opacity=".7" />
          </g>
        </g>

        {/* Dominant Monterey cypress */}
        <g transform="translate(1490,798)">
          <g
            data-scene-animated
            style={{
              transformBox: 'fill-box',
              transformOrigin: '50% 100%',
              animation: 'helmSceneCypressSway 9s ease-in-out infinite',
              willChange: 'transform',
            }}
          >
            <path d="M -4 22 Q -2 52, -6 84 L 6 84 Q 2 52, 4 22 Z" fill="#6C513C" opacity=".9" />
            <circle cx="-8" cy="-12" r="36" fill="#6B7F5A" />
            <circle cx="-30" cy="-4" r="26" fill="#4A5E3E" />
            <circle cx="14" cy="-22" r="30" fill="#6B7F5A" />
            <circle cx="-16" cy="-36" r="23" fill="#4A5E3E" />
            <circle cx="20" cy="-40" r="20" fill="#37472E" />
            <circle cx="-42" cy="-22" r="18" fill="#4A5E3E" />
            <circle cx="-26" cy="14" r="20" fill="#37472E" />
            <circle cx="10" cy="18" r="18" fill="#4A5E3E" />
            <circle cx="-4" cy="-56" r="14" fill="#6B7F5A" opacity=".6" />
            <circle cx="28" cy="-12" r="16" fill="#4A5E3E" />
            <circle cx="-4" cy="-30" r="6" fill="#D9E6C0" opacity=".35" />
          </g>
        </g>

        {/* Drifting seagulls */}
        <g opacity=".35">
          <g
            data-scene-animated
            style={{ animation: 'helmSceneGullDrift 40s linear infinite', willChange: 'transform' }}
          >
            <path d="M 240 280 q 10 -8 20 0 q 10 -8 20 0" stroke="#3E4848" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M 340 326 q 8 -6 16 0 q 8 -6 16 0" stroke="#3E4848" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </g>
          <g
            data-scene-animated
            style={{ animation: 'helmSceneGullDrift 55s linear infinite reverse', willChange: 'transform' }}
          >
            <path d="M 1020 240 q 9 -7 18 0 q 9 -7 18 0" stroke="#3E4848" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </svg>

      {/*
       * Static film grain — no animation, no mix-blend-mode. A single rasterisation
       * at paint; opacity 0.05 is imperceptibly distinguishable from the animated
       * version that previously burned 4Hz of main-thread work on Safari.
       */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -20,
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          opacity: 0.05,
          pointerEvents: 'none',
        }}
      >
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves={1} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} />
      </svg>
    </div>
  );
}

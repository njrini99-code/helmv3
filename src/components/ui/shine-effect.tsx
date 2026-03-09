/**
 * ShineEffect Component
 *
 * A subtle top-edge shine effect for glassmorphic UI elements.
 * Used to create depth and premium feel on glass-standard cards.
 *
 * Usage:
 * ```tsx
 * <div className="relative glass-standard rounded-2xl overflow-clip">
 *   <ShineEffect />
 *   {children}
 * </div>
 * ```
 */
export function ShineEffect() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }}
    />
  );
}

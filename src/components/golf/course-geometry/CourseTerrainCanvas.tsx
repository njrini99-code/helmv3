'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { projectTerrainPoint, terrainHeight, type TerrainCamera, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { checkedAnchor } from '@/lib/golf/course-geometry/quality';
import { terrainColors } from '@/lib/golf/course-geometry/terrain-material';
import { terrainCanopy } from '@/lib/golf/course-geometry/terrain-canopy';
import { TerrainCanopyLayer } from './TerrainCanopyLayer';

const VERTEX = `attribute vec3 position; attribute vec3 color;
uniform mat4 camera; varying vec3 tint;
void main(){gl_Position=camera*vec4(position,1.0);tint=color;}`;
const FRAGMENT = `precision mediump float; varying vec3 tint;
void main(){gl_FragColor=vec4(tint,1.0);}`;
function color(value: string): number[] {
  const hex = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Terrain requires resolved diagram color tokens');
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/** One GPU backend of CourseHoleScene. Static buffers + one camera uniform;
 * no geometry processing, network requests or score updates during orbit. */
export function CourseTerrainCanvas({ scene, mesh, camera, width, height, fallback, onUnavailable }: {
  scene: HoleScene; mesh: TerrainMesh; camera: TerrainCamera; width: number; height: number; fallback: ReactNode;
  onUnavailable?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef<((c: TerrainCamera, w: number, h: number) => void) | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const canopy = useMemo(() => terrainCanopy(scene, mesh, camera), [scene, mesh, camera]);
  useEffect(() => { if (unavailable) onUnavailable?.(); }, [unavailable, onUnavailable]);
  const worldAnchors = useMemo(() => scene.events.map(event => {
    const point = checkedAnchor(event, scene.features);
    const z = point && terrainHeight(mesh, point);
    return point && z != null ? { point: [point[0], point[1], z] as const, event } : null;
  }), [scene, mesh]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl', { alpha: false, antialias: true, depth: true, powerPreference: 'default' });
    if (!gl) { setUnavailable(true); return; }
    const shaders: WebGLShader[] = [], buffers: WebGLBuffer[] = [];
    let program: WebGLProgram | null = null;
    const lost = (event: Event) => { event.preventDefault(); draw.current = null; setUnavailable(true); };
    el.addEventListener('webglcontextlost', lost);
    try {
      program = gl.createProgram();
      if (!program) throw new Error('GPU program unavailable');
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('GPU shader unavailable');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('GPU shader compilation failed');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GPU program linking failed');
      gl.useProgram(program);
      const style = getComputedStyle(el);
      const palette = mesh.featureKinds.map(kind => color(style.getPropertyValue(`--fw-diagram-${kind}`)));
      const colors = terrainColors(mesh, palette, { surround: color(style.getPropertyValue('--fw-diagram-surround')),
        fringe: color(style.getPropertyValue('--fw-diagram-fringe')) });
      for (const [name, data] of [['position', new Float32Array(mesh.vertices)], ['color', colors]] as const) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('GPU buffer unavailable');
        buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const attribute = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
      }
      const uniform = gl.getUniformLocation(program, 'camera');
      const ground = color(style.getPropertyValue('--fw-diagram-ground'));
      gl.clearColor(ground[0]!, ground[1]!, ground[2]!, 1);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      draw.current = (c, w, h) => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (el.width !== Math.round(w * ratio) || el.height !== Math.round(h * ratio)) {
          el.width = Math.round(w * ratio); el.height = Math.round(h * ratio);
        }
        gl.viewport(0, 0, el.width, el.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(uniform, false, new Float32Array(c.matrix));
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
      };
    } catch { draw.current = null; setUnavailable(true); }
    return () => {
      draw.current = null; el.removeEventListener('webglcontextlost', lost);
      buffers.forEach(b => gl.deleteBuffer(b)); shaders.forEach(s => gl.deleteShader(s));
      if (program) gl.deleteProgram(program);
    };
  }, [mesh]);
  useEffect(() => { draw.current?.(camera, width, height); }, [mesh, camera, width, height]);
  return unavailable ? <>{fallback}<span className="sr-only">GPU terrain unavailable. Showing the top-down course outline.</span></> : <div className="relative h-full w-full">
    <canvas ref={canvas} role="img" aria-label="Experimental course terrain from USGS elevation data. Pin and shot positions unknown."
      data-terrain-hash={mesh.contentHash} data-terrain-pitch={camera.pitch} data-terrain-yaw={camera.yawOffset}
      data-terrain-exaggeration={camera.exaggeration} data-terrain-triangles={mesh.triangleFeatures.length}
      style={{ width: '100%', height: '100%', display: 'block' }} />
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
      <TerrainCanopyLayer canopy={canopy} width={width} height={height} />
      {worldAnchors.map(anchor => {
        if (!anchor) return null;
        const [x, y] = projectTerrainPoint(anchor.point, camera);
        if (x < 0 || x > width || y < 0 || y > height) return null;
        return <circle key={anchor.event.evidence.eventKey} data-anchor="estimated" cx={x} cy={y} r="3"
          fill="none" stroke="var(--fw-diagram-event)" strokeWidth="1.5" />;
      })}
    </svg>
  </div>;
}

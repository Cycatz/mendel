import * as THREE from 'three';

export interface MeshArrays { pos: ArrayLike<number>; nrm: ArrayLike<number>; col: ArrayLike<number>; idx: ArrayLike<number> }

// Engine mesh arrays -> three.js geometry. Organ colours are authored in sRGB;
// three expects linear vertex colours.
export function plantGeometry(res: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(res.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(res.nrm, 3));
  const lin = new Float32Array(res.col.length);
  for (let i = 0; i < lin.length; i++) lin[i] = Math.pow(Math.max(0, res.col[i]), 2.2);
  g.setAttribute('color', new THREE.BufferAttribute(lin, 3));
  g.setIndex(res.idx.length > 65535 ? new THREE.Uint32BufferAttribute(res.idx, 1) : new THREE.Uint16BufferAttribute(res.idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

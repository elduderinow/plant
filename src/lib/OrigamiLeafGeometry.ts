import { BufferGeometry, Float32BufferAttribute } from "three";

/**
 * A leaf built as a radial fan across a half circle, with alternating fold
 * depth per rib that flattens towards the tip. Ported unchanged from the 2024
 * scene.
 */
export class OrigamiLeafGeometry extends BufferGeometry {
  constructor(radius = 1, folds = 12, segments = 8, foldDepth = 0.2) {
    super();

    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let i = 0; i <= folds; i++) {
      const angle = (i / folds) * Math.PI;
      const foldDir = i % 2 === 0 ? 1 : -1;

      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const r = t * radius;

        const aspect = 2;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle) * aspect;
        const z = foldDir * foldDepth * Math.pow(1 - t, 2);

        vertices.push(x, y, z);
        uvs.push(i / folds, t);
      }
    }

    const ringVerts = segments + 1;
    for (let i = 0; i < folds; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * ringVerts + j;
        const b = (i + 1) * ringVerts + j;
        const c = i * ringVerts + j + 1;
        const d = (i + 1) * ringVerts + j + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    this.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    this.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    this.setIndex(indices);
    this.computeVertexNormals();
  }
}

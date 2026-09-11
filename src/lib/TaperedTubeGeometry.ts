import {
  BufferGeometry,
  CatmullRomCurve3,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A TubeGeometry whose radius eases from startRadius to endRadius along its
 * length, capped with a sphere at the tip. Ported unchanged from the 2024
 * scene: it builds plain BufferGeometry, so nothing here is renderer specific.
 */
export class TaperedTubeGeometry extends TubeGeometry {
  constructor(
    path: CatmullRomCurve3,
    tubularSegments = 64,
    startRadius = 0.1,
    endRadius = 0.05,
    radialSegments = 24,
    closed = false,
  ) {
    super(path, tubularSegments, startRadius, radialSegments, closed);

    const position = this.attributes.position;
    const normal = this.attributes.normal;
    const vertex = new Vector3();
    const normalVec = new Vector3();

    const verticesPerSegment = radialSegments + 1;
    const totalSegments = tubularSegments + 1;

    const smoothStep = (t: number) => t * t * (3 - 2 * t);

    for (let segment = 0; segment < totalSegments; segment++) {
      const t = smoothStep(segment / tubularSegments);
      const currentRadius = startRadius + (endRadius - startRadius) * t;
      const scale = currentRadius / startRadius;

      for (let i = 0; i < verticesPerSegment; i++) {
        const vertexIndex = segment * verticesPerSegment + i;

        vertex.fromBufferAttribute(position, vertexIndex);
        normalVec.fromBufferAttribute(normal, vertexIndex);

        // Push each ring vertex along its own normal to reach the new radius.
        vertex.add(normalVec.multiplyScalar((scale - 1) * startRadius));
        position.setXYZ(vertexIndex, vertex.x, vertex.y, vertex.z);
      }
    }

    // The last vertex of a ring duplicates the first. Copy the normal across so
    // the seam does not shade as a hard edge.
    for (let segment = 0; segment < totalSegments; segment++) {
      const start = segment * verticesPerSegment;
      const end = start + radialSegments;
      normal.setXYZ(end, normal.getX(start), normal.getY(start), normal.getZ(start));
    }

    normal.needsUpdate = true;
    position.needsUpdate = true;

    const capGeometries: BufferGeometry[] = [];
    const addCap = (radius: number, t: number, flip = false) => {
      const cap = new SphereGeometry(radius, radialSegments, radialSegments);
      cap.rotateX(Math.PI / 2);

      const pos = path.getPointAt(t);
      const tangent = path.getTangentAt(t);

      const q = new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        tangent.clone().normalize(),
      );
      const m = new Matrix4().makeRotationFromQuaternion(q).setPosition(pos);

      if (flip) cap.rotateY(Math.PI / 2);

      cap.applyMatrix4(m);
      capGeometries.push(cap);
    };
    addCap(endRadius, 1, true);

    const merged = mergeGeometries([this, ...capGeometries], false);
    this.copy(merged);
    this.computeVertexNormals();
  }
}

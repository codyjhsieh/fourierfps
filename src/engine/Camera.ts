import * as THREE from "three";

/** First-person perspective camera with a pivot rig for look + lens attachment. */
export class Camera {
  readonly camera: THREE.PerspectiveCamera;
  /** The yaw/pitch pivot the player controller rotates. Camera is a child. */
  readonly pivot: THREE.Object3D;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(62, Camera.aspect(), 0.05, 160);
    this.pivot = new THREE.Object3D();
    this.pivot.add(this.camera);
    this.camera.position.set(0, 0, 0);

    window.addEventListener("house:resize", this.onResize);
  }

  private static aspect(): number {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    return w / h;
  }

  private onResize = (): void => {
    this.camera.aspect = Camera.aspect();
    this.camera.updateProjectionMatrix();
  };
}

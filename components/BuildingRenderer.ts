import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BuildingParams } from "@/lib/buildingTypes";

export class BuildingRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private buildingGroup: THREE.Group;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f0ede8");
    this.scene.fog = new THREE.Fog("#f0ede8", 80, 150);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    this.camera.position.set(25, 20, 30);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 조명
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd580, 1.4);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.4);
    fill.position.set(-15, 10, -10);
    this.scene.add(fill);

    // 지면
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshLambertMaterial({ color: "#d4c9b0" });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 그리드
    const grid = new THREE.GridHelper(60, 30, "#b0a090", "#c8bfad");
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    this.animate();
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(params: BuildingParams) {
    // 기존 건물 제거
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      this.buildingGroup.remove(child);
    }

    const {
      floors, width, depth, heightPerFloor,
      piloti, pilotiFloors, roofType, roofAngle,
      windows, balconies, hasCourt, courtWidth, courtDepth,
      wallColor, roofColor,
    } = params;

    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const glassMat = new THREE.MeshLambertMaterial({
      color: "#89b8cc",
      transparent: true,
      opacity: 0.6,
    });
    const pillarMat = new THREE.MeshLambertMaterial({ color: "#cccccc" });
    const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
    const balconyMat = new THREE.MeshLambertMaterial({ color: "#d0c8bc" });

    const totalHeight = floors * heightPerFloor;
    const pilotiH = piloti ? pilotiFloors * heightPerFloor : 0;

    // 필로티 기둥
    if (piloti && pilotiFloors > 0) {
      const pillarR = 0.3;
      const pillarH = pilotiH;
      const positions = [
        [-width / 2 + 1, -depth / 2 + 1],
        [width / 2 - 1, -depth / 2 + 1],
        [-width / 2 + 1, depth / 2 - 1],
        [width / 2 - 1, depth / 2 - 1],
        [0, -depth / 2 + 1],
        [0, depth / 2 - 1],
      ];
      positions.forEach(([px, pz]) => {
        const geo = new THREE.CylinderGeometry(pillarR, pillarR, pillarH, 12);
        const mesh = new THREE.Mesh(geo, pillarMat);
        mesh.position.set(px, pillarH / 2, pz);
        mesh.castShadow = true;
        this.buildingGroup.add(mesh);
      });
    }

    // 각 층 건물 본체
    const startFloor = piloti ? pilotiFloors : 0;
    for (let f = startFloor; f < floors; f++) {
      const floorY = f * heightPerFloor;
      // 모든 층에 중정 적용 (f >= 0)
      const isCourtFloor = hasCourt && courtWidth && courtDepth;

      if (isCourtFloor) {
        // 중정 있는 층: 4면 벽으로 분리
        const cW = courtWidth!;
        const cD = courtDepth!;

        // 앞벽
        const frontD = (depth - cD) / 2;
        this.addBox(width, heightPerFloor, frontD, wallMat, 0, floorY + heightPerFloor / 2, -(cD / 2 + frontD / 2));
        // 뒷벽
        this.addBox(width, heightPerFloor, frontD, wallMat, 0, floorY + heightPerFloor / 2, cD / 2 + frontD / 2);
        // 좌벽
        const sideW = (width - cW) / 2;
        this.addBox(sideW, heightPerFloor, cD, wallMat, -(cW / 2 + sideW / 2), floorY + heightPerFloor / 2, 0);
        // 우벽
        this.addBox(sideW, heightPerFloor, cD, wallMat, cW / 2 + sideW / 2, floorY + heightPerFloor / 2, 0);
        // 중정 바닥 슬래브 — 첫 번째 중정 층에만 생성
        if (f === startFloor) {
          const slabGeo = new THREE.BoxGeometry(cW - 0.3, 0.1, cD - 0.3);
          const slabMat = new THREE.MeshLambertMaterial({ color: "#c0b8a8" });
          const slab = new THREE.Mesh(slabGeo, slabMat);
          slab.position.set(0, floorY, 0);
          this.buildingGroup.add(slab);
        }
      } else {
        const geo = new THREE.BoxGeometry(width, heightPerFloor, depth);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(0, floorY + heightPerFloor / 2, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.buildingGroup.add(mesh);
      }

      // 창문
      windows.filter((w) => w.floor === f + 1).forEach((win) => {
        const wallPos = this.getWallPosition(win.wall, width, depth, floorY + heightPerFloor / 2, win.xOffset, win.width, win.height);
        const geo = new THREE.BoxGeometry(wallPos.w, wallPos.h, 0.1);
        const mesh = new THREE.Mesh(geo, glassMat);
        mesh.position.set(wallPos.x, wallPos.y, wallPos.z);
        if (win.wall === "left" || win.wall === "right") mesh.rotation.y = Math.PI / 2;
        this.buildingGroup.add(mesh);
      });

      // 발코니
      balconies.filter((b) => b.floor === f + 1).forEach((bal) => {
        const balPos = this.getBalconyPosition(bal.wall, width, depth, floorY);
        const geo = new THREE.BoxGeometry(
          bal.wall === "front" || bal.wall === "back" ? bal.width : bal.depth,
          0.15,
          bal.wall === "left" || bal.wall === "right" ? bal.width : bal.depth
        );
        const mesh = new THREE.Mesh(geo, balconyMat);
        mesh.position.set(balPos.x, floorY + 0.075, balPos.z);
        mesh.castShadow = true;
        this.buildingGroup.add(mesh);

        // 난간
        this.addRailing(bal.wall, width, depth, floorY, bal.width, bal.depth);
      });
    }

    // 지붕
    const roofY = totalHeight;
    if (roofType === "flat") {
      this.addBox(width + 0.2, 0.2, depth + 0.2, roofMat, 0, roofY + 0.1, 0);
    } else if (roofType === "gable") {
      const angle = (roofAngle ?? 30) * (Math.PI / 180);
      const ridgeH = (width / 2) * Math.tan(angle);
      const geo = new THREE.BufferGeometry();
      const hw = width / 2 + 0.3;
      const hd = depth / 2 + 0.5;
      const vertices = new Float32Array([
        -hw, 0, -hd,  hw, 0, -hd,  0, ridgeH, -hd,
        -hw, 0,  hd,  hw, 0,  hd,  0, ridgeH,  hd,
      ]);
      const indices = [0,1,2, 3,5,4, 0,2,5, 0,5,3, 1,4,5, 1,5,2, 0,3,4, 0,4,1];
      geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.position.set(0, roofY, 0);
      mesh.castShadow = true;
      this.buildingGroup.add(mesh);
    } else if (roofType === "hip") {
      const angle = (roofAngle ?? 25) * (Math.PI / 180);
      const ridgeH = Math.min(width, depth) / 2 * Math.tan(angle);
      const geo = new THREE.BufferGeometry();
      const hw = width / 2 + 0.3;
      const hd = depth / 2 + 0.3;
      const ridgeW = (width - depth) / 2;
      const vertices = new Float32Array([
        -hw, 0, -hd,   hw, 0, -hd,
         hw, 0,  hd,  -hw, 0,  hd,
        -ridgeW, ridgeH, 0,  ridgeW, ridgeH, 0,
      ]);
      const indices = [
        0,1,5, 0,5,4,
        1,2,5, 2,4,5,
        2,3,4, 3,0,4,
        4,5,2,
      ];
      geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.position.set(0, roofY, 0);
      mesh.castShadow = true;
      this.buildingGroup.add(mesh);
    }

    // 카메라 자동 조정
    const maxDim = Math.max(width, depth, totalHeight);
    this.camera.position.set(maxDim * 1.8, maxDim * 1.2, maxDim * 2.0);
    this.camera.lookAt(0, totalHeight / 2, 0);
    this.controls.target.set(0, totalHeight / 2, 0);
    this.controls.update();
  }

  private addBox(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.buildingGroup.add(mesh);
  }

  private getWallPosition(
    wall: string, width: number, depth: number,
    centerY: number, xOffset: number, winW: number, winH: number
  ) {
    const offset = 0.06;
    switch (wall) {
      case "front": return { x: xOffset * width, y: centerY, z: depth / 2 + offset, w: winW, h: winH };
      case "back":  return { x: xOffset * width, y: centerY, z: -depth / 2 - offset, w: winW, h: winH };
      case "left":  return { x: -width / 2 - offset, y: centerY, z: xOffset * depth, w: winW, h: winH };
      case "right": return { x: width / 2 + offset, y: centerY, z: xOffset * depth, w: winW, h: winH };
      default:      return { x: 0, y: centerY, z: depth / 2 + offset, w: winW, h: winH };
    }
  }

  private getBalconyPosition(wall: string, width: number, depth: number) {
    const gap = 0.15;
    switch (wall) {
      case "front": return { x: 0, z: depth / 2 + gap };
      case "back":  return { x: 0, z: -depth / 2 - gap };
      case "left":  return { x: -width / 2 - gap, z: 0 };
      case "right": return { x: width / 2 + gap, z: 0 };
      default:      return { x: 0, z: depth / 2 + gap };
    }
  }

  private addRailing(wall: string, width: number, depth: number, floorY: number, balW: number, balD: number) {
    const railH = 1.0;
    const railMat = new THREE.MeshLambertMaterial({ color: "#a0a0a0" });
    const railThick = 0.05;
    const railLen = wall === "front" || wall === "back" ? balW : balW;

    const geo = new THREE.BoxGeometry(
      wall === "left" || wall === "right" ? railThick : railLen,
      railH,
      wall === "left" || wall === "right" ? railLen : railThick
    );
    const mesh = new THREE.Mesh(geo, railMat);
    const pos = this.getBalconyPosition(wall, width, depth);
    const edgeOffset = wall === "front" ? balD / 2 : wall === "back" ? -balD / 2 : 0;
    const edgeOffsetZ = wall === "left" ? balD / 2 : wall === "right" ? -balD / 2 : 0;
    mesh.position.set(pos.x + (wall === "left" || wall === "right" ? 0 : edgeOffset), floorY + railH / 2 + 0.15, pos.z + (wall === "front" || wall === "back" ? edgeOffset * 0 : edgeOffsetZ));
    this.buildingGroup.add(mesh);
  }

  dispose() {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.controls.dispose();
  }
}
